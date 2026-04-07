/**
 * Iteration workspace signal presenter — formats signal items for display.
 */

export function formatSignalItems(values: string[] | undefined, fallback = ""): string {
  if (!values || values.length === 0) return fallback;
  const filtered = values.map((v) => v.trim()).filter(Boolean);
  if (filtered.length === 0) return fallback;
  return filtered.join("；");
}

export function buildLabeledSignal(label: string, values: string[]): string {
  if (values.length === 0) return "";
  return `${label}：${values.join("；")}`;
}

export function buildEvidenceSignal(evidence: string): string {
  const trimmed = evidence.trim();
  return `evidence：${trimmed || "-"}`;
}
