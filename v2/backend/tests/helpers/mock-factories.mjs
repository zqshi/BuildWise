/**
 * 共享 Mock 工厂
 * 提供 In-Memory Repository 和 Mock AgentRunner，供全量测试复用
 */

// ─── OpenclawGlobal In-Memory Repository ───

export function createInMemoryOpenclawGlobalRepo() {
  const store = {
    conversations: [],
    messages: [],
    skills: [],
    strategyState: {
      activeSkillIds: [],
      customWorkflowDescriptions: [],
      lastResetAt: null,
      updatedAt: new Date().toISOString(),
    },
  };

  return {
    _store: store,
    listConversations() { return store.conversations; },
    findConversation(id) { return store.conversations.find((c) => c.id === id) || null; },
    createConversation(conv) { store.conversations.push(conv); return conv; },
    updateConversation(conv) {
      const idx = store.conversations.findIndex((c) => c.id === conv.id);
      if (idx >= 0) store.conversations[idx] = conv;
    },
    listMessages(conversationId) { return store.messages.filter((m) => m.conversationId === conversationId); },
    appendMessage(msg) { store.messages.push(msg); return msg; },
    listSkills() { return store.skills; },
    findSkill(id) { return store.skills.find((s) => s.id === id) || null; },
    saveSkill(skill) {
      const idx = store.skills.findIndex((s) => s.id === skill.id);
      if (idx >= 0) { store.skills[idx] = skill; } else { store.skills.push(skill); }
      return skill;
    },
    removeSkill(id) {
      const idx = store.skills.findIndex((s) => s.id === id);
      if (idx >= 0) { store.skills.splice(idx, 1); return true; }
      return false;
    },
    getStrategyState() { return store.strategyState; },
    updateStrategyState(state) { store.strategyState = state; },
  };
}

// ─── Workspace In-Memory Repository ───

