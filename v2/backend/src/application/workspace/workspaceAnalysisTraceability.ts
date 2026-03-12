import type { AttachmentAnalysisReport, IterationAgentOutput } from "../../domain/workspace/types";
import { listParsedRoleOutputs, pickStringList } from "./workspaceAnalysisExtractors";

function tokenizeRequirement(value: string) {
  const normalized = value.toLowerCase();
  const tokens = normalized
    .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8);
  return Array.from(new Set(tokens));
}

function scorePathAgainstRequirement(requirement: string, path: string) {
  const lowerPath = path.toLowerCase();
  const tokens = tokenizeRequirement(requirement);
  if (tokens.length === 0) {
    return 0;
  }
  return tokens.reduce((total, token) => (lowerPath.includes(token) ? total + 1 : total), 0);
}

function inferMappedPages(codePaths: string[]) {
  return codePaths.filter((item) => /(page|view|screen|ui|component)/i.test(item)).slice(0, 6);
}

function inferMappedApis(codePaths: string[]) {
  return codePaths.filter((item) => /(route|controller|api|interfaces\/http)/i.test(item)).slice(0, 6);
}

function inferMappedEntities(codePaths: string[], excerpt: string) {
  const entitiesFromPath = codePaths
    .filter((item) => /(entity|model|domain)/i.test(item))
    .map((item) => item.split("/").pop() || item)
    .map((item) => item.replace(/\.[a-z0-9]+$/i, ""))
    .filter(Boolean)
    .slice(0, 6);
  const excerptEntities = excerpt
    .split(/[，。；、\n:：/ ]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 24 && /(用户|订单|商品|账户|项目|任务|权限|配置|支付|库存)/.test(item))
    .slice(0, 6);
  return Array.from(new Set([...entitiesFromPath, ...excerptEntities])).slice(0, 8);
}

export function buildTraceabilityMap(params: {
  requirements: string[];
  components: string[];
  codePaths: string[];
  prioritizedFindings: Array<{ priority: "P0" | "P1" | "P2"; content: string; reason: string }>;
}) {
  const requirements = params.requirements.slice(0, 8);
  const components = params.components.slice(0, 8);
  const codePaths = params.codePaths.slice(0, 12);
  const requirementToComponent =
    requirements.length > 0
      ? requirements.map((requirement) => ({
          requirement,
          components: components
            .map((component) => ({ component, score: scorePathAgainstRequirement(requirement, component) }))
            .sort((a, b) => b.score - a.score)
            .map((item) => item.component)
            .slice(0, 4),
          evidence: "来源：需求范围与边界组件集合"
        }))
      : [];
  const componentToCode =
    components.length > 0
      ? components.map((component) => ({
          component,
          codePaths: codePaths.slice(0, 4),
          evidence: "来源：边界 codePaths 与交付计划路径"
        }))
      : [];
  const requirementToCode =
    requirements.length > 0
      ? requirements.map((requirement) => ({
          requirement,
          codePaths: codePaths
            .map((path) => ({ path, score: scorePathAgainstRequirement(requirement, path) }))
            .sort((a, b) => b.score - a.score)
            .map((item) => item.path)
            .slice(0, 4),
          evidence: "来源：需求边界与代码路径白名单"
        }))
      : [];
  const unmappedRequirements = requirementToCode
    .filter((item) => item.codePaths.length === 0)
    .map((item) => item.requirement)
    .slice(0, 8);
  const conflicts: string[] = [];
  for (const item of requirementToCode) {
    if (item.codePaths.length > 0 && components.length === 0) {
      conflicts.push(`需求「${item.requirement}」映射到代码，但缺少组件映射。`);
    }
  }
  const mapConfidence: "high" | "medium" | "low" =
    unmappedRequirements.length === 0 && conflicts.length === 0
      ? "high"
      : unmappedRequirements.length <= Math.ceil(Math.max(1, requirements.length * 0.3))
        ? "medium"
        : "low";
  const mappingSlots = requirements.length * 3;
  const mappedSlots = requirementToComponent.length + requirementToCode.length + componentToCode.length;
  const coverageScore = mappingSlots === 0 ? 0 : Math.min(100, Math.round((mappedSlots / mappingSlots) * 100));
  const gaps: string[] = [];
  if (requirements.length === 0) gaps.push("缺少 requirementRefs，无法形成需求侧映射。");
  if (components.length === 0) gaps.push("缺少 componentRefs，无法形成组件侧映射。");
  if (codePaths.length === 0) gaps.push("缺少 codePaths，无法形成代码路径映射。");
  if (params.prioritizedFindings.some((item) => item.priority === "P0") && codePaths.length === 0) {
    gaps.push("存在 P0 发现但缺少路径白名单，发布风险不可控。");
  }
  return {
    requirementToComponent,
    componentToCode,
    requirementToCode,
    coverageScore,
    mappingConfidence: mapConfidence,
    unmappedRequirements,
    conflicts: Array.from(new Set(conflicts)).slice(0, 8),
    gaps: Array.from(new Set(gaps)).slice(0, 8)
  };
}

