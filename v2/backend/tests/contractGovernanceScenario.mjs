import path from "node:path";

export async function runContractGovernanceScenario(context, state) {
  const { assert, getJson, request, fixtureDir } = context;
  const expectSmsDebugCode = context.features?.smsDebugCodeExpected !== false;

  const readyPayload = await getJson("/ready");
  assert(readyPayload.status === "ready", "ready endpoint should return ready");

  const statusPayload = await getJson("/api/status");
  assert(typeof statusPayload.runtime?.llmRequired === "boolean", "status runtime.llmRequired should exist");
  assert(typeof statusPayload.runtime?.llm?.configured === "boolean", "status runtime.llm.configured should exist");
  assert(typeof statusPayload.runtime?.llm?.reachable === "boolean", "status runtime.llm.reachable should exist");

  const roles = await getJson("/api/governance/roles");
  assert(Array.isArray(roles) && roles.length >= 1, "governance roles must exist");
  assert(typeof roles[0].id === "string", "governance role id must exist");
  const permissionPoints = await getJson("/api/governance/permission-points");
  assert(Array.isArray(permissionPoints) && permissionPoints.length >= 1, "governance permission points must exist");
  assert(permissionPoints.some((item) => item.key === "template:run"), "permission points should include template:run");
  assert(permissionPoints.some((item) => item.key === "deploy:write"), "permission points should include deploy:write");

  const contractPhone = `19${String(Date.now()).slice(-9)}`;
  const smsRequestBeforeBinding = await request("/api/auth/sms/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: contractPhone })
  });
  assert(smsRequestBeforeBinding.res.status === 200, "sms request should return 200");
  if (expectSmsDebugCode) {
    assert(typeof smsRequestBeforeBinding.payload?.debugCode === "string", "sms request should return debug code");
    const smsVerifyBeforeBinding = await request("/api/auth/sms/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: contractPhone, code: smsRequestBeforeBinding.payload.debugCode })
    });
    assert(smsVerifyBeforeBinding.res.status === 403, "unbound phone should not pass sms verify");
  }

  const contractPhoneBound = `18${String(Date.now()).slice(-9)}`;
  const addPhoneBinding = await request("/api/governance/platform-role-bindings", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "owner" },
    body: JSON.stringify({ userId: contractPhoneBound, role: "member" })
  });
  assert(addPhoneBinding.res.status === 200, "add platform binding should return 200");
  assert(addPhoneBinding.payload?.userId === contractPhoneBound, "binding user id should match phone");

  const smsRequestAfterBinding = await request("/api/auth/sms/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: contractPhoneBound })
  });
  assert(smsRequestAfterBinding.res.status === 200, "sms request after binding should return 200");
  if (expectSmsDebugCode) {
    assert(typeof smsRequestAfterBinding.payload?.debugCode === "string", "sms request after binding should return debug code");
    const smsVerifyAfterBinding = await request("/api/auth/sms/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: contractPhoneBound, code: smsRequestAfterBinding.payload.debugCode })
    });
    assert(smsVerifyAfterBinding.res.status === 200, "bound phone should pass sms verify");
    assert(smsVerifyAfterBinding.payload?.user?.phone === contractPhoneBound, "sms verify user phone should match");
    assert(smsVerifyAfterBinding.payload?.user?.workspaceRole === "pm", "member platform role should map to pm workspace role");
  }

  const invalidCustomRole = await request("/api/governance/custom-roles", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "owner" },
    body: JSON.stringify({
      name: "ContractInvalidPermissionRole",
      description: "invalid permission guard",
      level: 1,
      permissions: ["unknown:permission:key"]
    })
  });
  assert(invalidCustomRole.res.status === 400, "custom role with unknown permissions should be rejected");

  const customRolesLegacy = await request("/api/governance/custom_roles");
  assert(customRolesLegacy.res.status === 200, "legacy GET /api/governance/custom_roles should return 200");
  assert(Array.isArray(customRolesLegacy.payload), "legacy custom roles response should be array");

  const invalidCustomRoleLegacy = await request("/api/governance/custom_roles", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "owner" },
    body: JSON.stringify({
      name: "ContractInvalidPermissionRoleLegacy",
      description: "invalid permission guard legacy",
      level: 1,
      permissions: ["unknown:permission:key"]
    })
  });
  assert(invalidCustomRoleLegacy.res.status === 400, "legacy custom role endpoint should validate permissions");

  const globalPolicyDraft = await request("/api/governance/orchestration/policies", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "owner", "x-user-id": "contract-owner" },
    body: JSON.stringify({
      strategy: {
        requiredConfirmations: {
          firstIterationGitReport: false
        }
      }
    })
  });
  assert(globalPolicyDraft.res.status === 200, "create global orchestration policy draft should return 200");
  assert(globalPolicyDraft.payload?.projectId === 0, "global orchestration policy should use projectId=0 scope");

  const activateGlobalPolicy = await request(`/api/governance/orchestration/policies/${globalPolicyDraft.payload.version}/activate`, {
    method: "POST",
    headers: { "x-role": "owner", "x-user-id": "contract-owner" }
  });
  assert(activateGlobalPolicy.res.status === 200, "activate global orchestration policy should return 200");
  assert(activateGlobalPolicy.payload?.status === "active", "activated global orchestration policy should be active");

  const globalPolicies = await getJson("/api/governance/orchestration/policies");
  assert(globalPolicies?.active?.projectId === 0, "global orchestration active policy should stay in global scope");
  assert(Array.isArray(globalPolicies?.items), "global orchestration policies list should be array");
  assert(globalPolicies.items.some((item) => item.version === globalPolicyDraft.payload.version), "global policies should include created version");

  const restoreGlobalPolicy = await request("/api/governance/orchestration/policies/restore-initial", {
    method: "POST",
    headers: { "x-role": "owner", "x-user-id": "contract-owner" }
  });
  assert(restoreGlobalPolicy.res.status === 200, "restore global orchestration policy should return 200");
  assert(restoreGlobalPolicy.payload?.status === "active", "restored global orchestration policy should be active");
  assert(
    restoreGlobalPolicy.payload?.strategy?.requiredConfirmations?.firstIterationGitReport === true,
    "restored global orchestration policy should recover initial confirmation gate"
  );

  const policyExecute = await request("/api/iterations/1/policy-execute", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "owner" },
    body: JSON.stringify({ action: "contract-global-policy-check", message: "执行全局策略检查" })
  });
  assert(policyExecute.res.status === 200, "policy execute should return 200 under global orchestration policy");
  assert(policyExecute.payload?.policyVersion === restoreGlobalPolicy.payload.version, "policy execute should use active global policy");

  const templates = await getJson("/api/templates");
  assert(Array.isArray(templates) && templates.length >= 1, "templates must exist");

  const auditAfterRelation = await getJson("/api/governance/audit-logs?limit=10");
  assert(Array.isArray(auditAfterRelation), "audit logs must be array");
  assert(auditAfterRelation.length > 0, "audit logs should contain at least one entry after test operations");

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

  const snapshotRestore = await request(`/api/collab/snapshots/${snapshotCreate.payload.id}/restore`, { method: "POST" });
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
  assert(typeof templateRuns[0].parameters?.iterationId === "string" && templateRuns[0].parameters.iterationId.length > 0, "template run should carry iterationId mapping");

  const createDeploy = await request("/api/ops/deployments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: 1, iterationId: 1, environment: "staging", version: "iter-v1-test" })
  });
  assert(createDeploy.res.status === 200 || createDeploy.res.status === 409, "create deployment should return 200 or 409");
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
  assert(Array.isArray(deployList), "deployment list must be array");
  if (createDeploy.res.status === 200) {
    assert(deployList.length >= 1, "deployment list must include created deployment");
    assert(deployList.some((item) => item.status === "success"), "deployment list should include success status");
    assert(deployList.some((item) => item.iterationId === 1), "deployment list should keep iteration mapping");
  } else {
    assert(deployList.every((item) => item.projectId === 1), "deployment list should stay project-scoped when deployment is blocked");
  }

  const opsMetrics = await getJson("/api/ops/metrics");
  assert(Array.isArray(opsMetrics.metrics), "ops metrics should be array");
  assert(opsMetrics.metrics.some((item) => item.name === "iteration_test_matrix_execution_coverage"), "ops metrics should include test matrix execution coverage");
  assert(opsMetrics.metrics.some((item) => item.name === "iteration_test_matrix_pass_rate"), "ops metrics should include test matrix pass rate");
  assert(opsMetrics.metrics.some((item) => item.name === "iteration_high_value_findings_coverage"), "ops metrics should include high value findings coverage");
  assert(opsMetrics.metrics.some((item) => item.name === "iteration_p0_findings_total"), "ops metrics should include p0 findings total");
  assert(opsMetrics.metrics.some((item) => item.name === "iteration_analysis_ignored_files_ratio"), "ops metrics should include ignored files ratio");

  const metricsPrometheus = await request("/metrics");
  assert(metricsPrometheus.res.status === 200, "prometheus metrics should return 200");
  assert(String(metricsPrometheus.payload).includes("buildwise_deployment_success_rate"), "prometheus metrics should expose deployment rate");

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
  assert(publishIterationDryRun.res.status === 200 || publishIterationDryRun.res.status === 409, "iteration publish(dry-run) should return 200 or 409");
  if (publishIterationDryRun.res.status === 200) {
    assert(typeof publishIterationDryRun.payload?.publish?.commit === "string", "publish commit should exist");
    assert(typeof publishIterationDryRun.payload?.publish?.prUrl === "string", "publish pr url should exist in dry-run");
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

  const scopedAcceptanceCriteria = ["仪表盘 KPI 指标可见且口径一致", "核心查询接口 P95 小于 300ms"];
  const createdIteration = await request("/api/projects/1/iterations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Iteration Auto Link",
      description: "auto code link should exist",
      goals: ["仪表盘改造", "查询性能优化"],
      scope: {
        inScope: ["dashboard", "query-api"],
        outOfScope: ["payment"],
        acceptanceCriteria: scopedAcceptanceCriteria
      }
    })
  });
  assert(createdIteration.res.status === 200, "create iteration should return 200");
  const createdIterationId = createdIteration.payload.id;
  state.createdIterationId = createdIterationId;
  state.scopedAcceptanceCriteria = scopedAcceptanceCriteria;
  assert(
    Array.isArray(createdIteration.payload?.scope?.acceptanceCriteria) &&
      createdIteration.payload.scope.acceptanceCriteria.includes(scopedAcceptanceCriteria[0]),
    "create iteration should persist scope.acceptanceCriteria"
  );
  const autoCodeLink = await getJson(`/api/iterations/${createdIterationId}/code-link`);
  assert(typeof autoCodeLink.branch === "string" && autoCodeLink.branch.length > 0, "new iteration should auto link code branch");
  const createdIterationContext = await getJson(`/api/iterations/${createdIterationId}/context`);
  assert(
    Array.isArray(createdIterationContext?.scope?.acceptanceCriteria) &&
      createdIterationContext.scope.acceptanceCriteria.includes(scopedAcceptanceCriteria[1]),
    "iteration context should expose persisted acceptance criteria"
  );
}
