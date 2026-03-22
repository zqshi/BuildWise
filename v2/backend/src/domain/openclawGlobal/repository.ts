import type {
  OpenclawGlobalConversation,
  OpenclawGlobalMessage,
  OpenclawGlobalSkillRecord,
  OpenclawGlobalStrategyState
} from "./types";

export interface OpenclawGlobalRepository {
  // ---- 对话 ----
  listConversations(): OpenclawGlobalConversation[];
  findConversation(conversationId: string): OpenclawGlobalConversation | null;
  createConversation(conversation: OpenclawGlobalConversation): OpenclawGlobalConversation;
  updateConversation(conversation: OpenclawGlobalConversation): void;

  // ---- 消息 ----
  listMessages(conversationId: string): OpenclawGlobalMessage[];
  appendMessage(message: OpenclawGlobalMessage): OpenclawGlobalMessage;

  // ---- Skill 记录 ----
  listSkills(): OpenclawGlobalSkillRecord[];
  findSkill(skillId: string): OpenclawGlobalSkillRecord | null;
  saveSkill(skill: OpenclawGlobalSkillRecord): OpenclawGlobalSkillRecord;

  // ---- 策略状态 ----
  getStrategyState(): OpenclawGlobalStrategyState;
  updateStrategyState(state: OpenclawGlobalStrategyState): void;
}
