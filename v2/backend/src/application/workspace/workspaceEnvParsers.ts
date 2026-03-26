export function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt((value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readNonNegativeInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt((value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Alias for readPositiveInt — kept for semantic clarity at call sites. */
export const readPositiveMs = readPositiveInt;

export function readStringList(value: string | undefined) {
  if (!value || !value.trim()) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}
