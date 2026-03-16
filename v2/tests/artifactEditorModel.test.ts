import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArtifactCommitSummary,
  buildArtifactRevisionPrompt,
  buildEditorLineNumbers,
  detectCodeLanguage,
  detectDocumentFormat,
  normalizeRichTextContent,
  resolveArtifactActionErrorMessage,
  shouldCloseDrawerAfterRevisionRequest,
  stripRichTextToPlainText,
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
  assert.equal(detectDocumentFormat("<p>富文本</p>"), "html");
  assert.equal(detectDocumentFormat("# 标题\n\n- 列表"), "markdown");
});

test("buildArtifactCommitSummary extracts top lines from rich text", () => {
  const summary = buildArtifactCommitSummary("<p>第一段<br />第二行</p><p>第二段</p>", "fallback");
  assert.equal(summary, "第一段；第二行；第二段");
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
