import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { AgentRunner } from "./agentRunner";
import { coachIterationConversationOp } from "./workspaceServiceCoachOps";

export class CoachService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null
  ) {}

  coachIterationConversation(iterationId: number, message: string) {
    return coachIterationConversationOp(this.repo, this.agentRunner, iterationId, message);
  }
}
