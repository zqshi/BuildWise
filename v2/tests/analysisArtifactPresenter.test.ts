import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisArtifactPreview, parseAnalysisArtifactSections } from "../src/pages/projects/analysisArtifactPresenter.ts";

test("parseAnalysisArtifactSections builds titled sections from draft content", () => {
  const sections = parseAnalysisArtifactSections([
    "项目目标：建立客户经理线索协同看板的首版基线。",
    "业务对象：线索、状态、跟进记录。",
    "本轮纳入：线索录入、状态推进、跟进记录。",
    "本轮排除：审批流、移动端、导出。",
    "待确认点：",
    "- 详情展示采用抽屉而非独立页面",
    "- 首版不引入角色差异视图"
  ].join("\n"));

  assert.equal(sections.length, 5);
  assert.equal(sections[0].title, "项目目标");
  assert.match(sections[0].content, /首版基线/);
  assert.equal(sections[4].title, "待确认点");
  assert.deepEqual(sections[4].bullets, ["详情展示采用抽屉而非独立页面", "首版不引入角色差异视图"]);
});

test("parseAnalysisArtifactSections keeps free text in fallback section", () => {
  const sections = parseAnalysisArtifactSections("这是分析结论。\n后续建议先确认边界。");
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, "分析内容");
  assert.match(sections[0].content, /后续建议/);
});

test("buildAnalysisArtifactPreview derives summary and evidence from same draft content", () => {
  const preview = buildAnalysisArtifactPreview([
    "项目目标：建立客户经理线索协同看板的首版基线。",
    "业务对象：线索、状态、跟进记录。",
    "待确认点：",
    "- 详情展示采用抽屉而非独立页面",
    "- 首版不引入角色差异视图"
  ].join("\n"));

  assert.match(preview.summary, /项目目标：建立客户经理线索协同看板的首版基线/);
  assert.match(preview.summary, /待确认点/);
  assert.ok(preview.evidence.length >= 2, "evidence should have at least 2 items");
});
