import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const {
  syncProjectWorkspaceKnowledge,
  searchProjectWorkspaceKnowledge
} = await import("../dist/application/workspace/projectWorkspaceKnowledgeService.js");

function buildProject() {
  return {
    id: 1,
    name: "订单中心",
    description: "订单履约与退款治理",
    status: "active",
    lastUpdated: "2026-03-23T00:00:00.000Z",
    knowledgeBase: {
      ontologyTerms: [
        { term: "退款", aliases: ["退货退款"], definition: "用户发起退款申请的业务动作", evidence: "prd" }
      ],
      stableRules: [
        { rule: "退款必须在签收后7天内发起", rationale: "售后时效控制", source: "业务确认" }
      ],
      componentInventory: [
        {
          component: "退款申请页",
          responsibility: "承接退款申请与校验",
          relatedRequirements: ["refund-window"],
          relatedCodePaths: ["src/pages/refund/apply.tsx"]
        }
      ],
      codeMap: [
        {
          capability: "退款时效校验",
          codePaths: ["src/pages/refund/validation.ts"],
          tests: ["tests/refund-window.test.ts"]
        }
      ],
      decisionLog: [
        { decision: "退款窗口设为7天", status: "active", rationale: "与业务政策一致", iterationVersion: "v1.2" }
      ],
      knownRisks: [
        { risk: "退款窗口被错误放宽", mitigation: "校验规则前置", trigger: "发布配置错误" }
      ],
      changePatterns: [
        { pattern: "售后规则调整", preferredFlow: "先确认规则再改页面与接口", avoid: "直接改前端文案" }
      ],
      updatedAt: "2026-03-23T00:00:00.000Z"
    }
  };
}

function buildIteration() {
  return {
    id: 11,
    projectId: 1,
    name: "退款时效收敛",
    description: "收敛退款窗口边界",
    goals: ["统一退款时效"],
    modules: [],
    status: "review",
    progress: 70,
    createdAt: "2026-03-23T00:00:00.000Z",
    createdBy: "tester",
    current: true,
    scope: {
      inScope: ["退款申请页", "退款接口"],
      outOfScope: [],
      acceptanceCriteria: ["退款必须在签收后7天内发起"]
    },
    continuity: {
      inheritedFromIterationId: 10,
      inheritedSummary: "",
      carriedGoals: [],
      carriedRisks: [],
      carriedDecisions: []
    },
    assessment: {
      baselineIterationId: 10,
      baselineIterationName: "退款首版",
      currentSummary: "",
      deltaInScope: [],
      resolvedItems: [],
      pendingItems: [],
      risks: []
    },
    changeControl: {
      lastAnalysisAt: "2026-03-23T01:00:00.000Z",
      lastAnalysisFileName: "",
      lastAnalysisDigest: "",
      lastUploadedInputFingerprint: "",
      lastUploadedAt: "",
      lastFailedAnalysisInput: "",
      lastFailedAnalysisAt: "",
      lastFailedAnalysisError: "",
      lastAttachmentUploadId: "",
      lastAttachmentIngestJobId: "",
      lastAttachmentAnalysisJobId: "",
      lastAttachmentReportId: "",
      lastAnalysisP0Count: 1,
      lastAnalysisHighValueCount: 1,
      lastAnalysisConsideredFiles: 1,
      lastAnalysisIgnoredFiles: 0,
      lastAnalysisIgnoredFileRatio: 0,
      lastReportPublishable: true,
      lastReportQualityScore: 90,
      lastReportQualitySummary: "good",
      lastReportQualityUpdatedAt: "2026-03-23T01:00:00.000Z",
      pendingHumanConfirmation: false,
      clarificationRounds: 0,
      clarificationQuestions: [],
      clarificationDraftResolvedQuestions: [],
      clarificationDraftUpdatedAt: "",
      lastClarificationResolution: { resolvedQuestions: [], unresolvedQuestions: [], updatedAt: "" },
      lastClarificationNote: "",
      confirmedAt: "2026-03-23T02:00:00.000Z",
      confirmedBy: "owner",
      boundary: {
        requirementRefs: ["refund-window"],
        componentRefs: ["退款申请页"],
        codePaths: ["src/pages/refund/validation.ts"],
        note: "退款时效边界",
        updatedAt: "2026-03-23T02:00:00.000Z"
      },
      changeSource: { type: "document", rawInput: "退款规则变更", attachments: [], references: [], updatedAt: "2026-03-23T01:00:00.000Z" },
      executableConstraints: { componentWhitelist: [], codePathWhitelist: [], acceptanceChecks: [], generatedAt: "2026-03-23T02:00:00.000Z" },
      generatedTestMatrix: [],
      generatedTestMatrixUpdatedAt: "",
      testMatrixExecutionUpdatedAt: "",
      qualityArtifacts: { unitTests: [], contractTests: [], acceptanceChecklist: [], regressionPoints: [], materializedFiles: [], updatedAt: "" },
      uxArtifacts: { informationArchitecture: [], interactionFlows: [], uiStates: [], uxConstraints: [], updatedAt: "" },
      traceabilitySnapshot: { requirementCoverage: 100, mappingConfidence: "high", unmappedRequirements: [], conflicts: [], generatedAt: "2026-03-23T01:00:00.000Z" },
      lastTraceabilityCoverageScore: 100,
      normalizedFunctionalPoints: [],
      mappingAuditTrail: [],
      domainKnowledgeEntries: [],
      domainKnowledgeUpdatedAt: "",
      knowledgeHits: [],
      knowledgeConflicts: [],
      lastReleaseReviewDecision: "go",
      lastReleaseReviewReason: "coverage ok",
      lastReleaseReviewBlockers: [],
      lastReleaseReviewScore: 92,
      lastReleaseReviewUpdatedAt: "2026-03-23T03:00:00.000Z",
      lastOpsRollbackSuggested: false,
      artifactWorkflow: { activeStage: "release", items: [], updatedAt: "2026-03-23T03:00:00.000Z" }
    }
  };
}

