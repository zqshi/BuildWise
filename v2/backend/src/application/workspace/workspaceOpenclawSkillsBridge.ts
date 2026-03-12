import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { Iteration } from "../../domain/workspace/types";

type SkillChainConfig = {
  sequence?: unknown;
};

type SkillBridgeResult = {
  ok?: boolean;
  mode?: string;
  skill?: string;
  result?: {
    status?: string;
    summary?: string;
    questions?: string[];
    risks?: string[];
    next_actions?: string[];
    evidence?: string[];
  };
};

export type OpenclawSkillChainRun = {
  enabled: boolean;
  mode: "bridge" | "openclaw-native" | "disabled";
  blocked: boolean;
  summaries: string[];
  suggestedActions: string[];
  checklist: string[];
  risks: string[];
  evidence: string[];
  error: string;
};

function loadSkillIds(): string[] {
  const chainPath = resolve(process.cwd(), "skills", "buildwise-openclaw", "skill-chain.json");
  if (!existsSync(chainPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(chainPath, "utf-8")) as SkillChainConfig;
    if (!Array.isArray(parsed.sequence)) {
      return [];
    }
    return parsed.sequence
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

function runBridgeSkill(skill: string, input: Record<string, unknown>): SkillBridgeResult | null {
  const bridgePath = resolve(process.cwd(), "openclaw", "run-skill-bridge.mjs");
  if (!existsSync(bridgePath)) {
    return null;
  }
  try {
    const raw = execFileSync("node", [bridgePath, skill, JSON.stringify(input)], {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024
    });
    const parsed = JSON.parse(raw) as SkillBridgeResult;
    return parsed;
  } catch {
    return null;
  }
}

export function runOpenclawSkillChainForCoach(params: {
  iteration: Iteration;
  previousIterationName: string;
  userMessage: string;
}): OpenclawSkillChainRun {
  const enabled = (process.env.BUILDWISE_OPENCLAW_SKILLS_ENABLED || "1").trim() !== "0";
  if (!enabled) {
    return {
      enabled: false,
      mode: "disabled",
      blocked: false,
      summaries: [],
      suggestedActions: [],
      checklist: [],
      risks: [],
      evidence: [],
      error: ""
    };
  }
  const skillIds = loadSkillIds();
  if (skillIds.length === 0) {
    return {
      enabled: true,
      mode: "bridge",
      blocked: false,
      summaries: [],
      suggestedActions: [],
      checklist: [],
      risks: ["skill chain missing or empty"],
      evidence: [],
      error: "missing_skill_chain"
    };
  }

  const summaries: string[] = [];
  const suggestedActions: string[] = [];
  const checklist: string[] = [];
  const risks: string[] = [];
  const evidence: string[] = [];
  let mode: OpenclawSkillChainRun["mode"] = "bridge";
  let blocked = false;
  let error = "";

  for (const skill of skillIds) {
    const result = runBridgeSkill(skill, {
      iterationId: params.iteration.id,
      iterationName: params.iteration.name,
      status: params.iteration.status,
      previousIterationName: params.previousIterationName,
      message: params.userMessage
    });
    if (!result || result.ok !== true || !result.result) {
      error = `skill_run_failed:${skill}`;
      risks.push(`技能执行失败：${skill}`);
      blocked = true;
      break;
    }
    mode = result.mode === "openclaw-native" ? "openclaw-native" : "bridge";
    const status = String(result.result.status || "").trim().toLowerCase();
    const summary = String(result.result.summary || "").trim();
    if (summary) {
      summaries.push(`${skill}: ${summary}`);
    }
    const skillRisks = Array.isArray(result.result.risks) ? result.result.risks.map((item) => String(item).trim()).filter(Boolean) : [];
    const questions = Array.isArray(result.result.questions)
      ? result.result.questions.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const nextActions = Array.isArray(result.result.next_actions)
      ? result.result.next_actions.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const skillEvidence = Array.isArray(result.result.evidence)
      ? result.result.evidence.map((item) => String(item).trim()).filter(Boolean)
      : [];

    risks.push(...skillRisks);
    checklist.push(...questions);
    suggestedActions.push(...nextActions);
    evidence.push(...skillEvidence.map((item) => `${skill}:${item}`));
    if (status === "blocked" || status === "error") {
      blocked = true;
    }
  }

  return {
    enabled: true,
    mode,
    blocked,
    summaries: Array.from(new Set(summaries)).slice(0, 10),
    suggestedActions: Array.from(new Set(suggestedActions)).slice(0, 8),
    checklist: Array.from(new Set(checklist)).slice(0, 8),
    risks: Array.from(new Set(risks)).slice(0, 8),
    evidence: Array.from(new Set(evidence)).slice(0, 12),
    error
  };
}

