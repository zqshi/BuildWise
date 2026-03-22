import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { OpenclawGlobalRepository } from "../../domain/openclawGlobal/repository";
import type {
  OpenclawGlobalConversation,
  OpenclawGlobalMessage,
  OpenclawGlobalSkillRecord,
  OpenclawGlobalStore,
  OpenclawGlobalStrategyState
} from "../../domain/openclawGlobal/types";
import { defaultOpenclawGlobalStore } from "../../domain/openclawGlobal/types";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * JSON-file backed OpenClaw global repository.
 *
 * CONCURRENCY SAFETY NOTE:
 * All read-modify-write sequences are fully synchronous (readFileSync →
 * in-memory mutation → writeFileSync) with no await points in between.
 * Node.js single-threaded execution guarantees atomicity within each
 * synchronous call, so no async mutex is needed for single-process deployments.
 *
 * If any method is refactored to use async I/O, an async mutex MUST be added.
 * For production, prefer STORAGE_BACKEND=sqlite for transactional safety.
 */
export class JsonOpenclawGlobalRepository implements OpenclawGlobalRepository {
  private readonly dataFile: string;
  constructor(dataFile: string) {
    this.dataFile = dataFile;
  }

  private readStore(): OpenclawGlobalStore {
    if (!existsSync(this.dataFile)) {
      const initial = defaultOpenclawGlobalStore();
      this.writeStore(initial);
      return initial;
    }
    const raw = readFileSync(this.dataFile, "utf-8");
    let parsed: Partial<OpenclawGlobalStore>;
    try {
      parsed = JSON.parse(raw) as Partial<OpenclawGlobalStore>;
    } catch {
      console.error(`[openclaw-global-repo] data file corrupted, resetting: ${this.dataFile}`);
      const initial = defaultOpenclawGlobalStore();
      this.writeStore(initial);
      return initial;
    }
    return {
      conversations: asArray<OpenclawGlobalConversation>(parsed.conversations),
      messages: asArray<OpenclawGlobalMessage>(parsed.messages),
      skills: asArray<OpenclawGlobalSkillRecord>(parsed.skills),
      strategyState: parsed.strategyState ?? defaultOpenclawGlobalStore().strategyState
    };
  }

  private writeStore(data: OpenclawGlobalStore): void {
    const tmpFile = `${this.dataFile}.tmp`;
    writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmpFile, this.dataFile);
  }

  // ---- 对话 ----

  listConversations(): OpenclawGlobalConversation[] {
    return this.readStore().conversations;
  }

  findConversation(conversationId: string): OpenclawGlobalConversation | null {
    return this.readStore().conversations.find((c) => c.id === conversationId) ?? null;
  }

  createConversation(conversation: OpenclawGlobalConversation): OpenclawGlobalConversation {
    const data = this.readStore();
    data.conversations.push(conversation);
    this.writeStore(data);
    return conversation;
  }

  updateConversation(conversation: OpenclawGlobalConversation): void {
    const data = this.readStore();
    const idx = data.conversations.findIndex((c) => c.id === conversation.id);
    if (idx >= 0) {
      data.conversations[idx] = conversation;
      this.writeStore(data);
    }
  }

  // ---- 消息 ----

  listMessages(conversationId: string): OpenclawGlobalMessage[] {
    return this.readStore().messages.filter((m) => m.conversationId === conversationId);
  }

  appendMessage(message: OpenclawGlobalMessage): OpenclawGlobalMessage {
    const data = this.readStore();
    data.messages.push(message);
    this.writeStore(data);
    return message;
  }

  // ---- Skill 记录 ----

  listSkills(): OpenclawGlobalSkillRecord[] {
    return this.readStore().skills;
  }

  findSkill(skillId: string): OpenclawGlobalSkillRecord | null {
    return this.readStore().skills.find((s) => s.id === skillId) ?? null;
  }

  saveSkill(skill: OpenclawGlobalSkillRecord): OpenclawGlobalSkillRecord {
    const data = this.readStore();
    const idx = data.skills.findIndex((s) => s.id === skill.id);
    if (idx >= 0) {
      data.skills[idx] = skill;
    } else {
      data.skills.push(skill);
    }
    this.writeStore(data);
    return skill;
  }

  // ---- 策略状态 ----

  getStrategyState(): OpenclawGlobalStrategyState {
    return this.readStore().strategyState;
  }

  updateStrategyState(state: OpenclawGlobalStrategyState): void {
    const data = this.readStore();
    data.strategyState = state;
    this.writeStore(data);
  }
}
