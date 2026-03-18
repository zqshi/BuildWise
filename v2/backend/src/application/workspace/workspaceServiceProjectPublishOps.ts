import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { normalizeIteration, normalizeProject } from "./workspaceSupport";
import { publishIterationBranch } from "./repositoryPublishing";
import { buildDefaultIterationCodeLink, listUncoveredAcceptanceCriteria, writeAuditLog } from "./workspaceServiceCommon";
import { assertBoundaryWhitelist, listWorkingTreeChangedPaths } from "./boundaryGuard";
import { inferRemoteConfigured } from "./workspaceServiceProjectRepoHealthOps";

export async function publishIterationToRemoteOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: { commitMessage?: string; openPr?: boolean; prTitle?: string; prBody?: string; dryRun?: boolean }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return { ok: false as const, reason: "iteration_not_found" };
  }
  const project = repo.findProject(iteration.projectId);
  if (!project) {
    return { ok: false as const, reason: "project_not_found" };
  }
  const normalizedProject = normalizeProject(project);
  const projectRepo = normalizedProject.repository;
  if (!projectRepo) {
    return { ok: false as const, reason: "repository_not_found" };
  }
  if (!projectRepo.workspace?.repoPath) {
    return { ok: false as const, reason: "repository_not_scaffolded" };
  }
  const normalizedIteration = normalizeIteration(iteration);
  if (normalizedIteration.changeControl?.pendingHumanConfirmation) {
    return { ok: false as const, reason: "analysis_confirmation_required" };
  }
  if (normalizedIteration.changeControl?.lastReleaseReviewDecision === "block") {
    return {
      ok: false as const,
      reason: "release_review_blocked",
      message: normalizedIteration.changeControl.lastReleaseReviewReason || "release review blocked",
      blockers: normalizedIteration.changeControl.lastReleaseReviewBlockers || []
    };
  }
  const matrix = Array.isArray(normalizedIteration.changeControl?.generatedTestMatrix)
    ? normalizedIteration.changeControl?.generatedTestMatrix
    : [];
  const failedOrBlocked = matrix.filter((item) => item.executionStatus === "failed" || item.executionStatus === "blocked");
  if (failedOrBlocked.length > 0) {
    return {
      ok: false as const,
      reason: "release_review_blocked",
      message: `test matrix has ${failedOrBlocked.length} failed/blocked cases`,
      blockers: failedOrBlocked.map((item) => item.caseId)
    };
  }
  const acceptanceChecklist = Array.isArray(normalizedIteration.changeControl?.qualityArtifacts?.acceptanceChecklist)
    ? normalizedIteration.changeControl?.qualityArtifacts.acceptanceChecklist
    : [];
  const uncoveredAcceptanceCriteria = listUncoveredAcceptanceCriteria(normalizedIteration.scope.acceptanceCriteria, acceptanceChecklist, []);
  if (acceptanceChecklist.length === 0 || uncoveredAcceptanceCriteria.length > 0) {
    const blockers = [
      ...(acceptanceChecklist.length === 0 ? ["缺少 acceptanceChecklist，无法进入发布"] : []),
      ...(uncoveredAcceptanceCriteria.length > 0 ? [`验收标准未完全覆盖：${uncoveredAcceptanceCriteria.slice(0, 5).join("；")}`] : [])
    ];
    return { ok: false as const, reason: "release_review_blocked", message: blockers.join("；"), blockers };
  }
  const codeLink = normalizedIteration.codeLink ?? buildDefaultIterationCodeLink(repo, normalizedIteration);
  if (!codeLink) {
    return { ok: false as const, reason: "code_link_unavailable" };
  }
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const dryRun = input.dryRun === true;
  const repoMode = projectRepo.repoMode || "hybrid";
  const remoteConfigured = inferRemoteConfigured(projectRepo);
  if (!dryRun && repoMode === "managed_local") {
    return {
      ok: false as const,
      reason: "remote_required_for_publish",
      message: "managed_local mode requires remote binding before non-dry-run publish"
    };
  }
  if (!dryRun && !remoteConfigured) {
    return {
      ok: false as const,
      reason: "remote_required_for_publish",
      message: "remote repository is not configured"
    };
  }
  const githubToken = processEnv.GITHUB_TOKEN?.trim() || "";
  const commitMessage = input.commitMessage?.trim() || `feat(iteration): publish iteration ${normalizedIteration.id}`;
  const prTitle = input.prTitle?.trim() || `Iteration #${normalizedIteration.id}: ${normalizedIteration.name}`;
  const prBody = input.prBody?.trim() || `Auto-generated PR for iteration ${normalizedIteration.id}.`;
  const openPr = input.openPr !== false;
  const boundaryCodePaths = normalizedIteration.changeControl?.boundary?.codePaths ?? [];
  try {
    const changedPaths = listWorkingTreeChangedPaths(projectRepo.workspace.repoPath);
    const boundaryCheck = assertBoundaryWhitelist({ repoPath: projectRepo.workspace.repoPath, whitelist: boundaryCodePaths, changedPaths });
    if (!boundaryCheck.ok) {
      return {
        ok: false as const,
        reason: "boundary_violation",
        message: "changed files exceed boundary whitelist",
        blockers: boundaryCheck.violations
      };
    }
    const published = await publishIterationBranch({
      repoPath: projectRepo.workspace.repoPath,
      branch: codeLink.branch,
      baseBranch: projectRepo.defaultBranch,
      commitMessage,
      remoteName: "origin",
      cloneUrl: projectRepo.remote?.cloneUrl || projectRepo.url,
      openPr,
      prTitle,
      prBody,
      owner: projectRepo.organization,
      repo: projectRepo.name,
      visibility: projectRepo.remote?.visibility || "private",
      ownerType: projectRepo.remote?.ownerType || "org",
      githubToken,
      dryRun
    });
    const updatedLink = {
      ...codeLink,
      commit: published.commit || codeLink.commit,
      pr: published.prUrl || codeLink.pr,
      linkedAt: new Date().toISOString()
    };
    normalizedIteration.codeLink = updatedLink;
    repo.updateIteration(normalizedIteration);
    writeAuditLog(repo, "iteration_published", `iteration:${iterationId}`, `${updatedLink.branch}@${updatedLink.commit} pr=${updatedLink.pr || "none"}`);
    return {
      ok: true as const,
      data: { iterationId, projectId: normalizedIteration.projectId, codeLink: updatedLink, publish: published }
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: "publish_failed",
      message: error instanceof Error ? error.message : "publish failed"
    };
  }
}
