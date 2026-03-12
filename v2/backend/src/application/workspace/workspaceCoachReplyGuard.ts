export function parseRecentSuggestedActions(messages: Array<{ role: string; content: string }>) {
  const actions: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "system") {
      continue;
    }
    if (msg.content.startsWith("操作建议：")) {
      const parsed = msg.content
        .replace(/^操作建议：/, "")
        .split("；")
        .map((item) => item.trim())
        .filter(Boolean);
      actions.push(...parsed);
      continue;
    }
    if (msg.content.startsWith("操作建议JSON:")) {
      const raw = msg.content.replace(/^操作建议JSON:/, "").trim();
      try {
        const data = JSON.parse(raw) as { actions?: unknown };
        if (Array.isArray(data.actions)) {
          actions.push(
            ...data.actions
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
          );
        }
      } catch {
        // ignore parse error
      }
    }
  }
  return Array.from(new Set(actions));
}

export function dedupeActions(current: string[], recent: string[]) {
  const recentSet = new Set(recent.map((item) => item.trim()).filter(Boolean));
  const result = current.filter((item) => !recentSet.has(item));
  return result.length > 0 ? result : current;
}

function normalizeForCompare(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：,.!?;:]/g, "")
    .trim();
}

function calcOverlapRatio(a: string, b: string) {
  if (!a || !b) {
    return 0;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  let hit = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) {
      hit += 1;
    }
  }
  return hit / Math.max(1, shorter.length);
}

export function isMechanicalSimilarReply(current: string, previous: string) {
  const a = normalizeForCompare(current);
  const b = normalizeForCompare(previous);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  return calcOverlapRatio(a, b) >= 0.86;
}
