// workspaceOpenclawSkillsBridge — Skill 选择与注入桥接层
// 三源合一 Registry: file-pack / global-custom / policy skillsPlan
// 选择优先级: stageSkillMap > 关键词匹配 > 全量兜底

import type { Iteration } from "../../domain/workspace/types";
import type { Project } from "../../domain/workspace/projectTypes";
import {
  loadFilePackSkillsWithSop,
  buildUnifiedSkillRegistryOp,
  type UnifiedSkillEntry,
  type GlobalCustomSkillEntry,
  type SkillsPlanEntry
} from "./skillRegistry";
import { buildSkillPromptInjection } from "./skillInjector";

// Exported types
export type OpenclawSkillChainRun = {
  enabled: boolean;
  mode: "bridge" | "openclaw-native" | "disabled";
  blocked: boolean;
  summaries: string[];
  suggestedActions: string[];
  checklist: string[];
  risks: string[];
  evidence: string[];
  selectedSkills: string[];
  selectionReasons: string[];
  error: string;
};

export type SkillRegistryContext = {
  globalCustomSkills?: GlobalCustomSkillEntry[];
  policySkillsPlan?: SkillsPlanEntry[];
};

export type { UnifiedSkillEntry };

// Registry construction — 三源合一
function buildRegistry(ctx?: SkillRegistryContext): UnifiedSkillEntry[] {
  const filePackSkills = loadFilePackSkillsWithSop();
  return buildUnifiedSkillRegistryOp(
    filePackSkills,
    ctx?.globalCustomSkills ?? [],
    ctx?.policySkillsPlan ?? []
  );
}

// Selection engine
const BUSINESS_RULE_PATTERNS = [
  /业务规则/, /领域/, /规则/, /口径/, /例外/, /约束/, /术语/, /验收/, /合规/, /审批/, /状态流转/,
  /domain/, /rule/, /policy/, /acceptance/, /compliance/
];

