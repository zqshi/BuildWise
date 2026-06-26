/**
 * postExecutionVerifier — Coach 执行后统一后验门禁层
 *
 * V3 门禁硬化：把散落在 stageOrchestrator 的校验上提为统一可测纯函数层。
 *
 * 职责：
 * 1. 硬阻断判断：stage gate 或 policy gate 任一阻断 → 不推进阶段/不合成交付物
 * 2. action/intent 白名单校验（从 processAgentResponse 上提）
 * 3. 门禁绕过检测：policyGate.blocked 但 LLM 声明推进类 action → 标记 bypass_attempt
 *
 * 纯函数无副作用，审计日志记录由调用方执行。
 */

export type PolicyGate = { blocked: boolean; reason: string; requiredActions: string[] } | null;
export type GateResult = { blocked: boolean };

/** 推进类 action：会改变阶段状态/触发全周期，门禁阻断时不应执行 */
const ADVANCE_ACTIONS = new Set(["rewrite", "run-full-cycle", "enter-clarify-mode", "confirm-accurate", "confirm-inaccurate"]);

export const VALID_ACTIONS = new Set([
  "none", "rewrite", "confirm-accurate", "confirm-inaccurate", "enter-clarify-mode", "run-full-cycle", "capture-business-rule",
]);

export const VALID_INTENTS = new Set([
  "collect-attachment", "clarify", "confirm-boundary", "plan", "qa", "release", "full-cycle", "general",
]);

/**
 * 阶段推进是否应被硬阻断。stage gate 或 policy gate 任一阻断即阻断。
 * 注意：阻断只影响状态推进/交付物合成，不影响 LLM 对话回复（门禁严格但不冷暴力）。
 */
export function shouldBlockStageAdvance(gateResult: GateResult, policyGate: PolicyGate): boolean {
  return gateResult.blocked || policyGate?.blocked === true;
}

/**
 * 交付物合成是否应被硬阻断。与阶段推进同条件。
 */
export function shouldBlockArtifactSynthesis(gateResult: GateResult, policyGate: PolicyGate): boolean {
  return shouldBlockStageAdvance(gateResult, policyGate);
}

/**
 * 校验 LLM 声明的 action 是否在白名单内。非法 → 降级为 none。
 */
export function sanitizeAction(rawAction: unknown): string {
  const action = typeof rawAction === "string" ? rawAction.trim() : "";
  return VALID_ACTIONS.has(action) ? action : "none";
}

/**
 * 校验 LLM 声明的 intent 是否在白名单内。非法 → 降级为 general。
 */
export function sanitizeIntent(rawIntent: unknown): string {
  const intent = typeof rawIntent === "string" ? rawIntent.trim() : "";
  return VALID_INTENTS.has(intent) ? intent : "general";
}

/**
 * 检测门禁绕过：policyGate 阻断时，LLM 仍声明推进类 action（绕过门禁尝试推进）。
 * 返回 true 表示发生绕过尝试，调用方应记 gate_bypass_attempt 审计日志。
 */
export function detectGateBypass(policyGate: PolicyGate, sanitizedAction: string): boolean {
  if (!policyGate?.blocked) return false;
  return ADVANCE_ACTIONS.has(sanitizedAction);
}

export type PostVerifyResult = {
  /** 是否阻断推进/合成 */
  blocked: boolean;
  /** 校验后的 action（非法降级 none） */
  action: string;
  /** 校验后的 intent（非法降级 general） */
  intent: string;
  /** 是否检测到门禁绕过尝试 */
  bypassAttempt: boolean;
};

/**
 * 统一后验入口：硬阻断判断 + action/intent 白名单 + 门禁绕过检测。
 */
export function verifyCoachExecution(params: {
  gateResult: GateResult;
  policyGate: PolicyGate;
  rawAction: unknown;
  rawIntent: unknown;
}): PostVerifyResult {
  const { gateResult, policyGate, rawAction, rawIntent } = params;
  const action = sanitizeAction(rawAction);
  const intent = sanitizeIntent(rawIntent);
  return {
    blocked: shouldBlockStageAdvance(gateResult, policyGate),
    action,
    intent,
    bypassAttempt: detectGateBypass(policyGate, action),
  };
}
