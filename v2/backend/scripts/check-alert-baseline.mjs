const API_BASE = process.env.API_BASE || "http://127.0.0.1:5055";

const thresholds = {
  maxInflight: Number(process.env.ALERT_MAX_INFLIGHT || 200),
  maxAvgLatencyMs: Number(process.env.ALERT_MAX_AVG_LATENCY_MS || 800),
  minDeploymentSuccessRate: Number(process.env.ALERT_MIN_DEPLOYMENT_SUCCESS_RATE || 95),
  maxRateLimited: Number(process.env.ALERT_MAX_RATE_LIMITED || 20)
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

  const alerts = [];

  if ((status?.status || "").toLowerCase() !== "ok") {
    alerts.push(`status_not_ok:${status?.status || "unknown"}`);
  }

  if ((ready?.status || "").toLowerCase() !== "ready") {
    alerts.push(`service_not_ready:${ready?.status || "unknown"}`);
  }

  const inFlight = Number(runtime?.requests?.inFlight || 0);
  const avgLatencyMs = Number(runtime?.requests?.avgLatencyMs || 0);
  const rateLimited = Number(runtime?.requests?.rateLimited || 0);
  const deploymentSuccessRate = Number(findMetric(opsMetrics?.metrics, "deployment_success_rate") || 0);

  if (inFlight > thresholds.maxInflight) {
    alerts.push(`inflight_high:${inFlight}>${thresholds.maxInflight}`);
  }

  if (avgLatencyMs > thresholds.maxAvgLatencyMs) {
    alerts.push(`latency_high:${avgLatencyMs}>${thresholds.maxAvgLatencyMs}`);
  }

  if (rateLimited > thresholds.maxRateLimited) {
    alerts.push(`rate_limited_high:${rateLimited}>${thresholds.maxRateLimited}`);
  }

  if (deploymentSuccessRate < thresholds.minDeploymentSuccessRate) {
    alerts.push(`deploy_success_rate_low:${deploymentSuccessRate}<${thresholds.minDeploymentSuccessRate}`);
  }

  const report = {
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    thresholds,
    snapshot: {
      serviceStatus: status?.status || "unknown",
      readiness: ready?.status || "unknown",
      inFlight,
      avgLatencyMs,
      rateLimited,
      deploymentSuccessRate
    },
    alerts
  };

  console.log(JSON.stringify(report, null, 2));

  if (alerts.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`[alert-baseline] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
