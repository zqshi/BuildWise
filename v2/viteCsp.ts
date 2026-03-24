function resolveApiConnectOrigin(apiBase: string): string | null {
  const trimmed = apiBase.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(options: {
  apiBase?: string;
  mode?: string;
}) {
  const connectSources = new Set<string>(["'self'"]);
  const apiOrigin = resolveApiConnectOrigin(options.apiBase || "");
  if (apiOrigin) {
    connectSources.add(apiOrigin);
  }
  if (options.mode === "development") {
    connectSources.add("ws:");
    connectSources.add("wss:");
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src ${Array.from(connectSources).join(" ")}`,
    "font-src 'self' data:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}
