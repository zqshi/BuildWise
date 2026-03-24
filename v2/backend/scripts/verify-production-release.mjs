import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectAlertBaseline, collectLlmBaseline, collectPreflightBaseline, runBackupRestoreDrill } from "./releaseVerificationSupport.mjs";
import { createHttpTestClient } from "../tests/httpTestClient.mjs";
import { createContractHarness } from "../tests/contractHarness.mjs";
import { runContractGitIntakeScenario } from "../tests/contractGitIntakeScenario.mjs";
import { runContractGovernanceScenario } from "../tests/contractGovernanceScenario.mjs";
import { runContractLifecycleScenario } from "../tests/contractLifecycleScenario.mjs";

const backendRoot = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(backendRoot, "dist");
const tempRoot = path.join(os.tmpdir(), `buildwise-prod-verify-${Date.now()}`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildReleaseEnv() {
  return {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "5055",
    AUTH_MODE: "jwt",
    JWT_SECRET: "12345678901234567890123456789012",
    CORS_ORIGINS: "http://127.0.0.1",
    STORAGE_BACKEND: "sqlite",
    WORKSPACE_DB_FILE: path.join(tempRoot, "workspace.db"),
    WORKSPACE_DATA_FILE: path.join(tempRoot, "data.runtime.json"),
    ALLOW_SEED_DATA_BOOTSTRAP: "false",
    LLM_REQUIRED: "false",
    LLM_API_BASE: "",
    LLM_API_KEY: "",
    LLM_MODEL: "",
    BUILDWISE_PREFER_PROCESS_ENV: "1",
    BACKUP_ROOT: path.join(tempRoot, "backups"),
    ALERT_MIN_DEPLOYMENT_SUCCESS_RATE: "0",
    LLM_CHECK_REQUIRE_CONFIGURED: "false",
    LLM_CHECK_REQUIRE_REACHABLE: "false"
  };
}

mkdirSync(tempRoot, { recursive: true });
writeFileSync(path.join(tempRoot, "data.runtime.json"), JSON.stringify({ projects: [], iterations: [], messages: [] }, null, 2), "utf-8");

let appContext = null;

try {
  assert(existsSync(path.join(distRoot, "index.js")), "dist/index.js is missing, run build before verify-production-release");

  const [{ createBuildwiseApp }, { createTokenPair }] = await Promise.all([
    import(path.join(distRoot, "app.js")),
    import(path.join(distRoot, "infrastructure", "runtime", "jwt.js"))
  ]);
  const env = buildReleaseEnv();
  appContext = await createBuildwiseApp({
    env,
    dataFile: env.WORKSPACE_DATA_FILE,
    registerProcessHandlers: false,
    scheduleWorkspaceRefresh: false,
    syncWorkspaceKnowledgeOnStart: false,
    probeLlmOnStart: false
  });
  await appContext.app.ready();

  const apiClient = createHttpTestClient({ app: appContext.app });

  const llmPolicy = {
    requireConfigured: false,
    requireReachable: false
  };
  const alertThresholds = {
    maxInflight: Number(env.ALERT_MAX_INFLIGHT || 200),
    maxAvgLatencyMs: Number(env.ALERT_MAX_AVG_LATENCY_MS || 800),
    minDeploymentSuccessRate: Number(env.ALERT_MIN_DEPLOYMENT_SUCCESS_RATE || 0),
    maxRateLimited: Number(env.ALERT_MAX_RATE_LIMITED || 20),
    minTestMatrixCoverage: Number(env.ALERT_MIN_TEST_MATRIX_COVERAGE || 100),
    minTestMatrixExecutionCoverage: Number(env.ALERT_MIN_TEST_MATRIX_EXECUTION_COVERAGE || 100),
    minTestMatrixPassRate: Number(env.ALERT_MIN_TEST_MATRIX_PASS_RATE || 95),
    minHighValueFindingsCoverage: Number(env.ALERT_MIN_HIGH_VALUE_FINDINGS_COVERAGE || 90),
    maxP0FindingsTotal: Number(env.ALERT_MAX_P0_FINDINGS_TOTAL || 5),
    maxIgnoredFilesRatio: Number(env.ALERT_MAX_IGNORED_FILES_RATIO || 70)
  };
  const reports = {
    preflight: await collectPreflightBaseline({ getJson: apiClient.getJson, llmPolicy, alertThresholds }),
    alerts: await collectAlertBaseline({
      getJson: apiClient.getJson,
      thresholds: {
        maxInflight: alertThresholds.maxInflight,
        maxAvgLatencyMs: alertThresholds.maxAvgLatencyMs,
        minDeploymentSuccessRate: alertThresholds.minDeploymentSuccessRate,
        maxRateLimited: alertThresholds.maxRateLimited
      }
    }),
    llm: await collectLlmBaseline({ getJson: apiClient.getJson, policy: llmPolicy }),
    backup: runBackupRestoreDrill(env)
  };
  if (reports.preflight.alerts.length > 0 || reports.alerts.alerts.length > 0 || reports.llm.alerts.length > 0) {
    throw new Error(`production baseline has active alerts: ${JSON.stringify({
      preflight: reports.preflight.alerts,
      alerts: reports.alerts.alerts,
      llm: reports.llm.alerts
    })}`);
  }

  const seedData = JSON.parse(readFileSync(path.join(backendRoot, "data.json"), "utf-8"));
  appContext.workspaceRepo.write(seedData);
  appContext.workspaceService.upsertPlatformRoleBinding({ userId: "18800000000", role: "owner" });
  const tokenByRole = Object.fromEntries(
    ["owner", "viewer", "qa", "pm"].map((role) => [
      role,
      createTokenPair("18800000000", role, appContext.config.jwtSecret, appContext.config.jwtAccessTtlSec, appContext.config.jwtRefreshTtlSec)
        .accessToken
    ])
  );
  const defaultHeaders = {
    authorization: `Bearer ${tokenByRole.owner}`,
    "x-user-id": "18800000000",
    "x-role": "owner"
  };

  const contractState = {};
  const contractHarness = await createContractHarness({
    app: appContext.app,
    defaultHeaders,
    tokenByRole,
    features: {
      smsDebugCodeExpected: false
    }
  });
  try {
    await runContractGovernanceScenario(contractHarness, contractState);
    await runContractLifecycleScenario(contractHarness, contractState);
  } finally {
    contractHarness.cleanup();
  }
  await runContractGitIntakeScenario({
    app: appContext.app,
    fixtureDir: path.join(tempRoot, "git-intake"),
    defaultHeaders,
    tokenByRole,
    strictCoachBranchReason: false
  });
  reports.contract = { status: "passed" };
  reports.contractGitIntake = { status: "passed" };

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        mode: "in-process-production-release-verify",
        reports
      },
      null,
      2
    )
  );
} catch (error) {
  console.error("[verify-production-release]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await appContext?.app.close().catch(() => {});
  rmSync(tempRoot, { recursive: true, force: true });
}
