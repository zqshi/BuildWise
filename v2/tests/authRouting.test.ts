import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppRoute } from "../src/app/authRouting.ts";

test("empty hash resolves to marketing page", () => {
  assert.equal(resolveAppRoute(""), "marketing");
});

test("marketing aliases resolve to marketing page", () => {
  assert.equal(resolveAppRoute("#/"), "marketing");
  assert.equal(resolveAppRoute("#/home"), "marketing");
});

test("login hash resolves to login page", () => {
  assert.equal(resolveAppRoute("#/login"), "login");
});

test("workspace hashes keep workspace route", () => {
  assert.equal(resolveAppRoute("#/dashboard"), "workspace");
  assert.equal(resolveAppRoute("#/projects"), "workspace");
});
