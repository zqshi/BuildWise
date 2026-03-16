import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const v2Dir = resolve(testDir, "..");
const scriptPath = resolve(v2Dir, "scripts", "setup-creative-generator-demo.mjs");

test("creative generator setup script resumes from completed artifacts and retries transient llm payload failures", () => {
  const source = readFileSync(scriptPath, "utf-8");
  assert.match(source, /for \(let attempt = 1; attempt <= 5; attempt \+= 1\)/);
  assert.match(source, /missing reply\|invalid payload/i);
  assert.match(source, /function shouldSeedConversation\(artifacts\)/);
  assert.match(source, /function selectPendingSteps\(steps, artifacts\)/);
  assert.match(source, /const pendingSteps = selectPendingSteps\(steps, existingArtifacts\)/);
  assert.doesNotMatch(source, /llm\?\.reachable/);
  assert.match(source, /!llm\?\.configured \|\| !String\(llm\?\.model \|\| ""\)\.trim\(\)/);
  assert.match(source, /保持正常对话回复，但正文必须包含一份完整可渲染的 HTML 原型/);
  assert.match(source, /保持正常对话回复，但正文必须包含一段完整的 TypeScript\/React 代码/);
  assert.doesNotMatch(source, /只返回完整 HTML/);
});
