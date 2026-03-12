import type { ModelRelationPayload } from "../../domain/workspace/types";

export const MOCK_MODEL_RELATIONS: ModelRelationPayload[] = [
  {
    id: "mock-r-1",
    fromEntityId: "entity_project",
    toEntityId: "entity_iteration",
    type: "one_to_many",
    name: "包含迭代",
    businessDescription: "项目作为治理容器，按版本拆分多个迭代单元。",
    ontologyBasis: "Project -> Iteration",
    dataBasis: ["project.id", "iteration.project_id"]
  },
  {
    id: "mock-r-2",
    fromEntityId: "entity_iteration",
    toEntityId: "entity_task",
    type: "one_to_many",
    name: "拆解任务",
    businessDescription: "每个迭代在执行层面拆分为可分配的任务集。",
    ontologyBasis: "Iteration -> Task",
    dataBasis: ["iteration.id", "task.iteration_id"]
  },
  {
    id: "mock-r-3",
    fromEntityId: "entity_task",
    toEntityId: "entity_member",
    type: "many_to_many",
    name: "成员协作",
    businessDescription: "任务与成员之间为协作分派关系，支持多人协同。",
    ontologyBasis: "Task <-> Member",
    dataBasis: ["task_member.task_id", "task_member.member_id"]
  },
  {
    id: "mock-r-4",
    fromEntityId: "entity_member",
    toEntityId: "entity_role",
    type: "many_to_many",
    name: "角色授权",
    businessDescription: "成员可被授予多个角色，角色可复用于多个成员。",
    ontologyBasis: "Member <-> Role",
    dataBasis: ["member_role.member_id", "member_role.role_id"]
  },
  {
    id: "mock-r-5",
    fromEntityId: "entity_task",
    toEntityId: "entity_delivery",
    type: "one_to_many",
    name: "产出交付件",
    businessDescription: "任务执行产生交付件，供发布和验收链路复用。",
    ontologyBasis: "Task -> Delivery",
    dataBasis: ["task.id", "delivery.task_id"]
  },
  {
    id: "mock-r-6",
    fromEntityId: "entity_delivery",
    toEntityId: "entity_release",
    type: "one_to_one",
    name: "发布映射",
    businessDescription: "单次交付件映射到唯一发布记录，便于审计追踪。",
    ontologyBasis: "Delivery -> Release",
    dataBasis: ["delivery.id", "release.delivery_id"]
  },
  {
    id: "mock-r-7",
    fromEntityId: "entity_iteration",
    toEntityId: "entity_risk",
    type: "one_to_many",
    name: "识别风险",
    businessDescription: "迭代过程识别出的风险项归属于对应迭代。",
    ontologyBasis: "Iteration -> Risk",
    dataBasis: ["iteration.id", "risk.iteration_id"]
  },
  {
    id: "mock-r-8",
    fromEntityId: "entity_risk",
    toEntityId: "entity_policy",
    type: "one_to_many",
    name: "策略治理",
    businessDescription: "风险会触发治理策略执行与审批动作。",
    ontologyBasis: "Risk -> Policy",
    dataBasis: ["risk.id", "policy.risk_id"]
  },
  {
    id: "mock-r-9",
    fromEntityId: "entity_release",
    toEntityId: "entity_metric",
    type: "one_to_many",
    name: "指标追踪",
    businessDescription: "发布行为输出质量与运行指标用于后验评估。",
    ontologyBasis: "Release -> Metric",
    dataBasis: ["release.id", "metric.release_id"]
  },
  {
    id: "mock-r-10",
    fromEntityId: "entity_metric",
    toEntityId: "entity_dashboard",
    type: "one_to_many",
    name: "看板呈现",
    businessDescription: "指标汇总后投射到看板维度进行可视化监控。",
    ontologyBasis: "Metric -> Dashboard",
    dataBasis: ["metric.id", "dashboard_metric.metric_id"]
  },
  {
    id: "mock-r-11",
    fromEntityId: "entity_dashboard",
    toEntityId: "entity_project",
    type: "many_to_many",
    name: "项目归因",
    businessDescription: "看板支持多项目归因分析与横向对比。",
    ontologyBasis: "Dashboard <-> Project",
    dataBasis: ["dashboard_project.dashboard_id", "dashboard_project.project_id"]
  },
  {
    id: "mock-r-12",
    fromEntityId: "entity_issue",
    toEntityId: "entity_task",
    type: "many_to_many",
    name: "缺陷回流",
    businessDescription: "缺陷项可回流关联多个任务形成修复闭环。",
    ontologyBasis: "Issue <-> Task",
    dataBasis: ["issue_task.issue_id", "issue_task.task_id"]
  }
];

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

export function toBusinessSummaryErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "业务摘要生成失败";
  if (/API error: 404\b/.test(message) || /Route not found/i.test(message)) {
    return "后端尚未升级到支持模型摘要的版本，请重启后端服务";
  }
  return message;
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
