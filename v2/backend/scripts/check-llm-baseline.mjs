const API_BASE = process.env.API_BASE || "http://127.0.0.1:5055";

const policy = {
  requireConfigured: process.env.LLM_CHECK_REQUIRE_CONFIGURED !== "false",
  requireReachable:
    process.env.LLM_CHECK_REQUIRE_REACHABLE === "true"
      ? true
      : process.env.LLM_CHECK_REQUIRE_REACHABLE === "false"
        ? false
        : true
};

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`request failed: ${path} -> ${res.status}`);
  }
  return res.json();
}

async function main() {
  const [status, ready] = await Promise.all([getJson("/api/status"), getJson("/ready")]);
  const llm = status?.runtime?.llm || {};
  const llmRequired = Boolean(status?.runtime?.llmRequired);

  const alerts = [];
  if ((status?.status || "").toLowerCase() !== "ok") {
    alerts.push(`status_not_ok:${status?.status || "unknown"}`);
  }
  if (policy.requireConfigured && !llm.configured) {
    alerts.push(`llm_not_configured:${llm.error || "missing_configuration"}`);
  }
  if ((policy.requireReachable || llmRequired) && !llm.reachable) {
    alerts.push(`llm_not_reachable:${llm.error || "probe_failed"}`);
  }
  if ((ready?.status || "").toLowerCase() !== "ready") {
    alerts.push(`service_not_ready:${ready?.reason || ready?.status || "unknown"}`);
  }

  const report = {
    checkedAt: new Date().toISOString(),
    apiBase: API_BASE,
    policy,
    snapshot: {
      status: status?.status || "unknown",
      ready: ready?.status || "unknown",
      readyReason: ready?.reason || "",
      llmRequired,
      llm: {
        configured: Boolean(llm.configured),
        reachable: Boolean(llm.reachable),
        baseUrl: llm.baseUrl || "",
        model: llm.model || "",
        checkedAt: llm.checkedAt || "",
        error: llm.error || ""
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
    policy,
    snapshot: {
      status: "unknown",
      ready: "unknown",
      readyReason: "",
      llmRequired: false,
      llm: {
        configured: false,
        reachable: false,
        baseUrl: "",
        model: "",
        checkedAt: "",
        error: error instanceof Error ? error.message : String(error)
      }
    },
    alerts: [`check_failed:${error instanceof Error ? error.message : String(error)}`]
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
