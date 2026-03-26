import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nginxPath = resolve(import.meta.dirname, "..", "nginx.conf");
const nginxConfig = readFileSync(nginxPath, "utf-8");

test("nginx includes Content-Security-Policy header", () => {
  assert.match(nginxConfig, /add_header Content-Security-Policy/i);
});

test("nginx includes HSTS header", () => {
  assert.match(nginxConfig, /add_header Strict-Transport-Security/i);
});

test("nginx configures rate limiting with limit_req_zone", () => {
  assert.match(nginxConfig, /limit_req_zone/);
});

test("nginx enables gzip compression", () => {
  assert.match(nginxConfig, /gzip on/);
});
