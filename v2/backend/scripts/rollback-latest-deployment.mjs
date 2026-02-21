const API_BASE = process.env.API_BASE || "http://127.0.0.1:5055";
const PROJECT_ID = Number(process.env.PROJECT_ID || 1);
const ROLE = process.env.ROLE || "owner";
const ROLLBACK_VERSION = process.env.ROLLBACK_VERSION || "";
const AUTO_COMPLETE = process.env.AUTO_COMPLETE !== "false";

if (!Number.isInteger(PROJECT_ID) || PROJECT_ID <= 0) {
  console.error("[rollback] PROJECT_ID must be a positive integer");
  process.exit(1);
}

async function requestJson(path, init) {
  const res = await fetch(`${API_BASE}${path}`, init);
  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    throw new Error(`request failed: ${path} -> ${res.status} :: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

function byCreatedDesc(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

async function main() {
  const deployments = await requestJson(`/api/ops/deployments?projectId=${PROJECT_ID}`);
  const sorted = Array.isArray(deployments) ? [...deployments].sort(byCreatedDesc) : [];

  if (sorted.length === 0) {
    throw new Error(`no deployments found for project ${PROJECT_ID}`);
  }

  const latest = sorted[0];
  const latestSuccess = sorted.find((item) => item.status === "success");
  const fallbackVersion = latestSuccess?.version || latest.version;
  const rollbackVersion = ROLLBACK_VERSION || `${fallbackVersion}-rollback-${Date.now().toString().slice(-4)}`;
  const iterationId = latestSuccess?.iterationId || latest.iterationId;

  const created = await requestJson("/api/ops/deployments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-role": ROLE
    },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      iterationId,
      environment: latest.environment,
      version: rollbackVersion
    })
  });

  let running = created;
  let completed = created;

  running = await requestJson(`/api/ops/deployments/${created.id}/transition`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-role": ROLE
    },
    body: JSON.stringify({ toStatus: "running" })
  });

  if (AUTO_COMPLETE) {
    completed = await requestJson(`/api/ops/deployments/${created.id}/transition`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-role": ROLE
      },
      body: JSON.stringify({ toStatus: "success" })
    });
  }

  console.log(
    JSON.stringify(
      {
        rolledBackAt: new Date().toISOString(),
        projectId: PROJECT_ID,
        sourceDeployment: {
          id: latest.id,
          version: latest.version,
          status: latest.status,
          iterationId: latest.iterationId || null
        },
        rollbackDeployment: {
          id: completed.id,
          version: completed.version,
          status: completed.status,
          iterationId: completed.iterationId || null
        },
        autoComplete: AUTO_COMPLETE
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`[rollback] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
