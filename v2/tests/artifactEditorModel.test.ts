import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArtifactCommitSummary,
  buildArtifactRevisionPrompt,
  buildEditorLineNumbers,
  detectCodeLanguage,
  detectDocumentFormat,
  extractArtifactMarkdownCodeBlocks,
  extractArtifactMarkdownTables,
  extractArtifactOutlineSections,
  extractArtifactDocumentContent,
  extractArtifactPrototypeHtml,
  normalizeMarkdownForPreview,
  normalizeRichTextContent,
  resolveArtifactActionErrorMessage,
  shouldCloseDrawerAfterRevisionRequest,
  stripRichTextToPlainText,
  summarizeArtifactStructure,
  summarizeArtifactText
} from "../src/pages/projects/artifactEditorModel.ts";

test("normalizeRichTextContent converts plain text into paragraph html", () => {
  const html = normalizeRichTextContent("第一段\n第二行\n\n第二段");
  assert.match(html, /<p>第一段<br \/>第二行<\/p><p>第二段<\/p>/);
});

test("stripRichTextToPlainText restores readable text", () => {
  const text = stripRichTextToPlainText("<p>第一段<br />第二行</p><p>第二段</p>");
  assert.equal(text, "第一段\n第二行\n\n第二段");
});

test("buildEditorLineNumbers and summarizeArtifactText use actual content length", () => {
  assert.deepEqual(buildEditorLineNumbers("a\nb\nc"), [1, 2, 3]);
  assert.deepEqual(summarizeArtifactText("a\nb\nc"), { lines: 3, chars: 5, words: 3 });
});

test("detectCodeLanguage identifies common artifact code shapes", () => {
  assert.equal(detectCodeLanguage("技术架构-html", "<div>demo</div>"), "html");
  assert.equal(detectCodeLanguage("接口定义", "{\"ok\":true}"), "json");
  assert.equal(detectCodeLanguage("实现代码", "export const run = () => {};"), "typescript");
});

test("detectDocumentFormat distinguishes html from markdown text", () => {
  assert.equal(detectDocumentFormat("<div><p>富文本</p><section>内容</section></div>"), "html");
  assert.equal(detectDocumentFormat("<p>富文本</p>"), "markdown");
  assert.equal(detectDocumentFormat("# 标题\n\n- 列表"), "markdown");
});

test("extractArtifactDocumentContent unwraps structured agent payloads", () => {
  const content = extractArtifactDocumentContent(
    JSON.stringify({
      intent: "output-incremental-prd-v1.1",
      reply: "# 创意生成器 V1.1 增量 PRD\n\n## 问题定义\n补充业务规则注入。"
    })
  );

  assert.equal(content, "# 创意生成器 V1.1 增量 PRD\n\n## 问题定义\n补充业务规则注入。");
  assert.equal(detectDocumentFormat(JSON.stringify({ reply: "<div><p>富文本正文</p><section>详情</section></div>" })), "html");
});

test("extractArtifactDocumentContent unwraps fenced json payloads for detail drawer display", () => {
  const content = extractArtifactDocumentContent(
    [
      "```json",
      "{",
      "\"intent\": \"output-incremental-prd-v1.1\",",
      "\"reply\": \"# 创意生成器 V1.1 增量 PRD\\n\\n## 一、产品概述\\n补充业务规则注入。\"",
      "}",
      "```"
    ].join("\n")
  );

  assert.equal(content, "# 创意生成器 V1.1 增量 PRD\n\n## 一、产品概述\n补充业务规则注入。");
});

test("extractArtifactDocumentContent unwraps unterminated fenced json payloads from persisted drafts", () => {
  const content = extractArtifactDocumentContent(
    [
      "```json",
      "{",
      "\"intent\": \"output-incremental-prd-v1.1\",",
      "\"reply\": \"# 创意生成器 V1.1 增量 PRD\\n\\n## 一、产品概述\\n补充业务规则注入。\"",
      "}"
    ].join("\n")
  );

  assert.equal(content, "# 创意生成器 V1.1 增量 PRD\n\n## 一、产品概述\n补充业务规则注入。");
});

