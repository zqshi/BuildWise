export const rolePermissions: Record<string, string[]> = {
  owner: ["*"],
  pm: ["collab:write", "collab:read", "template:run", "deploy:read"],
  developer: ["collab:read", "template:run", "deploy:write", "deploy:read"],
  qa: ["collab:read", "deploy:read", "deploy:transition"],
  viewer: ["collab:read", "deploy:read"]
};

export function hasPermission(role: string, permission: string) {
  const permissions = rolePermissions[role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export const deploymentTransitions: Record<string, string[]> = {
  queued: ["running", "failed"],
  running: ["success", "failed"],
  success: [],
  failed: ["running"]
};

export function nowIso() {
  return new Date().toISOString();
}

export function randomToken(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}
