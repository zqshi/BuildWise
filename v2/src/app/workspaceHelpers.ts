import type { IterationContextPayload } from "../domain/workspace/types";

export function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function nowIsoString() {
  return new Date().toISOString();
}

export function buildAssistantReply(input: string, scope: IterationContextPayload["scope"] | undefined) {
  if (!scope) {
    return "请先选择迭代版本，再进行需求沟通。";
  }
  if (input.includes("开始拆解任务")) {
    const goals = scope.inScope.length > 0 ? scope.inScope : ["补充本轮范围目标"];
    const goalList = goals.join("\n2) ");
    const outScope = scope.outOfScope.join("、") || "暂无";
    return `本轮范围拆解建议：\n1) ${goalList}\n\n非本轮范围：${outScope}\n请确认优先级后进入实现。`;
  }
  return "已记录到当前迭代。可用指令：完成: xxx；延期: xxx；新增范围: xxx；移出范围: xxx；验收通过: xxx；风险: xxx；清除风险: xxx；当前总结: xxx。";
}
