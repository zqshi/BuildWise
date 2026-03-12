import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const TEST_PORT = Number(process.env.CONTRACT_GIT_INTAKE_TEST_PORT || String(5400 + Math.floor(Math.random() * 400)));
const BASE = (process.env.CONTRACT_BASE_URL || `http://127.0.0.1:${TEST_PORT}`).replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = Number(process.env.CONTRACT_REQUEST_TIMEOUT_MS || 120000);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function request(pathname, options) {
  const res = await fetchWithTimeout(`${BASE}${pathname}`, options);
  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await res.json() : await res.text();
  return { res, payload };
}

async function getJson(pathname) {
  const res = await fetchWithTimeout(`${BASE}${pathname}`);
  assert(res.ok, `Request failed: ${pathname} -> ${res.status}`);
  return res.json();
}

async function waitForHealth(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchWithTimeout(`${BASE}/health`, {}, 1000);
      if (res.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error("Backend did not become healthy in time");
}

const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-contract-git-intake-"));
const useExternalServer = Boolean(process.env.CONTRACT_BASE_URL && process.env.CONTRACT_BASE_URL.trim());
let server = null;

if (!useExternalServer) {
  const workspaceRoot = path.resolve(process.cwd(), "..", "..");
  const modelFixture = path.join(fixtureDir, "model.json");
  const dataFixture = path.join(fixtureDir, "data.json");
  cpSync(path.join(workspaceRoot, "v2", "model.json"), modelFixture);
  writeFileSync(
    dataFixture,
    JSON.stringify(
      {
        projects: [],
        iterations: [],
        messages: [],
        snapshots: [],
        transitions: [],
        auditLogs: [],
        versionSnapshots: [],
        projectShares: [],
        deployments: [],
        templateRuns: [],
        opsTriageTemplates: []
      },
      null,
      2
    ),
    "utf-8"
  );

  const serverEnv = {
    ...process.env,
    PORT: String(TEST_PORT),
    HOST: "127.0.0.1",
    MODEL_FILE: modelFixture,
    WORKSPACE_DATA_FILE: dataFixture,
    REPO_SYNC_INTERVAL_MS: "0",
    LLM_API_BASE: "",
    LLM_API_KEY: "",
    LLM_MODEL: "",
    ANTHROPIC_BASE_URL: "",
    ANTHROPIC_AUTH_TOKEN: "",
    ANTHROPIC_MODEL: ""
  };

  server = spawn("node", ["dist/index.js"], {
    cwd: process.cwd(),
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

let stderr = "";
let stdout = "";
if (server) {
  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
}

try {
  await waitForHealth();

  const createdProjectDecline = await request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Git Intake Decline Contract Project", description: "decline flow" })
  });
  assert(createdProjectDecline.res.status === 200, "create decline project should return 200");
  const declineProjectId = createdProjectDecline.payload?.id;
  assert(Number.isInteger(declineProjectId), "decline project id must be integer");

  const declineBootstrap = await request(`/api/projects/${declineProjectId}/repository/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "github",
      organization: "buildwise-contract",
      name: "decline-flow",
      url: "https://example.invalid/buildwise-contract-decline.git",
      defaultBranch: "main",
      repoMode: "external_git",
      requireRemoteForProduction: true,
      requireRemoteForStaging: false
    })
  });
  assert(declineBootstrap.res.status === 200, "bootstrap decline project repository should return 200");

  const createdDeclineIteration = await request(`/api/projects/${declineProjectId}/iterations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Decline Iteration", description: "first iteration with git intake prompt" })
  });
  assert(createdDeclineIteration.res.status === 200, "create first decline iteration should return 200");
  const declineIterationId = createdDeclineIteration.payload?.id;
  assert(Number.isInteger(declineIterationId), "decline iteration id must be integer");
  assert(
    createdDeclineIteration.payload?.interactionState?.gitRequirementIntake?.status === "pending-confirmation",
    "first iteration should enter pending-confirmation when git repository exists"
  );

  const declineMessages = await getJson(`/api/iterations/${declineIterationId}/messages`);
  assert(Array.isArray(declineMessages), "iteration messages should be array");
  assert(
    declineMessages.some(
      (message) =>
        message.role === "assistant" &&
        typeof message.content === "string" &&
        message.content.includes("是否需要我先读取仓库")
    ),
    "first iteration should include git requirement intake confirmation prompt"
  );

  const pendingReply = await request(`/api/iterations/${declineIterationId}/agent-chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "继续" })
  });
  assert(pendingReply.res.status === 200, "agent-chat pending reply should return 200");
  assert(
    Array.isArray(pendingReply.payload?.guidance?.suggestedActions) &&
      pendingReply.payload.guidance.suggestedActions.length > 0,
    "pending decision should return actionable guidance"
  );

  const declineReply = await request(`/api/iterations/${declineIterationId}/agent-chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "暂不读取仓库" })
  });
  assert(declineReply.res.status === 200, "agent-chat decline should return 200");
  assert(
    declineReply.payload?.llm?.reason === "git-intake-declined-branch",
    "decline decision should hit deterministic declined branch"
  );
  assert(declineReply.payload?.llm?.used === false, "decline decision should not call llm");

  const declineContext = await getJson(`/api/iterations/${declineIterationId}/context`);
  assert(
    declineContext?.iteration?.interactionState?.gitRequirementIntake?.status === "declined",
    "decline decision should persist declined status in iteration context"
  );
  const createdFollowupIteration = await request(`/api/projects/${declineProjectId}/iterations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Decline Iteration Followup", description: "should not inject static onboarding copy" })
  });
  assert(createdFollowupIteration.res.status === 200, "create followup iteration should return 200");
  const followupIterationId = createdFollowupIteration.payload?.id;
  assert(Number.isInteger(followupIterationId), "followup iteration id must be integer");
  const followupMessages = await getJson(`/api/iterations/${followupIterationId}/messages`);
  assert(Array.isArray(followupMessages), "followup messages should be array");
  assert(
    followupMessages.every(
      (message) =>
        typeof message.content !== "string" || !message.content.includes("已为新迭代载入历史上下文，请先完成以下动作")
    ),
    "followup iteration should not include static onboarding script"
  );

  const createdProjectAccept = await request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Git Intake Accept Contract Project", description: "accept flow" })
  });
  assert(createdProjectAccept.res.status === 200, "create accept project should return 200");
  const acceptProjectId = createdProjectAccept.payload?.id;
  assert(Number.isInteger(acceptProjectId), "accept project id must be integer");

  const acceptBootstrap = await request(`/api/projects/${acceptProjectId}/repository/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "github",
      organization: "buildwise-contract",
      name: "accept-flow",
      url: "https://example.invalid/buildwise-contract-accept.git",
      defaultBranch: "main",
      repoMode: "external_git",
      requireRemoteForProduction: true,
      requireRemoteForStaging: false
    })
  });
  assert(acceptBootstrap.res.status === 200, "bootstrap accept project repository should return 200");

  const createdAcceptIteration = await request(`/api/projects/${acceptProjectId}/iterations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Accept Iteration", description: "first iteration read repository" })
  });
  assert(createdAcceptIteration.res.status === 200, "create first accept iteration should return 200");
  const acceptIterationId = createdAcceptIteration.payload?.id;
  assert(Number.isInteger(acceptIterationId), "accept iteration id must be integer");

  const acceptReply = await request(`/api/iterations/${acceptIterationId}/agent-chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "读取仓库" })
  });
  assert(acceptReply.res.status === 200, "agent-chat accept should return 200");
  assert(acceptReply.payload?.llm?.used === false, "accept decision should not call llm");
  assert(
    acceptReply.payload?.llm?.reason === "git-intake-deterministic-branch",
    "accept decision should return deterministic branch reason"
  );
  assert(
    typeof acceptReply.payload?.reply === "string" &&
      (acceptReply.payload.reply.includes("读取仓库失败") || acceptReply.payload.reply.includes("继续分析")),
    "invalid remote should return deterministic read-failed prompt"
  );

  const acceptContext = await getJson(`/api/iterations/${acceptIterationId}/context`);
  assert(
    acceptContext?.iteration?.interactionState?.gitRequirementIntake?.status === "read-failed",
    "failed git read should persist read-failed status in iteration context"
  );
  assert(
    typeof acceptContext?.iteration?.interactionState?.gitRequirementIntake?.error === "string" &&
      acceptContext.iteration.interactionState.gitRequirementIntake.error.length > 0,
    "failed git read should include error details"
  );

  const createdProjectSync = await request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Repo Sync Alert Contract Project", description: "periodic sync failure alert" })
  });
  assert(createdProjectSync.res.status === 200, "create sync project should return 200");
  const syncProjectId = createdProjectSync.payload?.id;
  assert(Number.isInteger(syncProjectId), "sync project id must be integer");

  const syncBootstrap = await request(`/api/projects/${syncProjectId}/repository/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "github",
      organization: "buildwise-contract",
      name: "sync-flow",
      url: "https://example.invalid/buildwise-contract-sync.git",
      defaultBranch: "main",
      repoMode: "hybrid",
      requireRemoteForProduction: true,
      requireRemoteForStaging: false
    })
  });
  assert(syncBootstrap.res.status === 200, "bootstrap sync project repository should return 200");

  const scaffoldSyncRepo = await request(`/api/projects/${syncProjectId}/repository/scaffold`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rootDir: path.join(fixtureDir, "repos-sync"),
      initializeGit: true,
      createInitialCommit: true,
      dryRun: false
    })
  });
  assert(scaffoldSyncRepo.res.status === 200, "scaffold sync project repository should return 200");

  const createdSyncIteration = await request(`/api/projects/${syncProjectId}/iterations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Sync Alert Iteration", description: "sync failure should be surfaced in chat" })
  });
  assert(createdSyncIteration.res.status === 200, "create sync iteration should return 200");
  const syncIterationId = createdSyncIteration.payload?.id;
  assert(Number.isInteger(syncIterationId), "sync iteration id must be integer");

  const syncAlert = await request(`/api/iterations/${syncIterationId}/agent-chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "继续" })
  });
  assert(syncAlert.res.status === 200, "agent-chat sync alert should return 200");
  assert(
    syncAlert.payload?.llm?.reason === "repository-periodic-sync-failed",
    "periodic repository sync failure should return deterministic failure branch"
  );
  assert(
    typeof syncAlert.payload?.reply === "string" && syncAlert.payload.reply.includes("仓库定期同步失败"),
    "sync failure should be communicated in coach reply"
  );

  console.log("contract.git-intake.mjs passed");
} finally {
  if (server) {
    server.kill("SIGTERM");
    await delay(200);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
  }
  rmSync(fixtureDir, { recursive: true, force: true });
  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
  if (stdout.trim()) {
    process.stdout.write(stdout);
  }
}
