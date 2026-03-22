import assert from "node:assert/strict";
import test from "node:test";

import { presentCoachReply } from "../src/app/workspaceChatReplyPresenter.ts";
import { compactArtifactCardSummary, parseArtifactReferenceMessage, shouldSuppressArtifactTextMessage } from "../src/app/workspaceChatMessagePresentation.ts";
import { buildAnalysisArtifactPreview, parseAnalysisArtifactSections } from "../src/pages/projects/analysisArtifactPresenter.ts";

test("presentCoachReply removes internal skill notes and compresses deliverable-ready chatter", () => {
  const reply = [
    "已输出首版需求分析报告，以下是需要你确认的待处理点。",
    "[skills] 10-business-rule-linking: 当前输入涉及业务规则。",
    "问题定义：创意生成器 MVP 需要先验证单页生成闭环。",
    "请查看交付物卡片并确认，如需修改可继续补充意见。"
  ].join("\n");

  assert.equal(
    presentCoachReply(reply),
    "已输出首版需求分析报告，以下是需要你确认的待处理点。\n问题定义：创意生成器 MVP 需要先验证单页生成闭环。\n请查看交付物卡片并确认，如需修改可继续补充意见。"
  );
});

test("presentCoachReply preserves natural language lines from structured artifact and strips markdown", () => {
  const reply = [
    "### 创意生成器 V1.1 继承差异分析报告",
    "## 变更目标",
    "| 类型 | 对象 |",
    "| --- | --- |",
    "| API | /api/history/filter |",
    "## 待确认点",
    "请查看交付物卡片并确认，若需修改可继续补充意见。"
  ].join("\n");

  // 新逻辑：保留自然语言行，剥离结构化行（表格/标题等走卡片通道）
  assert.equal(
    presentCoachReply(reply),
    "请查看交付物卡片并确认，若需修改可继续补充意见。"
  );
});

test("presentCoachReply extracts natural language from structured json payload", () => {
  const reply = JSON.stringify({
    intent: "deliverable-output",
    reply: "# 创意生成器 V1.1 继承差异分析报告\n\n## 一、继承不变项\n| 模块 | 具体内容 |\n| --- | --- |"
  });

  // 纯结构化内容无自然语言行时，生成简短引导
  assert.equal(
    presentCoachReply(reply),
    "已生成「继承差异分析报告」，请查看交付物卡片了解详情。"
  );
});

test("analysis artifact preview ignores internal skill lines and prioritizes meaningful sections", () => {
  const content = [
    "说明：以下为 V1 首版分析。",
    "[skills] 10-business-rule-linking: 业务规则映射",
    "问题定义：帮助团队快速生成创意页面。",
    "纳入范围：单页生成、提示词模板、结果预览。",
    "待确认：是否支持导出源码。",
    "- 风险：首版先不接入多人协作"
  ].join("\n");

  assert.deepEqual(
    parseAnalysisArtifactSections(content).map((section) => section.title),
    ["说明", "问题定义", "纳入范围", "待确认"]
  );
  assert.equal(
    buildAnalysisArtifactPreview(content).summary,
    "问题定义：帮助团队快速生成创意页面。；纳入范围：单页生成、提示词模板、结果预览。"
  );
  assert.equal(
    buildAnalysisArtifactPreview(content).evidence.includes("风险：首版先不接入多人协作"),
    true
  );
});

test("compactArtifactCardSummary compresses structured artifact body into short summary lines", () => {
  const summary = compactArtifactCardSummary([
    "# 创意生成器 V1.1 继承差异分析报告",
    "## 一、继承不变项",
    "| 模块 | 具体内容 | 状态 |",
    "| 核心生成主路径 | 创意主题输入 -> 生成逻辑 | 保持不变 |"
  ].join("\n"));

  assert.equal(summary, "# 创意生成器 V1.1 继承差异分析报告；## 一、继承不变项；| 模块 | 具体内容 | 状态 |");
});

test("compactArtifactCardSummary unwraps fenced json payload before summarizing", () => {
  const summary = compactArtifactCardSummary([
    "```json",
    "{",
    "\"intent\": \"deliverable-output\",",
    "\"reply\": \"# 创意生成器 MVP - 设计规范\\n\\n## 1. 布局规则\\n\\n| 区域 | 宽度 |\\n| --- | --- |\"",
    "}",
    "```"
  ].join("\n"));

  assert.equal(summary, "# 创意生成器 MVP - 设计规范；## 1. 布局规则；| 区域 | 宽度 |");
});

test("compactArtifactCardSummary unwraps unterminated fenced json payload before summarizing", () => {
  const summary = compactArtifactCardSummary([
    "```json",
    "{",
    "\"intent\": \"deliverable-output\",",
    "\"reply\": \"# 创意生成器 MVP - 设计规范\\n\\n## 1. 布局规则\\n\\n| 区域 | 宽度 |\\n| --- | --- |\"",
    "}"
  ].join("\n"));

  assert.equal(summary, "# 创意生成器 MVP - 设计规范；## 1. 布局规则；| 区域 | 宽度 |");
});

test("compactArtifactCardSummary unwraps truncated reply strings before summarizing", () => {
  const summary = compactArtifactCardSummary([
    "```json",
    "{",
    "\"intent\": \"output-incremental-prd-v1.1\",",
    "\"reply\": \"# 创意生成器 V1.1 增量 PRD\\n\\n## 一、产品概述\\n- 支持业务规则注入\\n- 支持历史筛选\\n\\n--"
  ].join("\n"));

  assert.equal(summary, "# 创意生成器 V1.1 增量 PRD；## 一、产品概述；支持业务规则注入");
});

test("parseArtifactReferenceMessage compacts oversized summary payloads", () => {
  const parsed = parseArtifactReferenceMessage([
    "【交付物引用】继承差异分析报告",
    "摘要：# 创意生成器 V1.1 继承差异分析报告\n## 一、继承不变项\n| 模块 | 具体内容 |",
    "请查看交付物"
  ].join("\n"));

  assert.equal(parsed?.summary, "# 创意生成器 V1.1 继承差异分析报告");
});

test("shouldSuppressArtifactTextMessage hides duplicate structured artifact text when card exists", () => {
  const duplicateText = [
    "# 创意生成器 V1.1 继承差异分析报告",
    "## 一、继承不变项",
    "| 模块 | 具体内容 | 状态 |",
    "请查看交付物卡片并确认。"
  ].join("\n");

  assert.equal(
    shouldSuppressArtifactTextMessage(duplicateText, "# 创意生成器 V1.1 继承差异分析报告；## 一、继承不变项", "继承差异分析报告"),
    true
  );
  assert.equal(
    shouldSuppressArtifactTextMessage("补充建议：请先确认禁用词处理方式。", "简要摘要", "继承差异分析报告"),
    false
  );
  assert.equal(
    shouldSuppressArtifactTextMessage(
      JSON.stringify({
        intent: "deliverable-output",
        reply: "# 创意生成器 V1.1 继承差异分析报告\n\n## 一、继承不变项\n| 模块 | 具体内容 |"
      }),
      "创意生成器 V1.1 继承差异分析报告；一、继承不变项",
      "继承差异分析报告"
    ),
    true
  );
});