test("extractArtifactDocumentContent falls back to quoted reply field when payload is not valid json", () => {
  const content = extractArtifactDocumentContent("\"intent\": \"output-incremental-prd-v1.1\", \"reply\": \"# 创意生成器 V1.1 增量 PRD\\n\\n## 一、产品概述\\n补充业务规则注入。\"");

  assert.equal(content, "# 创意生成器 V1.1 增量 PRD\n\n## 一、产品概述\n补充业务规则注入。");
});

test("extractArtifactDocumentContent decodes truncated reply strings from persisted payloads", () => {
  const content = extractArtifactDocumentContent(
    [
      "```json",
      "{",
      "\"intent\": \"output-incremental-prd-v1.1\",",
      "\"reply\": \"# 创意生成器 V1.1 增量 PRD\\n\\n## 一、产品概述\\n- 支持业务规则注入\\n- 支持历史筛选\\n\\n--"
    ].join("\n")
  );

  assert.equal(content, "# 创意生成器 V1.1 增量 PRD\n\n## 一、产品概述\n- 支持业务规则注入\n- 支持历史筛选\n\n--");
});

test("extractArtifactPrototypeHtml returns fenced html body without prompt chatter", () => {
  const html = extractArtifactPrototypeHtml(
    [
      "请继续输出原型交付物，需要一个完整可渲染的 HTML 原型。",
      "```html",
      "<!doctype html>",
      "<html><body><main>prototype</main></body></html>",
      "```"
    ].join("\n")
  );

  assert.equal(html, "<!doctype html>\n<html><body><main>prototype</main></body></html>");
});

test("extractArtifactPrototypeHtml unwraps structured payload and keeps only the html document", () => {
  const html = extractArtifactPrototypeHtml(
    JSON.stringify({
      intent: "output-prototype-preview-v1",
      reply: "说明文字\\n\\n<!doctype html><html><body><section>preview</section></body></html>"
    })
  );

  assert.equal(html, "<!doctype html><html><body><section>preview</section></body></html>");
});

test("extractArtifactOutlineSections reads markdown heading outline and summaries", () => {
  const sections = extractArtifactOutlineSections(
    [
      "# 创意生成器 MVP - 设计规范",
      "",
      "## 1. 布局规则",
      "整体采用左右分栏。",
      "",
      "## 2. 状态反馈",
      "- 加载时显示骨架屏"
    ].join("\n")
  );

  assert.deepEqual(
    sections.slice(0, 3),
    [
      { level: 1, title: "创意生成器 MVP - 设计规范", summary: "" },
      { level: 2, title: "1. 布局规则", summary: "整体采用左右分栏。" },
      { level: 2, title: "2. 状态反馈", summary: "加载时显示骨架屏" }
    ]
  );
});

test("summarizeArtifactStructure counts headings, code fences, tables and checklists", () => {
  const summary = summarizeArtifactStructure(
    [
      "# 标题",
      "## 表格",
      "| 名称 | 说明 |",
      "| --- | --- |",
      "| loading | 加载态 |",
      "- [ ] 补充交互动效",
      "```css",
      ".shell { display: grid; }",
      "```"
    ].join("\n")
  );

  assert.deepEqual(summary, {
    headingCount: 2,
    codeFenceCount: 1,
    tableRowCount: 3,
    checklistCount: 1
  });
});

test("extractArtifactMarkdownCodeBlocks returns fenced previews with language", () => {
  const blocks = extractArtifactMarkdownCodeBlocks(
    [
      "```css",
      ".shell { display: grid; }",
      ".card { border-radius: 16px; }",
      "```",
      "",
      "```ts",
      "export const routes = [];",
      "```"
    ].join("\n")
  );

  assert.deepEqual(blocks, [
    { language: "css", preview: ".shell { display: grid; }\n.card { border-radius: 16px; }" },
    { language: "ts", preview: "export const routes = [];" }
  ]);
});

test("extractArtifactMarkdownTables parses markdown tables into headers and rows", () => {
  const tables = extractArtifactMarkdownTables(
    [
      "| 类型 | 用例 | 预期 |",
      "| --- | --- | --- |",
      "| 冒烟 | TC-001 | 成功生成结果 |",
      "| 回归 | TC-002 | 历史筛选保持可用 |"
    ].join("\n")
  );

  assert.deepEqual(tables, [
    {
      headers: ["类型", "用例", "预期"],
      rows: [
        ["冒烟", "TC-001", "成功生成结果"],
        ["回归", "TC-002", "历史筛选保持可用"]
      ]
    }
  ]);
});