export function createInMemoryWorkspaceRepo() {
  const store = {
    projects: [],
    iterations: [],
    messages: [],
    snapshots: [],
    transitions: [],
    auditLogs: [],
    versionSnapshots: [],
    projectShares: [],
    deployments: [],
    templateRuns: [],
    opsTriageTemplates: [],
    projectPolicies: [],
    projectWorkspaceBindings: [],
    policyExecutionLogs: [],
    projectRoleBindings: [],
    tenantMemberBindings: [],
    platformRoleBindings: [],
    governanceCustomRoles: [],
  };

  let nextIdCounter = 1;

  return {
    _store: store,

    // ── StoreAccess ──
    read() { return store; },
    write(data) { Object.assign(store, data); },
    nextId() { return nextIdCounter++; },

    // ── ProjectRepository ──
    listProjects() { return store.projects; },
    findProject(projectId) { return store.projects.find((p) => p.id === projectId) || null; },
    createProject(input) {
      const now = new Date().toISOString();
      const project = { id: nextIdCounter++, ...input, status: "active", createdAt: now, updatedAt: now };
      store.projects.push(project);
      return project;
    },
    updateProject(project) {
      const idx = store.projects.findIndex((p) => p.id === project.id);
      if (idx >= 0) store.projects[idx] = project;
    },

    // ── IterationRepository ──
    listIterations(projectId) { return store.iterations.filter((i) => i.projectId === projectId); },
    findIteration(iterationId) { return store.iterations.find((i) => i.id === iterationId) || null; },
    findPreviousIteration(iteration) {
      const siblings = store.iterations.filter((i) => i.projectId === iteration.projectId && i.id < iteration.id);
      return siblings.length > 0 ? siblings[siblings.length - 1] : null;
    },
    createIteration(projectId, payload) {
      const now = new Date().toISOString();
      const iteration = { id: nextIdCounter++, projectId, ...payload, status: "planning", createdAt: now, updatedAt: now };
      store.iterations.push(iteration);
      return iteration;
    },
    updateIteration(iteration) {
      const idx = store.iterations.findIndex((i) => i.id === iteration.id);
      if (idx >= 0) store.iterations[idx] = iteration;
    },
    listSnapshots(iterationId) { return store.snapshots.filter((s) => s.iterationId === iterationId); },
    appendSnapshot(snapshot) { store.snapshots.push(snapshot); },
    listTransitions(iterationId) { return store.transitions.filter((t) => t.iterationId === iterationId); },
    appendTransition(transition) { store.transitions.push(transition); },

    // ── MessageRepository ──
    listMessages(iterationId) { return store.messages.filter((m) => m.iterationId === iterationId); },
    createMessage(iterationId, role, content) {
      const now = new Date().toISOString();
      const msg = { id: nextIdCounter++, iterationId, role, content, createdAt: now };
      store.messages.push(msg);
      return msg;
    },

    // ── GovernanceRepository ──
    listAuditLogs(limit) { return limit ? store.auditLogs.slice(-limit) : store.auditLogs; },
    appendAuditLog(log) { store.auditLogs.push(log); },
    listProjectPolicies(projectId) { return store.projectPolicies.filter((p) => p.projectId === projectId); },
    appendProjectPolicy(record) { store.projectPolicies.push(record); },
    updateProjectPolicy(record) {
      const idx = store.projectPolicies.findIndex((p) => p.id === record.id);
      if (idx >= 0) store.projectPolicies[idx] = record;
    },
    listPolicyExecutionLogs(iterationId) { return store.policyExecutionLogs.filter((l) => l.iterationId === iterationId); },
    appendPolicyExecutionLog(record) { store.policyExecutionLogs.push(record); },
    listProjectRoleBindings(projectId) { return store.projectRoleBindings.filter((r) => r.projectId === projectId); },
    upsertProjectRoleBinding(record) {
      const idx = store.projectRoleBindings.findIndex((r) => r.projectId === record.projectId && r.userId === record.userId);
      if (idx >= 0) { store.projectRoleBindings[idx] = record; } else { store.projectRoleBindings.push(record); }
      return record;
    },
    removeProjectRoleBinding(projectId, userId) {
      const idx = store.projectRoleBindings.findIndex((r) => r.projectId === projectId && r.userId === userId);
      if (idx >= 0) { store.projectRoleBindings.splice(idx, 1); return true; }
      return false;
    },
    listTenantMemberBindings(tenantId) { return store.tenantMemberBindings.filter((r) => r.tenantId === tenantId); },
    upsertTenantMemberBinding(record) {
      const idx = store.tenantMemberBindings.findIndex((r) => r.tenantId === record.tenantId && r.userId === record.userId);
      if (idx >= 0) { store.tenantMemberBindings[idx] = record; } else { store.tenantMemberBindings.push(record); }
      return record;
    },
    removeTenantMemberBinding(tenantId, userId) {
      const idx = store.tenantMemberBindings.findIndex((r) => r.tenantId === tenantId && r.userId === userId);
      if (idx >= 0) { store.tenantMemberBindings.splice(idx, 1); return true; }
      return false;
    },
    listPlatformRoleBindings() { return store.platformRoleBindings; },
    upsertPlatformRoleBinding(record) {
      const idx = store.platformRoleBindings.findIndex((r) => r.userId === record.userId);
      if (idx >= 0) { store.platformRoleBindings[idx] = record; } else { store.platformRoleBindings.push(record); }
      return record;
    },
    removePlatformRoleBinding(userId) {
      const idx = store.platformRoleBindings.findIndex((r) => r.userId === userId);
      if (idx >= 0) { store.platformRoleBindings.splice(idx, 1); return true; }
      return false;
    },
    listGovernanceCustomRoles() { return store.governanceCustomRoles; },
    upsertGovernanceCustomRole(record) {
      const idx = store.governanceCustomRoles.findIndex((r) => r.roleKey === record.roleKey);
      if (idx >= 0) { store.governanceCustomRoles[idx] = record; } else { store.governanceCustomRoles.push(record); }
      return record;
    },
    removeGovernanceCustomRole(roleKey) {
      const idx = store.governanceCustomRoles.findIndex((r) => r.roleKey === roleKey);
      if (idx >= 0) { store.governanceCustomRoles.splice(idx, 1); return true; }
      return false;
    },

    // ── CollaborationRepository ──
    listVersionSnapshots(projectId) { return store.versionSnapshots.filter((v) => v.projectId === projectId); },
    appendVersionSnapshot(snapshot) { store.versionSnapshots.push(snapshot); },
    findVersionSnapshot(snapshotId) { return store.versionSnapshots.find((v) => v.id === snapshotId) || null; },
    listProjectShares(projectId) { return store.projectShares.filter((s) => s.projectId === projectId); },
    findProjectShareByToken(token) { return store.projectShares.find((s) => s.token === token) || null; },
    appendProjectShare(share) { store.projectShares.push(share); },
    listDeployments(projectId) {
      return projectId != null ? store.deployments.filter((d) => d.projectId === projectId) : store.deployments;
    },
    findDeployment(deploymentId) { return store.deployments.find((d) => d.id === deploymentId) || null; },
    appendDeployment(record) { store.deployments.push(record); },
    updateDeployment(record) {
      const idx = store.deployments.findIndex((d) => d.id === record.id);
      if (idx >= 0) store.deployments[idx] = record;
    },
    listTemplateRuns(projectId) {
      return projectId != null ? store.templateRuns.filter((r) => r.projectId === projectId) : store.templateRuns;
    },
    appendTemplateRun(record) { store.templateRuns.push(record); },
    listProjectWorkspaceBindings(projectId) {
      return store.projectWorkspaceBindings.filter((b) => b.projectId === projectId);
    },
    upsertProjectWorkspaceBinding(record) {
      const idx = store.projectWorkspaceBindings.findIndex((b) => b.projectId === record.projectId);
      if (idx >= 0) { store.projectWorkspaceBindings[idx] = record; } else { store.projectWorkspaceBindings.push(record); }
      return record;
    },
  };
}

// ─── Mock AgentRunner ───

export function createMockAgentRunner(reply = "mock reply") {
  const calls = [];
  return {
    calls,
    run() { throw new Error("should not call run"); },
    async runWithHistory(systemPrompt, history) {
      calls.push({ systemPrompt, history });
      return { content: reply, model: "mock-model" };
    },
  };
}

export function createMockAgentRunnerWithJson(json) {
  return createMockAgentRunner(JSON.stringify(json));
}

// ─── 便捷数据构造 ───

export function buildMinimalProject(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: 1,
    name: "测试项目",
    description: "自动化测试用",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildMinimalIteration(projectId, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: 1,
    projectId,
    title: "迭代-1",
    goal: "测试目标",
    status: "planning",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildMinimalPolicyRecord(projectId, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: 1,
    projectId,
    version: 1,
    status: "active",
    createdBy: "test-actor",
    approvedBy: "test-actor",
    createdAt: now,
    approvedAt: now,
    strategy: {
      stages: ["clarification", "scope", "development", "testing", "release", "archive"],
      gates: [],
      requiredConfirmations: { firstIterationGitReport: true },
      exceptions: [],
      skillsPlan: [{ stage: "agent-selected", skills: [] }],
    },
    ...overrides,
  };
}
