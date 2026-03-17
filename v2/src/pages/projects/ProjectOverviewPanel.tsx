import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Iteration, ModelRelationPayload, Project, StatusPayload } from "../../domain/workspace/types";
import type { OpsMetricsPayload } from "../../domain/workspace/platformTypes";
import {
  activateProjectPolicy,
  bootstrapProjectRepository,
  bindProjectWorkspace,
  createProjectPolicyDraft,
  executePolicyStep,
  fetchIterationPolicyLogs,
  fetchProjectPolicies,
  configureProjectRepositoryMode,
  fetchProjectRoleBindings,
  fetchProjectModelBusinessSummary,
  fetchProjectRepositoryMigrationPlan,
  fetchProjectRepositoryStatus,
  validateProjectRepositoryRemote,
  removeProjectRoleBinding,
  restoreProjectPolicyToInitialMode,
  sendOpenclawProjectChat,
  upsertProjectRoleBinding,
  type PolicyExecutionLogPayload,
  type ProjectPolicyPayload,
  type ProjectRoleBindingPayload
} from "../../app/workspaceApi";
import type { ProjectModelBusinessSummaryPayload } from "../../domain/workspace/modelOpsTypes";
import { buildModelRelationGraph } from "./projectModelGraphModel";
import { composeOpenclawProjectMessage, type OpenclawDialogMode } from "../layout/openclawPromptComposer";
import {
  MOCK_MODEL_RELATIONS,
  computeProjectOverviewHealthScore,
  guessRepoName,
  inferProviderFromRepoUrl,
  looksLikeGitUrl,
  normalizeInlineMarkdownText,
  toBusinessSummaryErrorMessage,
  toFriendlyName,
  toFriendlyRelationType
} from "./projectOverviewPanelHelpers";
import { ProjectOverviewPanelModelDetails } from "./ProjectOverviewPanelModelDetails";
import { ProjectOverviewPanelDrawers } from "./ProjectOverviewPanelDrawers";

type ProjectOverviewPanelProps = {
  currentProject: Project | null;
  currentIteration: Iteration | null;
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  iterations: Iteration[];
  projectProgress: number;
  modelPageCount: number;
  modelRuleCount: number;
  modelEntityCount: number;
  modelRelations?: ModelRelationPayload[];
  opsMetrics?: OpsMetricsPayload | null;
  status: StatusPayload | null;
  error: string | null;
  backendUnavailable?: boolean;
  onShowCreateIteration: () => void;
  onEnterIteration: (iterationId: number) => void;
  onDeleteProject: (projectId: number) => Promise<void>;
};


