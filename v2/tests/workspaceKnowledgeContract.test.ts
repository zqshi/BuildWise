import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const v2Dir = resolve(testDir, "..");

test("workspace support normalizes project knowledge base and multimodal mapping fields", () => {
  const supportSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceSupportCore.ts"),
    "utf-8"
  );
  const commonSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceServiceCommon.ts"),
    "utf-8"
  );

  assert.match(supportSource, /knowledgeBase:\s*\{/);
  assert.match(supportSource, /ontologyTerms:/);
  assert.match(commonSource, /changeSource:\s*\{/);
  assert.match(commonSource, /knowledgeHits:\s*\[\]/);
  assert.match(commonSource, /knowledgeConflicts:\s*\[\]/);
  assert.match(commonSource, /normalizedFunctionalPoints:\s*\[\]/);
  assert.match(commonSource, /mappingAuditTrail:\s*\[\]/);
  assert.match(supportSource, /changeSource:\s*\{/);
  assert.match(supportSource, /sourceType:/);
  assert.match(supportSource, /functionalPoint:/);
});

test("workspace domain models expose project knowledge and multimodal change contracts", () => {
  const backendProjectTypes = readFileSync(resolve(v2Dir, "backend", "src", "domain", "workspace", "projectTypes.ts"), "utf-8");
  const backendIterationTypes = readFileSync(resolve(v2Dir, "backend", "src", "domain", "workspace", "iterationTypes.ts"), "utf-8");
  const frontendProjectTypes = readFileSync(resolve(v2Dir, "src", "domain", "workspace", "projectTypes.ts"), "utf-8");
  const frontendIterationTypes = readFileSync(resolve(v2Dir, "src", "domain", "workspace", "iterationTypes.ts"), "utf-8");

  for (const source of [backendProjectTypes, frontendProjectTypes]) {
    assert.match(source, /export type ProjectKnowledgeBase/);
    assert.match(source, /knowledgeBase\?: ProjectKnowledgeBase/);
    assert.match(source, /changePatterns:/);
  }

  for (const source of [backendIterationTypes, frontendIterationTypes]) {
    assert.match(source, /export type IterationChangeSourceType/);
    assert.match(source, /changeSource: IterationChangeSource/);
    assert.match(source, /knowledgeHits: string\[\]/);
    assert.match(source, /knowledgeConflicts: string\[\]/);
    assert.match(source, /normalizedFunctionalPoints: string\[\]/);
    assert.match(source, /mappingAuditTrail:/);
  }
});

test("coach runtime injects project knowledge and change intelligence as context, not fixed reply copy", () => {
  const coachSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceServiceCoachOps.ts"),
    "utf-8"
  );
  const knowledgeSyncSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "knowledgeSyncService.ts"),
    "utf-8"
  );

  // Coach 委托 knowledgeSyncService 做统一知识注入
  assert.match(coachSource, /buildKnowledgeSyncContext/);
  // knowledgeSyncService 覆盖全部 7 个知识维度
  assert.match(knowledgeSyncSource, /项目知识-业务概念/);
  assert.match(knowledgeSyncSource, /项目知识-业务规则/);
  assert.match(knowledgeSyncSource, /项目知识-功能模块/);
  assert.match(knowledgeSyncSource, /项目知识-代码映射/);
  assert.match(knowledgeSyncSource, /项目知识-已知风险/);
  assert.match(knowledgeSyncSource, /项目知识-变更模式/);
  // Coach 仍包含变更智能注入
  assert.match(coachSource, /变更来源是/);
  assert.match(coachSource, /与已有知识的关联/);
  assert.match(coachSource, /发现的知识冲突/);
  assert.match(coachSource, /归纳出的功能点/);
  assert.match(coachSource, /function buildFallbackCoachReply\(rawContent: string\)/);
  assert.match(coachSource, /extractCoachMarker\(result\.content\)/);
  assert.match(coachSource, /用自然沟通引导用户推进迭代澄清与边界确认/);
  assert.doesNotMatch(coachSource, /固定话术|固定回复模板/);
});

test("openclaw direct chat injects project and portfolio knowledge as context only", () => {
  const openclawOpsSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceServiceOpenclawOps.ts"),
    "utf-8"
  );

  assert.match(openclawOpsSource, /\[项目知识上下文\]/);
  assert.match(openclawOpsSource, /关键业务概念/);
  assert.match(openclawOpsSource, /已确认的业务规则/);
  assert.match(openclawOpsSource, /变更模式/);
  assert.match(openclawOpsSource, /\[skills selection\]/);
  assert.match(openclawOpsSource, /近期决策/);
  assert.match(openclawOpsSource, /contextSections/);
  assert.doesNotMatch(openclawOpsSource, /固定话术|固定回复模板/);
});
