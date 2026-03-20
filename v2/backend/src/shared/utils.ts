/** ISO 8601 timestamp of the current moment. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Extract a string array from an unknown value (typically parsed JSON). */
export function pickStringList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(0, max);
}

/** Extract a trimmed string from an unknown value, or return fallback. */
export function pickString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

/** Extract an error message from an unknown thrown value. */
export function resolveErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
