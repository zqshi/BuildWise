/**
 * PolicyIntentParser — 从 LLM 回复中提取策略变更意图
 *
 * LLM 通过 HTML 注释标记 `<!-- policy:{...} -->` 输出结构化策略意图，
 * 此模块解析该标记并转换为类型安全的 PolicyIntent。
 *
 * 设计约定：
 * - 标记对用户不可见（HTML 注释）
 * - 一次回复最多一个策略变更
 * - 解析失败返回 no-policy-change + parseError
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyIntentType =
  | "add-gate"
  | "remove-gate"
  | "modify-gate"
  | "add-stage"
  | "remove-stage"
  | "modify-skill-plan"
  | "no-policy-change";

export type GateDelta = {
  stage: string;
  requiredArtifacts: string[];
  requireHumanConfirmation: boolean;
};

export type SkillsPlanDelta = Array<{
  stage: string;
  skills: string[];
}>;

export type PolicyDelta = {
  action: string;
  gate?: GateDelta;
  stage?: string;
  insertAfter?: string;
  skillsPlan?: SkillsPlanDelta;
};

export type PolicyIntent = {
  type: PolicyIntentType;
  delta: PolicyDelta | null;
  evidence: string[];
  parseError?: string;
};

// ---------------------------------------------------------------------------
// Marker extraction
// ---------------------------------------------------------------------------

const POLICY_MARKER_RE = /<!--\s*policy:([\s\S]*?)-->/;

function extractPolicyMarker(reply: string): string | null {
  const match = reply.match(POLICY_MARKER_RE);
  return match ? match[1].trim() : null;
}

function extractEvidence(reply: string): string[] {
  const cleaned = reply.replace(POLICY_MARKER_RE, "").trim();
  if (!cleaned) return [];
  // 取回复正文的第一句作为证据摘要
  const firstSentence = cleaned.split(/[。！？\n]/)[0]?.trim();
  return firstSentence ? [firstSentence] : [];
}

// ---------------------------------------------------------------------------
// Action → IntentType mapping
// ---------------------------------------------------------------------------

const ACTION_MAP: Record<string, PolicyIntentType> = {
  "add-gate": "add-gate",
  "remove-gate": "remove-gate",
  "modify-gate": "modify-gate",
  "add-stage": "add-stage",
  "remove-stage": "remove-stage",
  "modify-skill-plan": "modify-skill-plan",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 从 LLM 回复中解析策略变更意图。
 *
 * @param reply - LLM 原始回复文本
 * @param _history - 对话历史（预留，当前未使用）
 * @returns PolicyIntent
 */
export function parsePolicyIntentFromReply(
  reply: string,
  _history: Array<{ role: string; content: string }>
): PolicyIntent {
  const noChange: PolicyIntent = {
    type: "no-policy-change",
    delta: null,
    evidence: [],
  };

  if (!reply || !reply.trim()) {
    return noChange;
  }

  const markerJson = extractPolicyMarker(reply);
  if (!markerJson) {
    return noChange;
  }

  let parsed: PolicyDelta;
  try {
    parsed = JSON.parse(markerJson);
  } catch {
    return {
      type: "no-policy-change",
      delta: null,
      evidence: extractEvidence(reply),
      parseError: `Invalid JSON in policy marker: ${markerJson.slice(0, 100)}`,
    };
  }

  const intentType = ACTION_MAP[parsed.action];
  if (!intentType) {
    return {
      type: "no-policy-change",
      delta: null,
      evidence: extractEvidence(reply),
      parseError: `Unknown policy action: ${parsed.action}`,
    };
  }

  return {
    type: intentType,
    delta: parsed,
    evidence: extractEvidence(reply),
  };
}
