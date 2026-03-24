import assert from "node:assert/strict";
import test from "node:test";

import { extractArtifactCodeStructure } from "../src/pages/projects/artifactCodeModel.ts";

test("extractArtifactCodeStructure parses multi-file markdown code delivery", () => {
  const content = [
    "# 前端代码交付",
    "",
    "覆盖首页生成、结果展示与收藏状态。",
    "",
    "## `src/pages/CreativeGeneratorPage.tsx`",
    "负责主页面布局和生成动作。",
    "```tsx",
    "export function CreativeGeneratorPage() {",
    "  return <main>hello</main>;",
    "}",
    "```",
    "",
    "## src/components/ResultCard.tsx",
    "封装单个创意结果卡片。",
    "```tsx",
    "export function ResultCard() {",
    "  return <article />;",
    "}",
    "```"
  ].join("\n");

  const structure = extractArtifactCodeStructure("前端代码", content);

  assert.deepEqual(structure.overview, ["前端代码交付", "覆盖首页生成、结果展示与收藏状态。"]);
  assert.equal(structure.files.length, 2);
  assert.equal(structure.files[0]?.path, "src/pages/CreativeGeneratorPage.tsx");
  assert.equal(structure.files[0]?.language, "tsx");
  assert.match(structure.files[0]?.code || "", /CreativeGeneratorPage/);
  assert.equal(structure.files[1]?.path, "src/components/ResultCard.tsx");
  assert.equal(structure.files[1]?.summary, "封装单个创意结果卡片。");
});

test("extractArtifactCodeStructure falls back to generated path when raw code has no file headings", () => {
  const content = [
    "```ts",
    "export async function registerCreativeRoutes() {",
    "  return true;",
    "}",
    "```"
  ].join("\n");

  const structure = extractArtifactCodeStructure("后端代码", content);

  assert.equal(structure.files.length, 1);
  assert.equal(structure.files[0]?.path, "backend/src/routes/creativeGenerator.ts");
  assert.equal(structure.files[0]?.language, "ts");
});
