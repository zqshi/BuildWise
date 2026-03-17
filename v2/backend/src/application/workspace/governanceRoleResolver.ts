import type { GovernanceRole } from "../../domain/workspace/types";
import type { GovernanceCustomRoleRecord } from "../../domain/workspace/collaborationTypes";

const LEGACY_ROLE_MAP: Record<string, GovernanceRole["id"]> = {
  admin: "owner",
  member: "pm",
  viewer: "viewer"
};

function normalizeRoleKey(roleKey: string) {
  const normalized = roleKey.trim().toLowerCase();
  return LEGACY_ROLE_MAP[normalized] || normalized;
}

function uniquePermissions(permissions: string[]) {
  return [...new Set(permissions.map((item) => item.trim()).filter(Boolean))];
}

export function resolveRolePermissions(
  roleKey: string,
  governanceRoles: GovernanceRole[],
  customRoles: GovernanceCustomRoleRecord[]
) {
  const normalizedRoleKey = normalizeRoleKey(roleKey);
  const governanceRole = governanceRoles.find((item) => item.id === normalizedRoleKey);
  if (governanceRole) {
    return uniquePermissions(governanceRole.permissions);
  }
  const customRole = customRoles.find((item) => item.roleKey === normalizedRoleKey);
  if (customRole) {
    return uniquePermissions(customRole.permissions);
  }
  return [];
}

function scoreRoleMatch(candidate: GovernanceRole, permissions: Set<string>) {
  const matched = candidate.permissions.filter((item) => permissions.has(item)).length;
  const coverage = candidate.permissions.length > 0 ? matched / candidate.permissions.length : 0;
  return matched + coverage;
}

export function inferWorkspaceRoleFromPermissions(
  permissions: string[],
  governanceRoles: GovernanceRole[]
): GovernanceRole["id"] {
  const granted = new Set(uniquePermissions(permissions));
  if (granted.has("governance:*")) {
    return "owner";
  }
  const owner = governanceRoles.find((item) => item.id === "owner");
  if (owner && owner.permissions.every((item) => granted.has(item))) {
    return "owner";
  }
  let bestRole: GovernanceRole["id"] = "viewer";
  let bestScore = -1;
  governanceRoles.forEach((role) => {
    const score = scoreRoleMatch(role, granted);
    if (score > bestScore) {
      bestRole = role.id;
      bestScore = score;
    }
  });
  return bestRole;
}

export function resolveWorkspaceRole(
  roleKey: string,
  governanceRoles: GovernanceRole[],
  customRoles: GovernanceCustomRoleRecord[]
): GovernanceRole["id"] {
  const normalizedRoleKey = normalizeRoleKey(roleKey);
  const governanceRole = governanceRoles.find((item) => item.id === normalizedRoleKey);
  if (governanceRole) {
    return governanceRole.id;
  }
  const permissions = resolveRolePermissions(normalizedRoleKey, governanceRoles, customRoles);
  return inferWorkspaceRoleFromPermissions(permissions, governanceRoles);
}
