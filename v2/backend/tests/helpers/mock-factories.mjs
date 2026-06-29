/**
 * 共享 Mock 工厂
 * 提供 In-Memory Repository 和 Mock AgentRunner，供全量测试复用
 */

// ─── GlobalAssistant In-Memory Repository ───

export function createInMemoryGlobalAssistantRepo() {
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
    backlogItems: [],
    analysisJobs: [],
    reportIndexes: [],
    reportSections: [],
    assistantMessages: [],
  };

  let nextIdCounter = 1;

  return {
    _store: store,

    // ── StoreAccess ──
    read() { return store; },
    write(data) { Object.assign(store, data); },
    nextId() { return nextIdCounter++; },

    // ── ProjectRepository ──
    listProjects(tenantId) {
      return tenantId ? store.projects.filter((p) => p.tenantId === tenantId) : store.projects;
    },
    findProject(projectId, tenantId) {
      const found = store.projects.find((p) => p.id === projectId) || null;
      if (!found || !tenantId) return found;
      return found.tenantId === tenantId ? found : null;
    },
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
    deleteIteration(iterationId) {
      const idx = store.iterations.findIndex((i) => i.id === iterationId);
      if (idx === -1) return false;
      store.iterations.splice(idx, 1);
      store.messages = store.messages.filter((m) => m.iterationId !== iterationId);
      store.snapshots = store.snapshots.filter((s) => s.iterationId !== iterationId);
      store.transitions = store.transitions.filter((t) => t.iterationId !== iterationId);
      return true;
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

    // ── AssistantMessageRepository ──
    listAssistantMessages(tenantId, limit) {
      const items = store.assistantMessages.filter((m) => m.tenantId === tenantId);
      return limit ? items.slice(-limit) : items;
    },
    appendAssistantMessage(msg) {
      const record = { id: nextIdCounter++, ...msg };
      store.assistantMessages.push(record);
      return record;
    },
    clearAssistantMessages(tenantId) {
      store.assistantMessages = store.assistantMessages.filter((m) => m.tenantId !== tenantId);
    },

    // ── GovernanceRepository ──
    listAuditLogs(limit) { return limit ? store.auditLogs.slice(-limit) : store.auditLogs; },
    appendAuditLog(log) { store.auditLogs.push(log); },

    // ── AnalysisRepository ──
    saveAnalysisJob(job) {
      const idx = store.analysisJobs.findIndex((j) => j.jobId === job.jobId);
      if (idx >= 0) store.analysisJobs[idx] = { ...store.analysisJobs[idx], ...job };
      else store.analysisJobs.push(job);
    },
    listAnalysisJobs(iterationId) { return store.analysisJobs.filter((j) => j.iterationId === iterationId); },
    saveReportIndex(report) {
      const idx = store.reportIndexes.findIndex((r) => r.jobId === report.jobId);
      if (idx >= 0) store.reportIndexes[idx] = report; else store.reportIndexes.push(report);
    },
    findReportIndexByJob(jobId) { return store.reportIndexes.find((r) => r.jobId === jobId) || null; },
    saveReportSections(sections) {
      for (const sec of sections) {
        const idx = store.reportSections.findIndex((s) => s.sectionId === sec.sectionId);
        if (idx >= 0) store.reportSections[idx] = sec; else store.reportSections.push(sec);
      }
    },
    listReportSections(reportId) { return store.reportSections.filter((s) => s.reportId === reportId); },
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

    // ── BacklogRepository（默认值对齐 SqliteWorkspaceBacklog） ──
    listBacklogItems(projectId) { return store.backlogItems.filter((i) => i.projectId === projectId); },
    findBacklogItem(itemId) { return store.backlogItems.find((i) => i.id === itemId) || null; },
    createBacklogItem(projectId, input, createdBy) {
      const now = new Date().toISOString();
      const item = {
        id: nextIdCounter++,
        projectId,
        iterationId: input.iterationId ?? null,
        title: input.title,
        description: input.description || "",
        priority: input.priority || "medium",
        status: input.iterationId ? "planned" : "open",
        source: input.source || "internal",
        sourceRef: input.sourceRef || "",
        tags: input.tags ? [...input.tags] : [],
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
      store.backlogItems.push(item);
      return item;
    },
    updateBacklogItem(item) {
      const idx = store.backlogItems.findIndex((i) => i.id === item.id);
      if (idx >= 0) store.backlogItems[idx] = { ...store.backlogItems[idx], ...item, updatedAt: new Date().toISOString() };
    },
    deleteBacklogItem(itemId) {
      const idx = store.backlogItems.findIndex((i) => i.id === itemId);
      if (idx === -1) return false;
      store.backlogItems.splice(idx, 1);
      return true;
    },
    listBacklogItemsByIteration(iterationId) { return store.backlogItems.filter((i) => i.iterationId === iterationId); },
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

// ─── ContinuousModeling In-Memory Repository ───

export function createInMemoryModelingRepo() {
  const snapshots = [];
  return {
    _snapshots: snapshots,
    listSnapshots(projectId) {
      return snapshots.filter((s) => s.projectId === projectId);
    },
    getLatestPublishedSnapshot(projectId) {
      const published = snapshots.filter((s) => s.projectId === projectId && s.status === "published");
      return published.length > 0 ? published[published.length - 1] : null;
    },
    saveCandidateSnapshot(snapshot) {
      // upsert 语义，对齐 JsonContinuousModelingRepository（同 id 覆盖）。
      // v0.26.0 T2：resolveReviewTask 写回同 id 快照须覆盖而非重复 push，
      // 否则多次解决累积 resolved 被掩盖（第二次读到第一次 push 的旧快照）。
      const idx = snapshots.findIndex((s) => s.id === snapshot.id);
      if (idx >= 0) snapshots[idx] = snapshot;
      else snapshots.push(snapshot);
    },
    updateSnapshotStatus(snapshotId, status) {
      const s = snapshots.find((item) => item.id === snapshotId);
      if (s) { s.status = status; return true; }
      return false;
    },
  };
}

// ─── 便捷数据构造 ───

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
