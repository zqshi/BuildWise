import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import type { IterationArtifactStage } from '../../../domain/workspace/iterationTypes';
import { getEffectiveExperiencePolicy } from './experiencePolicyOps';
import { maybeExtractExperience } from './extractionOps';
import { createLogger } from '../../../infrastructure/runtime/logger';

const log = createLogger("experience-scan");

export async function runExperienceScan(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  projectId: number
): Promise<{ scannedIterations: number; newEntries: number }> {
  if (!agentRunner) return { scannedIterations: 0, newEntries: 0 };

  const policy = getEffectiveExperiencePolicy(repo, projectId);
  if (!policy.scheduleScanEnabled) {
    return { scannedIterations: 0, newEntries: 0 };
  }

  const iterations = repo.listIterations(projectId);
  const existingExtractions = repo.listExperienceExtractions(projectId);
  const extractedSet = new Set(
    existingExtractions
      .filter((e) => e.status === "success")
      .map((e) => `${e.iterationId}:${e.triggerEvent}:${e.sourceStage}`)
  );

  let totalNew = 0;
  let scanned = 0;

  for (const iteration of iterations) {
    const activeStage = iteration.changeControl?.artifactWorkflow?.activeStage;
    if (!activeStage) continue;

    const stages: IterationArtifactStage[] = ["clarification", "scope", "interaction", "development", "testing", "release", "archive"];
    const activeIdx = stages.indexOf(activeStage);

    for (let i = 0; i <= activeIdx; i++) {
      const stage = stages[i]!;
      const key = `${iteration.id}:stage-gate-passed:${stage}`;
      if (extractedSet.has(key)) continue;

      const entryIds = await maybeExtractExperience(repo, agentRunner, "stage-gate-passed", {
        projectId,
        iterationId: iteration.id,
        iteration,
        stage
      });
      totalNew += entryIds.length;
    }

    if (iteration.status === "completed") {
      const completionKey = `${iteration.id}:iteration-completed:archive`;
      if (!extractedSet.has(completionKey)) {
        const entryIds = await maybeExtractExperience(repo, agentRunner, "iteration-completed", {
          projectId,
          iterationId: iteration.id,
          iteration
        });
        totalNew += entryIds.length;
      }
    }

    scanned++;
  }

  log.info(`扫描完成: project=${projectId} 扫描${scanned}个迭代 新增${totalNew}条经验`);
  return { scannedIterations: scanned, newEntries: totalNew };
}
