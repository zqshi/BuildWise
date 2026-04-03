/**
 * Coach Service — 教练服务
 *
 * 基于 OpenClaw Gateway 提供稳定的迭代对话和交付物生成能力。
 */

import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { AgentRunner } from "./agentRunner";
import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import { coachIterationConversationOp } from "./coachOps";

export class CoachService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null,
    private readonly modelingRepo: ContinuousModelingRepository | null = null
  ) {}

  /**
   * 教练迭代对话
   */
  coachIterationConversation(iterationId: number, message: string) {
    return coachIterationConversationOp(this.repo, this.agentRunner, iterationId, message, this.modelingRepo);
  }
}