export function ProjectOverviewPanel({
  currentProject,
  currentIteration,
  currentRole,
  iterations,
  projectProgress,
  modelPageCount,
  modelRuleCount,
  modelEntityCount,
  modelRelations = [],
  opsMetrics = null,
  status,
  error,
  backendUnavailable = false,
  onShowCreateIteration,
  onEnterIteration,
  onDeleteProject
}: ProjectOverviewPanelProps) {
  const [showModelDetails, setShowModelDetails] = useState(false);
  const [showRepoConfigDrawer, setShowRepoConfigDrawer] = useState(false);
  const [repoConfigStep, setRepoConfigStep] = useState<1 | 2 | 3>(1);
  const [repoUrlDraft, setRepoUrlDraft] = useState(currentProject?.repository?.url || "");
  const [showRepoAdvanced, setShowRepoAdvanced] = useState(false);
  const [requireRemoteForProduction, setRequireRemoteForProduction] = useState(
    currentProject?.repository?.governance?.requireRemoteForProduction ?? true
  );
  const [requireRemoteForStaging, setRequireRemoteForStaging] = useState(
    currentProject?.repository?.governance?.requireRemoteForStaging ?? false
  );
  const [repoHealth, setRepoHealth] = useState<{
    remoteConfigured: boolean;
    remoteReachable: boolean;
    remoteSynced: boolean;
    lastCheckedAt: string;
    lastError: string;
  } | null>(null);
  const [repoConfigBusy, setRepoConfigBusy] = useState(false);
  const [repoValidationBusy, setRepoValidationBusy] = useState(false);
  const [repoValidationError, setRepoValidationError] = useState("");
  const [repoConfigNotice, setRepoConfigNotice] = useState("");
  const [repoMigrationPlan, setRepoMigrationPlan] = useState<{
    currentMode: "external_git" | "managed_local" | "hybrid";
    targetMode: "hybrid" | "external_git";
    blockers: string[];
    nextAction: string;
    steps: Array<{
      id: string;
      title: string;
      description: string;
      status: "pending" | "ready" | "done" | "blocked";
      action: string;
    }>;
  } | null>(null);
  const [businessSummary, setBusinessSummary] = useState<ProjectModelBusinessSummaryPayload | null>(null);
  const [businessSummaryLoading, setBusinessSummaryLoading] = useState(false);
  const [businessSummaryError, setBusinessSummaryError] = useState("");
  const [businessSummaryVersion, setBusinessSummaryVersion] = useState(0);
  const [modelDetailsView, setModelDetailsView] = useState<"summary" | "graph">("summary");
  const [relationTypeFilter, setRelationTypeFilter] = useState<"all" | "one_to_one" | "one_to_many" | "many_to_many">("all");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
  const [graphViewportOffset, setGraphViewportOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [useMockGraphData, setUseMockGraphData] = useState(false);
  const [showPolicyDrawer, setShowPolicyDrawer] = useState(false);
  const [showOpenclawDrawer, setShowOpenclawDrawer] = useState(false);
  const [activePolicy, setActivePolicy] = useState<ProjectPolicyPayload | null>(null);
  const [policyItems, setPolicyItems] = useState<ProjectPolicyPayload[]>([]);
  const [roleBindings, setRoleBindings] = useState<ProjectRoleBindingPayload[]>([]);
  const [policyLogs, setPolicyLogs] = useState<PolicyExecutionLogPayload[]>([]);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyNotice, setPolicyNotice] = useState("");
  const [bindingProfile, setBindingProfile] = useState("buildwise-local");
  const [bindingAgentId, setBindingAgentId] = useState("main");
  const [bindingWorkspacePath, setBindingWorkspacePath] = useState("/Users/zqs/.openclaw/workspace-buildwise-local");
  const [bindingRuntimeMode, setBindingRuntimeMode] = useState<"openclaw-native" | "bridge">("openclaw-native");
  const [newRoleUserId, setNewRoleUserId] = useState("user-1");
  const [newRoleValue, setNewRoleValue] = useState<"admin" | "member" | "viewer">("member");
  const [openclawChatInput, setOpenclawChatInput] = useState("");
  const [openclawChatBusy, setOpenclawChatBusy] = useState(false);
  const [openclawDialogMode, setOpenclawDialogMode] = useState<OpenclawDialogMode>("native");
  const [openclawChatLines, setOpenclawChatLines] = useState<Array<{ role: "admin" | "openclaw"; content: string; at: string }>>([]);

  useEffect(() => {
    setRepoUrlDraft(currentProject?.repository?.url || "");
    setRequireRemoteForProduction(currentProject?.repository?.governance?.requireRemoteForProduction ?? true);
    setRequireRemoteForStaging(currentProject?.repository?.governance?.requireRemoteForStaging ?? false);
    setRepoHealth(currentProject?.repository?.health || null);
    setRepoMigrationPlan(null);
    setRepoValidationError("");
    setRepoConfigNotice("");
    setBusinessSummary(null);
    setBusinessSummaryError("");
    setBusinessSummaryLoading(false);
  }, [currentProject?.id, currentProject?.repository?.url, currentProject?.repository?.governance?.requireRemoteForProduction, currentProject?.repository?.governance?.requireRemoteForStaging]);

  useEffect(() => {
    if (!showRepoConfigDrawer) return;
    setRepoConfigStep(1);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowRepoConfigDrawer(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showRepoConfigDrawer]);
  const sortedIterations = useMemo(() => [...iterations].sort((a, b) => a.id - b.id), [iterations]);
  const recentIterations = useMemo(() => sortedIterations.slice(-5), [sortedIterations]);
  const completedIterations = sortedIterations.filter((item) => item.status === "completed").length;
  const activeIterations = sortedIterations.length - completedIterations;
  const displayedModelRelations = modelRelations;
  const displayedModelRuleCount = modelRuleCount;
  const displayedModelEntityCount = modelEntityCount;
  const displayedModelPageCount = modelPageCount;

  const healthScore = useMemo(
    () =>
      computeProjectOverviewHealthScore({
        projectProgress,
        modelRuleCount: displayedModelRuleCount,
        modelEntityCount: displayedModelEntityCount,
        modelRelationCount: displayedModelRelations.length,
        modelPageCount: displayedModelPageCount,
        repoHealth,
        runtimeStatus: status?.status || ""
      }),
    [displayedModelEntityCount, displayedModelPageCount, displayedModelRelations.length, displayedModelRuleCount, projectProgress, repoHealth, status?.status]
  );
  const trendText = useMemo(() => {
    if (recentIterations.length < 2) {
      return "样本不足，趋势待形成";
    }
    const first = recentIterations[0]?.progress ?? 0;
    const last = recentIterations[recentIterations.length - 1]?.progress ?? 0;
    if (last > first) {
      return "跨迭代沉淀趋势向好";
    }
    if (last < first) {
      return "跨迭代沉淀趋势放缓";
    }
    return "跨迭代沉淀趋势平稳";
  }, [recentIterations]);
  const isUsingMockData = false;
  const relationTypeStats = useMemo(() => {
    const stats = new Map<string, number>();
    for (const item of displayedModelRelations) {
      const key = toFriendlyRelationType(item.type);
      stats.set(key, (stats.get(key) ?? 0) + 1);
    }
    return Array.from(stats.entries()).map(([name, count]) => ({ name, count }));
  }, [displayedModelRelations]);
  const modelSummaryText = useMemo(() => {
    const relationBrief = relationTypeStats.length > 0 ? relationTypeStats.map((item) => `${item.name}${item.count}条`).join("，") : "暂无关系类型沉淀";
    return `当前已沉淀领域规则 ${displayedModelRuleCount} 条、数据实体 ${displayedModelEntityCount} 个、实体关系 ${displayedModelRelations.length} 条；关系结构以${relationBrief}为主。`;
  }, [displayedModelEntityCount, displayedModelRelations.length, displayedModelRuleCount, relationTypeStats]);
  const relationFocusEntities = useMemo(() => {
    const entityCounter = new Map<string, number>();
    for (const relation of displayedModelRelations) {
      entityCounter.set(relation.fromEntityId, (entityCounter.get(relation.fromEntityId) ?? 0) + 1);
      entityCounter.set(relation.toEntityId, (entityCounter.get(relation.toEntityId) ?? 0) + 1);
    }
    return Array.from(entityCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([entityId, count]) => `${toFriendlyName(entityId)}(${count})`);
  }, [displayedModelRelations]);
  const summaryGeneratedAtText = businessSummary?.generatedAt ? new Date(businessSummary.generatedAt).toLocaleString("zh-CN") : "";
  const domainRuleDescriptions = useMemo(() => {
    const lines: string[] = [];
    for (const item of displayedModelRelations.slice(0, 8)) {
      const from = toFriendlyName(item.fromEntityId);
      const to = toFriendlyName(item.toEntityId);
      const relation = toFriendlyRelationType(item.type);
      lines.push(`规则：${from}与${to}之间建立${relation}约束。`);
    }
    return lines;
  }, [displayedModelRelations]);
  const modelHighlights = useMemo(() => {
    const issues: string[] = [];
    if (displayedModelEntityCount === 0) issues.push("尚未沉淀数据实体");
    if (displayedModelRuleCount === 0) issues.push("尚未沉淀领域规则");
    if (displayedModelRelations.length === 0) issues.push("尚未沉淀实体关系");
    return issues;
  }, [displayedModelEntityCount, displayedModelRuleCount, displayedModelRelations.length]);
  const summaryHeadline = businessSummary?.summary?.trim() || modelSummaryText;
  const graphSourceRelations = useMockGraphData ? MOCK_MODEL_RELATIONS : displayedModelRelations;
  const mockEntitySet = useMemo(() => {
    const ids = new Set<string>();
    for (const item of MOCK_MODEL_RELATIONS) {
      ids.add(item.fromEntityId);
      ids.add(item.toEntityId);
    }
    return ids;
  }, []);
  const relationGraph = useMemo(
    () => buildModelRelationGraph(graphSourceRelations, useMockGraphData ? mockEntitySet.size : displayedModelEntityCount),
    [displayedModelEntityCount, graphSourceRelations, mockEntitySet.size, useMockGraphData]
  );
  const relationGraphNodeById = useMemo(
    () => new Map(relationGraph.nodes.map((node) => [node.id, node])),
    [relationGraph.nodes]
  );
  const filteredRelationGraphEdges = useMemo(
    () =>
      relationGraph.edges.filter((edge) => {
        if (relationTypeFilter === "all") return true;
        return edge.type === relationTypeFilter;
      }),
    [relationGraph.edges, relationTypeFilter]
  );
  const filteredRelationGraphEdgeById = useMemo(
    () => new Map(filteredRelationGraphEdges.map((edge) => [edge.id, edge])),
    [filteredRelationGraphEdges]
  );
  const highlightedEdge = highlightedEdgeId ? filteredRelationGraphEdgeById.get(highlightedEdgeId) ?? null : null;
  const activeFocusNodeId = hoveredNodeId ?? selectedNodeId;
  const selectedNode = selectedNodeId ? relationGraphNodeById.get(selectedNodeId) ?? null : null;
  const selectedNodeOutgoingEdges = useMemo(
    () => (selectedNodeId ? filteredRelationGraphEdges.filter((edge) => edge.fromEntityId === selectedNodeId) : []),
    [filteredRelationGraphEdges, selectedNodeId]
  );
  const selectedNodeIncomingEdges = useMemo(
    () => (selectedNodeId ? filteredRelationGraphEdges.filter((edge) => edge.toEntityId === selectedNodeId) : []),
    [filteredRelationGraphEdges, selectedNodeId]
  );
  const hoveredConnectedNodeIds = useMemo(() => {
    if (!activeFocusNodeId) return null;
    const ids = new Set<string>([activeFocusNodeId]);
    for (const edge of filteredRelationGraphEdges) {
      if (edge.fromEntityId === activeFocusNodeId) ids.add(edge.toEntityId);
      if (edge.toEntityId === activeFocusNodeId) ids.add(edge.fromEntityId);
    }
    return ids;
  }, [activeFocusNodeId, filteredRelationGraphEdges]);
  const showNodeLabels = relationGraph.nodes.length <= 20;
  const centerGraphOnPoint = (x: number, y: number) => {
    const clampOffset = (value: number) => Math.max(-18, Math.min(18, value));
    setGraphViewportOffset({
      x: clampOffset(50 - x),
      y: clampOffset(50 - y)
    });
  };
  const summaryHighlights = useMemo(() => {
    const items: string[] = [];
    if (businessSummary?.focus?.length) {
      items.push(...businessSummary.focus.slice(0, 2).map((item) => normalizeInlineMarkdownText(item)));
    } else if (relationTypeStats.length > 0) {
      items.push(`关系结构：${relationTypeStats.slice(0, 3).map((item) => `${item.name}${item.count}条`).join("、")}`);
    }
    if (relationFocusEntities.length > 0) {
      items.push(`关键实体：${relationFocusEntities.join("、")}`);
    }
    if (businessSummary?.risks?.length) {
      items.push(`风险提示：${normalizeInlineMarkdownText(businessSummary.risks[0])}`);
    } else if (modelHighlights.length > 0) {
      items.push(modelHighlights[0]);
    }
    items.push(`迭代趋势：${trendText}`);
    return items.slice(0, 4);
  }, [businessSummary?.focus, businessSummary?.risks, modelHighlights, relationFocusEntities, relationTypeStats, trendText]);
  const repoUrlValid = looksLikeGitUrl(repoUrlDraft);
  const repoLastCheckedText = repoHealth?.lastCheckedAt ? new Date(repoHealth.lastCheckedAt).toLocaleString("zh-CN") : "";
  const canMoveToNextStep = repoConfigStep === 1 ? repoUrlValid : true;
  const isAdmin = currentRole === "owner";
  const targetIterationId = currentIteration?.id || iterations[iterations.length - 1]?.id || null;

  useEffect(() => {
    setRepoValidationError("");
  }, [repoUrlDraft]);

  useEffect(() => {
    const consumeEntry = () => {
      if (!currentProject) return;
      let pendingEntry: string | null = null;
      try {
        pendingEntry = localStorage.getItem("buildwise:project-governance-entry");
        if (pendingEntry) {
          localStorage.removeItem("buildwise:project-governance-entry");
        }
      } catch {
        pendingEntry = null;
      }
      if (pendingEntry === "policy") {
        setShowPolicyDrawer(true);
        return;
      }
      if (pendingEntry === "openclaw") {
        setShowOpenclawDrawer(true);
      }
    };
    consumeEntry();
    const onOpenRequest = () => consumeEntry();
    window.addEventListener("buildwise:open-governance", onOpenRequest);
    return () => window.removeEventListener("buildwise:open-governance", onOpenRequest);
  }, [currentProject?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!currentProject || isUsingMockData) {
      setBusinessSummary(null);
      setBusinessSummaryError("");
      setBusinessSummaryLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setBusinessSummaryLoading(true);
    setBusinessSummaryError("");
    fetchProjectModelBusinessSummary(currentProject.id, currentIteration?.id)
      .then((payload) => {
        if (cancelled) return;
        setBusinessSummary(payload);
      })
      .catch((error) => {
        if (cancelled) return;
        setBusinessSummary(null);
        setBusinessSummaryError(toBusinessSummaryErrorMessage(error));
      })
      .finally(() => {
        if (cancelled) return;
        setBusinessSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    currentProject?.id,
    currentIteration?.id,
    modelRuleCount,
    modelEntityCount,
    modelPageCount,
    modelRelations.length,
    isUsingMockData,
    businessSummaryVersion
  ]);

  useEffect(() => {
    setHoveredNodeId(null);
    setSelectedNodeId(null);
    setHighlightedEdgeId(null);
    setGraphViewportOffset({ x: 0, y: 0 });
  }, [relationTypeFilter, useMockGraphData]);

  useEffect(() => {
    if (!highlightedEdgeId) return;
    const timer = window.setTimeout(() => {
      setHighlightedEdgeId((current) => (current === highlightedEdgeId ? null : current));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [highlightedEdgeId]);

  const handleDeleteProject = async () => {
    if (!currentProject) {
      return;
    }
    const confirmed = window.confirm(`确认删除项目「${currentProject.name}」吗？删除后将从项目列表隐藏。`);
    if (!confirmed) {
      return;
    }
    await onDeleteProject(currentProject.id);
  };

  const handleRefreshRepositoryStatus = async () => {
    if (!currentProject) return;
    try {
      setRepoConfigBusy(true);
      setRepoValidationError("");
      const status = await fetchProjectRepositoryStatus(currentProject.id);
      setRepoHealth(status?.health || null);
      setRequireRemoteForProduction(status?.governance?.requireRemoteForProduction ?? true);
      setRequireRemoteForStaging(status?.governance?.requireRemoteForStaging ?? false);
      const migrationPlan = await fetchProjectRepositoryMigrationPlan(currentProject.id);
      setRepoMigrationPlan(migrationPlan);
      setRepoConfigNotice("代码仓连接状态已刷新。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "代码仓状态刷新失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  const runRepositoryRemoteValidation = async () => {
    if (!currentProject) {
      return false;
    }
    const url = repoUrlDraft.trim();
    if (!url) {
      setRepoValidationError("请先填写 Git 仓库地址。");
      return false;
    }
    if (!looksLikeGitUrl(url)) {
      setRepoValidationError("地址格式不正确，请使用 https://、ssh:// 或 git@ 开头。");
      return false;
    }
    try {
      setRepoValidationBusy(true);
      setRepoValidationError("");
      await validateProjectRepositoryRemote(currentProject.id, { url });
      return true;
    } catch (error) {
      setRepoValidationError(error instanceof Error ? error.message.replace(/^API error:\s*/i, "") : "仓库地址校验失败");
      return false;
    } finally {
      setRepoValidationBusy(false);
    }
  };

  const handleAdvanceRepositoryStep = async () => {
    if (repoConfigStep !== 1) {
      setRepoConfigStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
      return;
    }
    const passed = await runRepositoryRemoteValidation();
    if (!passed) {
      return;
    }
    setRepoConfigNotice("仓库地址校验通过，可以继续配置发布规则。");
    setRepoConfigStep(2);
  };

  const handleConnectRepository = async () => {
    if (!currentProject) return;
    const url = repoUrlDraft.trim();
    if (!url) {
      setRepoConfigNotice("请先填写 Git 仓库地址。");
      return;
    }
    const repoName = guessRepoName(url) || currentProject.name;
    try {
      setRepoConfigBusy(true);
      setRepoValidationError("");
      const passed = await runRepositoryRemoteValidation();
      if (!passed) {
        return;
      }
      await bootstrapProjectRepository(currentProject.id, {
        provider: inferProviderFromRepoUrl(url),
        name: repoName,
        url,
        defaultBranch: "main",
        repoMode: "external_git",
        requireRemoteForProduction,
        requireRemoteForStaging
      });
      await handleRefreshRepositoryStatus();
      setRepoConfigNotice("代码仓地址已保存并完成连接。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "代码仓连接失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  const handleSaveRepositoryPolicy = async () => {
    if (!currentProject) return;
    try {
      setRepoConfigBusy(true);
      await configureProjectRepositoryMode(currentProject.id, {
        repoMode: repoUrlDraft.trim() ? "external_git" : "hybrid",
        requireRemoteForProduction,
        requireRemoteForStaging
      });
      await handleRefreshRepositoryStatus();
      setRepoConfigNotice("发布前规则已更新。");
    } catch (error) {
      setRepoConfigNotice(error instanceof Error ? error.message : "发布前规则更新失败");
    } finally {
      setRepoConfigBusy(false);
    }
  };

  const loadPolicyData = async () => {
    if (!currentProject) return;
    try {
      const [policies, roles] = await Promise.all([fetchProjectPolicies(currentProject.id), fetchProjectRoleBindings(currentProject.id)]);
      setActivePolicy(policies.active || null);
      setPolicyItems(policies.items || []);
      setRoleBindings(roles);
      if (targetIterationId) {
        const logs = await fetchIterationPolicyLogs(targetIterationId);
        setPolicyLogs(logs.slice(-20).reverse());
      } else {
        setPolicyLogs([]);
      }
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "策略数据加载失败");
    }
  };

  const handleCreatePolicyDraft = async () => {
    if (!currentProject || !isAdmin) return;
    try {
      setPolicyBusy(true);
      await createProjectPolicyDraft(currentProject.id, undefined, "owner", "admin-1");
      await loadPolicyData();
      setPolicyNotice("已创建策略草案。");
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "创建策略草案失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleActivateLatestDraft = async () => {
    if (!currentProject || !isAdmin) return;
    const draft = policyItems.find((item) => item.status === "draft");
    if (!draft) {
      setPolicyNotice("没有可激活的草案。");
      return;
    }
    try {
      setPolicyBusy(true);
      await activateProjectPolicy(currentProject.id, draft.version, "owner", "admin-1");
      await loadPolicyData();
      setPolicyNotice(`策略 v${draft.version} 已激活。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "激活策略失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleRestoreInitialPolicyMode = async () => {
    if (!currentProject || !isAdmin) return;
    try {
      setPolicyBusy(true);
      const restored = await restoreProjectPolicyToInitialMode(currentProject.id, "owner", "admin-1");
      await loadPolicyData();
      setPolicyNotice(`已恢复到初始化编排模式（v${restored.version}）。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "恢复初始化编排模式失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleBindWorkspace = async () => {
    if (!currentProject || !isAdmin) return;
    try {
      setPolicyBusy(true);
      await bindProjectWorkspace(
        currentProject.id,
        {
          openclawProfile: bindingProfile.trim(),
          agentId: bindingAgentId.trim() || "main",
          workspacePath: bindingWorkspacePath.trim(),
          runtimeMode: bindingRuntimeMode,
          locked: true
        },
        "owner",
        "admin-1"
      );
      setPolicyNotice("OpenClaw 工作区绑定已更新。");
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "绑定工作区失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleAddRoleBinding = async () => {
    if (!currentProject || !isAdmin || !newRoleUserId.trim()) return;
    try {
      setPolicyBusy(true);
      await upsertProjectRoleBinding(currentProject.id, { userId: newRoleUserId.trim(), role: newRoleValue }, "owner");
      await loadPolicyData();
      setPolicyNotice(`已更新用户 ${newRoleUserId.trim()} 的项目角色。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "更新角色失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleRemoveRoleBinding = async (userId: string) => {
    if (!currentProject || !isAdmin || !userId.trim()) return;
    try {
      setPolicyBusy(true);
      await removeProjectRoleBinding(currentProject.id, userId.trim(), "owner");
      await loadPolicyData();
      setPolicyNotice(`已移除用户 ${userId.trim()} 的项目角色。`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "移除角色失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleRunPolicyStep = async () => {
    if (!targetIterationId) {
      setPolicyNotice("当前项目暂无可执行迭代。");
      return;
    }
    try {
      setPolicyBusy(true);
      const result = await executePolicyStep(targetIterationId, {
        action: "admin-policy-check",
        message: "管理员发起策略执行检查"
      });
      await loadPolicyData();
      setPolicyNotice(result.ok ? "策略执行检查通过。" : `策略阻断：${result.gate.reason}`);
    } catch (error) {
      setPolicyNotice(error instanceof Error ? error.message : "策略执行失败");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleOpenclawSend = async () => {
    if (!currentProject || !openclawChatInput.trim()) return;
    const text = openclawChatInput.trim();
    setOpenclawChatLines((prev) => [...prev, { role: "admin", content: text, at: new Date().toISOString() }]);
    setOpenclawChatInput("");
    try {
      setOpenclawChatBusy(true);
      const payload = composeOpenclawProjectMessage(text, openclawDialogMode);
      const result = await sendOpenclawProjectChat(currentProject.id, payload, "owner");
      setOpenclawChatLines((prev) => [...prev, { role: "openclaw", content: result.reply, at: new Date().toISOString() }]);
      await loadPolicyData();
    } catch (error) {
      setOpenclawChatLines((prev) => [
        ...prev,
        { role: "openclaw", content: error instanceof Error ? error.message : "OpenClaw 对话失败", at: new Date().toISOString() }
      ]);
    } finally {
      setOpenclawChatBusy(false);
    }
  };

  useEffect(() => {
    if (!showPolicyDrawer && !showOpenclawDrawer) return;
    void loadPolicyData();
  }, [showPolicyDrawer, showOpenclawDrawer, currentProject?.id, targetIterationId]);

  return (
    <>
      <article className="panel preview-panel context-panel project-overview-panel">
      <div className="panel-head">
        <h2>项目面板</h2>
      </div>
      <div className="preview-scroll project-overview-scroll">
        <section className="project-overview-hero">
          <article className="project-progress-card">
            <div className="project-card-head">
              <h3>当前迭代进度</h3>
              <span className={`status-pill ${currentIteration?.status || "planned"}`}>{currentIteration?.status || "planned"}</span>
            </div>
            <div className="project-progress-ring" style={{ "--progress": `${Math.max(0, Math.min(100, projectProgress))}%` } as CSSProperties}>
              <div className="project-progress-ring-inner">
                <strong>{projectProgress}%</strong>
                <span>{currentIteration?.version || currentIteration?.name || "未选择迭代"}</span>
              </div>
            </div>
            <p className="project-progress-meta">
              总迭代 {iterations.length}（已完成 {completedIterations} / 进行中 {activeIterations}）
            </p>
          </article>

          <article className="project-summary-card">
            <div className="project-card-head">
              <h3>建模摘要</h3>
              <span className="linkish">健康分 {healthScore}</span>
            </div>
            <p className="project-summary-text">{summaryHeadline}</p>
            <div className="project-summary-kpis">
              <div className="doc-item">
                <span>领域规则</span>
                <strong>{displayedModelRuleCount}</strong>
              </div>
              <div className="doc-item">
                <span>数据实体</span>
                <strong>{displayedModelEntityCount}</strong>
              </div>
              <div className="doc-item">
                <span>实体关系</span>
                <strong>{displayedModelRelations.length}</strong>
              </div>
              <div className="doc-item">
                <span>页面资产</span>
                <strong>{displayedModelPageCount}</strong>
              </div>
            </div>
            {summaryHighlights.length > 0 ? (
              <ul className="project-highlight-list">
                {summaryHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="hint">当前项目已形成基础建模沉淀。</p>
            )}
          </article>
        </section>

        <section className="project-versions-card">
          <div className="panel-head tight">
            <h3>版本记录</h3>
            <div className="chat-tools">
              <button type="button" className="icon-btn" title="筛选（即将上线）" disabled>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2.5 3h11M5 7.5h6M6.5 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <button type="button" className="icon-btn" title="导出（即将上线）" disabled>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 2.5v7M5.5 7 8 9.5 10.5 7M3 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className="btn ghost mini"
                onClick={onShowCreateIteration}
                disabled={!currentProject || backendUnavailable}
                title={backendUnavailable ? "后端服务未连接，暂不可创建迭代" : undefined}
              >
                新增迭代
              </button>
            </div>
          </div>
          {iterations.length === 0 ? (
            <p className="hint">暂无迭代版本</p>
          ) : (
            <div className="project-version-table" role="table" aria-label="迭代版本列表">
              <div className="project-version-head" role="row">
                <span>版本</span>
                <span>描述</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {iterations.map((item) => (
                <div key={item.id} className={`project-version-row ${item.id === currentIteration?.id ? "active" : ""}`} role="row">
                  <span className="project-version-name">{item.version || item.name}</span>
                  <span className="project-version-desc">{item.description || "暂无描述"}</span>
                  <span className="project-version-status">{item.status} · {item.progress}%</span>
                  <span>
                    <button type="button" className="btn ghost mini" onClick={() => onEnterIteration(item.id)}>
                      进入版本
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <ProjectOverviewPanelModelDetails
          showModelDetails={showModelDetails}
          setShowModelDetails={setShowModelDetails}
          isUsingMockData={isUsingMockData}
          setBusinessSummaryVersion={setBusinessSummaryVersion}
          businessSummaryLoading={businessSummaryLoading}
          modelDetailsView={modelDetailsView}
          setModelDetailsView={setModelDetailsView}
          relationTypeFilter={relationTypeFilter}
          setRelationTypeFilter={setRelationTypeFilter}
          useMockGraphData={useMockGraphData}
          setUseMockGraphData={setUseMockGraphData}
          relationTypeStats={relationTypeStats}
          relationFocusEntities={relationFocusEntities}
          businessSummary={businessSummary}
          summaryGeneratedAtText={summaryGeneratedAtText}
          businessSummaryError={businessSummaryError}
          domainRuleDescriptions={domainRuleDescriptions}
          relationGraph={relationGraph}
          relationGraphNodeById={relationGraphNodeById}
          filteredRelationGraphEdges={filteredRelationGraphEdges}
          highlightedEdgeId={highlightedEdgeId}
          setHighlightedEdgeId={setHighlightedEdgeId}
          activeFocusNodeId={activeFocusNodeId}
          hoveredConnectedNodeIds={hoveredConnectedNodeIds}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
          setHoveredNodeId={setHoveredNodeId}
          graphViewportOffset={graphViewportOffset}
          showNodeLabels={showNodeLabels}
          centerGraphOnPoint={centerGraphOnPoint}
          highlightedEdge={highlightedEdge}
          hoveredNodeId={hoveredNodeId}
          selectedNode={selectedNode}
          selectedNodeOutgoingEdges={selectedNodeOutgoingEdges}
          selectedNodeIncomingEdges={selectedNodeIncomingEdges}
          displayedModelEntityCount={displayedModelEntityCount}
          displayedModelRelations={displayedModelRelations}
          displayedModelRuleCount={displayedModelRuleCount}
        />
        <section className="project-overview-bottom-grid">
          <div className="info-box">
            <div className="panel-head tight">
              <h3>代码仓设置</h3>
              <div className="chat-tools">
                <button type="button" className="btn ghost mini" disabled={!currentProject} onClick={() => setShowRepoConfigDrawer(true)}>
                  打开设置面板
                </button>
              </div>
            </div>
            <p className="hint">采用统一右侧滑入面板配置。业务人员只需填写一个 Git 仓库地址。</p>
            <p className="hint">
              地址已配置：{repoHealth ? (repoHealth.remoteConfigured ? "是" : "否") : "-"}；连接可用：
              {repoHealth ? (repoHealth.remoteReachable ? "是" : "否") : "-"}；同步状态：
              {repoHealth ? (repoHealth.remoteSynced ? "正常" : "待同步") : "-"}
            </p>
            {repoConfigNotice ? <p className="hint">{repoConfigNotice}</p> : null}
          </div>

          <div className="info-box">
            <h3>运行状态</h3>
            {status ? <p>{`服务：${status.service} · 状态：${status.status}`}</p> : <p className="hint">暂无服务状态。</p>}
            {error && <p className="error-inline">{error}</p>}
          </div>
        </section>

        <div className="info-box project-delete-box">
          <h3>项目操作</h3>
          <p className="hint">删除项目将执行逻辑删除，删除后项目不会出现在列表区域。</p>
          <button type="button" className="btn ghost mini project-delete-btn" onClick={handleDeleteProject} disabled={!currentProject}>
            删除项目
          </button>
        </div>
      </div>
      </article>

      <ProjectOverviewPanelDrawers
        showPolicyDrawer={showPolicyDrawer}
        setShowPolicyDrawer={setShowPolicyDrawer}
        showOpenclawDrawer={showOpenclawDrawer}
        setShowOpenclawDrawer={setShowOpenclawDrawer}
        showRepoConfigDrawer={showRepoConfigDrawer}
        setShowRepoConfigDrawer={setShowRepoConfigDrawer}
        activePolicy={activePolicy}
        policyItems={policyItems}
        isAdmin={isAdmin}
        policyBusy={policyBusy}
        handleCreatePolicyDraft={handleCreatePolicyDraft}
        handleActivateLatestDraft={handleActivateLatestDraft}
        handleRestoreInitialPolicyMode={handleRestoreInitialPolicyMode}
        handleRunPolicyStep={handleRunPolicyStep}
        bindingProfile={bindingProfile}
        setBindingProfile={setBindingProfile}
        bindingAgentId={bindingAgentId}
        setBindingAgentId={setBindingAgentId}
        bindingWorkspacePath={bindingWorkspacePath}
        setBindingWorkspacePath={setBindingWorkspacePath}
        bindingRuntimeMode={bindingRuntimeMode}
        setBindingRuntimeMode={setBindingRuntimeMode}
        handleBindWorkspace={handleBindWorkspace}
        newRoleUserId={newRoleUserId}
        setNewRoleUserId={setNewRoleUserId}
        newRoleValue={newRoleValue}
        setNewRoleValue={setNewRoleValue}
        handleAddRoleBinding={handleAddRoleBinding}
        roleBindings={roleBindings}
        handleRemoveRoleBinding={handleRemoveRoleBinding}
        targetIterationId={targetIterationId}
        openclawChatLines={openclawChatLines}
        openclawDialogMode={openclawDialogMode}
        setOpenclawDialogMode={setOpenclawDialogMode}
        openclawChatInput={openclawChatInput}
        setOpenclawChatInput={setOpenclawChatInput}
        openclawChatBusy={openclawChatBusy}
        handleOpenclawSend={handleOpenclawSend}
        policyLogs={policyLogs}
        repoConfigStep={repoConfigStep}
        setRepoConfigStep={setRepoConfigStep}
        repoUrlDraft={repoUrlDraft}
        setRepoUrlDraft={setRepoUrlDraft}
        currentProjectExists={Boolean(currentProject)}
        repoConfigBusy={repoConfigBusy}
        repoValidationBusy={repoValidationBusy}
        repoUrlValid={repoUrlValid}
        repoValidationError={repoValidationError}
        requireRemoteForProduction={requireRemoteForProduction}
        setRequireRemoteForProduction={setRequireRemoteForProduction}
        requireRemoteForStaging={requireRemoteForStaging}
        setRequireRemoteForStaging={setRequireRemoteForStaging}
        repoHealth={repoHealth}
        repoLastCheckedText={repoLastCheckedText}
        repoConfigNotice={repoConfigNotice}
        showRepoAdvanced={showRepoAdvanced}
        setShowRepoAdvanced={setShowRepoAdvanced}
        repoMigrationPlan={repoMigrationPlan}
        canMoveToNextStep={canMoveToNextStep}
        handleAdvanceRepositoryStep={handleAdvanceRepositoryStep}
        handleSaveRepositoryPolicy={handleSaveRepositoryPolicy}
        handleRefreshRepositoryStatus={handleRefreshRepositoryStatus}
        handleConnectRepository={handleConnectRepository}
      />
    </>
  );
}
