import { test } from "node:test";
import assert from "node:assert/strict";

import { versionedPath } from "./httpTestClient.mjs";

// 防回归：契约子进程模式曾因缺少 /api/v1/ 短路，把 /api/v1/status 改写成
// /api/v1/v1/status 导致 404。versionedPath 是 in-process 与子进程双模式
// 共用的唯一路径改写函数，必须保证已带版本前缀的路径不被二次改写。
test("versionedPath 不对已带 /api/v1/ 前缀的路径二次改写", () => {
  assert.equal(versionedPath("/api/v1/status"), "/api/v1/status");
});

test("versionedPath 为 /api/ 前缀补全 /api/v1/", () => {
  assert.equal(versionedPath("/api/status"), "/api/v1/status");
});

test("versionedPath 不改写非 /api/ 路径（如健康检查）", () => {
  assert.equal(versionedPath("/health"), "/health");
});
