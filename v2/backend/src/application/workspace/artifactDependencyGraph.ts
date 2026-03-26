/**
 * Artifact upstream dependency graph and excerpt extraction.
 *
 * Each artifact declares which previously-committed artifacts it depends on.
 * When generating a new artifact (via Coach or setup script), the upstream
 * artifacts' content is excerpted and injected into the prompt so the LLM
 * can produce coherent, chain-linked deliverables.
 */

const ARTIFACT_UPSTREAM_DEPS: Record<string, string[]> = {
  "analysis-report": [],
  "product-requirements-doc": ["analysis-report"],
  "boundary-confirmation": ["analysis-report", "product-requirements-doc"],
  "prototype-preview": ["product-requirements-doc", "boundary-confirmation"],
  "design-spec": ["product-requirements-doc", "boundary-confirmation", "prototype-preview"],
  "technical-architecture": ["product-requirements-doc", "boundary-confirmation", "design-spec"],
  "api-specification": ["technical-architecture", "product-requirements-doc"],
  "database-design": ["technical-architecture", "api-specification"],
  "frontend-code": ["technical-architecture", "design-spec", "prototype-preview", "api-specification"],
  "backend-code": ["technical-architecture", "api-specification", "database-design"],
  "test-matrix": ["product-requirements-doc", "api-specification", "frontend-code", "backend-code"],
  "acceptance-checklist": ["product-requirements-doc", "test-matrix"],
  "release-review": ["acceptance-checklist", "test-matrix", "frontend-code", "backend-code"],
  "deployment-plan": ["technical-architecture", "frontend-code", "backend-code", "release-review"],
  "delivery-package": ["release-review", "deployment-plan", "acceptance-checklist"]
};

const ARTIFACT_CONTEXT_CHAR_BUDGET = 8000;
const PER_DEP_MIN = 800;
const PER_DEP_MAX = 4000;
const SUMMARY_ONLY_THRESHOLD = 6;

export type ArtifactExcerpt = {
  artifactId: string;
  title: string;
  excerpt: string;
};

type WorkflowItemLike = {
  id: string;
  title: string;
  summary: string;
  outputVersion: number;
  draft: { content: string };
};

function extractHeadingsAndLeadContent(content: string, charLimit: number): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let charCount = 0;

  for (const line of lines) {
    if (charCount >= charLimit) break;
    const isHeading = /^#{1,4}\s/.test(line);
    if (isHeading || charCount < charLimit) {
      result.push(line);
      charCount += line.length + 1;
    }
  }

  const joined = result.join("\n").slice(0, charLimit);
  return joined;
}

export function buildUpstreamExcerpts(
  targetArtifactId: string,
  items: WorkflowItemLike[]
): ArtifactExcerpt[] {
  const deps = ARTIFACT_UPSTREAM_DEPS[targetArtifactId];
  if (!deps || deps.length === 0) return [];

  const committed = items.filter(
    (item) => deps.includes(item.id) && item.outputVersion > 0
  );
  if (committed.length === 0) return [];

  const useSummaryOnly = committed.length >= SUMMARY_ONLY_THRESHOLD;

  if (useSummaryOnly) {
    return committed.map((item) => ({
      artifactId: item.id,
      title: item.title,
      excerpt: (item.summary || item.draft.content.slice(0, 220)).trim()
    }));
  }

  const perDepBudget = Math.min(
    PER_DEP_MAX,
    Math.max(PER_DEP_MIN, Math.floor(ARTIFACT_CONTEXT_CHAR_BUDGET / committed.length))
  );

  return committed.map((item) => {
    const content = item.draft.content || item.summary || "";
    const excerpt = content.length <= perDepBudget
      ? content.trim()
      : extractHeadingsAndLeadContent(content, perDepBudget);
    return {
      artifactId: item.id,
      title: item.title,
      excerpt: excerpt || item.summary || ""
    };
  });
}

export function formatUpstreamContext(excerpts: ArtifactExcerpt[]): string {
  if (excerpts.length === 0) return "";

  const sections = excerpts.map(
    (e) => `### 上游交付物：${e.title}\n${e.excerpt}`
  );

  return [
    "以下是已确认的上游交付物内容摘要，请基于这些内容确保本交付物与上游保持一致、层层递进：",
    "",
    ...sections
  ].join("\n");
}
