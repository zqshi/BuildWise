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
      } catch (err) {
        console.debug("[CoachReplyGuard] failed to parse action JSON from coach reply", err);
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


