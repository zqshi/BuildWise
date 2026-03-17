export function formatSignalItems(items: string[] | null | undefined, fallback = "-") {
  const normalized = Array.isArray(items) ? items.map((item) => item.trim()).filter(Boolean) : [];
  return normalized.length > 0 ? normalized.join("；") : fallback;
}

export function buildLabeledSignal(label: string, items: string[] | null | undefined) {
  const normalized = Array.isArray(items) ? items.map((item) => item.trim()).filter(Boolean) : [];
  if (normalized.length === 0) {
    return "";
  }
  return `${label}：${normalized.join("；")}`;
}

export function buildEvidenceSignal(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return `evidence：${normalized || "-"}`;
}