test("syncProjectWorkspaceKnowledge materializes project workspace memory and shard index", () => {
  const repo = createInMemoryWorkspaceRepo();
  const workspacePath = mkdtempSync(join(tmpdir(), "buildwise-proj-workspace-"));
  repo._store.projects.push(buildProject());
  repo._store.iterations.push(buildIteration());
  repo._store.projectWorkspaceBindings.push({
    id: 1,
    projectId: 1,
    assistantProfile: "buildwise-local",
    agentId: "main",
    workspacePath,
    runtimeMode: "bridge",
    locked: true,
    createdBy: "tester",
    createdAt: "2026-03-23T00:00:00.000Z",
    updatedAt: "2026-03-23T00:00:00.000Z"
  });

  const result = syncProjectWorkspaceKnowledge(repo, 1);
  assert.ok(result);
  assert.equal(result.projectId, 1);
  assert.equal(result.workspacePath, workspacePath);
  assert.ok(existsSync(join(workspacePath, ".buildwise", "workspace.json")));
  assert.ok(existsSync(join(workspacePath, ".buildwise", "memory", "ontology-business.md")));
  assert.ok(existsSync(join(workspacePath, ".buildwise", "memory", "daily")));
  assert.ok(existsSync(join(workspacePath, ".buildwise", "index", "shards.json")));

  const memory = readFileSync(join(workspacePath, ".buildwise", "memory", "ontology-business.md"), "utf-8");
  assert.match(memory, /退款必须在签收后7天内发起/);
});

test("searchProjectWorkspaceKnowledge returns top matching shards from project workspace index", () => {
  const repo = createInMemoryWorkspaceRepo();
  const workspacePath = mkdtempSync(join(tmpdir(), "buildwise-proj-search-"));
  repo._store.projects.push(buildProject());
  repo._store.iterations.push(buildIteration());
  repo._store.projectWorkspaceBindings.push({
    id: 1,
    projectId: 1,
    assistantProfile: "buildwise-local",
    agentId: "main",
    workspacePath,
    runtimeMode: "bridge",
    locked: true,
    createdBy: "tester",
    createdAt: "2026-03-23T00:00:00.000Z",
    updatedAt: "2026-03-23T00:00:00.000Z"
  });

  syncProjectWorkspaceKnowledge(repo, 1);
  const hits = searchProjectWorkspaceKnowledge(repo, 1, "退款 7天 规则", 2);

  assert.equal(hits.length > 0, true);
  assert.match(hits[0].content, /退款/);
  assert.ok(hits[0].score > 0);
});
