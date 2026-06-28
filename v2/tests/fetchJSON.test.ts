import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { fetchJSON } from "../src/infrastructure/http/fetchJSON.ts";

// 前端副作用测试需 window/localStorage，node:test 默认无，用 jsdom 注入 global。
// token 为 null 时 fetchJSON 跳过 ensureFreshToken，故空 localStorage 即可隔离 LLM/网络。
const dom = new JSDOM("<!DOCTYPE html>", { url: "http://localhost" });
(globalThis as Record<string, unknown>).window = dom.window;
(globalThis as Record<string, unknown>).localStorage = dom.window.localStorage;
(globalThis as Record<string, unknown>).document = dom.window.document;

function mockFetchStatus(status: number): typeof fetch {
  return (() => Promise.resolve(new Response(null, { status }))) as typeof fetch;
}

function spyWindowDispatch(): { dispatched: string[]; restore: () => void } {
  const win = (globalThis as { window: { dispatchEvent: (e: Event) => boolean } }).window;
  const dispatched: string[] = [];
  const original = win.dispatchEvent;
  win.dispatchEvent = ((e: Event) => {
    dispatched.push(e.type);
    return true;
  }) as typeof win.dispatchEvent;
  return { dispatched, restore: () => { win.dispatchEvent = original; } };
}

function stubFetch(status: number): () => void {
  const original = (globalThis as { fetch: unknown }).fetch;
  (globalThis as { fetch: typeof fetch }).fetch = mockFetchStatus(status);
  return () => { (globalThis as { fetch: unknown }).fetch = original; };
}

test("fetchJSON 403（非 auth 路由）dispatch buildwise:tenant-stale 触发会话刷新", async () => {
  const spy = spyWindowDispatch();
  const restoreFetch = stubFetch(403);
  try {
    await assert.rejects(() => fetchJSON("/api/v1/projects"), /403/);
    assert.deepEqual(spy.dispatched, ["buildwise:tenant-stale"], "403 非 auth 路由应 dispatch tenant-stale");
  } finally {
    restoreFetch();
    spy.restore();
  }
});

test("fetchJSON 403 auth 路由不 dispatch tenant-stale（auth 路由不走租户失效逻辑）", async () => {
  const spy = spyWindowDispatch();
  const restoreFetch = stubFetch(403);
  try {
    await assert.rejects(() => fetchJSON("/api/v1/auth/sms/verify"), /403/);
    assert.deepEqual(spy.dispatched, [], "auth 路由 403 不应 dispatch tenant-stale");
  } finally {
    restoreFetch();
    spy.restore();
  }
});
