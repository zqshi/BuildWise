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
  assert.match(source, /const FORCE_ARTIFACTS = new Set/);
  assert.match(source, /const FORCE_ITERATION_IDS = new Set/);
  assert.match(source, /BUILDWISE_FORCE_ITERATION_IDS/);
  assert.match(source, /BUILDWISE_FORCE_ARTIFACTS/);
  assert.match(source, /for \(let attempt = 1; attempt <= 5; attempt \+= 1\)/);
  assert.match(source, /missing reply\|invalid payload/i);
  assert.match(source, /function shouldSeedConversation\(artifacts\)/);
  assert.match(source, /function selectPendingSteps\(iterationId, steps, artifacts\)/);
  assert.match(source, /const pendingSteps = selectPendingSteps\(iteration\.id, steps, existingArtifacts\)/);
  assert.match(source, /const forcedIteration = FORCE_ITERATION_IDS\.size === 0 \|\| FORCE_ITERATION_IDS\.has\(iterationId\)/);
  assert.match(source, /\(forcedArtifact && forcedIteration\) \|\| !completed\.has\(artifactId\)/);
  assert.match(source, /这是用于流程验证的交付物重建，不是阶段推进。请忽略当前迭代所处阶段，直接输出交付物/);
  assert.doesNotMatch(source, /llm\?\.reachable/);
  assert.match(source, /!llm\?\.configured \|\| !String\(llm\?\.model \|\| ""\)\.trim\(\)/);
  assert.match(source, /分析报告。使用 Markdown 标题分节，必须完整包含：目标用户、问题定义、核心场景、本轮纳入项、本轮排除项、交互原则、关键风险、待确认点/);
  assert.match(source, /继承差异分析报告。使用 Markdown 标题分节，必须完整包含：继承不变项、本轮新增项、业务规则变化、影响范围、受影响工程对象、回归关注点、待确认点/);
  assert.match(source, /直接输出完整正文，不要给流程说明或待处理摘要/);
  assert.match(source, /保持正常对话回复，但正文必须包含一份完整可渲染的 HTML 原型/);
  assert.match(source, /保持正常对话回复，但正文必须包含一段完整的 TypeScript\/React 代码/);
  assert.doesNotMatch(source, /只返回完整 HTML/);
});
