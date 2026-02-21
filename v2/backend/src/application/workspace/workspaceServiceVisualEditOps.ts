import type { IterationVisualEditAction, IterationVisualEditResponse } from "../../domain/workspace/analysisTypes";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
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

const colorMap: Record<string, string> = {
  蓝色: "#2563eb",
  绿色: "#16a34a",
  红色: "#dc2626",
  橙色: "#ea580c",
  灰色: "#475569",
  黑色: "#111827",
  白色: "#ffffff"
};

function normalizeText(message: string) {
  return message.trim().replace(/\s+/g, " ");
}

function parseActions(message: string): IterationVisualEditAction[] {
  const normalized = normalizeText(message);
  const actions: IterationVisualEditAction[] = [];
  const quoted = normalized.match(/["“]([^"”]{1,120})["”]/)?.[1]?.trim();
  const rename =
    quoted ||
    normalized.match(/(?:文案|文本|标题|改成|改为|改名为)\s*[:：]?\s*([^\n]{1,120})$/)?.[1]?.trim() ||
    "";
  if (rename) {
    actions.push({ op: "set-text", value: rename });
  }

  const fontSizeMatch = normalized.match(/(?:字号|字体大小|font[- ]?size)\s*(?:改为|设为|到)?\s*(\d{1,3})\s*px?/i);
  if (fontSizeMatch) {
    actions.push({ op: "set-style", property: "fontSize", value: `${Math.max(10, Math.min(72, Number(fontSizeMatch[1])))}px` });
  }

  if (/取消加粗|去掉加粗|normal/i.test(normalized)) {
    actions.push({ op: "set-style", property: "fontWeight", value: "400" });
  } else if (/加粗|粗体|bold/i.test(normalized)) {
    actions.push({ op: "set-style", property: "fontWeight", value: "700" });
  }

  for (const [word, hex] of Object.entries(colorMap)) {
    if (new RegExp(`(?:文字|字|文本)?(?:颜色|色).*${word}|${word}色`).test(normalized)) {
      actions.push({ op: "set-style", property: "color", value: hex });
      break;
    }
  }

  for (const [word, hex] of Object.entries(colorMap)) {
    if (new RegExp(`(?:背景|底色|背景色).*${word}`).test(normalized)) {
      actions.push({ op: "set-style", property: "backgroundColor", value: hex });
      break;
    }
  }

  if (/隐藏|移除|删除/.test(normalized)) {
    actions.push({ op: "toggle-visibility", value: "hidden" });
  } else if (/显示|恢复/.test(normalized)) {
    actions.push({ op: "toggle-visibility", value: "visible" });
  }

  const widthMatch = normalized.match(/宽(?:度)?\s*(?:改为|设为|到)?\s*(\d{2,4})/);
  if (widthMatch) {
    actions.push({ op: "resize", property: "width", value: `${Math.max(80, Math.min(1600, Number(widthMatch[1])))}px` });
  }
  const heightMatch = normalized.match(/高(?:度)?\s*(?:改为|设为|到)?\s*(\d{2,4})/);
  if (heightMatch) {
    actions.push({ op: "resize", property: "height", value: `${Math.max(24, Math.min(1000, Number(heightMatch[1])))}px` });
  }

  return actions;
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

export function executeVisualEditInstructionOp(
  repo: WorkspaceRepository,
  iterationId: number,
  message: string,
  target?: VisualEditTarget
): IterationVisualEditResponse | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const actions = dedupeActions(parseActions(message));
  if (actions.length === 0) {
    return {
      iterationId: normalized.id,
      status: "needs-clarification",
      reply: "我还不能精确执行这条修改，请补充具体属性，例如“字号改为 18px、加粗、文字改为 xxx”。",
      summary: "未识别到可执行的样式或文本变更。",
      scope: target?.mode === "html" ? "selected-element" : "prototype-target",
      actions: [],
      warnings: ["仅支持文本/样式/显隐/宽高类指令。"],
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
