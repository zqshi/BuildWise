function createHeadersAdapter(headers) {
  return {
    get(name) {
      const value = headers?.[String(name).toLowerCase()];
      if (Array.isArray(value)) {
        return value[0] ?? null;
      }
      return value ?? null;
    }
  };
}

export function versionedPath(routePath) {
  if (routePath.startsWith("/api/v1/")) {
    return routePath;
  }
  return routePath.startsWith("/api/") ? `/api/v1/${routePath.slice(5)}` : routePath;
}

export function createHttpTestClient(options = {}) {
  const baseUrl = (options.baseUrl || "").replace(/\/+$/, "");
  const app = options.app || null;
  const defaultHeaders = { ...(options.defaultHeaders || {}) };
  const tokenByRole = options.tokenByRole || null;
  const requestTimeoutMs = Number(options.requestTimeoutMs || 180000);

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  async function request(routePath, requestOptions = {}) {
    const headers = {
      ...defaultHeaders,
      ...(requestOptions.headers || {})
    };
    const requestedRole = typeof headers["x-role"] === "string" ? headers["x-role"].trim().toLowerCase() : "";
    if (tokenByRole && requestedRole && tokenByRole[requestedRole]) {
      headers.authorization = `Bearer ${tokenByRole[requestedRole]}`;
    }

    if (app) {
      const response = await app.inject({
        method: requestOptions.method || "GET",
        url: versionedPath(routePath),
        headers,
        payload: requestOptions.body
      });
      const contentType = response.headers["content-type"] || "";
      const payload = String(contentType).includes("application/json") ? response.json() : response.body;
      return {
        res: {
          status: response.statusCode,
          ok: response.statusCode >= 200 && response.statusCode < 300,
          headers: createHeadersAdapter(response.headers)
        },
        payload
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(`${baseUrl}${versionedPath(routePath)}`, {
        ...requestOptions,
        headers,
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.text();
      return { res: response, payload };
    } finally {
      clearTimeout(timer);
    }
  }

  async function getJson(routePath) {
    const response = await request(routePath);
    assert(response.res.ok, `Request failed: ${routePath} -> ${response.res.status}`);
    return response.payload;
  }

  async function waitForHealth() {
    const response = await request("/health");
    assert(response.res.ok, "Backend did not become healthy in time");
  }

  return {
    assert,
    base: baseUrl,
    getJson,
    request,
    waitForHealth
  };
}
