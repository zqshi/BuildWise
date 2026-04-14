import test from "node:test";
import assert from "node:assert/strict";

import { mergeCoreAnalysisChunks, mergeBizConfirmationChunks } from "../backend/src/application/workspace/analysis/chunkMergeOps.ts";
import type { CoreAnalysisChunkResult, BizConfirmationChunkResult } from "../backend/src/application/workspace/analysis/chunkMergeOps.ts";

// ---------------------------------------------------------------------------
// 工具：构建最小 CoreAnalysisChunkResult
// ---------------------------------------------------------------------------

function makeEmptyCoreChunk(overrides: Partial<CoreAnalysisChunkResult> = {}): CoreAnalysisChunkResult {
  return {
    projectDetection: { projectName: "", productName: "", projectCategory: "", evidence: [], confidence: "low" },
    meaningfulFindings: [],
    prioritizedFindings: [],
    nextActions: [],
    attachmentInsights: { projectCategory: "", artifactType: "", keyCharacteristics: [], versionChangeSummary: "", confidence: "low", limitations: [] },
    deepInsights: {
      coverage: { consideredFiles: 0, analyzedFiles: 0, partialFiles: 0, failedFiles: 0, coveragePercent: 0 },
      fileInsights: [],
      crossFileInsights: { themes: [], conflicts: [], gaps: [], recommendations: [], conflictChains: [], rootCauses: [], impactScope: [], decisionSuggestions: [] }
    },
    traceabilityMap: { requirementToComponent: [], componentToCode: [], requirementToCode: [], coverageScore: 0, mappingConfidence: "low", unmappedRequirements: [], conflicts: [], gaps: [] },
    executableConstraints: { componentWhitelist: [], codePathWhitelist: [], acceptanceChecks: [], gateRules: [] },
    domainKnowledge: { terms: [], rules: [], unknowns: [] },
    versionDiffDetailed: { summary: "", impactScope: [], riskPoints: [], added: [], changed: [], removed: [] },
    clarificationQuestions: [],
    risks: [],
    suggestions: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// mergeCoreAnalysisChunks
// ---------------------------------------------------------------------------

test("单片不合并直接返回", () => {
  const chunk = makeEmptyCoreChunk({ meaningfulFindings: ["发现A"] });
  const merged = mergeCoreAnalysisChunks([chunk]);
  assert.deepEqual(merged, chunk);
});

test("多片合并 meaningfulFindings 去重", () => {
  const c1 = makeEmptyCoreChunk({ meaningfulFindings: ["发现A", "发现B"] });
  const c2 = makeEmptyCoreChunk({ meaningfulFindings: ["发现B", "发现C"] });
  const merged = mergeCoreAnalysisChunks([c1, c2]);
  assert.deepEqual(merged.meaningfulFindings, ["发现A", "发现B", "发现C"]);
});

test("多片合并 prioritizedFindings 按优先级排序去重", () => {
  const c1 = makeEmptyCoreChunk({
    prioritizedFindings: [
      { priority: "P1", content: "中优先级问题", reason: "r1" },
      { priority: "P0", content: "高优先级问题", reason: "r0" }
    ]
  });
  const c2 = makeEmptyCoreChunk({
    prioritizedFindings: [
      { priority: "P2", content: "低优先级问题", reason: "r2" },
      { priority: "P0", content: "高优先级问题", reason: "r0" } // 重复
    ]
  });
  const merged = mergeCoreAnalysisChunks([c1, c2]);
  assert.equal(merged.prioritizedFindings.length, 3);
  assert.equal(merged.prioritizedFindings[0].priority, "P0");
  assert.equal(merged.prioritizedFindings[2].priority, "P2");
});

test("多片合并 projectDetection 取 confidence 最高的", () => {
  const c1 = makeEmptyCoreChunk({
    projectDetection: { projectName: "A", productName: "", projectCategory: "", evidence: ["e1"], confidence: "low" }
  });
  const c2 = makeEmptyCoreChunk({
    projectDetection: { projectName: "B", productName: "PB", projectCategory: "web", evidence: ["e2", "e3"], confidence: "high" }
  });
  const merged = mergeCoreAnalysisChunks([c1, c2]);
  assert.equal(merged.projectDetection.projectName, "B");
  assert.equal(merged.projectDetection.confidence, "high");
  // evidence 合并
  assert.ok(merged.projectDetection.evidence.includes("e1"));
  assert.ok(merged.projectDetection.evidence.includes("e2"));
});

test("多片合并 domainKnowledge.terms 相同 term 合并 mappedTo", () => {
  const c1 = makeEmptyCoreChunk({
    domainKnowledge: {
      terms: [{ term: "用户", definition: "系统使用者", mappedTo: { pages: ["登录页"], apis: [], entities: ["User"], codePaths: [] }, evidence: "", bindingStrength: "medium" as const }],
      rules: ["规则A"],
      unknowns: []
    }
  });
  const c2 = makeEmptyCoreChunk({
    domainKnowledge: {
      terms: [{ term: "用户", definition: "系统使用者", mappedTo: { pages: ["个人中心"], apis: ["/api/user"], entities: ["User"], codePaths: [] }, evidence: "", bindingStrength: "high" as const }],
      rules: ["规则B"],
      unknowns: []
    }
  });
  const merged = mergeCoreAnalysisChunks([c1, c2]);
  assert.equal(merged.domainKnowledge.terms.length, 1);
  const userTerm = merged.domainKnowledge.terms[0];
  assert.ok(userTerm.mappedTo.pages.includes("登录页"));
  assert.ok(userTerm.mappedTo.pages.includes("个人中心"));
  assert.equal(userTerm.bindingStrength, "high");
  assert.deepEqual(merged.domainKnowledge.rules, ["规则A", "规则B"]);
});

test("多片合并 fileInsights 按 path 去重", () => {
  const insight1 = { path: "a.ts", fileName: "a.ts", mimeType: "text/typescript", size: 100, kind: "code" as const, status: "analyzed" as const, mainContent: "", requiredWork: "", iterationValue: "", summary: "", keyPoints: [], risks: [], optimizeItems: [], keepItems: [], recommendedActions: [], openQuestions: [], citations: [], confidence: "high" as const };
  const insight2 = { ...insight1, path: "b.ts", fileName: "b.ts" };
  const c1 = makeEmptyCoreChunk({ deepInsights: { coverage: { consideredFiles: 1, analyzedFiles: 1, partialFiles: 0, failedFiles: 0, coveragePercent: 100 }, fileInsights: [insight1], crossFileInsights: { themes: ["主题A"], conflicts: [], gaps: [], recommendations: [], conflictChains: [], rootCauses: [], impactScope: [], decisionSuggestions: [] } } });
  const c2 = makeEmptyCoreChunk({ deepInsights: { coverage: { consideredFiles: 1, analyzedFiles: 1, partialFiles: 0, failedFiles: 0, coveragePercent: 100 }, fileInsights: [insight2], crossFileInsights: { themes: ["主题B"], conflicts: [], gaps: [], recommendations: [], conflictChains: [], rootCauses: [], impactScope: [], decisionSuggestions: [] } } });
  const merged = mergeCoreAnalysisChunks([c1, c2]);
  assert.equal(merged.deepInsights.fileInsights.length, 2);
  assert.equal(merged.deepInsights.coverage.analyzedFiles, 2);
  assert.deepEqual(merged.deepInsights.crossFileInsights.themes, ["主题A", "主题B"]);
});

// ---------------------------------------------------------------------------
// mergeBizConfirmationChunks
// ---------------------------------------------------------------------------

function makeEmptyBizChunk(overrides: Partial<BizConfirmationChunkResult> = {}): BizConfirmationChunkResult {
  return {
    coreIntent: "",
    successCriteria: [],
    interactionInsights: { primaryFlow: [], keyInteractions: [], exceptionPaths: [], usabilityRisks: [] },
    necessityAssessment: { mustDo: [], shouldDo: [], canDefer: [], outOfScope: [], rationale: "" },
    evidenceRefs: [],
    boundarySummary: "",
    functionalPoints: [],
    confirmationChecklist: [],
    versionDiffSummary: "",
    diffNarratives: [],
    diffConfirmationOrder: [],
    ...overrides
  };
}

test("BizConfirmation 多片合并取最后一个 coreIntent", () => {
  const c1 = makeEmptyBizChunk({ coreIntent: "意图A", functionalPoints: ["功能1"] });
  const c2 = makeEmptyBizChunk({ coreIntent: "意图B", functionalPoints: ["功能1", "功能2"] });
  const merged = mergeBizConfirmationChunks([c1, c2]);
  assert.equal(merged.coreIntent, "意图B");
  assert.deepEqual(merged.functionalPoints, ["功能1", "功能2"]);
});

test("BizConfirmation confirmationChecklist 按 order 排序重新编号", () => {
  const c1 = makeEmptyBizChunk({
    confirmationChecklist: [
      { order: 1, impactLevel: "高" as const, item: "项目A", rationale: "理由A" },
      { order: 2, impactLevel: "中" as const, item: "项目B", rationale: "理由B" }
    ]
  });
  const c2 = makeEmptyBizChunk({
    confirmationChecklist: [
      { order: 1, impactLevel: "低" as const, item: "项目C", rationale: "理由C" }
    ]
  });
  const merged = mergeBizConfirmationChunks([c1, c2]);
  assert.equal(merged.confirmationChecklist.length, 3);
  assert.equal(merged.confirmationChecklist[0].order, 1);
  assert.equal(merged.confirmationChecklist[2].order, 3);
});
