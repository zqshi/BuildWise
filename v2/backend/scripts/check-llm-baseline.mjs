import { collectLlmBaseline } from "./releaseVerificationSupport.mjs";

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
  const report = await collectLlmBaseline({ getJson, policy });
  report.apiBase = API_BASE;
  console.log(JSON.stringify(report, null, 2));
  if (report.alerts.length > 0) {
    process.exitCode = 2;
  }
}

main().catch(async (error) => {
  const report = await collectLlmBaseline({
    getJson: async () => {
      throw error;
    },
    policy
  }).catch(() => ({
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
  }));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
