import assert from "node:assert/strict";
import test from "node:test";
import { normalizeApiBase, shouldUseSameOriginProxy } from "../src/app/workspaceApiCore.ts";

test("normalizeApiBase strips trailing /api suffix only once", () => {
  assert.equal(normalizeApiBase("http://127.0.0.1:5055/api"), "http://127.0.0.1:5055");
  assert.equal(normalizeApiBase("https://api.example.com"), "https://api.example.com");
});

test("shouldUseSameOriginProxy collapses localhost cross-port api base", () => {
  assert.equal(shouldUseSameOriginProxy("http://127.0.0.1:4173", "http://127.0.0.1:5055/api"), true);
  assert.equal(shouldUseSameOriginProxy("http://localhost:4173", "http://localhost:5055"), true);
});

test("shouldUseSameOriginProxy keeps explicit remote api host", () => {
  assert.equal(shouldUseSameOriginProxy("http://127.0.0.1:4173", "https://api.example.com"), false);
  assert.equal(shouldUseSameOriginProxy("https://app.example.com", "https://api.example.com"), false);
});
