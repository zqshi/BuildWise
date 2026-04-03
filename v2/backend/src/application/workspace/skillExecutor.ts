/**
 * Skill Executor — 技能执行器
 *
 * 导出 Skill 执行相关的类型和工具函数。
 */

export type SkillId = "analyze-materials" | "extract-ontology" | "lock-boundary" | "generate-prd" |
  "design-interaction" | "plan-architecture" | "generate-code" |
  "generate-tests" | "release-review" | "package-delivery";

export type SkillDefinition = {
  id: string;
  name: string;
  stage: string;
  timeoutMs: number;
  capabilities: string[];
  defaultModel: string;
};

export type SkillExecutionOptions = {
  maxAttempts?: number;
  validateOutput?: boolean;
  sessionId?: string;
};

// ---------------------------------------------------------------------------
// Skill 定义注册表
// ---------------------------------------------------------------------------

const SKILL_DEFINITIONS: Record<SkillId, SkillDefinition> = {
  "analyze-materials": {
    id: "skill-buildwise-analyze-materials",
    name: "材料分析",
    stage: "clarification",
    timeoutMs: 60000,
    capabilities: ["text-analysis", "file-parsing", "multi-modal-understanding"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "extract-ontology": {
    id: "skill-buildwise-ontology-extraction",
    name: "本体抽取",
    stage: "clarification",
    timeoutMs: 90000,
    capabilities: ["entity-extraction", "relationship-mapping", "term-disambiguation"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "lock-boundary": {
    id: "skill-buildwise-lock-boundary",
    name: "边界锁定",
    stage: "scope",
    timeoutMs: 30000,
    capabilities: ["scope-analysis", "boundary-validation", "acceptance-criteria"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "generate-prd": {
    id: "skill-buildwise-generate-prd",
    name: "PRD 生成",
    stage: "scope",
    timeoutMs: 90000,
    capabilities: ["document-structure", "requirements-formulation", "technical-specification"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "design-interaction": {
    id: "skill-buildwise-design-interaction",
    name: "交互设计",
    stage: "interaction",
    timeoutMs: 60000,
    capabilities: ["ui-design", "ux-flows", "component-architecture"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "plan-architecture": {
    id: "skill-buildwise-plan-architecture",
    name: "技术架构",
    stage: "interaction",
    timeoutMs: 90000,
    capabilities: ["system-design", "api-design", "database-schema", "deployment-planning"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "generate-code": {
    id: "skill-buildwise-generate-code",
    name: "代码生成",
    stage: "interaction",
    timeoutMs: 120000,
    capabilities: ["code-generation", "language-support", "architecture-compliance"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "generate-tests": {
    id: "skill-buildwise-generate-tests",
    name: "测试生成",
    stage: "testing",
    timeoutMs: 90000,
    capabilities: ["test-case-generation", "coverage-analysis", "test-automation"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "release-review": {
    id: "skill-buildwise-release-review",
    name: "发布评审",
    stage: "release",
    timeoutMs: 60000,
    capabilities: ["risk-assessment", "quality-gating", "rollback-planning"],
    defaultModel: "claude-sonnet-4-20250514"
  },
  "package-delivery": {
    id: "skill-buildwise-package-delivery",
    name: "交付打包",
    stage: "release",
    timeoutMs: 30000,
    capabilities: ["artifact-compilation", "documentation-generation", "version-tagging"],
    defaultModel: "claude-sonnet-4-20250514"
  }
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

export function getSkillDefinition(skillId: SkillId): SkillDefinition {
  return SKILL_DEFINITIONS[skillId];
}

export function getAllSkillDefinitions(): SkillDefinition[] {
  return Object.values(SKILL_DEFINITIONS);
}

export function getSkillIdsForStage(stage: string): SkillId[] {
  return Object.entries(SKILL_DEFINITIONS)
    .filter(([_, def]) => def.stage === stage)
    .map(([id]) => id as SkillId);
}

// 阶段到 Skill ID 映射
export const STAGE_SKILL_MAPPING: Record<string, SkillId[]> = {
  clarification: ["analyze-materials", "extract-ontology"],
  scope: ["lock-boundary", "generate-prd"],
  interaction: ["design-interaction", "plan-architecture", "generate-code"],
  testing: ["generate-tests"],
  release: ["release-review", "package-delivery"]
};

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export const executor = {
  // 占位符，实际执行逻辑在 OpenClawGatewayClient 中实现
  version: "2.0.0-gateway",
  initialized: true
};
