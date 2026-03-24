import { collectAlertBaseline } from "./releaseVerificationSupport.mjs";

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

async function main() {
  const report = await collectAlertBaseline({ getJson, thresholds });
  report.apiBase = API_BASE;
  console.log(JSON.stringify(report, null, 2));
  if (report.alerts.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`[alert-baseline] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
