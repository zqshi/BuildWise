import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Iteration } from "../../domain/workspace/types";
import type { Project } from "../../domain/workspace/projectTypes";

type SkillChainConfig = {
  sequence?: unknown;
};

type SkillPackEntry = {
  id: string;
  name: string;
  description: string;
};

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

function loadSkillIds(): string[] {
  const chainPath = resolve(process.cwd(), "skills", "buildwise-openclaw", "skill-chain.json");
  if (!existsSync(chainPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(chainPath, "utf-8")) as SkillChainConfig;
    if (!Array.isArray(parsed.sequence)) {
      return [];
    }
    return parsed.sequence
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 16);
  } catch {
    return [];
  }
}

function parseFrontmatterValue(source: string, key: string) {
  const matched = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return matched?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
}

function loadSkillPackEntries(): SkillPackEntry[] {
  return loadSkillIds()
    .map((id) => {
      const skillPath = resolve(process.cwd(), "skills", "buildwise-openclaw", id, "SKILL.md");
      if (!existsSync(skillPath)) {
        return null;
      }
      try {
        const content = readFileSync(skillPath, "utf-8");
        return {
          id,
          name: parseFrontmatterValue(content, "name") || id,
          description: parseFrontmatterValue(content, "description")
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as SkillPackEntry[];
}

function uniq(items: string[], max = 8) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, max);
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function buildSkillSummary(entry: SkillPackEntry | undefined, reason: string) {
  if (!entry) {
    return reason;
  }
  return `${entry.id}: ${reason}`;
}

export function selectOpenclawSkills(params: {
  iteration?: Iteration | null;
  project?: Project | null;
  previousIterationName?: string;
  userMessage: string;
}) {
  const entries = loadSkillPackEntries();
  const message = params.userMessage.trim();
  const normalizedMessage = message.toLowerCase();
  const selectedSkills: string[] = [];
  const selectionReasons: string[] = [];
  const summaries: string[] = [];
  const suggestedActions: string[] = [];
  const checklist: string[] = [];
  const risks: string[] = [];
  const add = (id: string, reason: string, action: string[] = [], checks: string[] = [], risk: string[] = []) => {
    if (!entries.some((entry) => entry.id === id) || selectedSkills.includes(id)) {
      return;
    }
    selectedSkills.push(id);
    selectionReasons.push(`${id}:${reason}`);
    summaries.push(buildSkillSummary(entries.find((entry) => entry.id === id), reason));
    suggestedActions.push(...action);
    checklist.push(...checks);
    risks.push(...risk);
  };

  const boundary = params.iteration?.changeControl?.boundary;
  const activeStage = params.iteration?.changeControl?.artifactWorkflow?.activeStage || "";
  const normalizedPoints = params.iteration?.changeControl?.normalizedFunctionalPoints || [];
  const knowledgeHits = params.iteration?.changeControl?.knowledgeHits || [];
  const knowledgeConflicts = params.iteration?.changeControl?.knowledgeConflicts || [];
  const domainTerms = params.iteration?.changeControl?.domainKnowledgeEntries?.map((item) => item.term) || [];
  const projectTerms = params.project?.knowledgeBase?.ontologyTerms?.map((item) => item.term) || [];
  const projectRules = params.project?.knowledgeBase?.stableRules?.map((item) => item.rule) || [];
  const businessRuleTriggered =
    hasAny(normalizedMessage, [
      /业务规则/,
      /领域/,
      /规则/,
      /口径/,
      /例外/,
      /约束/,
      /术语/,
      /验收/,
      /合规/,
      /审批/,
      /状态流转/,
      /domain/,
      /rule/,
      /policy/,
      /acceptance/,
      /compliance/
    ]) ||
    knowledgeHits.length > 0 ||
    knowledgeConflicts.length > 0 ||
    domainTerms.length > 0 ||
    projectRules.length > 0;
  if (businessRuleTriggered) {
    add(
      "10-business-rule-linking",
      "当前输入涉及业务规则、领域知识或验收口径，需要把自然语言规则链接到页面、组件、接口、状态和测试。",
      ["确认新增或变更的业务规则", "确认规则命中的页面/组件/接口边界"],
      ["规则是否已映射到工程对象", "是否存在例外处理或冲突规则"],
      knowledgeConflicts.length > 0 ? ["存在项目知识冲突，需在继续前确认业务语义"] : []
    );
  }

  const qualityTriggered =
    hasAny(normalizedMessage, [
      /ux/,
      /原型/,
      /设计/,
      /交互/,
      /规范/,
      /页面/,
      /前端/,
      /后端/,
      /架构/,
      /代码/,
      /测试/,
      /发布/,
      /回滚/,
      /质量/,
      /prototype/,
      /design/,
      /spec/,
      /code/,
      /test/,
      /release/,
      /rollback/,
      /handoff/
    ]) ||
    ["interaction", "development", "testing", "release"].includes(activeStage) ||
    Boolean(boundary?.codePaths?.length) ||
    normalizedPoints.length > 0 ||
    Boolean(params.previousIterationName);
  if (qualityTriggered) {
    add(
      "11-product-rd-quality-contract",
      "当前阶段涉及原型、设计、实现、测试或发布，需要校验交付物是否达到可交接的产品研发质量要求。",
      ["确认当前交付物是否达到下一阶段交接质量", "确认测试和回滚方案是否完整"],
      ["UX/原型/代码/测试是否形成闭环", "发布是否具备可执行回滚路径"],
      boundary?.codePaths?.length ? [] : ["当前变更尚未形成稳定代码边界，后续交付可能失真"]
    );
  }

  return {
    availableSkills: entries.map((entry) => entry.id),
    selectedSkills,
    selectionReasons: uniq(selectionReasons, 6),
    summaries: uniq(summaries, 4),
    suggestedActions: uniq(suggestedActions, 6),
    checklist: uniq(checklist, 6),
    risks: uniq(risks, 6)
  };
}

export function buildOpenclawSkillsPackContext() {
  const entries = loadSkillPackEntries();
  if (entries.length === 0) {
    return "skills.mode=disabled\nskills.progressive_loading=no\nskills.available=-";
  }
  return [
    "skills.mode=agent-led",
    "skills.progressive_loading=yes",
    "skills.selection_rule=agent chooses and loads only the minimum required skills for the current concern",
    `skills.available=${entries.map((item) => `${item.id}:${item.description || item.name}`).join(" | ")}`
  ].join("\n");
}

export function buildOpenclawSkillSelectionContext(params: {
  iteration?: Iteration | null;
  project?: Project | null;
  previousIterationName?: string;
  userMessage: string;
}) {
  const selection = selectOpenclawSkills(params);
  return [
    `skills.selected=${selection.selectedSkills.join(" | ") || "-"}`,
    `skills.selection_reasons=${selection.selectionReasons.join(" | ") || "-"}`,
    `skills.recommended_actions=${selection.suggestedActions.join(" | ") || "-"}`,
    `skills.quality_risks=${selection.risks.join(" | ") || "-"}`
  ].join("\n");
}

export function runOpenclawSkillChainForCoach(params: {
  iteration: Iteration;
  project?: Project | null;
  previousIterationName: string;
  userMessage: string;
}): OpenclawSkillChainRun {
  const enabled = (process.env.BUILDWISE_OPENCLAW_SKILLS_ENABLED || "1").trim() !== "0";
  if (!enabled) {
    return {
      enabled: false,
      mode: "disabled",
      blocked: false,
      summaries: [],
      suggestedActions: [],
      checklist: [],
      risks: [],
      evidence: [],
      selectedSkills: [],
      selectionReasons: [],
      error: ""
    };
  }

  const entries = loadSkillPackEntries();
  if (entries.length === 0) {
    return {
      enabled: true,
      mode: "bridge",
      blocked: false,
      summaries: [],
      suggestedActions: [],
      checklist: [],
      risks: ["skills pack missing or empty"],
      evidence: [],
      selectedSkills: [],
      selectionReasons: [],
      error: "missing_skills_pack"
    };
  }

  const selection = selectOpenclawSkills({
    iteration: params.iteration,
    project: params.project ?? null,
    previousIterationName: params.previousIterationName,
    userMessage: params.userMessage
  });

  return {
    enabled: true,
    mode: "bridge",
    blocked: false,
    summaries: selection.summaries,
    suggestedActions: selection.suggestedActions,
    checklist: selection.checklist,
    risks: selection.risks,
    evidence: [
      `skills_mode=agent_led_progressive_loading`,
      `available_skills=${entries.map((item) => item.id).join("|")}`,
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
