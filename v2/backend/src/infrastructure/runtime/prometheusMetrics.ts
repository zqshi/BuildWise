import type { RuntimeSnapshot } from "./runtimeState";

type OpsMetricItem = {
  name: string;
  value: number;
  unit: string;
};

type OpsMetricsSnapshot = {
  generatedAt: string;
  metrics: OpsMetricItem[];
  latestAuditAt: string;
};

function sanitizeMetricName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatGauge(name: string, value: number, help: string) {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${Number.isFinite(value) ? value : 0}`];
}

export function buildPrometheusMetrics(runtime: RuntimeSnapshot, ops: OpsMetricsSnapshot, isReady: boolean) {
  const lines = [
    ...formatGauge("buildwise_up", 1, "BuildWise process health."),
    ...formatGauge("buildwise_runtime_ready", isReady ? 1 : 0, "BuildWise readiness state."),
    ...formatGauge("buildwise_runtime_shutting_down", runtime.shuttingDown ? 1 : 0, "BuildWise shutdown state."),
    ...formatGauge("buildwise_runtime_uptime_seconds", runtime.uptimeSec, "BuildWise process uptime in seconds."),
    ...formatGauge("buildwise_requests_in_flight", runtime.requests.inFlight, "Current in-flight requests."),
    ...formatGauge("buildwise_requests_total", runtime.requests.total, "Total requests served since boot."),
    ...formatGauge("buildwise_request_errors_total", runtime.requests.errors, "Total 5xx responses since boot."),
    ...formatGauge("buildwise_request_rate_limited_total", runtime.requests.rateLimited, "Total rate-limited requests since boot."),
    ...formatGauge("buildwise_request_avg_latency_ms", runtime.requests.avgLatencyMs, "Average request latency in milliseconds."),
    ...formatGauge("buildwise_llm_configured", runtime.llm.configured ? 1 : 0, "Whether LLM configuration is present."),
    ...formatGauge("buildwise_llm_reachable", runtime.llm.reachable ? 1 : 0, "Whether LLM endpoint probe is reachable."),
    ...formatGauge(
      "buildwise_dependency_storage_healthy",
      runtime.dependencies.storage.healthy ? 1 : 0,
      "Whether storage dependency probe is healthy."
    ),
    ...formatGauge(
      "buildwise_dependency_storage_required",
      runtime.dependencies.storage.required ? 1 : 0,
      "Whether storage dependency is required for readiness."
    )
  ];

  for (const metric of ops.metrics) {
    const sanitized = sanitizeMetricName(metric.name);
    if (!sanitized) {
      continue;
    }
    lines.push(`# HELP buildwise_${sanitized} BuildWise ops metric (${metric.unit || "count"}).`);
    lines.push("# TYPE buildwise_" + sanitized + " gauge");
    lines.push(`buildwise_${sanitized} ${Number.isFinite(metric.value) ? metric.value : 0}`);
  }

  return `${lines.join("\n")}\n`;
}
