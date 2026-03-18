import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { AgentRunner } from "./agentRunner";
import { OpenClawAgentRunner } from "../../infrastructure/openclaw/openclawAgentRunner";
import { OpenClawGatewayClient } from "../../infrastructure/openclaw/openclawGatewayClient";
import {
  openclawDirectChatGlobalOp,
  openclawDirectChatOp,
  probeOpenclawIntegrationOp,
  type OpenclawDirectChatResult,
  type OpenclawIntegrationStatus
} from "./workspaceServiceOpenclawOps";
import { buildOpenclawSkillSelectionContext } from "./workspaceOpenclawSkillsBridge";

export class OpenclawService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null
  ) {}

  openclawDirectChat(projectId: number, message: string): OpenclawDirectChatResult | Promise<OpenclawDirectChatResult> {
    // When agentRunner is an OpenClaw Gateway runner, use it for session-persistent chat
    if (this.agentRunner instanceof OpenClawAgentRunner) {
      return this.gatewayProjectChat(projectId, message);
    }
    // Fallback to CLI direct execution
    return openclawDirectChatOp(this.repo, { projectId, message });
  }

  openclawDirectChatGlobal(message: string): OpenclawDirectChatResult | Promise<OpenclawDirectChatResult> {
    if (this.agentRunner instanceof OpenClawAgentRunner) {
      return this.gatewayGlobalChat(message);
    }
    return openclawDirectChatGlobalOp(this.repo, { message });
  }

  probeOpenclawIntegration(): OpenclawIntegrationStatus {
    return probeOpenclawIntegrationOp();
  }

  private async gatewayProjectChat(projectId: number, message: string): Promise<OpenclawDirectChatResult> {
    const runner = this.agentRunner as OpenClawAgentRunner;
    const project = this.repo.findProject(projectId);
    const binding = this.repo.listProjectWorkspaceBindings(projectId)[0] || null;

    // Build context sections similar to CLI path but via Gateway
    const contextParts: string[] = [];
    if (project) {
      contextParts.push(summarizeProjectForGateway(project));
    }
    contextParts.push(buildOpenclawSkillSelectionContext({ project, userMessage: message }));

    const systemPrompt = contextParts.filter(Boolean).join("\n\n");
    const result = await runner.runWithHistory(
      systemPrompt || "你是 BuildWise 的业务助手。",
      [{ role: "user" as const, content: message }],
      { sessionContext: { projectId } }
    );

    return {
      mode: "openclaw-native",
      profile: "gateway",
      agentId: "main",
      workspacePath: binding?.workspacePath || "",
      reply: result.content,
      at: new Date().toISOString()
    };
  }

  private async gatewayGlobalChat(message: string): Promise<OpenclawDirectChatResult> {
    const runner = this.agentRunner as OpenClawAgentRunner;
    const projects = this.repo.listProjects().slice(0, 6);
    const contextParts: string[] = [];
    if (projects.length > 0) {
      const summaries = projects.map((p) => `「${p.name}」（${p.status}）`);
      contextParts.push(`当前有 ${projects.length} 个项目：${summaries.join("、")}`);
    }

    const systemPrompt = contextParts.filter(Boolean).join("\n\n");
    const result = await runner.runWithHistory(
      systemPrompt || "你是 BuildWise 的业务助手。",
      [{ role: "user" as const, content: message }],
      { sessionContext: { conversationId: `global-${Date.now()}` } }
    );

    return {
      mode: "openclaw-native",
      profile: "gateway",
      agentId: "main",
      workspacePath: "",
      reply: result.content,
      at: new Date().toISOString()
    };
  }
}

function summarizeProjectForGateway(project: { name: string; description?: string; status: string }): string {
  const parts = [`项目「${project.name}」（${project.status}）`];
  if (project.description) {
    parts.push(project.description);
  }
  return parts.join("，");
}
