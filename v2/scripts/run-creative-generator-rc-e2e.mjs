#!/usr/bin/env node

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = resolve(process.cwd());
const BACKEND_DIR = resolve(ROOT, "backend");
const BROWSER_USE_PYTHON = process.env.BROWSER_USE_PYTHON || "/Users/zqs/Downloads/project/browser-use/.venv/bin/python";
const BROWSER_USE_ENV_FILE = process.env.BROWSER_USE_ENV_FILE || "/Users/zqs/Downloads/project/browser-use/.env";
const HEADLESS = process.env.BROWSER_USE_HEADLESS || "1";
const BACKEND_PORT = Number(process.env.BUILDWISE_RC_BACKEND_PORT || 5055);
const FRONTEND_PORT = Number(process.env.BUILDWISE_RC_FRONTEND_PORT || 4173);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

const RUN_ROOT = mkdtempSync(join(tmpdir(), "buildwise-creative-generator-rc-"));
const ARTIFACTS_DIR = join(RUN_ROOT, "artifacts");
const SETUP_ARTIFACTS_DIR = join(ARTIFACTS_DIR, "setup");
const BROWSER_USE_ARTIFACTS_DIR = join(ARTIFACTS_DIR, "browser-use");
const DATA_FILE = join(RUN_ROOT, "data.runtime.json");
const WORKSPACE_PATH = join(RUN_ROOT, "project-workspaces", "project-1");
const REPORT_PATH = join(RUN_ROOT, "run-report.json");

mkdirSync(SETUP_ARTIFACTS_DIR, { recursive: true });
mkdirSync(BROWSER_USE_ARTIFACTS_DIR, { recursive: true });
mkdirSync(WORKSPACE_PATH, { recursive: true });

const processes = [];

function spawnLogged(cmd, args, options = {}) {
  const proc = spawn(cmd, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  proc.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  proc.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });
  return { proc, getOutput: () => ({ stdout, stderr }) };
}

async function runCommand(label, cmd, args, options = {}) {
  const { proc, getOutput } = spawnLogged(cmd, args, options);
  return new Promise((resolvePromise, rejectPromise) => {
    proc.on("exit", (code) => {
      const output = getOutput();
      if (code === 0) {
        resolvePromise(output);
      } else {
        rejectPromise(new Error(`${label} failed: code=${code}\nstdout=${output.stdout}\nstderr=${output.stderr}`));
      }
    });
  });
}

async function waitForHttp(url, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        return;
      }
    } catch {}
    await delay(1000);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function startBackend() {
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    HOST: "127.0.0.1",
    STORAGE_BACKEND: "json",
    WORKSPACE_DATA_FILE: DATA_FILE,
    BUILDWISE_PREFER_PROCESS_ENV: "1"
  };
  const { proc, getOutput } = spawnLogged("node", ["dist/index.js"], {
    cwd: BACKEND_DIR,
    env
  });
  processes.push({ proc, label: "backend", getOutput });
  await waitForHttp(`${BACKEND_URL}/health`);
}

async function startFrontend() {
  const env = {
    ...process.env,
    VITE_API_BASE: BACKEND_URL
  };
  const { proc, getOutput } = spawnLogged("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(FRONTEND_PORT)], {
    cwd: ROOT,
    env
  });
  processes.push({ proc, label: "frontend", getOutput });
  await waitForHttp(`${FRONTEND_URL}/`);
}

async function cleanupProcesses() {
  for (const item of processes.reverse()) {
    if (item.proc.exitCode !== null) {
      continue;
    }
    item.proc.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => item.proc.once("exit", resolve)),
      delay(2000)
    ]);
    if (item.proc.exitCode === null) {
      item.proc.kill("SIGKILL");
      await Promise.race([
        new Promise((resolve) => item.proc.once("exit", resolve)),
        delay(2000)
      ]);
    }
  }
}

async function main() {
  const report = {
    ok: false,
    runRoot: RUN_ROOT,
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
    artifactsDir: ARTIFACTS_DIR,
    steps: []
  };
  try {
    report.steps.push({ step: "clean-workspace" });
    await runCommand("clean-workspace", "bash", ["scripts/clean-workspace.sh"], { cwd: ROOT });

    report.steps.push({ step: "build-frontend" });
    await runCommand("build-frontend", "npm", ["run", "build"], {
      cwd: ROOT,
      env: { ...process.env, VITE_API_BASE: BACKEND_URL }
    });

    report.steps.push({ step: "build-backend" });
    await runCommand("build-backend", "npm", ["run", "build"], { cwd: BACKEND_DIR });

    report.steps.push({ step: "seed-demo-data" });
    await runCommand("seed-demo-data", "node", ["scripts/seed-creative-generator-demo-scaffold.mjs"], {
      cwd: ROOT,
      env: {
        ...process.env,
        BUILDWISE_DEMO_DATA_FILES: DATA_FILE,
        BUILDWISE_DEMO_WORKSPACE_PATH: WORKSPACE_PATH
      }
    });

    report.steps.push({ step: "start-backend" });
    await startBackend();

    report.steps.push({ step: "start-frontend" });
    await startFrontend();

    report.steps.push({ step: "setup-creative-generator-demo" });
    const setupOutput = await runCommand("setup-creative-generator-demo", "node", ["scripts/setup-creative-generator-demo.mjs"], {
      cwd: ROOT,
      env: {
        ...process.env,
        BUILDWISE_API_BASE: BACKEND_URL,
        BUILDWISE_DEMO_ARTIFACTS_DIR: SETUP_ARTIFACTS_DIR,
        BUILDWISE_BROWSER_USE_TARGET_URL: `${FRONTEND_URL}/app.html#/dashboard`
      }
    });

    report.steps.push({ step: "browser-use-e2e" });
    const browserUseOutput = await runCommand("browser-use-e2e", BROWSER_USE_PYTHON, ["scripts/browser_use_creative_generator_e2e.py"], {
      cwd: ROOT,
      env: {
        ...process.env,
        BROWSER_USE_HEADLESS: HEADLESS,
        BROWSER_USE_ENV_FILE,
        BUILDWISE_E2E_WORKDIR: ROOT,
        BUILDWISE_E2E_ARTIFACTS_DIR: BROWSER_USE_ARTIFACTS_DIR,
        BUILDWISE_E2E_LATEST_SETUP: join(SETUP_ARTIFACTS_DIR, "creative-generator-demo-latest.json"),
        BUILDWISE_E2E_TARGET_URL: `${FRONTEND_URL}/app.html#/dashboard`
      }
    });

    report.ok = true;
    report.setup = setupOutput.stdout.trim();
    report.browserUse = browserUseOutput.stdout.trim();
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    for (const item of processes) {
      const output = item.getOutput();
      report[`${item.label}Output`] = output;
    }
    throw error;
  } finally {
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    await cleanupProcesses();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