const QUALITY_PATTERNS = [
  /ux/, /原型/, /设计/, /交互/, /规范/, /页面/, /前端/, /后端/, /架构/, /代码/,
  /测试/, /发布/, /回滚/, /质量/, /prototype/, /design/, /spec/, /code/, /test/, /release/, /rollback/, /handoff/
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

type RegistrySelectionParams = {
  registrySkills: UnifiedSkillEntry[];
  userMessage: string;
  activeStage: string;
  stageSkillMap?: Record<string, string[]>;
  knowledgeHits?: string[];
  knowledgeConflicts?: string[];
  domainTerms?: string[];
};

type RegistrySelectionResult = {
  selectedSkills: string[];
  selectedSkillEntries: UnifiedSkillEntry[];
  selectionReasons: string[];
};

export function selectOpenclawSkillsFromRegistry(
  params: RegistrySelectionParams
): RegistrySelectionResult {
  const { registrySkills, userMessage, activeStage, stageSkillMap } = params;
  if (registrySkills.length === 0) {
    return { selectedSkills: [], selectedSkillEntries: [], selectionReasons: [] };
  }

  const normalizedMsg = userMessage.toLowerCase();
  const selected = new Map<string, { entry: UnifiedSkillEntry; reason: string }>();

  // 1. stageSkillMap 优先（来自 policy skillsPlan）
  if (stageSkillMap && activeStage && stageSkillMap[activeStage]) {
    for (const skillId of stageSkillMap[activeStage]) {
      const entry = registrySkills.find((s) => s.id === skillId);
      if (entry) {
        selected.set(skillId, { entry, reason: `stage:${activeStage}` });
      }
    }
  }

  // 2. Stage-based selection — 按迭代阶段自动选择对应 skill
  if (selected.size === 0 && activeStage) {
    const stageDefaultSkills: Record<string, string[]> = {
      clarification: ["00-orchestrator-sop", "01-ontology-mapping"],
      scope: ["02-impact-analysis", "03-deliverable-governance", "04-cross-iteration"],
      interaction: ["09-deliverable-content-contract", "08-agentic-flow-contract", "05-exception-recovery"],
      development: ["09-deliverable-content-contract", "08-agentic-flow-contract", "05-exception-recovery"],
      testing: ["06-quality-release-gate", "11-product-rd-quality-contract"],
      release: ["07-audit-trace", "06-quality-release-gate"],
      archive: ["07-audit-trace"]
    };
    const stageSkills = stageDefaultSkills[activeStage];
    if (stageSkills) {
      for (const skillId of stageSkills) {
        const entry = registrySkills.find((s) => s.id === skillId);
        if (entry) {
          selected.set(skillId, { entry, reason: `stage-default:${activeStage}` });
        }
      }
    }
  }

  // 3. Keyword signal — 业务规则/质量关键词补充选中
  const businessRuleTriggered =
    matchesAny(normalizedMsg, BUSINESS_RULE_PATTERNS) ||
    (params.knowledgeHits?.length ?? 0) > 0 ||
    (params.knowledgeConflicts?.length ?? 0) > 0 ||
    (params.domainTerms?.length ?? 0) > 0;

  if (businessRuleTriggered) {
    const entry = registrySkills.find((s) => s.id.includes("business-rule") || s.id.includes("rule-linking"));
    if (entry && !selected.has(entry.id)) {
      selected.set(entry.id, { entry, reason: "keyword:business-rule" });
    }
  }

  const qualityTriggered =
    matchesAny(normalizedMsg, QUALITY_PATTERNS) ||
    ["interaction", "development", "testing", "release"].includes(activeStage);

  if (qualityTriggered) {
    const entry = registrySkills.find((s) => s.id.includes("quality-contract") || s.id.includes("quality"));
    if (entry && !selected.has(entry.id)) {
      selected.set(entry.id, { entry, reason: "keyword:quality" });
    }
  }

  // 4. Orchestrator 始终在场（最低优先级补位）
  if (selected.size === 0) {
    const orchestrator = registrySkills.find((s) => s.id === "00-orchestrator-sop");
    if (orchestrator) {
      selected.set(orchestrator.id, { entry: orchestrator, reason: "fallback:orchestrator" });
    }
  }

  const selectedSkills = Array.from(selected.keys());
  const selectedSkillEntries = Array.from(selected.values()).map((v) => v.entry);
  const selectionReasons = Array.from(selected.values()).map((v) => `${v.entry.id}:${v.reason}`);

  return { selectedSkills, selectedSkillEntries, selectionReasons };
}

// Helpers — 从迭代/项目上下文提取 registry 选择参数
function extractSelectionParams(
  registry: UnifiedSkillEntry[],
  params: {
    iteration?: Iteration | null;
    project?: Project | null;
    userMessage: string;
    policySkillsPlan?: SkillsPlanEntry[];
  }
): RegistrySelectionParams {
  const activeStage = params.iteration?.changeControl?.artifactWorkflow?.activeStage || "";
  const knowledgeHits = params.iteration?.changeControl?.knowledgeHits || [];
  const knowledgeConflicts = params.iteration?.changeControl?.knowledgeConflicts || [];
  const domainTerms = params.iteration?.changeControl?.domainKnowledgeEntries?.map((item) => item.term) || [];
  const projectRules = params.project?.knowledgeBase?.stableRules?.map((item) => item.rule) || [];

  // 从 policy skillsPlan 构建 stageSkillMap
  let stageSkillMap: Record<string, string[]> | undefined;
  const plans = params.policySkillsPlan;
  if (plans && plans.length > 0) {
    stageSkillMap = {};
    for (const plan of plans) {
      if (plan.stage && plan.skills.length > 0) {
        stageSkillMap[plan.stage] = plan.skills;
      }
    }
    if (Object.keys(stageSkillMap).length === 0) {
      stageSkillMap = undefined;
    }
  }

  return {
    registrySkills: registry,
    userMessage: params.userMessage,
    activeStage,
    stageSkillMap,
    knowledgeHits,
    knowledgeConflicts,
    domainTerms: [...domainTerms, ...projectRules]
  };
}

// buildOpenclawSkillsPackContext — skill 能力概览（注入 contract context）
export function buildOpenclawSkillsPackContext(registryContext?: SkillRegistryContext) {
  const registry = buildRegistry(registryContext);
  if (registry.length === 0) {
    return "skills.mode=disabled\nskills.progressive_loading=no\nskills.available=-";
  }
  return [
    "skills.mode=agent-led",
    "skills.progressive_loading=yes",
    "skills.selection_rule=agent chooses and loads only the minimum required skills for the current concern",
    `skills.available=${registry.map((item) => `${item.id}:${item.description || item.name}`).join(" | ")}`
  ].join("\n");
}

// buildOpenclawSkillSelectionContext — skill 选择摘要 + SOP 注入
export function buildOpenclawSkillSelectionContext(params: {
  iteration?: Iteration | null;
  project?: Project | null;
  previousIterationName?: string;
  userMessage: string;
  registryContext?: SkillRegistryContext;
}) {
  const registry = buildRegistry(params.registryContext);
  const selectionParams = extractSelectionParams(registry, {
    ...params,
    policySkillsPlan: params.registryContext?.policySkillsPlan
  });
  const selection = selectOpenclawSkillsFromRegistry(selectionParams);

  const metadata = [
    `skills.selected=${selection.selectedSkills.join(" | ") || "-"}`,
    `skills.selection_reasons=${selection.selectionReasons.join(" | ") || "-"}`
  ].join("\n");

  const sopInjection = buildSkillPromptInjection(selection.selectedSkillEntries, {});

  return [metadata, sopInjection].filter(Boolean).join("\n\n");
}

// runOpenclawSkillChainForCoach — Coach 完整 skill chain 执行
export function runOpenclawSkillChainForCoach(params: {
  iteration: Iteration;
  project?: Project | null;
  previousIterationName: string;
  userMessage: string;
  openclawSkillsEnabled?: boolean;
  registryContext?: SkillRegistryContext;
}): OpenclawSkillChainRun {
  const enabled = params.openclawSkillsEnabled ?? (process.env.BUILDWISE_OPENCLAW_SKILLS_ENABLED || "1").trim() !== "0";
  if (!enabled) {
    return {
      enabled: false, mode: "disabled", blocked: false,
      summaries: [], suggestedActions: [], checklist: [], risks: [], evidence: [],
      selectedSkills: [], selectionReasons: [], error: ""
    };
  }

  const registry = buildRegistry(params.registryContext);
  if (registry.length === 0) {
    return {
      enabled: true, mode: "bridge", blocked: false,
      summaries: [], suggestedActions: [], checklist: [],
      risks: ["skills registry empty"], evidence: [],
      selectedSkills: [], selectionReasons: [], error: "empty_registry"
    };
  }

  const selectionParams = extractSelectionParams(registry, {
    iteration: params.iteration,
    project: params.project ?? null,
    userMessage: params.userMessage,
    policySkillsPlan: params.registryContext?.policySkillsPlan
  });
  const selection = selectOpenclawSkillsFromRegistry(selectionParams);
  const knowledgeConflicts = params.iteration?.changeControl?.knowledgeConflicts || [];

  // 从选中 skill 的 SOP 元数据派生行动建议
  const summaries = selection.selectedSkillEntries.map((e) => `${e.id}: ${e.description || e.name}`);
  const suggestedActions: string[] = [];
  const checklist: string[] = [];
  for (const entry of selection.selectedSkillEntries) {
    if (entry.id.includes("business-rule") || entry.id.includes("rule-linking")) {
      suggestedActions.push("确认新增或变更的业务规则", "确认规则命中的页面/组件/接口边界");
      checklist.push("规则是否已映射到工程对象", "是否存在例外处理或冲突规则");
    } else if (entry.id.includes("quality-contract") || entry.id.includes("quality")) {
      suggestedActions.push("确认当前交付物是否达到下一阶段交接质量", "确认测试和回滚方案是否完整");
      checklist.push("UX/原型/代码/测试是否形成闭环", "发布是否具备可执行回滚路径");
    } else {
      suggestedActions.push(`执行 ${entry.name} 相关检查`);
    }
  }
  const risks = knowledgeConflicts.length > 0 ? ["存在项目知识冲突，需在继续前确认业务语义"] : [];

  return {
    enabled: true,
    mode: "bridge",
    blocked: false,
    summaries: Array.from(new Set(summaries)).slice(0, 4),
    suggestedActions: Array.from(new Set(suggestedActions)).slice(0, 6),
    checklist: Array.from(new Set(checklist)).slice(0, 6),
    risks: Array.from(new Set(risks)).slice(0, 6),
    evidence: [
      "skills_mode=registry_based",
      `available_skills=${registry.map((item) => item.id).join("|")}`,
      `selected_skills=${selection.selectedSkills.join("|") || "none"}`,
      `selection_reasons=${selection.selectionReasons.join(" | ") || "none"}`,
      `iteration=${params.iteration.name}`,
      `baseline=${params.previousIterationName || "none"}`
    ],
    selectedSkills: selection.selectedSkills,
    selectionReasons: selection.selectionReasons,
    error: ""
  };
}
