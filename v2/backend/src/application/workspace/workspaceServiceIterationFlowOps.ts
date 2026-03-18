import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AssessmentPayload,
  AssessmentSnapshot,
  CreateIterationInput,
  IterationCodeLink,
  IterationContextPayload
} from "../../domain/workspace/types";
import { buildMergedIterationPayload, normalizeIteration, normalizeProject, allowedTransitionsFrom } from "./workspaceSupport";
import { buildDefaultIterationCodeLink, defaultIterationChangeControl, hasProject, writeAuditLog } from "./workspaceServiceCommon";
import { buildGitRequirementIntakePrompt, hasGitRequirementIntakeTarget } from "./workspaceServiceGitRequirementIntakeOps";
import { normalizeIterationMessageContent } from "./workspaceMessageSanitizer";

export function listIterationsOp(repo: WorkspaceRepository, projectId: number) {
  if (!hasProject(repo, projectId)) {
    return null;
  }
  return repo.listIterations(projectId).map(normalizeIteration);
}

export function createIterationOp(repo: WorkspaceRepository, projectId: number, payload: CreateIterationInput) {
  if (!hasProject(repo, projectId)) {
    return null;
  }
  const project = repo.findProject(projectId);
  const previous = repo.listIterations(projectId).sort((a, b) => b.id - a.id).map(normalizeIteration)[0] ?? null;
  const mergedPayload = buildMergedIterationPayload(payload, project, previous);
  const created = repo.createIteration(projectId, mergedPayload);
  if (!created.changeControl) {
    repo.updateIteration({
      ...created,
      changeControl: defaultIterationChangeControl({ isFirstIteration: !previous, hasPreviousIteration: Boolean(previous) })
    });
  }
  let normalized = normalizeIteration(repo.findIteration(created.id) ?? created);
  if (!normalized.codeLink) {
    const defaultCodeLink = buildDefaultIterationCodeLink(repo, normalized);
    if (defaultCodeLink) {
      normalized.codeLink = defaultCodeLink;
      repo.updateIteration(normalized);
      writeAuditLog(repo, "iteration_code_link_initialized", `iteration:${normalized.id}`, `${defaultCodeLink.branch}@${defaultCodeLink.commit || "HEAD"}`);
    }
  }
  const snapshot: AssessmentSnapshot = {
    id: repo.nextId(repo.read().snapshots),
    iterationId: normalized.id,
    source: "create",
    note: "迭代创建自动快照",
    assessment: normalized.assessment,
    scope: normalized.scope,
    status: normalized.status,
    progress: normalized.progress,
    createdAt: new Date().toISOString()
  };
  repo.appendSnapshot(snapshot);
  if (!previous && project?.repository && hasGitRequirementIntakeTarget(normalizeProject(project).repository)) {
    const projectRepo = normalizeProject(project).repository!;
    const now = new Date().toISOString();
    normalized = normalizeIteration({
      ...normalized,
      interactionState: {
        hasPrototypeAssets: normalized.interactionState?.hasPrototypeAssets ?? false,
        uploadKind: normalized.interactionState?.uploadKind || "other",
        lastUpdatedAt: now,
        lastAttachmentName: normalized.interactionState?.lastAttachmentName || "",
        gitRequirementIntake: {
          status: "pending-confirmation",
          askedAt: now,
          decidedAt: "",
          branch: projectRepo.defaultBranch || "main",
          repoUrl: projectRepo.url || "",
          summary: "",
          error: ""
        }
      }
    });
    repo.updateIteration(normalized);
    repo.createMessage(normalized.id, "assistant", buildGitRequirementIntakePrompt(projectRepo));
    writeAuditLog(repo, "iteration_git_intake_prompted", `iteration:${normalized.id}`, `repo=${projectRepo.url};branch=${projectRepo.defaultBranch}`);
  }
  return normalized;
}

export function listMessagesOp(repo: WorkspaceRepository, iterationId: number) {
  return repo.listMessages(iterationId);
}

