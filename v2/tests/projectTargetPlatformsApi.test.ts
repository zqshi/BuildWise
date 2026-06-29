import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createProject, updateProjectTargetPlatforms } from "../src/app/workspaceApi.ts";

// 前端副作用测试需 window/localStorage，node:test 默认无，用 jsdom 注入 global。
// token 为 null 时 fetchJSON 跳过 ensureFreshToken，空 localStorage 即可隔离 LLM/网络。
const dom = new JSDOM("<!DOCTYPE html>", { url: "http://localhost" });
(globalThis as Record<string, unknown>).window = dom.window;
(globalThis as Record<string, unknown>).localStorage = dom.window.localStorage;
(globalThis as Record<string, unknown>).document = dom.window.document;

type FetchCall = { url: string; method?: string; body?: string };

/** stub globalThis.fetch，捕获调用 URL/method/body，回固定 JSON。 */
function stubFetchCapturing(response: unknown): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = (globalThis as { fetch: unknown }).fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({
      url,
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return Promise.resolve(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      (globalThis as { fetch: unknown }).fetch = original;
    },
  };
}

test("新建项目时透传声明的目标端：POST body 含 targetPlatforms", async () => {
  const { calls, restore } = stubFetchCapturing({
    id: 1, name: "多端项目", description: "d", status: "active", targetPlatforms: ["web", "ios"],
  });
  try {
    await createProject({ name: "多端项目", description: "d", targetPlatforms: ["web", "ios"] });
    const call = calls[0];
    assert.match(call.url ?? "", /\/api\/v1\/projects$/, "应 POST 到项目创建路由");
    assert.equal(call.method, "POST");
    const body = JSON.parse(call.body ?? "{}");
    assert.deepEqual(body.targetPlatforms, ["web", "ios"], "声明的目标端应透传到请求体");
  } finally {
    restore();
  }
});

test("新建项目未声明目标端：body 不含 targetPlatforms 字段（向后兼容旧项目）", async () => {
  const { calls, restore } = stubFetchCapturing({ id: 2, name: "P", description: "d", status: "active" });
  try {
    await createProject({ name: "P", description: "d" });
    const body = JSON.parse(calls[0].body ?? "{}");
    assert.equal("targetPlatforms" in body, false, "未声明时不应传 targetPlatforms，由后端默认兜底");
  } finally {
    restore();
  }
});

test("更新项目目标端：POST 子资源路由 + body 含目标端集合", async () => {
  const { calls, restore } = stubFetchCapturing({ ok: true, targetPlatforms: ["web", "android"] });
  try {
    await updateProjectTargetPlatforms(5, ["web", "android"]);
    const call = calls[0];
    assert.match(call.url ?? "", /\/api\/v1\/projects\/5\/target-platforms$/, "应 POST 到目标端编辑子路由");
    assert.equal(call.method, "POST");
    const body = JSON.parse(call.body ?? "{}");
    assert.deepEqual(body.targetPlatforms, ["web", "android"], "目标端集合应作为请求体透传");
  } finally {
    restore();
  }
});
