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

function findMetric(metrics, name) {
  return Array.isArray(metrics) ? metrics.find((item) => item?.name === name)?.value : undefined;
}

async function main() {
  const [status, ready, runtime, opsMetrics] = await Promise.all([
    getJson("/api/status"),
    getJson("/ready"),
    getJson("/api/ops/runtime"),
    getJson("/api/ops/metrics")
  ]);

  const llm = status?.runtime?.llm || {};
  const llmRequired = Boolean(status?.runtime?.llmRequired);
  const dependencyRequired = Boolean(status?.runtime?.dependencyRequired);
  const dependencies = status?.runtime?.dependencies || {};
  const alerts = [];

  if ((status?.status || "").toLowerCase() !== "ok") {
    alerts.push(`status_not_ok:${status?.status || "unknown"}`);
  }
  if ((ready?.status || "").toLowerCase() !== "ready") {
    alerts.push(`service_not_ready:${ready?.reason || ready?.status || "unknown"}`);
  }
  if (llmPolicy.requireConfigured && !llm.configured) {
    alerts.push(`llm_not_configured:${llm.error || "missing_configuration"}`);
  }
  if ((llmPolicy.requireReachable || llmRequired) && !llm.reachable) {
    alerts.push(`llm_not_reachable:${llm.error || "probe_failed"}`);
  }
  if (dependencyRequired) {
    if (!dependencies?.modelFile?.healthy) {
      alerts.push(`model_file_unhealthy:${dependencies?.modelFile?.detail || "unknown"}`);
    }
    if (!dependencies?.storage?.healthy) {
      alerts.push(`storage_unhealthy:${dependencies?.storage?.detail || "unknown"}`);
    }
  }

  const inFlight = Number(runtime?.requests?.inFlight || 0);
  const avgLatencyMs = Number(runtime?.requests?.avgLatencyMs || 0);
  const rateLimited = Number(runtime?.requests?.rateLimited || 0);
  const deploymentSuccessRate = Number(findMetric(opsMetrics?.metrics, "deployment_success_rate") || 0);
  const testMatrixCoverage = Number(findMetric(opsMetrics?.metrics, "iteration_test_matrix_coverage") || 100);
  const testMatrixExecutionCoverage = Number(findMetric(opsMetrics?.metrics, "iteration_test_matrix_execution_coverage") || 100);
  const testMatrixPassRate = Number(findMetric(opsMetrics?.metrics, "iteration_test_matrix_pass_rate") || 100);
  const highValueFindingsCoverage = Number(findMetric(opsMetrics?.metrics, "iteration_high_value_findings_coverage") || 100);
  const p0FindingsTotal = Number(findMetric(opsMetrics?.metrics, "iteration_p0_findings_total") || 0);
  const ignoredFilesRatio = Number(findMetric(opsMetrics?.metrics, "iteration_analysis_ignored_files_ratio") || 0);

  if (inFlight > alertThresholds.maxInflight) {
    alerts.push(`inflight_high:${inFlight}>${alertThresholds.maxInflight}`);
  }
  if (avgLatencyMs > alertThresholds.maxAvgLatencyMs) {
    alerts.push(`latency_high:${avgLatencyMs}>${alertThresholds.maxAvgLatencyMs}`);
  }
  if (rateLimited > alertThresholds.maxRateLimited) {
    alerts.push(`rate_limited_high:${rateLimited}>${alertThresholds.maxRateLimited}`);
  }
  if (deploymentSuccessRate < alertThresholds.minDeploymentSuccessRate) {
    alerts.push(`deploy_success_rate_low:${deploymentSuccessRate}<${alertThresholds.minDeploymentSuccessRate}`);
  }
  if (testMatrixCoverage < alertThresholds.minTestMatrixCoverage) {
    alerts.push(`test_matrix_coverage_low:${testMatrixCoverage}<${alertThresholds.minTestMatrixCoverage}`);
  }
  if (testMatrixExecutionCoverage < alertThresholds.minTestMatrixExecutionCoverage) {
    alerts.push(`test_matrix_execution_coverage_low:${testMatrixExecutionCoverage}<${alertThresholds.minTestMatrixExecutionCoverage}`);
  }
  if (testMatrixPassRate < alertThresholds.minTestMatrixPassRate) {
    alerts.push(`test_matrix_pass_rate_low:${testMatrixPassRate}<${alertThresholds.minTestMatrixPassRate}`);
  }
  if (highValueFindingsCoverage < alertThresholds.minHighValueFindingsCoverage) {
    alerts.push(`high_value_findings_coverage_low:${highValueFindingsCoverage}<${alertThresholds.minHighValueFindingsCoverage}`);
  }
  if (p0FindingsTotal > alertThresholds.maxP0FindingsTotal) {
    alerts.push(`p0_findings_total_high:${p0FindingsTotal}>${alertThresholds.maxP0FindingsTotal}`);
  }
  if (ignoredFilesRatio > alertThresholds.maxIgnoredFilesRatio) {
    alerts.push(`ignored_files_ratio_high:${ignoredFilesRatio}>${alertThresholds.maxIgnoredFilesRatio}`);
  }

  const report = {
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    policies: { llmPolicy, alertThresholds },
    snapshot: {
      status: status?.status || "unknown",
      ready: ready?.status || "unknown",
      readyReason: ready?.reason || "",
      llmRequired,
      dependencyRequired,
      llm: {
        configured: Boolean(llm.configured),
        reachable: Boolean(llm.reachable),
        baseUrl: llm.baseUrl || "",
        model: llm.model || "",
        checkedAt: llm.checkedAt || "",
        error: llm.error || ""
      },
      dependencies: {
        modelFile: {
          healthy: Boolean(dependencies?.modelFile?.healthy),
          detail: dependencies?.modelFile?.detail || ""
        },
        storage: {
          healthy: Boolean(dependencies?.storage?.healthy),
          detail: dependencies?.storage?.detail || ""
        }
      },
      runtime: {
        inFlight,
        avgLatencyMs,
        rateLimited,
        deploymentSuccessRate,
        testMatrixCoverage,
        testMatrixExecutionCoverage,
        testMatrixPassRate,
        highValueFindingsCoverage,
        p0FindingsTotal,
        ignoredFilesRatio
      }
    },
    alerts
  };

  console.log(JSON.stringify(report, null, 2));

  if (alerts.length > 0) {
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
