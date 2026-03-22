import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { AgentRunner } from "./agentRunner";
import { OpenClawAgentRunner } from "../../infrastructure/openclaw/openclawAgentRunner";
import {
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

  probeOpenclawIntegration(): OpenclawIntegrationStatus {
    return probeOpenclawIntegrationOp();
  }

  private async gatewayProjectChat(projectId: number, message: string): Promise<OpenclawDirectChatResult> {
    const runner = this.agentRunner as OpenClawAgentRunner;
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
    const systemPrompt = [projectContext, skillContext].filter(Boolean).join("\n\n") || "你是 BuildWise 的业务助手。";

    const sessionContext: Record<string, unknown> = { projectId };
    if (binding?.agentId) {
      sessionContext.agentId = binding.agentId;
    }

    const result = await runner.runWithHistory(
      systemPrompt,
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

    const kb = input.project.knowledgeBase;
    if (kb) {
      const terms = kb.ontologyTerms.slice(0, 6);
      if (terms.length > 0) {
        parts.push(`项目关键业务概念：${terms.map((t) => t.term + (t.aliases.length > 0 ? `（${t.aliases.join("、")}）` : "")).join("、")}`);
      }
      const rules = kb.stableRules.slice(0, 6);
      if (rules.length > 0) {
        parts.push(`已确认的业务规则：${rules.map((r) => r.rule).join("；")}`);
      }
      const components = kb.componentInventory.slice(0, 6);
      if (components.length > 0) {
        parts.push(`涉及的功能模块：${components.map((c) => c.component).join("、")}`);
      }
      const risks = kb.knownRisks.slice(0, 4);
      if (risks.length > 0) {
        parts.push(`已知风险：${risks.map((r) => r.risk).join("、")}`);
      }
      const patterns = kb.changePatterns.slice(0, 4);
      if (patterns.length > 0) {
        parts.push(`常见变更模式：${patterns.map((p) => p.pattern).join("、")}`);
      }
    } else {
      parts.push("项目还没有积累业务知识，需要通过分析材料来逐步沉淀。");
    }
  }

  if (input.binding) {
    parts.push(`OpenClaw 绑定：profile=${input.binding.openclawProfile}, agentId=${input.binding.agentId}`);
  }

  return parts.filter(Boolean).join("\n");
}
