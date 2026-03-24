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

/**
 * Resolve a traceability mapping field from DeepSeek's variable output.
 * DeepSeek may return:
 * - Array of objects: [{requirement:"...", components/mappedComponents:[...]}]
 * - Object map: { "需求A": ["组件1","组件2"] }
 * - Various key names: requirementToComponent, requirementsToComponents, requirements_to_components
 */
function resolveTraceField(parent: Record<string, unknown>, ...candidateKeys: string[]): unknown {
  for (const k of candidateKeys) {
    if (parent[k] !== undefined) return parent[k];
  }
  return undefined;
}

function convertObjectMapToArray(raw: unknown, keyField: string, valueField: string, ...altValueFields: string[]) {
  if (Array.isArray(raw)) {
    // Normalize: rename alternate value fields to the canonical one
    return (raw as Array<Record<string, unknown>>).map((item) => {
      if (item[valueField]) return item;
      for (const alt of altValueFields) {
        if (item[alt]) return { ...item, [valueField]: item[alt] };
      }
      return item;
    });
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>)
      .map(([key, val]) => ({ [keyField]: key, [valueField]: Array.isArray(val) ? val : [val] }))
      .filter((item) => pickString(item[keyField]).length > 0);
  }
  return [];
}

/** Flatten nested whitelist/constraint objects into a flat string array. */
function flattenObjectToStringList(raw: unknown, max = 32): string[] {
  if (Array.isArray(raw)) return pickStringList(raw, max);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  if (raw && typeof raw === "object") {
    const result: string[] = [];
    for (const [, val] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof val === "string" && val.trim()) result.push(val.trim());
      else if (Array.isArray(val)) result.push(...val.filter((v): v is string => typeof v === "string" && v.length > 0));
    }
    return result.slice(0, max);
  }
  return [];
}

/** Extract string values from array of objects (e.g., [{rule:"...",evidence:"..."}] → ["..."]) */
function extractStringsFromObjectArray(raw: unknown, ...fields: string[]): string[] {
  if (!Array.isArray(raw)) return pickStringList(raw, 16);
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        for (const f of fields) {
          const v = (item as Record<string, unknown>)[f];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
      }
      return "";
    })
    .filter((s) => s.length > 0);
}

export function parseGovernanceInsightsCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const diffRaw = (parsed?.versionDiffDetailed ?? {}) as Record<string, unknown>;
  const traceRaw = (parsed?.traceabilityMap ?? {}) as Record<string, unknown>;
  const constraintsRaw = (parsed?.executableConstraints ?? {}) as Record<string, unknown>;
  const domainRaw = (parsed?.domainKnowledge ?? {}) as Record<string, unknown>;

  // traceabilityMap: handle both array format and object-map format from DeepSeek
  const r2cRaw = resolveTraceField(traceRaw,
    "requirementToComponent", "requirementsToComponents", "requirements_to_components",
    "requirement_to_component", "requirementToComponents");
  const r2cArray = convertObjectMapToArray(r2cRaw, "requirement", "components", "mappedComponents", "component");
  const c2cRaw = resolveTraceField(traceRaw,
    "componentToCode", "componentsToCode", "components_to_code", "component_to_code");
  const c2cArray = convertObjectMapToArray(c2cRaw, "component", "codePaths", "mappedCodePaths", "code");
  const r2codeRaw = resolveTraceField(traceRaw,
    "requirementToCode", "requirementsToCode", "requirements_to_code", "requirement_to_code");
  const r2codeArray = convertObjectMapToArray(r2codeRaw, "requirement", "codePaths", "mappedCodePaths", "code");
  // coverageScore: handle both 0-100 int and 0-1 float
  const rawScore = Number(resolveTraceField(traceRaw, "coverageScore", "coverage_score", "overallCoverageScore") ?? 0);
  const coverageScore = rawScore > 0 && rawScore <= 1 ? Math.round(rawScore * 100) : Math.max(0, Math.min(100, Math.round(rawScore)));

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
      requirementToComponent: r2cArray
        .map((item) => ({
          requirement: pickString(item.requirement),
          components: pickStringList(item.components, 12),
          evidence: pickString(item.evidence)
        }))
        .filter((item) => item.requirement)
        .slice(0, 16),
      componentToCode: c2cArray
        .map((item) => ({
          component: pickString(item.component),
          codePaths: pickStringList(item.codePaths, 12),
          evidence: pickString(item.evidence)
        }))
        .filter((item) => item.component)
        .slice(0, 16),
      requirementToCode: r2codeArray
        .map((item) => ({
          requirement: pickString(item.requirement),
          codePaths: pickStringList(item.codePaths, 12),
          evidence: pickString(item.evidence)
        }))
        .filter((item) => item.requirement)
        .slice(0, 16),
      coverageScore,
      mappingConfidence: normalizeMappingConfidence(pickString(resolveTraceField(traceRaw, "mappingConfidence", "mapping_confidence") as string | undefined)),
      unmappedRequirements: pickStringList(traceRaw.unmappedRequirements, 16),
      conflicts: pickStringList(traceRaw.conflicts, 16),
      gaps: pickStringList(traceRaw.gaps, 16)
    },
    executableConstraints: {
      componentWhitelist: flattenObjectToStringList(constraintsRaw.componentWhitelist || constraintsRaw.whitelist, 32),
      codePathWhitelist: flattenObjectToStringList(constraintsRaw.codePathWhitelist, 32),
      acceptanceChecks: flattenObjectToStringList(constraintsRaw.acceptanceChecks, 32),
      gateRules: flattenObjectToStringList(constraintsRaw.gateRules || constraintsRaw.gate_rules, 16)
    },
    domainKnowledge: {
      terms: Array.isArray(domainRaw.terms)
        ? (domainRaw.terms as Array<Record<string, unknown>>)
            .map((item) => {
              const rawMapped = item.mappedTo;
              const mappedTo = (typeof rawMapped === "object" && rawMapped !== null && !Array.isArray(rawMapped))
                ? rawMapped as Record<string, unknown>
                : {};
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
      rules: extractStringsFromObjectArray(domainRaw.rules, "rule", "content", "description"),
      unknowns: extractStringsFromObjectArray(domainRaw.unknowns, "item", "content", "description")
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
