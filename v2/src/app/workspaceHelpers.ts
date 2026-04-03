export function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function nowIsoString() {
  return new Date().toISOString();
}