export function createMessageOp(repo: WorkspaceRepository, iterationId: number, role: "system" | "assistant" | "user", content: string) {
  const normalizedContent = normalizeIterationMessageContent(role, content);
  const created = repo.createMessage(iterationId, role, normalizedContent);
  const iteration = repo.findIteration(iterationId);
  if (iteration) {
    const snapshot: AssessmentSnapshot = {
      id: repo.nextId(repo.read().snapshots),
      iterationId,
      source: "message",
      note: `${role} 消息更新`,
      assessment: iteration.assessment,
      scope: iteration.scope,
      status: iteration.status,
      progress: iteration.progress,
      createdAt: new Date().toISOString()
    };
    repo.appendSnapshot(snapshot);
  }
  return created;
}

export function bindIterationCodeLinkOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: Partial<Pick<IterationCodeLink, "branch" | "tag" | "commit" | "pr" | "paths" | "note">>
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const project = repo.findProject(iteration.projectId);
  const projectRepo = project ? normalizeProject(project).repository : null;
  if (!projectRepo) {
    return null;
  }
  const normalizedIteration = normalizeIteration(iteration);
  const slug = normalizedIteration.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `iter-${iterationId}`;
  const link: IterationCodeLink = {
    repoId: projectRepo.id,
    branch: input.branch?.trim() || `iteration/${iterationId}-${slug}`,
    tag: input.tag?.trim() || (normalizedIteration.version ? `v${normalizedIteration.version}` : `iter-v${iterationId}`),
    commit: input.commit?.trim() || "",
    pr: input.pr?.trim() || "",
    paths: Array.isArray(input.paths) ? input.paths.filter((item) => item.trim()).map((item) => item.trim()) : [],
    note: input.note?.trim() || "",
    linkedAt: new Date().toISOString()
  };
  normalizedIteration.codeLink = link;
  repo.updateIteration(normalizedIteration);
  writeAuditLog(repo, "iteration_code_linked", `iteration:${iterationId}`, `${link.branch}@${link.commit || "HEAD"}`);
  return link;
}

export function getIterationCodeLinkOp(repo: WorkspaceRepository, iterationId: number) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  return normalizeIteration(iteration).codeLink ?? null;
}

export function locateIterationsByCodeRefOp(repo: WorkspaceRepository, projectId: number, ref: string) {
  const query = ref.trim().toLowerCase();
  if (!query) {
    return [];
  }
  return repo
    .listIterations(projectId)
    .map(normalizeIteration)
    .filter((item) => {
      const link = item.codeLink;
      if (!link) {
        return false;
      }
      const fields = [link.branch, link.tag, link.commit, link.pr, ...link.paths].filter(Boolean).map((value) => value.toLowerCase());
      return fields.some((value) => value.includes(query));
    })
    .map((item) => ({
      iterationId: item.id,
      iterationName: item.name,
      status: item.status,
      codeLink: item.codeLink
    }));
}

export function getIterationContextOp(repo: WorkspaceRepository, iterationId: number): IterationContextPayload | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const previous = repo.findPreviousIteration(normalized);
  return {
    iteration: normalized,
    previous: previous ? normalizeIteration(previous) : null,
    continuity: normalized.continuity,
    scope: normalized.scope
  };
}

export function getAssessmentOp(repo: WorkspaceRepository, iterationId: number): AssessmentPayload | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  return {
    iterationId: normalized.id,
    iterationName: normalized.name,
    assessment: normalized.assessment
  };
}

export function listAssessmentSnapshotsOp(repo: WorkspaceRepository, iterationId: number) {
  return repo.listSnapshots(iterationId);
}

export function getStateMachineOp(repo: WorkspaceRepository, iterationId: number) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const currentStatus = normalized.status;
  return {
    iterationId: normalized.id,
    currentStatus,
    allowedTransitions: allowedTransitionsFrom(currentStatus),
    transitionHistory: repo.listTransitions(iterationId).map((item) => ({
      ...item,
      note: item.note || item.reason || "",
      reason: item.reason || item.note || "",
      source: item.source || "manual",
      operator: item.operator || "unknown",
      operatorRole: item.operatorRole || "unknown"
    }))
  };
}
