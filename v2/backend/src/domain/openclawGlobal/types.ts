/**
 * OpenClaw 全局工作区领域类型
 *
 * 业务助手（主窗口）的持久化模型。
 * Skill 的生成/评估只在此层发生，项目 Workspace 只消费已有 Skill。
 */

// ---------------------------------------------------------------------------
// 对话
// ---------------------------------------------------------------------------

export type OpenclawGlobalMessageRole = "user" | "assistant" | "system";

export type OpenclawGlobalMessage = {
  id: string;
  conversationId: string;
  role: OpenclawGlobalMessageRole;
  content: string;
  /** Agent 产生的结构化元数据（意图识别、Skill 评估结果等） */
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type OpenclawGlobalConversation = {
  id: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Skill 记录（全局自定义 Skill 的轻量注册信息）
// ---------------------------------------------------------------------------

export type OpenclawGlobalSkillStatus = "draft" | "active" | "deprecated";

export type OpenclawGlobalSkillRecord = {
  id: string;
  name: string;
  description: string;
  /** Skill 产生的来源对话 ID */
  sourceConversationId: string;
  /** 完整的 Skill 定义内容（等同于 SKILL.md 的文本） */
  content: string;
  status: OpenclawGlobalSkillStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// 全局策略状态
// ---------------------------------------------------------------------------

export type OpenclawGlobalStrategyState = {
  /** 当前生效的自定义 Skill ID 列表 */
  activeSkillIds: string[];
  /** 用户自定义的工作流描述（自然语言，由 Agent 消费） */
  customWorkflowDescriptions: string[];
  /** 上次恢复初始配置的时间，null 表示从未恢复 */
  lastResetAt: string | null;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// 持久化存储结构
// ---------------------------------------------------------------------------

export type OpenclawGlobalStore = {
  conversations: OpenclawGlobalConversation[];
  messages: OpenclawGlobalMessage[];
  skills: OpenclawGlobalSkillRecord[];
  strategyState: OpenclawGlobalStrategyState;
};

export function defaultOpenclawGlobalStore(): OpenclawGlobalStore {
  return {
    conversations: [],
    messages: [],
    skills: [],
    strategyState: {
      activeSkillIds: [],
      customWorkflowDescriptions: [],
      lastResetAt: null,
      updatedAt: new Date().toISOString()
    }
  };
}