function inferDiffRisk(item: string) {
  const text = item.toLowerCase();
  if (/(auth|payment|权限|鉴权|风控|库存|结算|生产|回滚)/.test(text)) return "high" as const;
  if (/(api|接口|schema|model|路由|controller|service)/.test(text)) return "medium" as const;
  return "low" as const;
}

export function buildVersionDiffDetailed(params: {
  added: string[];
  changed: string[];
  removed: string[];
  diffLocations: AttachmentAnalysisReport["diffLocations"];
}) {
  const toItems = (items: string[], fallbackDimension: string) =>
    items.slice(0, 12).map((item) => ({
      dimension: params.diffLocations.find((entry) => entry.currentItem === item || entry.baselineItem === item)?.dimension || fallbackDimension,
      item,
      impact: inferDiffRisk(item) === "high" ? "涉及核心链路或高风险能力，需增加回归与发布门禁。" : "影响受控，按边界与验收清单推进。",
      risk: inferDiffRisk(item)
    }));
  const impactScope = Array.from(new Set(params.diffLocations.map((item) => item.dimension).filter(Boolean))).map((item) => String(item));
  const allRiskItems = [...params.added, ...params.changed, ...params.removed];
  const highRiskPoints = allRiskItems.filter((item) => inferDiffRisk(item) === "high");
  return {
    summary: `新增${params.added.length}项，变化${params.changed.length}项，移除${params.removed.length}项。`,
    impactScope,
    riskPoints: highRiskPoints.slice(0, 8),
    added: toItems(params.added, "inScope"),
    changed: toItems(params.changed, "inScope"),
    removed: toItems(params.removed, "inScope")
  };
}

export function buildDomainKnowledge(params: {
  requirements: string[];
  codePaths: string[];
  excerpt: string;
  agentOutputs: IterationAgentOutput[];
  projectCategory: string;
}) {
  const requirementTerms = params.requirements.map((item) => item.trim()).filter(Boolean).slice(0, 8);
  const parsedRequirements = listParsedRoleOutputs(params.agentOutputs, "requirements-analyst")[0] ?? null;
  const parsedUnknowns = pickStringList(parsedRequirements?.unknowns, 8);
  const parsedRules = pickStringList((parsedRequirements?.assumptions ?? []) as unknown, 8);
  const termCandidates =
    requirementTerms.length > 0
      ? requirementTerms
      : params.excerpt
          .split(/[，。；、\n:：]/)
          .map((item) => item.trim())
          .filter((item) => item.length >= 2 && item.length <= 28)
          .slice(0, 8);
  const terms = termCandidates.map((term) => ({
    term,
    definition: `与${params.projectCategory || "业务"}相关的需求术语，需在实现与验收中保持一致语义。`,
    mappedTo: {
      pages: inferMappedPages(params.codePaths),
      apis: inferMappedApis(params.codePaths),
      entities: inferMappedEntities(params.codePaths, params.excerpt),
      codePaths: params.codePaths.slice(0, 3)
    },
    evidence: "来源：需求条目 / 附件摘要",
    bindingStrength:
      params.codePaths.length >= 3 ? ("high" as const) : params.codePaths.length >= 1 ? ("medium" as const) : ("low" as const)
  }));
  return {
    terms,
    rules: parsedRules.length > 0 ? parsedRules : ["高风险需求必须有可验证验收项与回归点。"],
    unknowns: parsedUnknowns
  };
}
