import assert from "node:assert/strict";
import test from "node:test";
import { buildContentSecurityPolicy } from "../viteCsp.ts";

test("CSP keeps same-origin API on self only", () => {
  const csp = buildContentSecurityPolicy({});
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /127\.0\.0\.1:5055/);
});

test("CSP allows configured cross-origin API base", () => {
  const csp = buildContentSecurityPolicy({
    apiBase: "http://127.0.0.1:5055/api"
  });
  assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:5055/);
});

test("development CSP keeps websocket sources for Vite HMR", () => {
  const csp = buildContentSecurityPolicy({
    apiBase: "http://127.0.0.1:5055",
    mode: "development"
  });
  assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:5055 ws: wss:/);
});
