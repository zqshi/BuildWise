import type {
  BusinessEntity,
  BusinessRule,
  IterationModelingInput,
  ModelSnapshot,
  OntologyTerm,
  ReviewTask
} from "../../domain/continuousModeling/types";
export { nowIso } from "../../shared/utils";

function uniq(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

export function normalizeOntologyTerms(terms: OntologyTerm[]) {
  const byCanonical = new Map<string, OntologyTerm>();
  for (const term of terms) {
    const key = term.canonicalTerm.trim();
    if (!key) {
      continue;
    }
    const current = byCanonical.get(key);
    if (!current) {
      byCanonical.set(key, {
        canonicalTerm: key,
        aliases: uniq(term.aliases),
        technicalAliases: uniq(term.technicalAliases),
        definition: term.definition.trim(),
        evidence: uniq(term.evidence)
      });
      continue;
    }
    byCanonical.set(key, {
      canonicalTerm: key,
      aliases: uniq([...current.aliases, ...term.aliases]),
      technicalAliases: uniq([...current.technicalAliases, ...term.technicalAliases]),
      definition: current.definition || term.definition.trim(),
      evidence: uniq([...current.evidence, ...term.evidence])
    });
  }
  return Array.from(byCanonical.values()).sort((left, right) => left.canonicalTerm.localeCompare(right.canonicalTerm));
}

export function detectChangedEntityNames(current: BusinessEntity[], baseline: ModelSnapshot | null) {
  const baselineNames = new Set((baseline?.entities || []).map((item) => item.name));
  return uniq(current.map((item) => item.name).filter((name) => !baselineNames.has(name)));
}

export function detectChangedRuleNames(current: BusinessRule[], baseline: ModelSnapshot | null) {
  const baselineNames = new Set((baseline?.rules || []).map((item) => item.name));
  return uniq(current.map((item) => item.name).filter((name) => !baselineNames.has(name)));
}

export function detectChangedTerms(current: OntologyTerm[], baseline: ModelSnapshot | null) {
  const baselineTerms = new Set((baseline?.ontologyTerms || []).map((item) => item.canonicalTerm));
  return uniq(current.map((item) => item.canonicalTerm).filter((name) => !baselineTerms.has(name)));
}

export function buildReviewTasks(input: IterationModelingInput, changedTerms: string[]): ReviewTask[] {
  const tasks: ReviewTask[] = [];
  for (const term of changedTerms) {
    tasks.push({
      id: `review-term-${input.projectId}-${input.iterationId}-${term}`,
      type: "term_confirmation",
      title: `确认业务术语：${term}`,
      description: `请确认术语「${term}」的业务定义、别名及技术映射是否准确。`,
      blocking: true
    });
  }
  if (input.rules.length === 0) {
    tasks.push({
      id: `review-rule-${input.projectId}-${input.iterationId}`,
      type: "rule_confirmation",
      title: "确认业务规则缺失原因",
      description: "当前候选快照未沉淀业务规则，请确认是否允许以空规则发布。",
      blocking: true
    });
  }
  return tasks;
}

/**
 * 计算候选快照的下一个版本序号（v0.26.0 T1 方案 B）。
 *
 * 候选 id 含版本序号 snapshot-${projectId}-${iterationId}-v${n}-candidate，
 * 使同迭代多次建模生成多版本候选，发布后再次建模不覆盖已发布快照。
 * 旧快照 id 无版本序号视为 v0，新候选从 v1 起，旧 published 不被覆盖（向后兼容）。
 *
 * 仅计同 iterationId 的快照，取已有版本序号最大值 +1；无版本序号的旧快照不增序号。
 */
const VERSIONED_CANDIDATE_ID_PATTERN = /-v(\d+)-candidate$/;

export function nextCandidateVersionNumber(snapshots: ModelSnapshot[], iterationId: number): number {
  let max = 0;
  for (const snapshot of snapshots) {
    if (snapshot.iterationId !== iterationId) {
      continue;
    }
    const match = VERSIONED_CANDIDATE_ID_PATTERN.exec(snapshot.id);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > max) {
        max = n;
      }
    }
  }
  return max + 1;
}
