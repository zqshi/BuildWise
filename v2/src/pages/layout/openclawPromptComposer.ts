export type OpenclawDialogMode = "native" | "orchestration";

export function composeOpenclawGlobalMessage(input: string, mode: OpenclawDialogMode) {
  const message = input.trim();
  if (!message) {
    return "";
  }
  if (mode === "native") {
    return message;
  }
  return [
    "[OpenClaw 主窗口编排约束]",
    "你当前处于主窗口，仅可进行流程编排与配置确认，不可直接伪造项目执行结果。",
    "平台提供的是 skills 能力包、状态约束与审计基础设施，具体使用哪些 skills 由 Agent 自行判断。",
    "skills 采用渐进式加载：只加载当前问题所需的最小必要 skills，不按固定顺序全量执行。",
    "输出要求：给出全局统一可复用的流程配置、能力约束、关键门禁与下一步建议。",
    "请优先输出 JSON 合同：{status,summary,next_actions,risks,evidence}。",
    "适用范围：对所有项目 workspace 一致生效，不做项目维度差异化配置。",
    "执行边界：项目引导只在项目窗口、且必须在 iteration 上下文中执行。",
    `用户请求：${message}`
  ].join("\n");
}

export function composeOpenclawProjectMessage(input: string, mode: OpenclawDialogMode) {
  const message = input.trim();
  if (!message) {
    return "";
  }
  if (mode === "native") {
    return message;
  }
  return [
    "[OpenClaw 项目窗口策略约束]",
    "你当前处于项目窗口，可给出当前项目可执行的策略建议，但不要直接伪造执行结果。",
    "平台提供的是 skills 能力包与约束，具体 skill 选择由 Agent 根据问题自行编排。",
    "skills 采用渐进式加载：只加载当前项目问题需要的 skills。",
    "输出要求：给出该项目可落地的阶段门禁、确认动作、异常恢复分支与下一步建议。",
    "执行边界：涉及代码与迭代推进动作必须在真实 iteration 上下文中完成并可追溯。",
    `用户请求：${message}`
  ].join("\n");
}
