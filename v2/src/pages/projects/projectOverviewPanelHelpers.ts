import type { ModelRelationPayload } from "../../domain/workspace/types";

export const MOCK_MODEL_RELATIONS: ModelRelationPayload[] = [
  {
    id: "mock-r-1",
    fromEntityId: "entity_负责人",
    toEntityId: "entity_线索",
    type: "one_to_many",
    name: "负责推进",
    businessDescription: "一位负责人可以同时负责多条线索，但每条线索在同一时刻只有一个主负责人。",
    ontologyBasis: "负责人 -> 线索",
    dataBasis: ["sales_owner.owner_id", "lead.owner_id"]
  },
  {
    id: "mock-r-2",
    fromEntityId: "entity_线索",
    toEntityId: "entity_跟进记录",
    type: "one_to_many",
    name: "沉淀跟进",
    businessDescription: "一条线索会持续积累多条跟进记录，形成完整的沟通历史。",
    ontologyBasis: "线索 -> 跟进记录",
    dataBasis: ["lead.lead_id", "followup_record.lead_id"]
  },
  {
    id: "mock-r-3",
    fromEntityId: "entity_线索阶段",
    toEntityId: "entity_线索",
    type: "one_to_many",
    name: "阶段归属",
    businessDescription: "线索总是处于某个明确阶段，阶段变化会影响列表排序和后续动作提示。",
    ontologyBasis: "线索阶段 -> 线索",
    dataBasis: ["lead_stage.stage_code", "lead.stage"]
  },
  {
    id: "mock-r-4",
    fromEntityId: "entity_线索导出任务",
    toEntityId: "entity_线索",
    type: "many_to_many",
    name: "批量带出",
    businessDescription: "一次导出任务会命中一批线索，同一条线索也可能被多次导出。",
    ontologyBasis: "线索导出任务 <-> 线索",
    dataBasis: ["export_job.job_id", "export_job_lead.lead_id"]
  },
  {
    id: "mock-r-5",
    fromEntityId: "entity_线索导出任务",
    toEntityId: "entity_导出结果包",
    type: "one_to_one",
    name: "生成结果包",
    businessDescription: "每次导出任务最终产出一个可下载结果包，便于业务离线流转。",
    ontologyBasis: "线索导出任务 -> 导出结果包",
    dataBasis: ["export_job.job_id", "export_file.job_id"]
  },
  {
    id: "mock-r-6",
    fromEntityId: "entity_线索",
    toEntityId: "entity_客户公司",
    type: "many_to_many",
    name: "关联客户",
    businessDescription: "同一客户公司可以对应多条线索，线索也可能在不同接触阶段指向同一客户主体。",
    ontologyBasis: "线索 <-> 客户公司",
    dataBasis: ["lead_company.lead_id", "lead_company.company_id"]
  },
  {
    id: "mock-r-7",
    fromEntityId: "entity_跟进记录",
    toEntityId: "entity_提醒对象",
    type: "one_to_many",
    name: "提醒候选",
    businessDescription: "跟进记录理论上可以挂接提醒对象，但当前演示版本中该能力已延期，不进入上线范围。",
    ontologyBasis: "跟进记录 -> 提醒对象",
    dataBasis: ["followup_record.record_id", "mention_target.record_id"]
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
