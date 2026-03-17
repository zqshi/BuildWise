import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImpactAssessmentFallbackReply,
  hasImpactAssessmentReply,
  isRequirementChangeMessage
} from "../backend/src/application/workspace/workspaceCoachImpactAssessment.ts";

test("isRequirementChangeMessage detects add-or-change requirement inputs", () => {
  assert.equal(isRequirementChangeMessage("V1.1 需要新增业务规则注入能力，并修改历史记录筛选"), true);
  assert.equal(isRequirementChangeMessage("今天帮我看一下当前进度"), false);
});

test("hasImpactAssessmentReply only matches replies with assessment signals", () => {
  assert.equal(hasImpactAssessmentReply("影响评估：会影响 2 个组件。待确认点：是否接受这条边界。"), true);
  assert.equal(hasImpactAssessmentReply("我会继续推进原型和测试。"), false);
});

test("buildImpactAssessmentFallbackReply summarizes impacted engineering and business boundaries", () => {
  const reply = buildImpactAssessmentFallbackReply({
    changeControl: {
      normalizedFunctionalPoints: ["品牌语气规则注入", "历史记录筛选"],
      mappingAuditTrail: [
        {
          impactedArtifacts: ["analysis-report", "product-requirements-doc"],
          requirementRefs: ["REQ-V1.1-001"],
          componentRefs: ["IdeaPromptForm", "HistoryFilterBar"],
          codePaths: ["apps/web/src/ideas/form", "apps/web/src/ideas/history"],
          functionalPoint: "品牌语气规则注入"
        }
      ],
      artifactWorkflow: {
        items: [
          { id: "analysis-report", title: "继承差异分析报告" },
          { id: "product-requirements-doc", title: "产品需求文档" }
        ]
      },
      domainKnowledgeEntries: [
        { mappedPages: ["创意生成页", "历史记录页"] }
      ],
      boundary: {
        componentRefs: ["IdeaPromptForm"],
        codePaths: ["apps/web/src/ideas/form"]
      },
      knowledgeConflicts: ["禁用词规则不得阻塞主生成路径"],
      clarificationQuestions: ["是否允许在 V1.1 内修改历史筛选交互"]
    }
  } as never);

  assert.match(reply, /影响评估：当前变更涉及功能点 品牌语气规则注入、历史记录筛选。/);
  assert.match(reply, /受影响交付物：继承差异分析报告、产品需求文档。/);
  assert.match(reply, /受影响页面：创意生成页、历史记录页。/);
  assert.match(reply, /组件映射：IdeaPromptForm、HistoryFilterBar。/);
  assert.match(reply, /代码边界：apps\/web\/src\/ideas\/form、apps\/web\/src\/ideas\/history。/);
  assert.match(reply, /待确认点：禁用词规则不得阻塞主生成路径；是否允许在 V1.1 内修改历史筛选交互。/);
});
