import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { normalizeIteration, normalizeProject } from '../shared/workspaceSupport';
import { publishIterationBranch } from "./repositoryPublishing";
import { buildDefaultIterationCodeLink, listUncoveredAcceptanceCriteria, writeAuditLog } from '../shared/common';
import { assertBoundaryWhitelist, listWorkingTreeChangedPaths } from '../shared/boundaryGuard';
import { inferRemoteConfigured } from './repoHealthOps';
import { normalizeTargetPlatforms, type TargetPlatform } from '../../../domain/workspace/projectTypes';
import { assessPlatformCodeChangeReadiness, assessPlatformDeliveryReadiness } from '../analysis/releaseReviewOps';

function checkIterationPublishGates(ni: ReturnType<typeof normalizeIteration>, declaredPlatforms: readonly TargetPlatform[] | undefined) {
  if (ni.changeControl?.pendingHumanConfirmation) {
    return { ok: false as const, reason: "analysis_confirmation_required" };
  }
  if (ni.changeControl?.lastReleaseReviewDecision === "block") {
    return {
      ok: false as const, reason: "release_review_blocked",
      message: ni.changeControl.lastReleaseReviewReason || "发布评审结论为阻塞",
      blockers: ni.changeControl.lastReleaseReviewBlockers || []
    };
  }
  const matrix = Array.isArray(ni.changeControl?.generatedTestMatrix) ? ni.changeControl?.generatedTestMatrix : [];
  const failedOrBlocked = matrix.filter((item) => item.executionStatus === "failed" || item.executionStatus === "blocked");
  if (failedOrBlocked.length > 0) {
    return {
      ok: false as const, reason: "release_review_blocked",
      message: `测试矩阵存在 ${failedOrBlocked.length} 个失败或阻断用例`,
      blockers: failedOrBlocked.map((item) => item.caseId)
    };
  }
  const checklist = Array.isArray(ni.changeControl?.qualityArtifacts?.acceptanceChecklist)
    ? ni.changeControl?.qualityArtifacts.acceptanceChecklist : [];
  const uncovered = listUncoveredAcceptanceCriteria(ni.scope.acceptanceCriteria, checklist, []);
  if (checklist.length === 0 || uncovered.length > 0) {
    const blockers = [
      ...(checklist.length === 0 ? ["缺少验收清单，无法进入发布"] : []),
      ...(uncovered.length > 0 ? [`验收标准未完全覆盖：${uncovered.slice(0, 5).join("；")}`] : [])
    ];
    return { ok: false as const, reason: "release_review_blocked", message: blockers.join("；"), blockers };
  }
  // 仅当项目显式声明了目标端时启用端级门禁（无声明的历史项目向后兼容，跳过）
  if (declaredPlatforms && declaredPlatforms.length > 0) {
    const targetPlatforms = normalizeTargetPlatforms(declaredPlatforms);
    const items = ni.changeControl?.artifactWorkflow?.items ?? [];
    const agg = assessPlatformDeliveryReadiness(targetPlatforms, items);
    if (agg.decision !== "go") {
      return { ok: false as const, reason: "release_review_blocked", message: `目标端未全部就绪：${agg.blockers.join("；")}`, blockers: agg.blockers };
    }
  }
  return null;
}

