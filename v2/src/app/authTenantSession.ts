export type AuthTenantSummary = {
  tenantId: string;
  label: string;
  role: "admin" | "member" | "viewer";
  workspaceRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  isOwner: boolean;
};

const AUTH_TENANT_ID_KEY = "buildwise:auth-tenant-id";
const AUTH_TENANTS_KEY = "buildwise:auth-tenants";

function readStorage(key: string) {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failure
  }
}

function removeStorage(key: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failure
  }
}

export function readStoredAuthTenants(): AuthTenantSummary[] {
  const raw = readStorage(AUTH_TENANTS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => item as Partial<AuthTenantSummary>)
      .filter((item) => typeof item.tenantId === "string" && item.tenantId.trim())
      .map((item) => ({
        tenantId: item.tenantId?.trim() || "",
        label: item.label?.trim() || item.tenantId?.trim() || "",
        role: item.role === "admin" || item.role === "member" ? item.role : "viewer",
        workspaceRole:
          item.workspaceRole === "owner" || item.workspaceRole === "pm" || item.workspaceRole === "developer" || item.workspaceRole === "qa"
            ? item.workspaceRole
            : "viewer",
        isOwner: item.isOwner === true
      }));
  } catch {
    return [];
  }
}

export function persistAuthTenants(tenants: AuthTenantSummary[]) {
  writeStorage(AUTH_TENANTS_KEY, JSON.stringify(tenants));
}

export function clearAuthTenantSession() {
  removeStorage(AUTH_TENANTS_KEY);
  removeStorage(AUTH_TENANT_ID_KEY);
}

export function readStoredCurrentTenantId() {
  return readStorage(AUTH_TENANT_ID_KEY);
}

export function persistCurrentTenantId(tenantId: string) {
  writeStorage(AUTH_TENANT_ID_KEY, tenantId.trim());
}

export function resolveCurrentTenantId(tenants: AuthTenantSummary[], requestedTenantId: string) {
  const normalized = requestedTenantId.trim();
  if (normalized && tenants.some((item) => item.tenantId === normalized)) {
    return normalized;
  }
  return tenants[0]?.tenantId || "";
}

export function resolveCurrentTenant(tenants: AuthTenantSummary[], requestedTenantId: string) {
  const tenantId = resolveCurrentTenantId(tenants, requestedTenantId);
  return tenants.find((item) => item.tenantId === tenantId) || null;
}
