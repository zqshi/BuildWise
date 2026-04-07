/**
 * Coach Service — 教练服务
 *
 * 使用完整版教练对话（含 coach marker 解析、交付物声明、知识同步）。
 */

import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { AgentRunner } from "./agentRunner";
import { coachIterationConversationOp } from "./workspaceServiceCoachOps";

export class CoachService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null,
    _modelingRepo: unknown = null
  ) {}

  /**
   * 教练迭代对话
   */
  coachIterationConversation(iterationId: number, message: string) {
    return coachIterationConversationOp(this.repo, this.agentRunner, iterationId, message);
  }
}
