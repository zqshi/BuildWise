import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { AgentRunner } from "./agentRunner";
import { isGatewayCapableRunner } from "./agentRunner";
import {
  openclawDirectChatOp,
  probeOpenclawIntegrationOp,
  type OpenclawDirectChatResult,
  type OpenclawIntegrationStatus
} from "./workspaceServiceOpenclawOps";
import { buildOpenclawSkillSelectionContext } from "./workspaceOpenclawSkillsBridge";
import { buildKnowledgeSyncContext } from "./knowledgeSyncService";
import { searchProjectWorkspaceKnowledge } from "./projectWorkspaceKnowledgeService";

export class OpenclawService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null
  ) {}

  openclawDirectChat(projectId: number, message: string): OpenclawDirectChatResult | Promise<OpenclawDirectChatResult> {
    // When agentRunner is an OpenClaw Gateway runner, use it for session-persistent chat
    if (this.agentRunner && isGatewayCapableRunner(this.agentRunner)) {
      return this.gatewayProjectChat(projectId, message);
    }
    // Fallback to CLI direct execution
    return openclawDirectChatOp(this.repo, { projectId, message });
  }

  probeOpenclawIntegration(): OpenclawIntegrationStatus {
    return probeOpenclawIntegrationOp();
  }

  private async gatewayProjectChat(projectId: number, message: string): Promise<OpenclawDirectChatResult> {
    const runner = this.agentRunner!;
    const project = this.repo.findProject(projectId);
    const binding = this.repo.listProjectWorkspaceBindings(projectId)[0] || null;

    // Build full knowledge context (aligned with CLI path)
    const projectContext = buildGatewayProjectContext({
      project: project ?? null,
      userMessage: message,
      binding: binding ? {
        openclawProfile: binding.openclawProfile,
        agentId: binding.agentId,
        workspacePath: binding.workspacePath,
      } : null,
    });

    const skillContext = buildOpenclawSkillSelectionContext({ project, userMessage: message });
    const knowledgeHits = searchProjectWorkspaceKnowledge(this.repo, projectId, message, 3);
    const systemPrompt = [projectContext, skillContext].filter(Boolean).join("\n\n") || "你是 BuildWise 的业务助手。";
    const retrievalContext = knowledgeHits.length > 0
      ? [
          "[project workspace retrieval]",
          ...knowledgeHits.map((item, index) => `(${index + 1}) ${item.title} [score=${item.score}]` + `\n${item.content}`)
        ].join("\n\n")
      : "";

    const sessionContext: Record<string, unknown> = { projectId };
    if (binding?.agentId) {
      sessionContext.agentId = binding.agentId;
    }

    const result = await runner.runWithHistory(
      [systemPrompt, retrievalContext].filter(Boolean).join("\n\n"),
      [{ role: "user" as const, content: message }],
      { sessionContext }
    );

    return {
      mode: "openclaw-native",
      profile: binding?.openclawProfile || "gateway",
      agentId: binding?.agentId || "main",
      workspacePath: binding?.workspacePath || "",
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

// ---------------------------------------------------------------------------
// buildGatewayProjectContext — 完整项目知识注入（对齐 CLI 路径）
// ---------------------------------------------------------------------------

type GatewayContextInput = {
  project: {
    name: string;
    description?: string;
    status: string;
    knowledgeBase?: {
      ontologyTerms: Array<{ term: string; aliases: string[]; definition: string; evidence: string }>;
      stableRules: Array<{ rule: string; rationale: string; source: string }>;
      componentInventory: Array<{ component: string; responsibility: string; relatedRequirements: string[]; relatedCodePaths: string[] }>;
      codeMap: Array<{ capability: string; codePaths: string[]; tests: string[] }>;
      decisionLog: Array<{ decision: string; status: "active" | "deprecated"; rationale: string; iterationVersion: string }>;
      knownRisks: Array<{ risk: string; mitigation: string; trigger: string }>;
      changePatterns: Array<{ pattern: string; preferredFlow: string; avoid: string }>;
      updatedAt: string;
    } | null;
  } | null;
  userMessage: string;
  binding: { openclawProfile: string; agentId: string; workspacePath: string } | null;
};

export function buildGatewayProjectContext(input: GatewayContextInput): string {
  const parts: string[] = [];

  if (input.project) {
    parts.push(summarizeProjectForGateway(input.project));

    // 使用统一的 knowledgeSyncContext 替代手写序列化（覆盖全部 7 字段）
    const knowledgeContext = buildKnowledgeSyncContext(input.project.knowledgeBase ?? null);
    if (knowledgeContext) {
      parts.push(knowledgeContext);
    } else {
      parts.push("项目还没有积累业务知识，需要通过分析材料来逐步沉淀。");
    }
  }

  if (input.binding) {
    parts.push(`OpenClaw 绑定：profile=${input.binding.openclawProfile}, agentId=${input.binding.agentId}`);
  }

  return parts.filter(Boolean).join("\n");
}
