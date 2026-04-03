import type { ProjectModelBusinessSummaryPayload } from "../../domain/workspace/modelOpsTypes";
import type { ProjectModelViewPayload } from "../../domain/workspace/types";

export function toFriendlyName(raw: string) {
  return raw.replace(/^entity_/i, "").replace(/[_-]+/g, " ").trim() || raw;
}

export function toFriendlyRelationType(type: string) {
  if (type === "one_to_many") return "一对多";
  if (type === "many_to_one") return "多对一";
  if (type === "one_to_one") return "一对一";
  if (type === "many_to_many") return "多对多";
  return type;
}

export function inferProviderFromRepoUrl(url: string): "github" | "gitlab" | "gitea" | "bitbucket" | "custom" {
  const normalized = url.toLowerCase();
  if (normalized.includes("github.com")) return "github";
  if (normalized.includes("gitlab")) return "gitlab";
  if (normalized.includes("bitbucket")) return "bitbucket";
  if (normalized.includes("gitea")) return "gitea";
  return "custom";
}

export function guessRepoName(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  const parts = trimmed.split("/");
  const last = parts[parts.length - 1] || "";
  return last.replace(/\.git$/i, "").trim();
}

export function looksLikeGitUrl(url: string) {
  const normalized = url.trim();
  if (!normalized) return false;
  return /^(https?:\/\/|ssh:\/\/|git@)/i.test(normalized);
}

export function computeProjectOverviewHealthScore(input: {
  projectProgress: number;
  modelRuleCount: number;
  modelEntityCount: number;
  modelRelationCount: number;
  modelPageCount: number;
  repoHealth?: {
    remoteConfigured: boolean;
    remoteReachable: boolean;
    remoteSynced: boolean;
  } | null;
  runtimeStatus?: string | null;
}) {
  let score = 0;
  if (input.modelRuleCount > 0) score += 20;
  if (input.modelEntityCount > 0) score += 18;
  if (input.modelPageCount > 0) score += 12;
  if (input.modelRelationCount > 0) score += 15;
  score += Math.round(Math.max(0, Math.min(100, input.projectProgress)) * 0.2);
  if (input.repoHealth?.remoteConfigured) score += 10;
  if (input.repoHealth?.remoteReachable) score += 10;
  if (input.repoHealth?.remoteSynced) score += 10;
  if ((input.runtimeStatus || "").trim() && /(ok|healthy)/i.test(input.runtimeStatus || "")) {
    score += 5;
  }
  return Math.max(0, Math.min(100, score));
}

export function normalizeInlineMarkdownText(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[#>\-+]+\s+/g, "")
    .replace(/\\([\\`*_#[\]()])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildProjectModelBusinessSummaryFromView(input: {
  projectId: number;
  iterationId: number | null;
  view: ProjectModelViewPayload | null;
  generatedAt?: string;
}): ProjectModelBusinessSummaryPayload | null {
  if (!input.view) {
    return null;
  }
  const generatedAt = input.generatedAt || new Date().toISOString();
  const entityNames = input.view.entities.slice(0, 3).map((item) => item.businessName || item.name);
  const blockingTasks = input.view.reviewTasks.filter((item) => item.blocking).map((item) => normalizeInlineMarkdownText(item.title));
  const evidenceItems = input.view.evidence.slice(0, 2).map((item) => normalizeInlineMarkdownText(item));
  const focus = [
    entityNames.length > 0 ? `关键实体：${entityNames.join("、")}` : "",
    input.view.relations.length > 0 ? `关系沉淀：已形成 ${input.view.relations.length} 条实体关系` : "",
    input.view.rules.length > 0 ? `规则沉淀：已形成 ${input.view.rules.length} 条业务规则` : ""
  ].filter(Boolean);
  const risks = blockingTasks.length > 0 ? blockingTasks : input.view.reviewTasks.slice(0, 2).map((item) => normalizeInlineMarkdownText(item.title));
  const model = [
    `已沉淀 ${input.view.entities.length} 个实体`,
    `${input.view.relations.length} 条关系`,
    `${input.view.rules.length} 条规则`,
    evidenceItems.length > 0 ? `依据 ${evidenceItems.join("、")}` : ""
  ]
    .filter(Boolean)
    .join("，");

  return {
    generatedAt,
    source: "derived",
    model,
    projectId: input.projectId,
    iterationId: input.iterationId,
    summary: `${input.view.projectName || "当前项目"} 已形成以${input.view.entities.length} 个实体、${input.view.relations.length} 条关系、${input.view.rules.length} 条规则为核心的建模视图。`,
    focus,
    risks
  };
}
