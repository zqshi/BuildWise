import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { loadEnvFileIntoMap } = await import("../dist/infrastructure/runtime/envFileLoader.js");

test("loadEnvFileIntoMap keeps existing values by default", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "buildwise-env-loader-"));
  try {
    writeFileSync(path.join(dir, ".env"), "LLM_API_BASE=https://api.example.com/v1\nLLM_MODEL=demo-model\n", "utf-8");
    const env = {
      LLM_API_BASE: "https://stale.example.com/v1",
      LLM_MODEL: "stale-model"
    };
    const result = loadEnvFileIntoMap({ cwd: dir, env });
    assert.equal(env.LLM_API_BASE, "https://stale.example.com/v1");
    assert.equal(env.LLM_MODEL, "stale-model");
    assert.equal(result.loaded, 0);
    assert.equal(result.skipped, 2);
    assert.equal(result.overridden, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadEnvFileIntoMap overrides configured keys", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "buildwise-env-loader-"));
  try {
    writeFileSync(
      path.join(dir, ".env"),
      "LLM_API_BASE=https://api.example.com/v1\nLLM_MODEL=demo-model\nAUTH_MODE=token\n",
      "utf-8"
    );
    const env = {
      LLM_API_BASE: "https://stale.example.com/v1",
      LLM_MODEL: "stale-model",
      AUTH_MODE: "off"
    };
    const result = loadEnvFileIntoMap({
      cwd: dir,
      env,
      overrideKeys: ["LLM_API_BASE", "LLM_MODEL"]
    });
    assert.equal(env.LLM_API_BASE, "https://api.example.com/v1");
    assert.equal(env.LLM_MODEL, "demo-model");
    assert.equal(env.AUTH_MODE, "off");
    assert.equal(result.loaded, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.overridden, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
