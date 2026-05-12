import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  ExperiencePolicy,
  ExperienceTriggerEvent,
  ExperienceExtractionRule
} from '../../../domain/workspace/experiencePolicyTypes';
import { buildDefaultExperiencePolicy } from '../../../domain/workspace/experiencePolicyTypes';

const PLATFORM_PROJECT_ID = 0;

export function getEffectiveExperiencePolicy(
  repo: WorkspaceRepository,
  projectId: number
): ExperiencePolicy {
  const projectPolicy = repo.findActiveExperiencePolicy(projectId);
  if (projectPolicy) return projectPolicy;

  const platformPolicy = repo.findActiveExperiencePolicy(PLATFORM_PROJECT_ID);
  if (platformPolicy) return platformPolicy;

  return { id: 0, ...buildDefaultExperiencePolicy("system") };
}

export function isTriggerEnabled(
  policy: ExperiencePolicy,
  event: ExperienceTriggerEvent
): boolean {
  const rule = policy.rules.find((r) => r.trigger === event);
  return rule?.enabled ?? false;
}

export function getTriggerRule(
  policy: ExperiencePolicy,
  event: ExperienceTriggerEvent
): ExperienceExtractionRule | null {
  return policy.rules.find((r) => r.trigger === event && r.enabled) ?? null;
}

export function createExperiencePolicyOp(
  repo: WorkspaceRepository,
  input: Omit<ExperiencePolicy, "id">,
  createdBy: string
): ExperiencePolicy {
  const existing = repo.listExperiencePolicies(input.projectId);
  for (const p of existing) {
    if (p.status === "active") {
      repo.updateExperiencePolicy({ ...p, status: "draft" });
    }
  }

  const maxVersion = existing.reduce((max, p) => Math.max(max, p.version), 0);
  return repo.createExperiencePolicy({
    ...input,
    version: maxVersion + 1,
    status: "active",
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function updateExperiencePolicyOp(
  repo: WorkspaceRepository,
  policyId: number,
  updates: Partial<Pick<ExperiencePolicy, "rules" | "scheduleScanEnabled" | "scheduleScanIntervalDays">>
): ExperiencePolicy | null {
  const policies = repo.listExperiencePolicies(PLATFORM_PROJECT_ID)
    .concat(...[0, 1, 2, 3, 4, 5].map((i) => repo.listExperiencePolicies(i)));
  const existing = policies.find((p) => p.id === policyId);
  if (!existing) return null;

  const updated: ExperiencePolicy = {
    ...existing,
    rules: updates.rules ?? existing.rules,
    scheduleScanEnabled: updates.scheduleScanEnabled ?? existing.scheduleScanEnabled,
    scheduleScanIntervalDays: updates.scheduleScanIntervalDays ?? existing.scheduleScanIntervalDays,
    updatedAt: new Date().toISOString()
  };
  repo.updateExperiencePolicy(updated);
  return updated;
}

export function deleteProjectExperiencePolicyOp(
  repo: WorkspaceRepository,
  projectId: number
): boolean {
  if (projectId === PLATFORM_PROJECT_ID) return false;
  const policies = repo.listExperiencePolicies(projectId);
  let deleted = false;
  for (const p of policies) {
    if (repo.deleteExperiencePolicy(p.id)) deleted = true;
  }
  return deleted;
}

export function getPlatformExperiencePolicy(repo: WorkspaceRepository): ExperiencePolicy {
  return getEffectiveExperiencePolicy(repo, PLATFORM_PROJECT_ID);
}
