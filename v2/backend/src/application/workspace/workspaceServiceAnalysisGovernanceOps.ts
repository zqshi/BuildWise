import { parseJsonObjectFromText, pickString, pickStringList } from "./workspaceAnalysisExtractors";

const normalizeRisk = (value: string): "low" | "medium" | "high" => (value === "low" || value === "medium" || value === "high" ? value : "medium");
const normalizeMappingConfidence = (value: string): "high" | "medium" | "low" =>
  value === "high" || value === "medium" || value === "low" ? value : "medium";
const normalizeBindingStrength = (value: string): "high" | "medium" | "low" =>
  value === "high" || value === "medium" || value === "low" ? value : "medium";

const parseDiffItems = (value: unknown, fallbackDimension = "inScope") =>
  Array.isArray(value)
    ? value
        .map((item) => item as Record<string, unknown>)
        .map((item) => ({
          dimension: pickString(item.dimension) || fallbackDimension,
          item: pickString(item.item),
          impact: pickString(item.impact),
          risk: normalizeRisk(pickString(item.risk))
        }))
        .filter((item) => item.item.length > 0)
        .slice(0, 20)
    : [];

export function parseGovernanceInsightsCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const diffRaw = (parsed?.versionDiffDetailed ?? {}) as Record<string, unknown>;
  const traceRaw = (parsed?.traceabilityMap ?? {}) as Record<string, unknown>;
  const constraintsRaw = (parsed?.executableConstraints ?? {}) as Record<string, unknown>;
  const domainRaw = (parsed?.domainKnowledge ?? {}) as Record<string, unknown>;
  return {
    versionDiffDetailed: {
      summary: pickString(diffRaw.summary),
      impactScope: pickStringList(diffRaw.impactScope, 16),
      riskPoints: pickStringList(diffRaw.riskPoints, 16),
      added: parseDiffItems(diffRaw.added),
      changed: parseDiffItems(diffRaw.changed),
      removed: parseDiffItems(diffRaw.removed)
    },
    traceabilityMap: {
      requirementToComponent: Array.isArray(traceRaw.requirementToComponent)
        ? (traceRaw.requirementToComponent as Array<Record<string, unknown>>)
            .map((item) => ({
              requirement: pickString(item.requirement),
              components: pickStringList(item.components, 12),
              evidence: pickString(item.evidence)
            }))
            .filter((item) => item.requirement)
            .slice(0, 16)
        : [],
      componentToCode: Array.isArray(traceRaw.componentToCode)
        ? (traceRaw.componentToCode as Array<Record<string, unknown>>)
            .map((item) => ({
              component: pickString(item.component),
              codePaths: pickStringList(item.codePaths, 12),
              evidence: pickString(item.evidence)
            }))
            .filter((item) => item.component)
            .slice(0, 16)
        : [],
      requirementToCode: Array.isArray(traceRaw.requirementToCode)
        ? (traceRaw.requirementToCode as Array<Record<string, unknown>>)
            .map((item) => ({
              requirement: pickString(item.requirement),
              codePaths: pickStringList(item.codePaths, 12),
              evidence: pickString(item.evidence)
            }))
            .filter((item) => item.requirement)
            .slice(0, 16)
        : [],
      coverageScore: Number.isFinite(Number(traceRaw.coverageScore)) ? Math.max(0, Math.min(100, Math.round(Number(traceRaw.coverageScore)))) : 0,
      mappingConfidence: normalizeMappingConfidence(pickString(traceRaw.mappingConfidence)),
      unmappedRequirements: pickStringList(traceRaw.unmappedRequirements, 16),
      conflicts: pickStringList(traceRaw.conflicts, 16),
      gaps: pickStringList(traceRaw.gaps, 16)
    },
    executableConstraints: {
      componentWhitelist: pickStringList(constraintsRaw.componentWhitelist, 32),
      codePathWhitelist: pickStringList(constraintsRaw.codePathWhitelist, 32),
      acceptanceChecks: pickStringList(constraintsRaw.acceptanceChecks, 32),
      gateRules: pickStringList(constraintsRaw.gateRules, 16)
    },
    domainKnowledge: {
      terms: Array.isArray(domainRaw.terms)
        ? (domainRaw.terms as Array<Record<string, unknown>>)
            .map((item) => {
              const mappedTo = (item.mappedTo ?? {}) as Record<string, unknown>;
              return {
                term: pickString(item.term),
                definition: pickString(item.definition),
                mappedTo: {
                  pages: pickStringList(mappedTo.pages, 12),
                  apis: pickStringList(mappedTo.apis, 12),
                  entities: pickStringList(mappedTo.entities, 12),
                  codePaths: pickStringList(mappedTo.codePaths, 12)
                },
                evidence: pickString(item.evidence),
                bindingStrength: normalizeBindingStrength(pickString(item.bindingStrength))
              };
            })
            .filter((item) => item.term.length > 0)
            .slice(0, 16)
        : [],
      rules: pickStringList(domainRaw.rules, 16),
      unknowns: pickStringList(domainRaw.unknowns, 16)
    }
  };
}

export function listGovernanceInsightsMissingReasons(candidate: ReturnType<typeof parseGovernanceInsightsCandidate>) {
  const reasons: string[] = [];
  if (!candidate.versionDiffDetailed.summary && candidate.versionDiffDetailed.added.length === 0 && candidate.versionDiffDetailed.changed.length === 0) {
    reasons.push("versionDiffDetailed is empty");
  }
  if (candidate.traceabilityMap.requirementToCode.length === 0 && candidate.traceabilityMap.componentToCode.length === 0) {
    reasons.push("traceabilityMap mappings are empty");
  }
  if (candidate.executableConstraints.codePathWhitelist.length === 0 && candidate.executableConstraints.componentWhitelist.length === 0) {
    reasons.push("executableConstraints missing whitelist");
  }
  if (candidate.domainKnowledge.terms.length === 0) {
    reasons.push("domainKnowledge.terms is empty");
  }
  return reasons;
}
