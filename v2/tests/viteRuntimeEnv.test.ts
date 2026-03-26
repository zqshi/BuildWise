import assert from "node:assert/strict";
import test from "node:test";
import { resolveViteRuntimeEnv } from "../viteRuntimeEnv.ts";

test("vite runtime env prefers process env for cross-origin api base during builds", () => {
  const previousApiBase = process.env.VITE_API_BASE;
  const previousProxyTarget = process.env.VITE_API_PROXY_TARGET;
  process.env.VITE_API_BASE = "http://127.0.0.1:5066";
  process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:5067";
  try {
    const resolved = resolveViteRuntimeEnv("production", process.cwd());
    assert.equal(resolved.apiBase, "http://127.0.0.1:5066");
    assert.equal(resolved.apiProxyTarget, "http://127.0.0.1:5067");
  } finally {
    if (previousApiBase === undefined) {
      delete process.env.VITE_API_BASE;
    } else {
      process.env.VITE_API_BASE = previousApiBase;
    }
    if (previousProxyTarget === undefined) {
      delete process.env.VITE_API_PROXY_TARGET;
    } else {
      process.env.VITE_API_PROXY_TARGET = previousProxyTarget;
    }
  }
});
