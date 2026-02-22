import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const TEST_PORT = Number(process.env.CONTRACT_TEST_PORT || 5066);
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const llmConfigured = Boolean(process.env.LLM_API_BASE && process.env.LLM_API_BASE.trim());

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

  const readyPayload = await getJson("/ready");
  assert(readyPayload.status === "ready", "ready endpoint should return ready");

  const statusPayload = await getJson("/api/status");
  assert(typeof statusPayload.runtime?.llmRequired === "boolean", "status runtime.llmRequired should exist");
  assert(typeof statusPayload.runtime?.llm?.configured === "boolean", "status runtime.llm.configured should exist");
  assert(typeof statusPayload.runtime?.llm?.reachable === "boolean", "status runtime.llm.reachable should exist");

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
  const scopedSync = await getJson("/api/sync/report?projectId=1");
  assert(scopedSync.projectCount === 1, "scoped sync report should lock to one project");
  assert(typeof scopedSync.iterationCount === "number", "scoped sync iteration count must exist");

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

  const templates = await getJson("/api/templates");
  assert(Array.isArray(templates) && templates.length >= 1, "templates must exist");

  const openapi = await getJson("/api/openapi/export");
  assert(typeof openapi.openapi === "string", "openapi field must exist");
  assert(typeof openapi.paths === "object", "openapi paths must exist");

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

  const projectScopedRelation = await request("/api/model/relations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: 1,
      fromEntityId: "entity_project",
      toEntityId: "entity_iteration",
      type: "one_to_many",
      name: "project_scoped_relation"
    })
  });
  assert(projectScopedRelation.res.status === 200, "project-scoped relation should return 200");
  assert(projectScopedRelation.payload?.projectId === 1, "project-scoped relation should carry projectId");

  const projectScopedList = await getJson("/api/model/relations?projectId=1");
  assert(Array.isArray(projectScopedList), "project-scoped relations should be array");
  assert(
    projectScopedList.some((item) => item.id === projectScopedRelation.payload.id),
    "project-scoped list should include created relation"
  );

  const deleteProjectScopedRelation = await request(`/api/model/relations/${projectScopedRelation.payload.id}?projectId=1`, {
    method: "DELETE"
  });
  assert(deleteProjectScopedRelation.res.status === 200, "delete project-scoped relation should return 200");

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

  const snapshotCreate = await request("/api/collab/snapshots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: 1, iterationId: 1, name: "contract-snapshot", note: "for contract test" })
  });
  assert(snapshotCreate.res.status === 200, "create snapshot should return 200");
  assert(typeof snapshotCreate.payload?.id === "number", "snapshot id must exist");

  const snapshotCreateDenied = await request("/api/collab/snapshots", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "viewer" },
    body: JSON.stringify({ projectId: 1, iterationId: 1, name: "denied-snapshot" })
  });
  assert(snapshotCreateDenied.res.status === 403, "viewer should not create snapshot");

  const snapshotList = await getJson("/api/collab/snapshots?projectId=1");
  assert(Array.isArray(snapshotList) && snapshotList.length >= 1, "snapshot list must include created snapshot");

  const snapshotRestore = await request(`/api/collab/snapshots/${snapshotCreate.payload.id}/restore`, {
    method: "POST"
  });
  assert(snapshotRestore.res.status === 200, "restore snapshot should return 200");

  const shareCreate = await request("/api/collab/shares", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: 1, permission: "comment", ttlHours: 24 })
  });
  assert(shareCreate.res.status === 200, "create share should return 200");
  assert(typeof shareCreate.payload?.token === "string", "share token must exist");

  const shareList = await getJson("/api/collab/shares?projectId=1");
  assert(Array.isArray(shareList) && shareList.length >= 1, "share list must include created share");

  const shareAccess = await getJson(`/api/collab/share/${shareCreate.payload.token}`);
  assert(shareAccess.project?.id === 1, "share access should include project");

  const shareComment = await request(`/api/collab/share/${shareCreate.payload.token}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "external reviewer comment" })
  });
  assert(shareComment.res.status === 200, "share comment should return 200");

  const readOnlyShare = await request("/api/collab/shares", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: 1, permission: "read", ttlHours: 24 })
  });
  assert(readOnlyShare.res.status === 200, "create read-only share should return 200");
  const readOnlyComment = await request(`/api/collab/share/${readOnlyShare.payload.token}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "should be denied" })
  });
  assert(readOnlyComment.res.status === 403, "read-only share should deny comment");

  const runTemplate = await request(`/api/templates/${templates[0].id}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: 1, parameters: { focus: "契约测试", owner: "qa" } })
  });
  assert(runTemplate.res.status === 200, "run template should return 200");
  assert(runTemplate.payload?.status === "completed", "template run status must be completed");

  const runTemplateDenied = await request(`/api/templates/${templates[0].id}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "viewer" },
    body: JSON.stringify({ projectId: 1 })
  });
  assert(runTemplateDenied.res.status === 403, "viewer should not run template");

  const templateRuns = await getJson("/api/templates/runs?projectId=1");
  assert(Array.isArray(templateRuns) && templateRuns.length >= 1, "template runs should be listed");
  assert(typeof templateRuns[0].parameters === "object", "template run parameters should exist");
  assert(
    typeof templateRuns[0].parameters?.iterationId === "string" && templateRuns[0].parameters.iterationId.length > 0,
    "template run should carry iterationId mapping"
  );

  const createDeploy = await request("/api/ops/deployments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: 1, iterationId: 1, environment: "staging", version: "iter-v1-test" })
  });
  assert(
    createDeploy.res.status === 200 || createDeploy.res.status === 409,
    "create deployment should return 200 or 409(release gate blocked)"
  );
  if (createDeploy.res.status === 200) {
    assert(createDeploy.payload?.status === "queued", "deployment should start in queued");
    assert(typeof createDeploy.payload?.iterationId === "number", "deployment should carry iteration mapping");
  } else {
    assert(Array.isArray(createDeploy.payload?.blockers), "blocked deployment should return blockers");
  }

  const createDeployDenied = await request("/api/ops/deployments", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "viewer" },
    body: JSON.stringify({ projectId: 1, environment: "staging", version: "v-denied" })
  });
  assert(createDeployDenied.res.status === 403, "viewer should not create deployment");

  if (createDeploy.res.status === 200) {
    const deployToRunning = await request(`/api/ops/deployments/${createDeploy.payload.id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-role": "qa" },
      body: JSON.stringify({ toStatus: "running" })
    });
    assert(deployToRunning.res.status === 200, "deployment should transition to running");

    const deployToSuccess = await request(`/api/ops/deployments/${createDeploy.payload.id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-role": "qa" },
      body: JSON.stringify({ toStatus: "success" })
    });
    assert(deployToSuccess.res.status === 200, "deployment should transition to success");
  }

  const deployList = await getJson("/api/ops/deployments?projectId=1");
  assert(Array.isArray(deployList) && deployList.length >= 1, "deployment list must include created deployment");
  if (createDeploy.res.status === 200) {
    assert(deployList.some((item) => item.status === "success"), "deployment list should include success status");
    assert(deployList.some((item) => item.iterationId === 1), "deployment list should keep iteration mapping");
  }

  const opsMetrics = await getJson("/api/ops/metrics");
  assert(Array.isArray(opsMetrics.metrics), "ops metrics should be array");
  assert(
    opsMetrics.metrics.some((item) => item.name === "iteration_test_matrix_execution_coverage"),
    "ops metrics should include test matrix execution coverage"
  );
  assert(
    opsMetrics.metrics.some((item) => item.name === "iteration_test_matrix_pass_rate"),
    "ops metrics should include test matrix pass rate"
  );
  assert(
    opsMetrics.metrics.some((item) => item.name === "iteration_high_value_findings_coverage"),
    "ops metrics should include high value findings coverage"
  );
  assert(
    opsMetrics.metrics.some((item) => item.name === "iteration_p0_findings_total"),
    "ops metrics should include p0 findings total"
  );
  assert(
    opsMetrics.metrics.some((item) => item.name === "iteration_analysis_ignored_files_ratio"),
    "ops metrics should include ignored files ratio"
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

  const projectRepo = await getJson("/api/projects/1/repository");
  assert(typeof projectRepo.id === "string", "project repository id must exist");
  assert(Array.isArray(projectRepo.layout) && projectRepo.layout.length >= 1, "project repository layout must exist");

  const bootstrapRepo = await request("/api/projects/1/repository/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      organization: "acme",
      name: "buildwise-p1",
      repoMode: "managed_local",
      requireRemoteForProduction: true,
      requireRemoteForStaging: false
    })
  });
  assert(bootstrapRepo.res.status === 200, "project repository bootstrap should return 200");
  assert(bootstrapRepo.payload?.organization === "acme", "repository organization should be updated");
  assert(bootstrapRepo.payload?.repoMode === "managed_local", "repository mode should be updated");

  const repoStatus = await request("/api/projects/1/repository/status");
  assert(repoStatus.res.status === 200, "repository status should return 200");
  assert(typeof repoStatus.payload?.health?.remoteConfigured === "boolean", "repository health should expose remoteConfigured");

  const repoMigrationPlan = await request("/api/projects/1/repository/migration-plan");
  assert(repoMigrationPlan.res.status === 200, "repository migration plan should return 200");
  assert(Array.isArray(repoMigrationPlan.payload?.steps), "repository migration plan should include steps");
  assert(typeof repoMigrationPlan.payload?.nextAction === "string", "repository migration plan should include nextAction");

  const repoModeUpdated = await request("/api/projects/1/repository/mode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoMode: "hybrid", requireRemoteForProduction: true, requireRemoteForStaging: false })
  });
  assert(repoModeUpdated.res.status === 200, "repository mode update should return 200");
  assert(repoModeUpdated.payload?.repoMode === "hybrid", "repository mode should switch to hybrid");

  const provisionRepoDryRun = await request("/api/projects/1/repository/provision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ownerType: "org",
      organization: "acme",
      name: "buildwise-p1",
      visibility: "private",
      dryRun: true
    })
  });
  assert(provisionRepoDryRun.res.status === 200, "repository provision(dry-run) should return 200");
  assert(provisionRepoDryRun.payload?.remote?.status === "dry-run", "repository remote status should be dry-run");

  const scaffoldRepoDryRun = await request("/api/projects/1/repository/scaffold", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rootDir: path.join(fixtureDir, "repos"),
      initializeGit: true,
      createInitialCommit: true,
      dryRun: true
    })
  });
  assert(scaffoldRepoDryRun.res.status === 200, "repository scaffold(dry-run) should return 200");
  assert(typeof scaffoldRepoDryRun.payload?.scaffold?.repoPath === "string", "scaffold repo path must exist");

  const scaffoldRepoReal = await request("/api/projects/1/repository/scaffold", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rootDir: path.join(fixtureDir, "repos-real"),
      initializeGit: true,
      createInitialCommit: true,
      dryRun: false
    })
  });
  assert(scaffoldRepoReal.res.status === 200, "repository scaffold(real) should return 200");
  assert(scaffoldRepoReal.payload?.repository?.workspace?.gitInitialized === true, "repository should initialize git");

  const publishIterationDryRun = await request("/api/iterations/1/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commitMessage: "chore: dry-run publish",
      openPr: true,
      dryRun: true
    })
  });
  assert(
    publishIterationDryRun.res.status === 200 || publishIterationDryRun.res.status === 409,
    "iteration publish(dry-run) should return 200 or 409 when confirmation is pending"
  );
  if (publishIterationDryRun.res.status === 200) {
    assert(typeof publishIterationDryRun.payload?.publish?.commit === "string", "publish commit should exist");
    assert(
      typeof publishIterationDryRun.payload?.publish?.prUrl === "string",
      "publish pr url should exist in dry-run"
    );
  }

  const bindCodeLink = await request("/api/iterations/1/code-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      branch: "iteration/1-contract",
      commit: "abc123def",
      paths: ["apps/api/src", "apps/web/src"],
      note: "contract mapping"
    })
  });
  assert(bindCodeLink.res.status === 200, "iteration code link should return 200");
  assert(bindCodeLink.payload?.commit === "abc123def", "iteration code commit should match");

  const getCodeLink = await getJson("/api/iterations/1/code-link");
  assert(getCodeLink.branch === "iteration/1-contract", "iteration code branch should match");

  const traceByRef = await getJson("/api/projects/1/code-trace?ref=abc123def");
  assert(Array.isArray(traceByRef.matches), "trace result should include matches");
  assert(traceByRef.matches.length >= 1, "trace should locate at least one iteration");

  const projectTrace = await getJson("/api/trace?projectId=1");
  assert(Array.isArray(projectTrace.items), "project trace should be array");
  assert(projectTrace.items.some((item) => item.modelRef === "iteration:1"), "project trace should include iteration mapping");

  const createdIteration = await request("/api/projects/1/iterations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Iteration Auto Link", description: "auto code link should exist" })
  });
  assert(createdIteration.res.status === 200, "create iteration should return 200");
  const createdIterationId = createdIteration.payload.id;
  const autoCodeLink = await getJson(`/api/iterations/${createdIterationId}/code-link`);
  assert(typeof autoCodeLink.branch === "string" && autoCodeLink.branch.length > 0, "new iteration should auto link code branch");

  const analysisResult = await request(`/api/iterations/${createdIterationId}/analysis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: "ui-v2.png",
      mimeType: "image/png",
      size: 2048,
      excerpt: "新增用户画像组件并调整仪表盘 KPI 卡片布局"
    })
  });

  assert(
    analysisResult.res.status === 200 || analysisResult.res.status === 502 || analysisResult.res.status === 503,
    "analysis should return 200 or fail with 502/503 when LLM invocation unavailable"
  );
  if (analysisResult.res.status !== 200) {
    assert(typeof analysisResult.payload?.message === "string", "analysis failure message should exist");
  } else {
      assert(typeof analysisResult.payload?.understanding === "string", "analysis understanding must exist");
      assert(typeof analysisResult.payload?.projectDetection?.projectName === "string", "analysis projectDetection.projectName must exist");
      assert(typeof analysisResult.payload?.projectDetection?.productName === "string", "analysis projectDetection.productName must exist");
      assert(typeof analysisResult.payload?.projectDetection?.confidence === "string", "analysis projectDetection.confidence must exist");
      assert(Array.isArray(analysisResult.payload?.meaningfulFindings), "analysis meaningfulFindings must be array");
      assert(Array.isArray(analysisResult.payload?.prioritizedFindings), "analysis prioritizedFindings must be array");
      assert(Array.isArray(analysisResult.payload?.nextActions), "analysis nextActions must be array");
      assert(analysisResult.payload?.llmContext?.strategy === "direct", "analysis llmContext strategy should be direct");
      assert(typeof analysisResult.payload?.llmContext?.promptContextLength === "number", "analysis llmContext prompt length must exist");
      assert(typeof analysisResult.payload?.llmContext?.degraded === "boolean", "analysis llmContext degraded must exist");
      assert(typeof analysisResult.payload?.llmContext?.degradeReason === "string", "analysis llmContext degradeReason must exist");
      assert(Array.isArray(analysisResult.payload?.clarificationQuestions), "analysis clarificationQuestions must exist");

      const chunkedAnalysisResult = await request(`/api/iterations/${createdIterationId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "large-prd.md",
        mimeType: "text/markdown",
        size: 20480,
        excerpt: "这是附件摘要头部。",
        excerptChunks: [
          "chunk-1: 新增结算流程与发票状态联动",
          "chunk-2: 调整仪表盘 KPI 定义与统计口径",
          "chunk-3: 增加发布前回滚演练验收"
        ],
        excerptDigest: "strategy=chunked-head-middle-tail;chunks=3;digest=test-contract",
        excerptStrategy: "chunked-head-middle-tail"
      })
    });
      assert(chunkedAnalysisResult.res.status === 200, "chunked analysis should return 200");
      assert(
        chunkedAnalysisResult.payload?.llmContext?.strategy === "chunked-head-middle-tail",
        "chunked analysis should keep strategy"
      );
      assert(chunkedAnalysisResult.payload?.llmContext?.chunkCount === 3, "chunked analysis chunk count should be 3");
      assert(typeof chunkedAnalysisResult.payload?.llmContext?.unknownSignalCount === "number", "unknown signal count must exist");

      const folderAnalysisResult = await request(`/api/iterations/${createdIterationId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "sample-folder",
        sourceType: "folder",
        folderName: "sample-folder",
        mimeType: "application/x-directory",
        size: 4096,
        files: [
          {
            path: "sample-folder/README.md",
            fileName: "README.md",
            mimeType: "text/markdown",
            size: 512,
            excerpt: "产品: 供应链协同平台\n项目: 订单可视化改造\n新增订单仪表盘和KPI看板"
          },
          {
            path: "sample-folder/openapi.json",
            fileName: "openapi.json",
            mimeType: "application/json",
            size: 1024,
            excerpt: "{\"paths\":{\"/orders\":{\"get\":{\"summary\":\"订单列表\"}}}}"
          }
        ],
        excerptStrategy: "folder-batch",
        excerptDigest: "strategy=folder-batch;files=2;textFiles=2;binaryFiles=0"
      })
    });
      assert(folderAnalysisResult.res.status === 200, "folder analysis should return 200");
      assert(folderAnalysisResult.payload?.sourceType === "folder", "folder analysis sourceType should be folder");
      assert(folderAnalysisResult.payload?.fileStats?.totalFiles === 2, "folder analysis total files should be 2");
      assert(typeof folderAnalysisResult.payload?.fileSelection?.includedFiles === "number", "folder analysis fileSelection should exist");
      assert(Array.isArray(folderAnalysisResult.payload?.fileSelection?.ignoredFiles), "folder analysis ignored files should exist");
      assert(typeof folderAnalysisResult.payload?.projectDetection?.projectCategory === "string", "folder analysis project category should exist");
      assert(Array.isArray(folderAnalysisResult.payload?.meaningfulFindings), "folder analysis meaningful findings should exist");
      assert(Array.isArray(folderAnalysisResult.payload?.prioritizedFindings), "folder analysis prioritized findings should exist");

      const binaryAnalysisResult = await request(`/api/iterations/${createdIterationId}/analysis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "prototype.fig",
        mimeType: "application/octet-stream",
        size: 102400,
        excerpt: "",
        excerptStrategy: "binary-no-text",
        excerptDigest: "strategy=binary-no-text;chunks=0"
      })
    });
      assert(binaryAnalysisResult.res.status === 200, "binary analysis should return 200");
      assert(binaryAnalysisResult.payload?.llmContext?.strategy === "binary-no-text", "binary strategy should be preserved");
      assert(binaryAnalysisResult.payload?.llmContext?.degraded === true, "binary analysis should trigger degraded mode");
      assert(
        typeof binaryAnalysisResult.payload?.llmContext?.degradeReason === "string" &&
          binaryAnalysisResult.payload.llmContext.degradeReason.includes("binary-no-text"),
        "binary analysis should expose degrade reason"
      );
      assert(
        Array.isArray(binaryAnalysisResult.payload?.clarificationQuestions) &&
          binaryAnalysisResult.payload.clarificationQuestions.length >= 1,
        "binary analysis should generate clarification questions"
      );

      const pendingChangeControl = await getJson(`/api/iterations/${createdIterationId}/change-control`);
      assert(pendingChangeControl.pendingHumanConfirmation === true, "analysis should require human confirmation");
      assert(
        Array.isArray(pendingChangeControl.clarificationQuestions) && pendingChangeControl.clarificationQuestions.length >= 1,
        "change-control should persist clarification questions"
      );
      assert(
        Array.isArray(pendingChangeControl.clarificationDraftResolvedQuestions),
        "change-control should include clarification draft field"
      );

      const draftUpdate = await request(`/api/iterations/${createdIterationId}/change-control/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolvedQuestions: [pendingChangeControl.clarificationQuestions[0]] })
    });
      assert(draftUpdate.res.status === 200, "clarification draft update should return 200");
      assert(
        Array.isArray(draftUpdate.payload?.clarificationDraftResolvedQuestions) &&
          draftUpdate.payload.clarificationDraftResolvedQuestions.length === 1,
        "clarification draft should persist resolved question"
      );

      const blockedPublish = await request(`/api/iterations/${createdIterationId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commitMessage: "chore: blocked until confirmation",
        dryRun: true
      })
    });
      assert(blockedPublish.res.status === 409, "publish should be blocked before analysis confirmation");

      const clarification = await request(`/api/iterations/${createdIterationId}/change-control/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accurate: false,
        note: "analysis missing billing flow details"
      })
    });
      assert(clarification.res.status === 200, "clarification request should return 200");
      assert(clarification.payload?.pendingHumanConfirmation === true, "clarification keeps confirmation pending");
      assert(clarification.payload?.clarificationRounds >= 1, "clarification rounds should increase");
      assert(
        clarification.payload?.lastClarificationResolution?.resolvedQuestions?.length >= 0 &&
          clarification.payload?.lastClarificationResolution?.unresolvedQuestions?.length >= 1,
        "clarification should keep unresolved clarification resolution"
      );

      const confirmDenied = await request(`/api/iterations/${createdIterationId}/change-control/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accurate: true,
        actor: "pm",
        note: "try confirm with unresolved questions"
      })
    });
      assert(confirmDenied.res.status === 409, "confirmation should be blocked when clarification questions unresolved");
      assert(
        Array.isArray(confirmDenied.payload?.unresolvedQuestions) && confirmDenied.payload.unresolvedQuestions.length >= 1,
        "confirmation block should return unresolved questions"
      );

      const confirmed = await request(`/api/iterations/${createdIterationId}/change-control/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accurate: true,
        actor: "pm",
        note: "confirmed after clarification",
        resolvedClarificationQuestions: pendingChangeControl.clarificationQuestions,
        boundary: {
          requirementRefs: ["REQ-dashboard-kpi"],
          componentRefs: ["dashboard/kpi-card"],
          codePaths: ["apps/web/src/pages/dashboard.tsx"],
          note: "only update dashboard KPI and related api"
        }
      })
    });
      assert(confirmed.res.status === 200, "analysis confirmation should return 200");
      assert(confirmed.payload?.pendingHumanConfirmation === false, "confirmation should unlock publish");
      assert(
        Array.isArray(confirmed.payload?.clarificationQuestions) && confirmed.payload.clarificationQuestions.length === 0,
        "confirmation should clear clarification questions"
      );
      assert(
        Array.isArray(confirmed.payload?.lastClarificationResolution?.unresolvedQuestions) &&
          confirmed.payload.lastClarificationResolution.unresolvedQuestions.length === 0,
        "confirmation should clear unresolved clarification items"
      );
      assert(Array.isArray(confirmed.payload?.boundary?.componentRefs), "confirmed boundary component refs should exist");

      const updatedBoundary = await request(`/api/iterations/${createdIterationId}/change-control/boundary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requirementRefs: ["REQ-dashboard-kpi", "REQ-dashboard-distribution"],
        componentRefs: ["dashboard/kpi-card", "dashboard/distribution-chart"],
        codePaths: ["apps/web/src/pages/dashboard.tsx", "apps/api/src/dashboard.ts"],
        note: "expanded to distribution chart and api"
      })
    });
      assert(updatedBoundary.res.status === 200, "boundary update should return 200");
      assert(updatedBoundary.payload?.boundary?.codePaths?.length >= 2, "boundary code paths should update");
      if (Array.isArray(updatedBoundary.payload?.generatedTestMatrix) && updatedBoundary.payload.generatedTestMatrix.length > 0) {
        const firstCase = updatedBoundary.payload.generatedTestMatrix[0];
        const executionUpdate = await request(`/api/iterations/${createdIterationId}/change-control/test-matrix/execution`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            updates: [{ caseId: firstCase.caseId, status: "passed", by: "qa", note: "contract execution" }]
          })
        });
        assert(executionUpdate.res.status === 200, "test matrix execution update should return 200");
        assert(executionUpdate.payload?.summary?.executed >= 1, "test matrix execution should increase executed cases");
        assert(
          typeof executionUpdate.payload?.summary?.coverage === "number",
          "test matrix execution should return coverage summary"
        );
      }

      const releaseReview = await request(`/api/iterations/${createdIterationId}/release-review`);
      assert(releaseReview.res.status === 200, "release review should return 200");
      assert(
        releaseReview.payload?.decision === "go" ||
          releaseReview.payload?.decision === "caution" ||
          releaseReview.payload?.decision === "block",
        "release review decision must be go/caution/block"
      );
      assert(typeof releaseReview.payload?.score === "number", "release review score should exist");
      assert(Array.isArray(releaseReview.payload?.recommendations), "release review recommendations should exist");

      const testArtifacts = await request(`/api/iterations/${createdIterationId}/change-control/test-artifacts/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: true })
      });
      assert(testArtifacts.res.status === 200, "test artifacts generation should return 200");
      assert(Array.isArray(testArtifacts.payload?.generatedFiles), "test artifacts generatedFiles should exist");
      assert(testArtifacts.payload?.generatedFiles?.length >= 1, "test artifacts should include at least one file");

      const publishAfterConfirm = await request(`/api/iterations/${createdIterationId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commitMessage: "chore: publish after confirmation",
        openPr: true,
        dryRun: true
      })
    });
      assert(
        publishAfterConfirm.res.status === 200 || publishAfterConfirm.res.status === 409,
        "publish should succeed or be blocked by release gate after confirmation"
      );
      if (publishAfterConfirm.res.status === 409) {
        assert(Array.isArray(publishAfterConfirm.payload?.blockers), "blocked publish should return blockers");
      }
  }

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

  const auditAfterTransition = await getJson("/api/governance/audit-logs?limit=80");
  assert(Array.isArray(auditAfterTransition), "audit logs should be array");

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
