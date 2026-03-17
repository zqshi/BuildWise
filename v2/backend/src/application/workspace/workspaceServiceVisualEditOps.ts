import type { IterationVisualEditAction, IterationVisualEditResponse } from "../../domain/workspace/analysisTypes";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { LlmInvocationError, LlmUnavailableError, type AgentRunner } from "./agentRunner";
import { safeJsonParse } from "./workspaceServiceAttachmentUtils";
import { normalizeIteration } from "./workspaceSupport";

type VisualEditTarget = {
  mode?: "html" | "image" | "prototype";
  target?: string;
  summary?: string;
  html?: {
    selector?: string;
    tag?: string;
    text?: string;
    styles?: Record<string, string>;
  };
};

function normalizeText(message: string) {
  return message.trim().replace(/\s+/g, " ");
}

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const allowedStyleProps = new Set(["color", "backgroundColor", "fontSize", "fontWeight"]);
const cssColorValuePattern = /^(#[0-9a-f]{3,8}|rgba?\([^)]{1,64}\)|hsla?\([^)]{1,64}\)|[a-zA-Z]{2,20})$/;
const numericPxPattern = /^\d{1,4}(?:\.\d{1,2})?px$/;

function sanitizeAction(action: Record<string, unknown>): IterationVisualEditAction | null {
  const op = pickString(action.op) as IterationVisualEditAction["op"];
  if (!op) {
    return null;
  }
  if (op === "set-text") {
    const value = pickString(action.value).slice(0, 240);
    return value ? { op, value } : null;
  }
  if (op === "toggle-visibility") {
    const value = pickString(action.value).toLowerCase();
    if (value === "hidden" || value === "visible") {
      return { op, value };
    }
    return null;
  }
  if (op === "resize") {
    const property = pickString(action.property);
    const value = pickString(action.value).replace(/\s+/g, "");
    if ((property === "width" || property === "height") && numericPxPattern.test(value)) {
      const numeric = Number(value.replace(/px$/i, ""));
      const bounded = property === "width" ? clamp(numeric, 80, 1600) : clamp(numeric, 24, 1000);
      return { op, property, value: `${Math.round(bounded)}px` };
    }
    return null;
  }
  if (op === "set-style") {
    const property = pickString(action.property);
    const rawValue = pickString(action.value).replace(/\s+/g, "");
    if (!allowedStyleProps.has(property)) {
      return null;
    }
    if (property === "fontSize") {
      if (!numericPxPattern.test(rawValue)) {
        return null;
      }
      const numeric = clamp(Number(rawValue.replace(/px$/i, "")), 10, 72);
      return { op, property, value: `${Math.round(numeric)}px` };
    }
    if (property === "fontWeight") {
      if (!/^(100|200|300|400|500|600|700|800|900)$/.test(rawValue)) {
        return null;
      }
      return { op, property, value: rawValue };
    }
    if (!cssColorValuePattern.test(rawValue)) {
      return null;
    }
    return { op, property, value: rawValue };
  }
  return null;
}

async function inferActionsByLlm(
  agentRunner: AgentRunner,
  message: string,
  target?: VisualEditTarget
): Promise<IterationVisualEditAction[]> {
  const normalizedMessage = normalizeText(message);
  const optimizeIntent = /(优化|美化|更好看|更清晰|更醒目|提升可读性|提升层次)/.test(normalizedMessage);
  const prompt = {
    agentId: "agent-visual-edit-parser-1",
    role: "delivery-engineer" as const,
    scope: "iteration" as const,
    goal: "把用户自然语言编辑请求解析为可执行 UI 变更动作",
    expectedOutput: "JSON: {actions:[{op,property?,value?}], reasoning?}",
    systemPrompt: [
      "你是 BuildWise 可视化编辑动作解析器。",
      "把自然语言修改请求解析为动作数组 actions。",
      "动作仅允许：set-text, set-style, toggle-visibility, resize。",
      "set-style.property 仅允许：color, backgroundColor, fontSize, fontWeight。",
      "resize.property 仅允许：width, height，value 必须是 px。",
      "toggle-visibility.value 仅允许 hidden 或 visible。",
      "如果是“字号小一些/大一点”这类相对指令，请结合上下文当前字号推导目标 px。",
      "如果用户表达“优化/美化/更好看”，在不改变结构的前提下输出 1-3 条保守样式优化动作（优先 fontSize/fontWeight/color/backgroundColor）。",
      "必须严格输出 JSON，不要输出 markdown。"
    ].join("\n"),
    userPrompt: [
      `用户指令：${normalizedMessage}`,
      `目标信息：${JSON.stringify(
        {
          mode: target?.mode || "prototype",
          target: target?.target || "",
          summary: target?.summary || "",
          html: target?.html || null
        },
        null,
        2
      )}`,
      optimizeIntent ? "补充要求：这是优化类指令，请给出可直接执行的保守样式优化动作，不要返回空 actions。" : "",
      "请输出：JSON {actions:[{op,property?,value?}], reasoning}"
    ].join("\n\n")
  };
  const result = await agentRunner.run(prompt);
  const parsed = safeJsonParse(result.content);
  const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  return rawActions
    .map((item) => (item && typeof item === "object" ? sanitizeAction(item as Record<string, unknown>) : null))
    .filter((item): item is IterationVisualEditAction => Boolean(item));
}

function dedupeActions(actions: IterationVisualEditAction[]) {
  const seen = new Set<string>();
  return actions.filter((item) => {
    const key = `${item.op}:${item.property || ""}:${item.value || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function executeVisualEditInstructionOp(
  agentRunner: AgentRunner | null,
  repo: WorkspaceRepository,
  iterationId: number,
  message: string,
  target?: VisualEditTarget
): Promise<IterationVisualEditResponse | null> {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  if (!agentRunner) {
    throw new LlmUnavailableError("Visual edit LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL).");
  }
  const normalized = normalizeIteration(iteration);
  let llmActions: IterationVisualEditAction[] = [];
  try {
    llmActions = await inferActionsByLlm(agentRunner, message, target);
  } catch (error) {
    throw new LlmInvocationError(error instanceof Error ? error.message : "visual_edit_llm_error");
  }
  const actions = dedupeActions(llmActions);
  if (actions.length === 0) {
    return {
      iterationId: normalized.id,
      status: "needs-clarification",
      reply: "我还不能精确执行这条修改，请补充具体属性，例如“字号改为 18px、加粗、文字改为 xxx”。",
      summary: "未识别到可执行的样式或文本变更。",
      scope: target?.mode === "html" ? "selected-element" : "prototype-target",
      actions: [],
      warnings: ["请补充更明确的修改目标（属性、方向或对象）。"],
      target: {
        mode: target?.mode || "prototype",
        target: target?.target || "未命名元素"
      }
    };
  }

  const plan = actions.map((item) => {
    if (item.op === "set-text") {
      return `文案 -> ${item.value}`;
    }
    if (item.op === "toggle-visibility") {
      return `可见性 -> ${item.value === "hidden" ? "隐藏" : "显示"}`;
    }
    return `${item.property || item.op} -> ${item.value}`;
  });

  const targetLabel = target?.target?.trim() || target?.html?.selector?.trim() || "当前元素";
  return {
    iterationId: normalized.id,
    status: "applied",
    reply: `已按指令生成 ${actions.length} 项可执行修改，目标：${targetLabel}。`,
    summary: plan.join("；"),
    scope: target?.mode === "html" ? "selected-element" : "prototype-target",
    actions,
    warnings: [],
    target: {
      mode: target?.mode || "prototype",
      target: targetLabel
    }
  };
}
