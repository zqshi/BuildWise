export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const mergedOptions: RequestInit = {
    ...options,
    signal: options?.signal ?? controller.signal
  };
  let res: Response;
  try {
    res = await fetch(url, mergedOptions);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("API error: request timeout");
    }
    throw new Error("API error: network unavailable");
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let detail = "";
    if (contentType.includes("application/json")) {
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      detail = payload?.message ? `: ${payload.message}` : "";
    }
    throw new Error(`API error: ${res.status}${detail}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API error: invalid response format");
  }
  return (await res.json()) as T;
}
