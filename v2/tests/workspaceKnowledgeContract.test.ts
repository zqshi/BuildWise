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

  assert.match(coachSource, /项目知识\.ontologyTerms=/);
  assert.match(coachSource, /项目知识\.stableRules=/);
  assert.match(coachSource, /变更来源\.type=/);
  assert.match(coachSource, /项目知识命中=/);
  assert.match(coachSource, /项目知识冲突=/);
  assert.match(coachSource, /功能点归一化=/);
  assert.match(coachSource, /映射审计=/);
  assert.match(coachSource, /function buildFallbackCoachReply\(rawContent: string\)/);
  assert.match(coachSource, /pickString\(parsed\?\.reply\) \|\| buildFallbackCoachReply\(result\.content\)/);
  assert.match(coachSource, /继续当前交付物确认，再推进下一阶段/);
  assert.doesNotMatch(coachSource, /固定话术|固定回复模板/);
});

test("openclaw direct chat injects project and portfolio knowledge as context only", () => {
  const openclawOpsSource = readFileSync(
    resolve(v2Dir, "backend", "src", "application", "workspace", "workspaceServiceOpenclawOps.ts"),
    "utf-8"
  );

  assert.match(openclawOpsSource, /\[项目知识上下文\]/);
  assert.match(openclawOpsSource, /本体词典=/);
  assert.match(openclawOpsSource, /稳定规则=/);
  assert.match(openclawOpsSource, /变更模式=/);
  assert.match(openclawOpsSource, /\[主窗口项目概览上下文\]/);
  assert.match(openclawOpsSource, /最近决策=/);
  assert.match(openclawOpsSource, /contextSections/);
  assert.doesNotMatch(openclawOpsSource, /固定话术|固定回复模板/);
});
