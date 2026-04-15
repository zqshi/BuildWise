import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AssessmentSnapshot,
  CreateIterationInput
} from '../../../domain/workspace/types';
import { buildMergedIterationPayload, normalizeIteration, normalizeProject } from '../shared/workspaceSupport';
import { buildDefaultIterationCodeLink, defaultIterationChangeControl, hasProject, writeAuditLog } from '../shared/common';
import { hasGitRequirementIntakeTarget } from '../coach/gitRequirementIntakeOps';
import { normalizeIterationMessageContent } from '../coach/messageSanitizer';

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
          status: "available",
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
    writeAuditLog(repo, "iteration_git_intake_available", `iteration:${normalized.id}`, `repo=${projectRepo.url};branch=${projectRepo.defaultBranch}`);
  }
  return normalized;
}

export function listMessagesOp(repo: WorkspaceRepository, iterationId: number, opts?: { limit?: number; offset?: number }) {
  return repo.listMessages(iterationId, opts);
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
