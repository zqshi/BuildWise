export function parsePositiveInt(value: string | undefined) {
  if (!value) return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function currentRole(authRole: string | undefined) {
  const role = authRole?.trim().toLowerCase() || "viewer";
  return role === "admin" ? "owner" : role;
}
