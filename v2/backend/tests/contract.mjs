import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const TEST_PORT = Number(process.env.CONTRACT_TEST_PORT || 5066);
const BASE = `http://127.0.0.1:${TEST_PORT}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  assert(res.ok, `Request failed: ${path} -> ${res.status}`);
  return res.json();
}

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await res.json() : await res.text();
  return { res, payload };
}

async function waitForHealth(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error("Backend did not become healthy in time");
}

const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-contract-"));
const workspaceRoot = path.resolve(process.cwd(), "..", "..");
const modelFixture = path.join(fixtureDir, "model.json");
const dataFixture = path.join(fixtureDir, "data.json");
cpSync(path.join(workspaceRoot, "v2", "model.json"), modelFixture);
cpSync(path.join(workspaceRoot, "v2", "backend", "data.json"), dataFixture);

const server = spawn("node", ["dist/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(TEST_PORT),
    HOST: "127.0.0.1",
    MODEL_FILE: modelFixture,
    WORKSPACE_DATA_FILE: dataFixture
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stderr = "";
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForHealth();

  const model = await getJson("/api/model");
  assert(Array.isArray(model.entities), "model.entities must be array");
  assert(typeof model.stats?.entities === "number", "model.stats.entities must exist");

  const compile = await getJson("/api/rules/compile");
  assert(typeof compile.ruleCount === "number", "compile.ruleCount must be number");
  assert(Array.isArray(compile.warnings), "compile.warnings must be array");

  const bind = await getJson("/api/rules/bind");
  assert(Array.isArray(bind.bindings), "bind.bindings must be array");
  if (bind.bindings.length > 0) {
    const firstBinding = bind.bindings[0];
    assert(typeof firstBinding.status === "string", "binding.status must exist");
    assert(typeof firstBinding.reason === "string", "binding.reason must exist");
  }

  const sync = await getJson("/api/sync/report");
  assert(typeof sync.coverageScore === "number", "sync.coverageScore must be number");
  assert(sync.coverageScore >= 0 && sync.coverageScore <= 100, "sync.coverageScore must be 0-100");
  assert(Array.isArray(sync.impacts), "sync.impacts must be array");
  assert(Array.isArray(sync.risks), "sync.risks must be array");

  const trace = await getJson("/api/trace");
  assert(Array.isArray(trace.items), "trace.items must be array");
  if (trace.items.length > 0) {
    const firstTrace = trace.items[0];
    assert(typeof firstTrace.modelRef === "string", "trace.modelRef must exist");
    assert(typeof firstTrace.codeRef === "string", "trace.codeRef must exist");
  }

  const traceMap = await getJson("/api/trace/map");
  assert(Array.isArray(traceMap.items), "trace/map items must be array");

  const roles = await getJson("/api/governance/roles");
  assert(Array.isArray(roles) && roles.length >= 1, "governance roles must exist");
  assert(typeof roles[0].id === "string", "governance role id must exist");

  const roadmap = await getJson("/api/roadmap-v0-1");
  assert(roadmap.version === "V0.1", "roadmap.version must be V0.1");
  assert(typeof roadmap.goal === "string" && roadmap.goal.length > 0, "roadmap.goal must exist");
  assert(roadmap.modelContract?.apiDeclared === true, "roadmap.modelContract.apiDeclared must be true");
  assert(roadmap.modelContract?.statusFieldDeclared === true, "roadmap.statusFieldDeclared must be true");

  const roadmapOps = await getJson("/api/roadmap-v1-2");
  assert(roadmapOps.version === "V1.2", "roadmap.version must be V1.2");
  assert(typeof roadmapOps.stage === "string" && roadmapOps.stage.length > 0, "roadmap.stage must exist");

  const missingRoadmap = await request("/api/roadmap-v9-9");
  assert(missingRoadmap.res.status === 404, "unknown roadmap should return 404");

  const createdEntity = await request("/api/model/entities", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "ContractEntity",
      businessLabel: "契约实体"
    })
  });
  assert(createdEntity.res.status === 200, "POST /api/model/entities should return 200");
  assert(createdEntity.payload?.name === "ContractEntity", "created entity name mismatch");

  const relationsBefore = await getJson("/api/model/relations");
  assert(Array.isArray(relationsBefore), "relations list must be array");

  const invalidRelationPayload = await request("/api/model/relations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert(invalidRelationPayload.res.status === 400, "missing relation payload should return 400");

  const missingEntityRelation = await request("/api/model/relations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromEntityId: "entity_not_exists",
      toEntityId: "entity_project",
      type: "one_to_many"
    })
  });
  assert(missingEntityRelation.res.status === 404, "relation with missing entity should return 404");

  const createdRelation = await request("/api/model/relations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromEntityId: "entity_project",
      toEntityId: "entity_iteration",
      type: "one_to_many",
      name: "project_has_iterations"
    })
  });
  assert(createdRelation.res.status === 200, "create relation should return 200");
  assert(typeof createdRelation.payload?.id === "string", "created relation id must exist");

  const duplicateRelation = await request("/api/model/relations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fromEntityId: "entity_project",
      toEntityId: "entity_iteration",
      type: "one_to_many"
    })
  });
  assert(duplicateRelation.res.status === 409, "duplicate relation should return 409");

  const relationsAfter = await getJson("/api/model/relations");
  assert(Array.isArray(relationsAfter) && relationsAfter.length >= 1, "relations should include created relation");

  const deleteMissingRelation = await request("/api/model/relations/relation_missing_id", {
    method: "DELETE"
  });
  assert(deleteMissingRelation.res.status === 404, "delete missing relation should return 404");

  const deleteRelation = await request(`/api/model/relations/${createdRelation.payload.id}`, {
    method: "DELETE"
  });
  assert(deleteRelation.res.status === 200, "delete relation should return 200");

  const auditAfterRelation = await getJson("/api/governance/audit-logs?limit=10");
  assert(Array.isArray(auditAfterRelation), "audit logs must be array");
  assert(
    auditAfterRelation.some((item) => item.action === "model_relation_created"),
    "audit logs should include relation create event"
  );
  assert(
    auditAfterRelation.some((item) => item.action === "model_relation_deleted"),
    "audit logs should include relation delete event"
  );

  const invalidCreate = await request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert(invalidCreate.res.status === 400, "POST /api/projects without name should return 400");

  const invalidProjectId = await request("/api/projects/abc/iterations");
  assert(invalidProjectId.res.status === 400, "Invalid project id should return 400");

  const missingProject = await request("/api/projects/999999/iterations");
  assert(missingProject.res.status === 404, "Unknown project id should return 404");

  const invalidIterationId = await request("/api/iterations/abc/context");
  assert(invalidIterationId.res.status === 400, "Invalid iteration id should return 400");

  const stateMachine = await getJson("/api/iterations/1/state-machine");
  assert(typeof stateMachine.currentStatus === "string", "state machine currentStatus must exist");
  assert(Array.isArray(stateMachine.allowedTransitions), "state machine allowedTransitions must be array");
  assert(Array.isArray(stateMachine.transitionHistory), "state machine transitionHistory must be array");

  const invalidTransitionPayload = await request("/api/iterations/1/state/transition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert(invalidTransitionPayload.res.status === 400, "missing toStatus should return 400");

  const invalidTransition = await request("/api/iterations/1/state/transition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toStatus: "planned" })
  });
  assert(invalidTransition.res.status === 409, "invalid transition should return 409");

  const validTransition = await request("/api/iterations/1/state/transition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toStatus: "review", note: "contract test transition" })
  });
  assert(validTransition.res.status === 200, "valid transition should return 200");
  assert(validTransition.payload?.toStatus === "review", "transition target status mismatch");

  const auditAfterTransition = await getJson("/api/governance/audit-logs?limit=20");
  assert(
    auditAfterTransition.some((item) => item.action === "iteration_state_transitioned"),
    "audit logs should include transition event"
  );

  console.log("Contract test passed.");
} catch (error) {
  console.error("Contract test failed:", error);
  if (stderr.trim()) {
    console.error(stderr);
  }
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  rmSync(fixtureDir, { recursive: true, force: true });
}
