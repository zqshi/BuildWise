import { collectPreflightBaseline } from "./releaseVerificationSupport.mjs";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:5055";
const llmPolicy = {
  requireConfigured: process.env.LLM_CHECK_REQUIRE_CONFIGURED !== "false",
  requireReachable:
    process.env.LLM_CHECK_REQUIRE_REACHABLE === "true"
      ? true
      : process.env.LLM_CHECK_REQUIRE_REACHABLE === "false"
        ? false
        : true
};

const alertThresholds = {
  maxInflight: Number(process.env.ALERT_MAX_INFLIGHT || 200),
  maxAvgLatencyMs: Number(process.env.ALERT_MAX_AVG_LATENCY_MS || 800),
  minDeploymentSuccessRate: Number(process.env.ALERT_MIN_DEPLOYMENT_SUCCESS_RATE || 95),
  maxRateLimited: Number(process.env.ALERT_MAX_RATE_LIMITED || 20),
  minTestMatrixCoverage: Number(process.env.ALERT_MIN_TEST_MATRIX_COVERAGE || 100),
  minTestMatrixExecutionCoverage: Number(process.env.ALERT_MIN_TEST_MATRIX_EXECUTION_COVERAGE || 100),
  minTestMatrixPassRate: Number(process.env.ALERT_MIN_TEST_MATRIX_PASS_RATE || 95),
  minHighValueFindingsCoverage: Number(process.env.ALERT_MIN_HIGH_VALUE_FINDINGS_COVERAGE || 90),
  maxP0FindingsTotal: Number(process.env.ALERT_MAX_P0_FINDINGS_TOTAL || 5),
  maxIgnoredFilesRatio: Number(process.env.ALERT_MAX_IGNORED_FILES_RATIO || 70)
};

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`request failed: ${path} -> ${res.status}`);
  }
  return res.json();
}

async function main() {
  const report = await collectPreflightBaseline({ getJson, llmPolicy, alertThresholds });
  report.apiBase = API_BASE;
  console.log(JSON.stringify(report, null, 2));
  if (report.alerts.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  const report = {
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    policies: { llmPolicy, alertThresholds },
    snapshot: {
      status: "unknown",
      ready: "unknown",
      readyReason: "",
      llmRequired: false,
      dependencyRequired: false,
      llm: {
        configured: false,
        reachable: false,
        baseUrl: "",
        model: "",
        checkedAt: "",
        error: error instanceof Error ? error.message : String(error)
      },
      dependencies: {
        modelFile: { healthy: false, detail: "" },
        storage: { healthy: false, detail: "" }
      },
      runtime: {
        inFlight: 0,
        avgLatencyMs: 0,
        rateLimited: 0,
        deploymentSuccessRate: 0,
        testMatrixCoverage: 0,
        testMatrixExecutionCoverage: 0,
        testMatrixPassRate: 0,
        highValueFindingsCoverage: 0,
        p0FindingsTotal: 0,
        ignoredFilesRatio: 0
      }
    },
    alerts: [`check_failed:${error instanceof Error ? error.message : String(error)}`]
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
