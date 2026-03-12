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
    "你当前处于主窗口，仅可进行流程编排与配置确认，不可直接推进项目执行。",
    "输出要求：给出全局统一可复用的流程配置（阶段、门禁、触发条件、执行入口）。",
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
    "输出要求：给出该项目可落地的阶段门禁、确认动作、异常恢复分支。",
    "执行边界：涉及代码与迭代推进动作必须在真实 iteration 上下文中完成并可追溯。",
    `用户请求：${message}`
  ].join("\n");
}
