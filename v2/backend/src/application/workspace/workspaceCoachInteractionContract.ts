import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenclawSkillsPackContext } from "./workspaceOpenclawSkillsBridge";
// buildOpenclawSkillsPackContext now delegates to SkillRegistry internally

type RawCoachInteractionContract = {
  version?: unknown;
  principles?: unknown;
  softFlow?: {
    firstIteration?: unknown;
    subsequentIteration?: unknown;
  };
  autonomyHints?: unknown;
  fileDrivenFlowAdjustment?: {
    enabled?: unknown;
    expectations?: unknown;
    skillDecisionCriteria?: unknown;
  };
  hardConstraints?: unknown;
  expectedArtifacts?: unknown;
};

export type CoachInteractionContract = {
  version: string;
  principles: string[];
  softFlow: {
    firstIteration: string[];
    subsequentIteration: string[];
  };
  autonomyHints: string[];
  fileDrivenFlowAdjustment: {
    enabled: boolean;
    expectations: string[];
    skillDecisionCriteria: string[];
  };
  hardConstraints: string[];
  expectedArtifacts: string[];
};

const fallbackContract: CoachInteractionContract = {
  version: "fallback-1.0.0",
  principles: [
    "Platform provides infrastructure; OpenClaw decides interaction progression.",
    "Prefer natural-language negotiation over fixed questionnaires."
  ],
  softFlow: {
    firstIteration: ["align-goal-and-scope", "clarify-unknowns", "lock-boundary", "plan-and-deliver", "qa-and-release", "archive"],
    subsequentIteration: ["inheritance-diff-confirmation", "delta-boundary-lock", "incremental-delivery-and-qa", "release-and-rollover"]
  },
  autonomyHints: [
    "Adapt interaction sequence by risk and dependency signals.",
    "Use concise options when user intent is ambiguous."
  ],
  fileDrivenFlowAdjustment: {
    enabled: true,
    expectations: [
      "extract process intent from latest submitted file context",
      "propose concrete flow delta instead of generic advice",
      "decide whether to recommend creating a new skill for reusability"
    ],
    skillDecisionCriteria: [
      "cross-iteration reusability is needed",
      "flow logic has stable repeated pattern",
      "manual repetition cost is high"
    ]
  },
  hardConstraints: [
    "state-transition-must-follow-state-machine",
    "critical-confirmations-require-human-decision",
    "release-cannot-bypass-quality-gate",
    "all-key-decisions-must-be-traceable"
  ],
  expectedArtifacts: ["analysis-report", "boundary-confirmation", "test-matrix", "release-review", "delivery-package"]
};

function toStringList(value: unknown, max: number) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

export function loadCoachInteractionContract(): CoachInteractionContract {
  const contractPath = resolve(process.cwd(), "agents", "workflows", "dynamic", "iteration-coach.contract.json");
  if (!existsSync(contractPath)) {
    return fallbackContract;
  }
  try {
    const raw = JSON.parse(readFileSync(contractPath, "utf-8")) as RawCoachInteractionContract;
    return {
      version: typeof raw.version === "string" && raw.version.trim() ? raw.version.trim() : fallbackContract.version,
      principles: toStringList(raw.principles, 12).length > 0 ? toStringList(raw.principles, 12) : fallbackContract.principles,
      softFlow: {
        firstIteration:
          toStringList(raw.softFlow?.firstIteration, 16).length > 0
            ? toStringList(raw.softFlow?.firstIteration, 16)
            : fallbackContract.softFlow.firstIteration,
        subsequentIteration:
          toStringList(raw.softFlow?.subsequentIteration, 16).length > 0
            ? toStringList(raw.softFlow?.subsequentIteration, 16)
            : fallbackContract.softFlow.subsequentIteration
      },
      autonomyHints: toStringList(raw.autonomyHints, 12).length > 0 ? toStringList(raw.autonomyHints, 12) : fallbackContract.autonomyHints,
      fileDrivenFlowAdjustment: {
        enabled:
          typeof raw.fileDrivenFlowAdjustment?.enabled === "boolean"
            ? raw.fileDrivenFlowAdjustment.enabled
            : fallbackContract.fileDrivenFlowAdjustment.enabled,
        expectations:
          toStringList(raw.fileDrivenFlowAdjustment?.expectations, 12).length > 0
            ? toStringList(raw.fileDrivenFlowAdjustment?.expectations, 12)
            : fallbackContract.fileDrivenFlowAdjustment.expectations,
        skillDecisionCriteria:
          toStringList(raw.fileDrivenFlowAdjustment?.skillDecisionCriteria, 12).length > 0
            ? toStringList(raw.fileDrivenFlowAdjustment?.skillDecisionCriteria, 12)
            : fallbackContract.fileDrivenFlowAdjustment.skillDecisionCriteria
      },
      hardConstraints: toStringList(raw.hardConstraints, 12).length > 0 ? toStringList(raw.hardConstraints, 12) : fallbackContract.hardConstraints,
      expectedArtifacts:
        toStringList(raw.expectedArtifacts, 12).length > 0 ? toStringList(raw.expectedArtifacts, 12) : fallbackContract.expectedArtifacts
    };
  } catch {
    return fallbackContract;
  }
}

export function buildCoachContractContext(isFirstIteration: boolean) {
  const contract = loadCoachInteractionContract();
  const flow = isFirstIteration ? contract.softFlow.firstIteration : contract.softFlow.subsequentIteration;
  return [
    `contract.version=${contract.version}`,
    `contract.principles=${contract.principles.join(" | ") || "-"}`,
    `contract.softFlow=${flow.join(" -> ") || "-"}`,
    `contract.autonomyHints=${contract.autonomyHints.join(" | ") || "-"}`,
    `contract.fileDrivenFlow.enabled=${contract.fileDrivenFlowAdjustment.enabled ? "yes" : "no"}`,
    `contract.fileDrivenFlow.expectations=${contract.fileDrivenFlowAdjustment.expectations.join(" | ") || "-"}`,
    `contract.fileDrivenFlow.skillDecisionCriteria=${contract.fileDrivenFlowAdjustment.skillDecisionCriteria.join(" | ") || "-"}`,
    `contract.hardConstraints=${contract.hardConstraints.join(" | ") || "-"}`,
    `contract.expectedArtifacts=${contract.expectedArtifacts.join(" | ") || "-"}`,
    buildOpenclawSkillsPackContext()
  ].join("\n");
}
