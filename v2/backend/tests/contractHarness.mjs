import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createHttpTestClient, versionedPath } from "./httpTestClient.mjs";

export async function createContractHarness(options = {}) {
  const defaultPorts =
    process.env.STORAGE_BACKEND === "sqlite" ? [6911, 6923, 6935, 6947] : [6909, 6921, 6933, 6945];
  const requestedPort = process.env.CONTRACT_TEST_PORT ? Number(process.env.CONTRACT_TEST_PORT) : null;
  const candidatePorts = requestedPort ? [requestedPort] : defaultPorts;
  let base = (options.baseUrl || process.env.CONTRACT_BASE_URL || "").replace(/\/+$/, "");
  const llmConfigured = process.env.CONTRACT_ENABLE_LLM === "1" && Boolean(process.env.LLM_API_BASE && process.env.LLM_API_BASE.trim());
  const requestTimeoutMs = Number(process.env.CONTRACT_REQUEST_TIMEOUT_MS || 180000);
  const requestRetryTimes = Math.max(0, Number(process.env.CONTRACT_REQUEST_RETRY_TIMES || 2));
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-contract-"));
  const useExternalServer = Boolean((options.baseUrl || process.env.CONTRACT_BASE_URL || "").trim());
  const app = options.app || null;
  const defaultHeaders = options.defaultHeaders || {
    "x-role": "owner",
    "x-user-id": "contract-owner"
  };

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = requestTimeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function isRetryableFetchError(error) {
    const code = error?.cause?.code || error?.code || "";
    if (code === "ECONNRESET" || code === "EPIPE" || code === "UND_ERR_SOCKET") {
      return true;
    }
    if (error?.name === "AbortError") {
      return true;
    }
    const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
    return message.includes("fetch failed") || message.includes("socket") || message.includes("network") || message.includes("aborted");
  }

  async function fetchWithRetry(url, options = {}, timeoutMs = requestTimeoutMs) {
    let lastError = null;
    for (let attempt = 0; attempt <= requestRetryTimes; attempt += 1) {
      try {
        return await fetchWithTimeout(url, options, timeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt >= requestRetryTimes || !isRetryableFetchError(error)) {
          throw error;
        }
        await delay(150 * (attempt + 1));
      }
    }
    throw lastError;
  }

  async function waitForHealth(timeoutMs = 8000) {
    if (app) {
      const client = createHttpTestClient({ app, defaultHeaders, requestTimeoutMs });
      await client.waitForHealth();
      return;
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetchWithTimeout(`${base}/health`, {}, 1000);
        if (response.ok) {
          return;
        }
      } catch {}
      await delay(200);
    }
    throw new Error("Backend did not become healthy in time");
  }

  let server = null;
  let stdout = "";
  let stderr = "";

  if (!app && !useExternalServer) {
    const workspaceRoot = path.resolve(process.cwd(), "..", "..");
    const dataFixture = path.join(fixtureDir, "data.json");
    const sqliteFixture = path.join(fixtureDir, "workspace.db");
    cpSync(path.join(workspaceRoot, "v2", "backend", "data.json"), dataFixture);

    let startupError = null;
    for (const port of candidatePorts) {
      base = `http://127.0.0.1:${port}`;
      stdout = "";
      stderr = "";
      const serverEnv = {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        AUTH_MODE: "off",
        WORKSPACE_DATA_FILE: dataFixture,
        WORKSPACE_DB_FILE: sqliteFixture,
        // 契约 fixture sqlite 为空 db，必须显式 seed data.json 的迭代/项目等基础数据，
        // 否则 policy-execute 等依赖迭代1 的断言会 404。.env 默认 ALLOW_SEED_DATA_BOOTSTRAP=false
        // （避免 dev 覆盖已有 workspace.db），此处针对空 fixture db 显式开启。
        ALLOW_SEED_DATA_BOOTSTRAP: "true",
        BUILDWISE_PREFER_PROCESS_ENV: "1",
        LLM_REQUEST_TIMEOUT_MS: "15000"
      };

      if (!llmConfigured) {
        serverEnv.LLM_API_BASE = "";
        serverEnv.LLM_API_KEY = "";
        serverEnv.LLM_MODEL = "";
      }

      server = spawn("node", ["dist/index.js"], {
        cwd: process.cwd(),
        env: serverEnv,
        stdio: ["ignore", "pipe", "pipe"]
      });
      server.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      server.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      try {
        await waitForHealth();
        startupError = null;
        break;
      } catch (error) {
        startupError = error;
        server.kill("SIGTERM");
        server = null;
        if (!/listen /i.test(stderr)) {
          break;
        }
      }
    }

    if (startupError) {
      if (stdout.trim()) {
        console.error(stdout);
      }
      if (stderr.trim()) {
        console.error(stderr);
      }
      throw startupError;
    }
  } else {
    await waitForHealth();
  }

  const client = app
    ? createHttpTestClient({ app, defaultHeaders, requestTimeoutMs, tokenByRole: options.tokenByRole })
    : {
        async getJson(routePath) {
          const response = await fetchWithRetry(`${base}${versionedPath(routePath)}`, {
            headers: defaultHeaders
          });
          assert(response.ok, `Request failed: ${routePath} -> ${response.status}`);
          return response.json();
        },
        async request(routePath, requestOptions) {
          const headers = {
            ...defaultHeaders,
            ...(requestOptions?.headers || {})
          };
          const response = await fetchWithRetry(
            `${base}${versionedPath(routePath)}`,
            {
              ...requestOptions,
              headers
            }
          );
          const contentType = response.headers.get("content-type") || "";
          const payload = contentType.includes("application/json") ? await response.json() : await response.text();
          return { res: response, payload };
        }
      };

  return {
    assert,
    base,
    features: options.features || {},
    fixtureDir,
    getJson: client.getJson,
    request: client.request,
    cleanup() {
      if (server) {
        server.kill("SIGTERM");
      }
      rmSync(fixtureDir, { recursive: true, force: true });
    },
    logFailure(error) {
      console.error("Contract test failed:", error);
      if (stdout.trim()) {
        console.error(stdout);
      }
      if (stderr.trim()) {
        console.error(stderr);
      }
    }
  };
}
