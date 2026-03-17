export async function requestGitHub<T = Record<string, unknown>>(
  url: string,
  init: RequestInit,
  token: string,
  allow404 = false
): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
  if (allow404 && res.status === 404) {
    return { status: 404, body: null };
  }
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch (error) {
    console.warn("[requestGitHub] response parse failed:", error instanceof Error ? error.message : error);
    body = null;
  }
  return { status: res.status, body };
}
