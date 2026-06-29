import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderHook, act, waitFor } from "@testing-library/react";

// ─── useAuthController 副作用单测（v0.26.0 T6，v0.21.0 T3 遗留）────────────────────────────────
// 突出核心价值：认证会话的副作用——租户失效(403)自动刷新会话、认证过期自动重置、
// 页面刷新后恢复会话。补 v0.21.0 遗留的 hook 副作用测试盲区。
// useAuthController 是 React hook，须在 React 组件树内调用（renderHook），
// 否则触发 Invalid hook call；副作用经 window 事件 + jsdom 全局测。

// jsdom 全局注入（window/localStorage/document），node:test 默认无。
// 关键：Event/CustomEvent 必须用 jsdom 的构造器注入 globalThis——hook 内
// `new CustomEvent(...)` 经 window.dispatchEvent 时，jsdom 校验事件归属，
// node 原生 Event/CustomEvent 不被认（"not of type Event"）。
const dom = new JSDOM("<!DOCTYPE html>", { url: "http://localhost/#/dashboard" });
(globalThis as Record<string, unknown>).window = dom.window;
(globalThis as Record<string, unknown>).localStorage = dom.window.localStorage;
(globalThis as Record<string, unknown>).document = dom.window.document;
(globalThis as Record<string, unknown>).Event = dom.window.Event;
(globalThis as Record<string, unknown>).CustomEvent = dom.window.CustomEvent;

const { saveTokens, clearTokens } = await import("../src/infrastructure/auth/tokenStore.ts");

// jsdom 的 Event 构造器（已在 global 注入，事件分发统一走 jsdom）
const domWindow = dom.window as unknown as typeof window & { Event: typeof Event };
function buildEvent(type: string): Event {
  return new domWindow.Event(type);
}

function mockFetchSessionOk() {
  // fetchAuthSession 经 fetchJSON → ensureFreshToken（tokenStore 内存态，需预置 token）
  // ensureFreshToken 检查 token 不即将过期才放行；saveTokens 设长 expiresIn
  (globalThis as { fetch: unknown }).fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          ok: true,
          user: { phone: "13900000001", platformRole: "user", workspaceRole: "owner" },
          currentTenantId: "t1",
          tenants: [{ tenantId: "t1", tenantName: "租户1", workspaceRole: "owner" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )) as typeof fetch;
}

function restoreFetch(): void {
  // @ts-expect-error reset to native fetch for isolation
  delete (globalThis as { fetch?: unknown }).fetch;
}

function setupFreshToken() {
  // 预置有效 token（长 expiresIn），使 ensureFreshToken 放行
  saveTokens("test-access-token", 3600);
}

test("tenant-stale 事件触发 refreshSession：拉取最新租户并标记已认证", async () => {
  mockFetchSessionOk();
  setupFreshToken();
  const { useAuthController } = await import("../src/app/useAuthController.ts");

  // 无 prior session（localStorage 无 buildwise:auth=logged_in）→ 初始未认证
  const { result } = renderHook(() => useAuthController());

  // 模拟租户失效事件（fetchJSON 403 dispatch 的）
  await act(async () => {
    window.dispatchEvent(buildEvent("buildwise:tenant-stale"));
  });

  // refreshSession 拉取 session 成功 → isAuthenticated true
  await waitFor(() => {
    assert.equal(result.current.isAuthenticated, true);
  });
  assert.equal(result.current.currentTenantId, "t1");

  clearTokens();
  restoreFetch();
});

test("auth-expired 事件触发 resetAuthState：清除认证并跳转登录", async () => {
  mockFetchSessionOk();
  setupFreshToken();
  const { useAuthController } = await import("../src/app/useAuthController.ts");

  const { result } = renderHook(() => useAuthController());
  // 先触发 tenant-stale 建立已认证态
  await act(async () => {
    window.dispatchEvent(buildEvent("buildwise:tenant-stale"));
  });
  await waitFor(() => assert.equal(result.current.isAuthenticated, true));

  // 触发认证过期事件
  await act(async () => {
    window.dispatchEvent(buildEvent("buildwise:auth-expired"));
  });

  assert.equal(result.current.isAuthenticated, false);
  assert.equal(window.location.hash, "#/login");

  clearTokens();
  restoreFetch();
});

test("无 prior session（未登录过）→ 不调用 refreshSession，sessionRestoring 归 false", async () => {
  // 确保 localStorage 无 logged_in 标记
  localStorage.removeItem("buildwise:auth");
  let fetchCalled = false;
  (globalThis as { fetch: unknown }).fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  const { useAuthController } = await import("../src/app/useAuthController.ts");
  const { result } = renderHook(() => useAuthController());

  await waitFor(() => assert.equal(result.current.sessionRestoring, false));
  assert.equal(fetchCalled, false, "无 prior session 不应调 fetch");

  clearTokens();
  restoreFetch();
});
