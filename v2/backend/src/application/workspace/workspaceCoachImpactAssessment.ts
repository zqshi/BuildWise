import type { Iteration } from "../../domain/workspace/types";

const REQUIREMENT_CHANGE_SIGNAL = /(新增|修改|调整|变更|增加|删除|移除|补充|优化|引入|支持|改成|替换)/;
const REQUIREMENT_OBJECT_SIGNAL = /(需求|功能|规则|页面|组件|接口|流程|逻辑|交互|原型|版本|v\d)/i;
const IMPACT_ASSESSMENT_SIGNAL = /(影响评估|影响范围|受影响|边界风险|代码边界|组件映射|需求映射|待确认点)/;

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

export function isRequirementChangeMessage(message: string) {
  const text = message.trim();
  if (!text) {
    return false;
  }
  return REQUIREMENT_CHANGE_SIGNAL.test(text) && REQUIREMENT_OBJECT_SIGNAL.test(text);
}

export function hasImpactAssessmentReply(reply: string) {
  return IMPACT_ASSESSMENT_SIGNAL.test(reply.replace(/\s+/g, " ").trim());
}

export function buildImpactAssessmentFallbackReply(iteration: Iteration) {
  const control = iteration.changeControl;
  const artifactTitles = uniqueStrings(
    (control?.mappingAuditTrail || [])
      .flatMap((item) => item.impactedArtifacts)
      .map((artifactId) => control?.artifactWorkflow?.items.find((item) => item.id === artifactId)?.title || artifactId)
  );
  const requirementRefs = uniqueStrings((control?.mappingAuditTrail || []).flatMap((item) => item.requirementRefs || []));
  const componentRefs = uniqueStrings((control?.mappingAuditTrail || []).flatMap((item) => item.componentRefs || []));
  const codePaths = uniqueStrings((control?.mappingAuditTrail || []).flatMap((item) => item.codePaths || []));
  const boundary = control?.boundary;
  const pendingClarifications = uniqueStrings([
    ...(control?.knowledgeConflicts || []),
    ...(control?.clarificationQuestions || [])
  ]).slice(0, 4);
  const impactedPages = uniqueStrings(
    (control?.domainKnowledgeEntries || []).flatMap((item) => item.mappedPages || [])
  );

  const sections = [
    `影响评估：当前变更涉及功能点 ${control?.normalizedFunctionalPoints?.join("、") || "待进一步识别"}。`,
    artifactTitles.length > 0 ? `受影响交付物：${artifactTitles.join("、")}。` : "",
    impactedPages.length > 0 ? `受影响页面：${impactedPages.join("、")}。` : "",
    requirementRefs.length > 0 ? `需求映射：${requirementRefs.join("、")}。` : "",
    componentRefs.length > 0 ? `组件映射：${componentRefs.join("、")}。` : "",
    codePaths.length > 0 ? `代码边界：${codePaths.join("、")}。` : "",
    boundary?.componentRefs?.length ? `当前边界组件：${boundary.componentRefs.join("、")}。` : "",
    boundary?.codePaths?.length ? `当前边界代码路径：${boundary.codePaths.join("、")}。` : "",
    pendingClarifications.length > 0 ? `待确认点：${pendingClarifications.join("；")}。` : "待确认点：请确认以上影响范围是否接受，是否存在需要排除的页面、组件或规则。"
  ].filter(Boolean);

  return sections.join("\n");
}