export async function publishIterationToRemoteOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: { commitMessage?: string; openPr?: boolean; prTitle?: string; prBody?: string; dryRun?: boolean }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return { ok: false as const, reason: "iteration_not_found" };
  const project = repo.findProject(iteration.projectId);
  if (!project) return { ok: false as const, reason: "project_not_found" };
  const projectRepo = normalizeProject(project).repository;
  if (!projectRepo) return { ok: false as const, reason: "repository_not_found" };
  if (!projectRepo.workspace?.repoPath) return { ok: false as const, reason: "repository_not_scaffolded" };
  const ni = normalizeIteration(iteration);
  const dryRun = input.dryRun === true;
  const gateResult = checkIterationPublishGates(ni, project.targetPlatforms);
  if (gateResult) return gateResult;
  const codeLink = ni.codeLink ?? buildDefaultIterationCodeLink(repo, ni);
  if (!codeLink) return { ok: false as const, reason: "code_link_unavailable" };
  const repoMode = projectRepo.repoMode || "hybrid";
  const remoteConfigured = inferRemoteConfigured(projectRepo);
  if (!dryRun && repoMode === "managed_local") {
    return { ok: false as const, reason: "remote_required_for_publish", message: "本地托管模式需先绑定远程仓库才能正式发布" };
  }
  if (!dryRun && !remoteConfigured) {
    return { ok: false as const, reason: "remote_required_for_publish", message: "远程仓库未配置" };
  }
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const githubToken = processEnv.GITHUB_TOKEN?.trim() || "";
  const commitMessage = input.commitMessage?.trim() || `feat(iteration): publish iteration ${ni.id}`;
  const prTitle = input.prTitle?.trim() || `Iteration #${ni.id}: ${ni.name}`;
  const prBody = input.prBody?.trim() || `Auto-generated PR for iteration ${ni.id}.`;
  const openPr = input.openPr !== false;
  const boundaryCodePaths = ni.changeControl?.boundary?.codePaths ?? [];
  try {
    const changedPaths = listWorkingTreeChangedPaths(projectRepo.workspace.repoPath);
    const boundaryCheck = assertBoundaryWhitelist({ repoPath: projectRepo.workspace.repoPath, whitelist: boundaryCodePaths, changedPaths });
    if (!boundaryCheck.ok) {
      return { ok: false as const, reason: "boundary_violation", message: "变更文件超出边界白名单", blockers: boundaryCheck.violations };
    }
    // T2: 端级代码改动就绪门禁——声明端中某端有代码白名单但无改动 → block（堵「声明多端只改部分端代码就标可发布」的虚假推进）
    if (project.targetPlatforms && project.targetPlatforms.length > 0) {
      const targetPlatforms = normalizeTargetPlatforms(project.targetPlatforms);
      const codePathsByPlatform = ni.changeControl?.boundary?.codePathsByPlatform;
      const codeChangeAgg = assessPlatformCodeChangeReadiness(changedPaths, codePathsByPlatform, targetPlatforms);
      if (codeChangeAgg.decision !== "go") {
        return { ok: false as const, reason: "release_review_blocked", message: `目标端代码改动未就绪：${codeChangeAgg.blockers.join("；")}`, blockers: codeChangeAgg.blockers };
      }
    }
    const published = await publishIterationBranch({
      repoPath: projectRepo.workspace.repoPath, branch: codeLink.branch, baseBranch: projectRepo.defaultBranch,
      commitMessage, remoteName: "origin", cloneUrl: projectRepo.remote?.cloneUrl || projectRepo.url,
      openPr, prTitle, prBody, owner: projectRepo.organization, repo: projectRepo.name,
      visibility: projectRepo.remote?.visibility || "private", ownerType: projectRepo.remote?.ownerType || "org",
      githubToken, dryRun
    });
    const updatedLink = {
      ...codeLink, commit: published.commit || codeLink.commit,
      pr: published.prUrl || codeLink.pr, linkedAt: new Date().toISOString()
    };
    ni.codeLink = updatedLink;
    repo.updateIteration(ni);
    writeAuditLog(repo, "iteration_published", `iteration:${iterationId}`, `${updatedLink.branch}@${updatedLink.commit} pr=${updatedLink.pr || "none"}`);
    return { ok: true as const, data: { iterationId, projectId: ni.projectId, codeLink: updatedLink, publish: published } };
  } catch (error) {
    return { ok: false as const, reason: "publish_failed", message: error instanceof Error ? error.message : "发布失败" };
  }
}
