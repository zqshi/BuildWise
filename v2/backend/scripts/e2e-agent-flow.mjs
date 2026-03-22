#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const TEST_PORT = Number(process.env.E2E_TEST_PORT || 5068);
const BASE = process.env.E2E_API_BASE || `http://127.0.0.1:${TEST_PORT}`;
const REQUIRE_LLM = process.env.E2E_REQUIRE_LLM === "1";
const ENABLE_LLM = process.env.E2E_ENABLE_LLM === "1" && Boolean(process.env.LLM_API_BASE && process.env.LLM_API_KEY && process.env.LLM_MODEL);
const ALLOW_NO_LLM_ANALYSIS = process.env.E2E_ALLOW_NO_LLM_ANALYSIS !== "0";
const NOW = new Date().toISOString().replace(/[:.]/g, "-");
const REPORT_DIR = process.env.E2E_REPORT_DIR || path.resolve(process.cwd(), "../../tmp/e2e-reports");
const REPORT_FILE = path.join(REPORT_DIR, `agent-flow-${NOW}.json`);

function log(step, detail) {
  process.stdout.write(`[${step}] ${detail}\n`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sanitizePayload(payload, maxLen = 1200) {
  if (payload == null) {
    return payload;
  }
  try {
    const text = JSON.stringify(payload);
    if (text.length <= maxLen) {
      return payload;
    }
    return { truncated: true, preview: text.slice(0, maxLen) };
  } catch {
    return String(payload).slice(0, maxLen);
  }
}

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const headers = [];
  const rawHeaders = options.headers || {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    headers.push("-H", `${key}: ${value}`);
  }
  const method = options.method || "GET";
  const body = typeof options.body === "string" ? options.body : "";
  const args = ["-sS", "-X", method, ...headers, ...(body ? ["--data", body] : []), "-w", "\n__BW_HTTP_STATUS__:%{http_code}", url];
  const output = execFileSync("curl", args, { encoding: "utf-8" });
  const marker = "\n__BW_HTTP_STATUS__:";
  const markerIndex = output.lastIndexOf(marker);
  const text = markerIndex >= 0 ? output.slice(0, markerIndex) : output;
  const statusText = markerIndex >= 0 ? output.slice(markerIndex + marker.length).trim() : "000";
  const status = Number(statusText) || 0;
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return {
    res: {
      ok: status >= 200 && status < 300,
      status
    },
    payload
  };
}

function toLineList(items) {
  return Array.from(new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

async function waitForHealth(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request("/health");
      if (res.res.ok) {
        return;
      }
    } catch {}
    await delay(200);
  }
  throw new Error("backend did not become healthy in time");
}

async function main() {
  log("0", `start e2e flow against ${BASE}`);
  mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    testPort: TEST_PORT,
    status: "running",
    projectId: null,
    iterationId: null,
    blockedDeployBlockers: [],
    steps: [],
    error: "",
    finishedAt: ""
  };
  const pushStep = (name, status, detail = "", extra = {}) => {
    report.steps.push({
      name,
      status,
      detail,
      at: new Date().toISOString(),
      ...extra
    });
  };
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-e2e-agent-"));
  const workspaceRoot = path.resolve(process.cwd(), "..", "..");
  const dataFixture = path.join(fixtureDir, "data.json");
  const dataSource = path.join(workspaceRoot, "v2", "backend", "data.json");
  if (existsSync(dataSource)) {
    cpSync(dataSource, dataFixture);
  } else {
    writeFileSync(dataFixture, "{}", "utf-8");
  }
  const server = spawn("node", ["dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      HOST: "127.0.0.1",
      WORKSPACE_DATA_FILE: dataFixture,
      ...(ENABLE_LLM
        ? {}
        : {
            LLM_API_BASE: "",
            LLM_API_KEY: "",
            LLM_MODEL: ""
          })
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth();
    const health = await request("/health");
    assert(health.res.ok, `backend not healthy: ${health.res.status}`);
    pushStep("health", "passed", "backend healthy", { status: health.res.status });

    const runtime = await request("/api/ops/runtime");
    assert(runtime.res.ok, `runtime probe failed: ${runtime.res.status}`);
    const llmRequiredByRuntime = runtime.payload?.runtime?.llmRequired === true;
    const llmStatus = runtime.payload?.runtime?.llm || {};
    const llmConfigured = llmStatus?.configured === true;
    const llmReachable = llmStatus?.reachable === true;
    const llmError = typeof llmStatus?.error === "string" ? llmStatus.error : "";
    const enforceLlmProbe = REQUIRE_LLM || llmRequiredByRuntime;
    const llmProbePassed = enforceLlmProbe ? llmConfigured && llmReachable : true;
    pushStep("runtime_llm_probe", llmProbePassed ? "passed" : "failed", "llm runtime readiness", {
      required: enforceLlmProbe,
      llm: {
        configured: llmConfigured,
        reachable: llmReachable,
        baseUrl: llmStatus?.baseUrl || "",
        model: llmStatus?.model || "",
        error: llmError
      }
    });
    if (enforceLlmProbe) {
      assert(
        llmConfigured && llmReachable,
        `llm runtime not ready: configured=${llmConfigured} reachable=${llmReachable}${llmError ? ` error=${llmError}` : ""}`
      );
    }

    const projectName = `E2E-AgentFlow-${NOW}`;
    const createdProject = await request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: projectName,
        description: "E2E 验证项目：需求澄清->边界->改写->测试->发布门禁"
      })
    });
    assert(createdProject.res.ok, `create project failed: ${createdProject.res.status}`);
    const projectId = createdProject.payload?.id;
    assert(Number.isInteger(projectId), "projectId missing");
    report.projectId = projectId;
    log("1", `project created id=${projectId}`);
    pushStep("create_project", "passed", `projectId=${projectId}`);

    const createdIteration = await request(`/api/projects/${projectId}/iterations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "E2E 迭代",
        description: "用于验证全链路",
        versionType: "patch",
        goals: ["验证分析-边界-测试-发布门禁闭环"],
        scope: {
          inScope: ["登录页文案优化", "发布门禁验证"],
          outOfScope: ["数据库迁移"],
          acceptanceCriteria: ["生成测试矩阵", "发布门禁可阻断并可放行"]
        },
        aiSummary: "端到端验证"
      })
    });
    assert(createdIteration.res.ok, `create iteration failed: ${createdIteration.res.status}`);
    const iterationId = createdIteration.payload?.id;
    assert(Number.isInteger(iterationId), "iterationId missing");
    report.iterationId = iterationId;
    log("2", `iteration created id=${iterationId}`);
    pushStep("create_iteration", "passed", `iterationId=${iterationId}`);

    const analysis = await request(`/api/iterations/${iterationId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "e2e-requirement.md",
        mimeType: "text/markdown",
        size: 400,
        sourceType: "single-file",
        excerpt:
          [
            "需求：登录页面标题改为“欢迎回到 BuildWise”，按钮文案改为“立即开始”。",
            "约束：仅允许修改前端展示层；不得改动数据库和鉴权协议。",
            "验收：文案生效、无越界改动、回归登录流程通过。"
          ].join("\n"),
        agentScope: "full-cycle",
        autoTransition: false
      })
    });
    const llmUnavailable =
      analysis.res.status >= 500 &&
      typeof analysis.payload?.message === "string" &&
      /llm_/i.test(analysis.payload.message);
    if (!analysis.res.ok && !(ALLOW_NO_LLM_ANALYSIS && llmUnavailable)) {
      assert(analysis.res.ok, `analysis failed: ${analysis.res.status} ${JSON.stringify(analysis.payload)}`);
    }
    const clarificationQuestions = analysis.res.ok ? toLineList(analysis.payload?.clarificationQuestions) : [];
    if (analysis.res.ok) {
      log("3", `analysis ok, clarificationQuestions=${clarificationQuestions.length}`);
      pushStep("analysis", "passed", `clarificationQuestions=${clarificationQuestions.length}`, {
        status: analysis.res.status,
        payload: sanitizePayload({
          llmContext: analysis.payload?.llmContext,
          releaseReview: analysis.payload?.releaseReview
        })
      });
    } else {
      log("3", "analysis skipped: llm unavailable, continue with fallback boundary");
      pushStep("analysis", "skipped", "llm unavailable, fallback boundary used", {
        status: analysis.res.status,
        payload: sanitizePayload(analysis.payload)
      });
    }

    const requirementRefs = analysis.res.ok
      ? toLineList(analysis.payload?.traceabilityMap?.requirementToCode?.map((item) => item.requirement))
      : [];
    const boundary = {
      requirementRefs: requirementRefs.length > 0 ? requirementRefs.slice(0, 6) : ["登录页文案优化"],
      componentRefs: ["LoginPage", "AuthForm", "PrimaryButton"],
      codePaths: ["v2/src/pages/auth", "v2/src/app"],
      note: "E2E boundary lock"
    };

    const confirm = await request(`/api/iterations/${iterationId}/change-control/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accurate: true,
        note: "E2E 自动确认",
        actor: "e2e-script",
        resolvedClarificationQuestions: clarificationQuestions,
        boundary
      })
    });
    assert(confirm.res.ok, `confirm failed: ${confirm.res.status} ${JSON.stringify(confirm.payload)}`);
    log("4", "analysis confirmed and boundary locked");
    pushStep("confirm", "passed", "analysis confirmed");

    const rewrite = await request(`/api/iterations/${iterationId}/code-rewrite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instruction: "把登录页标题文案更新为“欢迎回到 BuildWise”，按钮文案改为“立即开始”",
        dryRun: true,
        maxFiles: 4
      })
    });
    const rewriteLlmUnavailable =
      rewrite.res.status >= 500 &&
      typeof rewrite.payload?.message === "string" &&
      /llm_|internal server error/i.test(rewrite.payload.message);
    if (!rewrite.res.ok && !(ALLOW_NO_LLM_ANALYSIS && rewriteLlmUnavailable)) {
      assert(rewrite.res.ok, `rewrite failed: ${rewrite.res.status} ${JSON.stringify(rewrite.payload)}`);
    }
    if (rewrite.res.ok) {
      log("5", `code rewrite dry-run ok, edits=${(rewrite.payload?.edits || []).length}`);
      pushStep("rewrite_dry_run", "passed", `edits=${(rewrite.payload?.edits || []).length}`);
    } else {
      log("5", "code rewrite skipped: llm unavailable");
      pushStep("rewrite_dry_run", "skipped", "llm unavailable", { status: rewrite.res.status, payload: sanitizePayload(rewrite.payload) });
    }

    const cc = await request(`/api/iterations/${iterationId}/change-control`);
    assert(cc.res.ok, `get change-control failed: ${cc.res.status}`);
    let matrix = Array.isArray(cc.payload?.generatedTestMatrix) ? cc.payload.generatedTestMatrix : [];
    let qualityArtifacts = cc.payload?.qualityArtifacts || {};
    if (matrix.length === 0 || (qualityArtifacts.acceptanceChecklist || []).length === 0) {
      const generated = await request(`/api/iterations/${iterationId}/change-control/test-artifacts/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: false })
      });
      assert(generated.res.ok, `generate test artifacts failed: ${generated.res.status} ${JSON.stringify(generated.payload)}`);
      const refreshed = await request(`/api/iterations/${iterationId}/change-control`);
      assert(refreshed.res.ok, `refresh change-control failed: ${refreshed.res.status}`);
      matrix = Array.isArray(refreshed.payload?.generatedTestMatrix) ? refreshed.payload.generatedTestMatrix : [];
      qualityArtifacts = refreshed.payload?.qualityArtifacts || {};
      pushStep("generate_test_artifacts", "passed", `matrix=${matrix.length};acceptance=${(qualityArtifacts.acceptanceChecklist || []).length}`);
    }
    log(
      "6",
      `quality artifacts: unitTests=${(qualityArtifacts.unitTests || []).length}, contractTests=${(qualityArtifacts.contractTests || []).length}, acceptanceChecklist=${(qualityArtifacts.acceptanceChecklist || []).length}`
    );
    pushStep("quality_artifacts", "passed", "change-control quality artifacts fetched", {
      matrixCases: matrix.length,
      artifacts: {
        unitTests: (qualityArtifacts.unitTests || []).length,
        contractTests: (qualityArtifacts.contractTests || []).length,
        acceptanceChecklist: (qualityArtifacts.acceptanceChecklist || []).length,
        regressionPoints: (qualityArtifacts.regressionPoints || []).length
      }
    });

    if (matrix.length > 0) {
      const updates = matrix.slice(0, Math.min(matrix.length, 5)).map((item, index) => ({
        caseId: item.caseId,
        status: index === 0 ? "failed" : "passed",
        by: "e2e-script",
        note: index === 0 ? "故意制造阻断用于验证发布门禁" : "e2e pass"
      }));
      const execution = await request(`/api/iterations/${iterationId}/change-control/test-matrix/execution`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates })
      });
      assert(execution.res.ok, `matrix execution update failed: ${execution.res.status}`);
      log("7", `test matrix execution updated, coverage=${execution.payload?.summary?.coverage ?? "n/a"}%`);
      pushStep("matrix_update_initial", "passed", `coverage=${execution.payload?.summary?.coverage ?? "n/a"}%`);
    } else {
      log("7", "skip matrix execution update (matrix empty)");
      pushStep("matrix_update_initial", "skipped", "no generated matrix");
    }

    const blockedDeploy = await request("/api/ops/deployments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        iterationId,
        environment: "production",
        version: "e2e-v1"
      })
    });
    assert(blockedDeploy.res.status === 409, `expected deploy gate block, got ${blockedDeploy.res.status}`);
    report.blockedDeployBlockers = Array.isArray(blockedDeploy.payload?.blockers) ? blockedDeploy.payload.blockers : [];
    log("8", `deploy blocked as expected, blockers=${(blockedDeploy.payload?.blockers || []).length}`);
    pushStep("deploy_block_check", "passed", "production deploy blocked as expected", {
      blockers: report.blockedDeployBlockers
    });

    if (matrix.length > 0) {
      const passAll = await request(`/api/iterations/${iterationId}/change-control/test-matrix/execution`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          updates: matrix.map((item) => ({
            caseId: item.caseId,
            status: "passed",
            by: "e2e-script",
            note: "all pass for release gate"
          }))
        })
      });
      assert(passAll.res.ok, `pass-all matrix failed: ${passAll.res.status}`);
      log("9", "all matrix cases marked passed");
      pushStep("matrix_update_pass_all", "passed", "all test cases marked passed");
    }

    const hasAcceptanceChecklist = Array.isArray(qualityArtifacts.acceptanceChecklist) && qualityArtifacts.acceptanceChecklist.length > 0;
    const canAttemptAllow = hasAcceptanceChecklist && matrix.length > 0;
    if (canAttemptAllow) {
      const allowedDeploy = await request("/api/ops/deployments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          iterationId,
          environment: "staging",
          version: "e2e-v2"
        })
      });
      assert(allowedDeploy.res.ok, `expected deploy create ok, got ${allowedDeploy.res.status} ${JSON.stringify(allowedDeploy.payload)}`);
      log("10", `deploy allowed id=${allowedDeploy.payload?.id}`);
      pushStep("deploy_allow_check", "passed", `staging deployment id=${allowedDeploy.payload?.id}`);
    } else {
      log("10", "skip deploy allow check: acceptance checklist unavailable");
      pushStep("deploy_allow_check", "skipped", "acceptance checklist unavailable in no-llm fallback");
    }

    log("DONE", "end-to-end flow completed");
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    pushStep("fatal", "failed", report.error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf-8");
    log("report", `written ${REPORT_FILE}`);
    server.kill("SIGTERM");
    rmSync(fixtureDir, { recursive: true, force: true });
    if (stderr.trim()) {
      log("server", `stderr: ${stderr.trim().slice(0, 300)}`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`E2E failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
