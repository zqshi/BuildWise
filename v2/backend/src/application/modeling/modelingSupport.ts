import type { ModelStore, TraceItem } from "../../domain/modeling/types";
import type { WorkspaceStore } from "../../domain/workspace/types";
export { nowIso } from "../../shared/utils";

export function normalizeMethod(method?: string) {
  return (method || "GET").toUpperCase();
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

const roadmapGoals = new Map<number, string>([
  [1, "实体/字段/规则/页面最小结构可创建与展示"],
  [2, "Figma/草图/文本输入占位与确认流程"],
  [3, "自然语言规则转结构化规则"],
  [4, "变更检测与同步报告可视化"],
  [5, "模型节点 ↔ 代码片段双向追溯"],
  [6, "一对多/多对多关系建模"],
  [7, "状态流转与工作流编排"],
  [8, "角色、权限、审计日志"],
  [9, "项目共享、版本快照、回滚"],
  [10, "模板市场、智能体执行框架"],
  [11, "开放 API 与集成中心"],
  [12, "部署管理与可观测性"]
]);

export function parseRoadmapPath(path: string) {
  const match = /^\/api\/roadmap-v(\d)-(\d)$/.exec(path);
  if (!match) {
    return null;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) {
    return null;
  }
  const index = major === 0 ? minor : major === 1 ? 10 + minor : null;
  if (index === null || index < 1 || index > 12) {
    return null;
  }
  return { major, minor, index };
}

export function stageOfVersion(index: number) {
  if (index <= 4) {
    return "S1";
  }
  if (index <= 6) {
    return "S2";
  }
  if (index <= 9) {
    return "S3";
  }
  return "S4";
}

export function resolveRoadmapGoal(index: number) {
  return roadmapGoals.get(index) || "待补充目标定义";
}

export function calculateCoverageScores(input: {
  compileRuleCount: number;
  compileValidRules: number;
  iterationCount: number;
  entityCount: number;
  apiCount: number;
  pageCount: number;
  projectCount: number;
}) {
  const ruleQuality =
    input.compileRuleCount === 0 ? 0.6 : clamp(input.compileValidRules / Math.max(1, input.compileRuleCount));
  const entityIterationFit = clamp(input.iterationCount / Math.max(1, input.entityCount));
  const apiPageFit = clamp(input.apiCount / Math.max(1, input.pageCount * 2));
  const workspaceActivity = clamp((input.projectCount * 0.4 + input.iterationCount * 0.6) / Math.max(1, input.projectCount * 2));
  const coverageScore = Number(
    (
      (entityIterationFit * 0.3 +
        ruleQuality * 0.25 +
        apiPageFit * 0.25 +
        workspaceActivity * 0.2) *
      100
    ).toFixed(1)
  );
  return { ruleQuality, coverageScore };
}

export function buildProjectTraceItems(workspace: WorkspaceStore, projectId: number): TraceItem[] {
  return workspace.iterations
    .filter((item) => item.projectId === projectId)
    .map((item) => {
      const branch = item.codeLink?.branch || "";
      const commit = item.codeLink?.commit || "";
      const pathRef = Array.isArray(item.codeLink?.paths) && item.codeLink?.paths.length > 0 ? item.codeLink?.paths[0] : "";
      const codeRef = commit || branch || pathRef || "unlinked";
      return {
        pageRoute: `/projects/${projectId}/iterations/${item.id}`,
        apiPath: `/api/projects/${projectId}/iterations/${item.id}`,
        relation: "iteration-links-code",
        modelRef: `iteration:${item.id}`,
        codeRef,
        intent: `迭代 ${item.name} 关联代码锚点 ${codeRef}`
      };
    });
}

export function buildGlobalTraceItems(model: ModelStore): TraceItem[] {
  return model.pages.flatMap((page) =>
    model.apis
      .filter((api) => typeof api.path === "string" && api.path)
      .slice(0, 3)
      .map((api) => ({
        pageRoute: page.route,
        apiPath: api.path as string,
        relation: "page-consumes-api",
        modelRef: `page:${page.id}`,
        codeRef: `backend/interfaces/http/routes#${(api.path as string).split("/").join("_")}`,
        intent: `页面 ${page.name} 使用接口 ${api.path as string}`
      }))
  );
}