test("normalizeMarkdownForPreview inserts missing table separator for llm markdown tables", () => {
  const normalized = normalizeMarkdownForPreview(
    ["| 功能模块 | 输入说明 |", "| 主题输入 | 支持文本输入 |", "| 创意生成 | 生成标题与文案 |"].join("\n")
  );
  assert.match(normalized, /\| 功能模块 \| 输入说明 \|\n\| --- \| --- \|/);
  assert.equal((normalized.match(/\| --- \| --- \|/g) || []).length, 1);
});

test("normalizeMarkdownForPreview upgrades pseudo headings and pseudo lists", () => {
  const normalized = normalizeMarkdownForPreview(
    ["", "问题定义：帮助运营团队快速生成创意文案", "1）先输入主题", "• 再选择语气模板", "— 最后确认结果"].join("\n")
  );
  assert.match(normalized, /\n## 问题定义\n帮助运营团队快速生成创意文案/);
  assert.match(normalized, /1\. 先输入主题/);
  assert.match(normalized, /- 再选择语气模板/);
  assert.match(normalized, /- 最后确认结果/);
});

test("normalizeMarkdownForPreview decorates markdown task list items for readonly rendering", () => {
  const normalized = normalizeMarkdownForPreview("- [ ] 补充品牌语气规则\n- [x] 确认禁用词清单");
  assert.match(normalized, /artifact-task-item"><input type="checkbox" disabled  \/><span>补充品牌语气规则/);
  assert.match(normalized, /artifact-task-item is-checked"><input type="checkbox" disabled checked \/><span>确认禁用词清单/);
});

test("normalizeMarkdownForPreview upgrades pseudo subsection headings", () => {
  const normalized = normalizeMarkdownForPreview("\n1.1 功能覆盖范围\n这里描述章节内容");
  assert.match(normalized, /\n### 1\.1 功能覆盖范围\n这里描述章节内容/);
});

test("normalizeMarkdownForPreview wraps pseudo code blocks with fences", () => {
  const normalized = normalizeMarkdownForPreview(["", "const options = {", "  mode: \"strict\"", "};", ""].join("\n"));
  assert.match(normalized, /```ts\nconst options = \{\n  mode: "strict"\n\};\n```/);
});

test("buildArtifactCommitSummary extracts top lines from rich text", () => {
  const summary = buildArtifactCommitSummary("<p>第一段<br />第二行</p><p>第二段</p>", "fallback");
  assert.equal(summary, "第一段；第二行；第二段");
});

test("buildArtifactCommitSummary reads top lines from structured payload reply", () => {
  const summary = buildArtifactCommitSummary(
    JSON.stringify({
      intent: "output-incremental-prd-v1.1",
      reply: "# 标题\n\n第一段\n第二段"
    }),
    "fallback"
  );
  assert.equal(summary, "# 标题；第一段；第二段");
});

test("buildArtifactCommitSummary avoids table-heavy artifact body becoming oversized summary", () => {
  const summary = buildArtifactCommitSummary(
    JSON.stringify({
      intent: "deliverable-output",
      reply: "# 创意生成器 V1.1 继承差异分析报告\n\n## 一、继承不变项\n以下模块在 V1.1 中保持不变。\n| 模块 | 具体内容 | 状态 |\n| --- | --- | --- |"
    }),
    "fallback"
  );
  assert.equal(summary, "# 创意生成器 V1.1 继承差异分析报告；## 一、继承不变项；以下模块在 V1.1 中保持不变。");
});

test("buildArtifactRevisionPrompt preserves existing draft input", () => {
  assert.equal(buildArtifactRevisionPrompt("产品需求文档"), "请调整交付物「产品需求文档」：");
  assert.equal(
    buildArtifactRevisionPrompt("产品需求文档", "补充验收标准"),
    "请调整交付物「产品需求文档」：\n补充验收标准"
  );
});

test("revision request closes drawer to keep the conversation flow focused", () => {
  assert.equal(shouldCloseDrawerAfterRevisionRequest(), true);
});

test("resolveArtifactActionErrorMessage explains artifact 404 clearly", () => {
  assert.equal(
    resolveArtifactActionErrorMessage(new Error("API error: 404: artifact not found")),
    "当前交付物上下文已失效，已无法提交。请重新打开该交付物后再试。"
  );
});
