import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const { ContinuousModelingService } = await import("../dist/application/continuousModeling/continuousModelingService.js");
const { ContinuousModelingWorkspaceService } = await import("../dist/application/continuousModeling/continuousModelingWorkspaceService.js");
const { buildProjectModelView } = await import("../dist/application/continuousModeling/continuousModelingProjectView.js");
const { JsonWorkspaceRepository } = await import("../dist/infrastructure/persistence/jsonWorkspaceRepository.js");

function createWorkspaceRepository() {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-continuous-modeling-workspace-"));
  const dataFile = path.join(fixtureDir, "workspace.json");
  writeFileSync(
    dataFile,
    JSON.stringify(
      {
        projects: [
          {
            id: 11,
            name: "统一建模项目",
            description: "测试统一模型视图",
            status: "in-progress",
            repository: {
              id: "repo-11",
              repoMode: "hybrid",
              provider: "github",
              organization: "buildwise",
              name: "unified-model-project",
              url: "https://github.com/buildwise/unified-model-project",
              defaultBranch: "main",
              structureVersion: "v1",
              layout: [],
              governance: {
                requireRemoteForProduction: true,
                requireRemoteForStaging: false
              },
              health: {
                remoteConfigured: true,
                remoteReachable: false,
                remoteSynced: false,
                lastCheckedAt: "",
                lastError: ""
              },
              createdAt: "2026-03-17T00:00:00.000Z",
              updatedAt: "2026-03-17T00:00:00.000Z"
            },
            knowledgeBase: {
              ontologyTerms: [
                {
                  term: "客户档案",
                  aliases: ["客户"],
                  definition: "客户主数据档案。",
                  evidence: "kb"
                }
              ],
              stableRules: [
                {
                  rule: "客户档案必须唯一",
                  rationale: "避免重复建档",
                  source: "kb"
                }
              ],
              componentInventory: [],
              codeMap: [],
              decisionLog: [
                {
                  decision: "客户统一归口管理",
                  status: "active",
                  rationale: "减少重复维护",
                  iterationVersion: "1.0.0"
                }
              ],
              knownRisks: [
                {
                  risk: "客户口径不统一",
                  mitigation: "统一术语",
                  trigger: "新增需求"
                }
              ],
              changePatterns: [],
              updatedAt: "2026-03-17T00:00:00.000Z"
            }
          }
        ],
        iterations: [
          {
            id: 21,
            projectId: 11,
            version: "1.1.0",
            name: "客户档案增量建模",
            description: "新增客户标签能力",
            goals: ["新增客户标签"],
            modules: [],
            status: "in-progress",
            progress: 35,
            createdAt: "2026-03-17",
            createdBy: "系统",
            current: true,
            aiSummary: "",
            scope: {
              inScope: ["新增客户标签"],
              outOfScope: [],
              acceptanceCriteria: ["标签可追溯"]
            },
            continuity: {
              inheritedFromIterationId: null,
              inheritedSummary: "",
              carriedGoals: [],
              carriedRisks: [],
              carriedDecisions: []
            },
            assessment: {
              baselineIterationId: null,
              baselineIterationName: "",
              currentSummary: "",
              deltaInScope: [],
              resolvedItems: [],
              pendingItems: [],
              risks: []
            }
          }
        ],
        messages: [],
        snapshots: [],
        transitions: [],
        auditLogs: [],
        versionSnapshots: [],
        projectShares: [],
        deployments: [],
        templateRuns: [],
        opsTriageTemplates: [],
        projectPolicies: [],
        projectWorkspaceBindings: [],
        policyExecutionLogs: [],
        projectRoleBindings: [],
        platformRoleBindings: [],
        governanceCustomRoles: []
      },
      null,
      2
    ),
    "utf-8"
  );
  return new JsonWorkspaceRepository(dataFile);
}

function createModelingRepository() {
  return {
    listSnapshots(projectId) {
      assert.equal(projectId, 11);
      return [
        {
          id: "snapshot-11-21-candidate",
          projectId: 11,
          iterationId: 21,
          version: "11.21.candidate",
          status: "candidate",
          ontologyTerms: [
            {
              canonicalTerm: "客户标签",
              aliases: ["标签"],
              technicalAliases: ["customer-tag"],
              definition: "客户标签模型。",
              evidence: ["snapshot"]
            }
          ],
          entities: [
            {
              id: "entity_customer_tag",
              name: "CustomerTag",
              businessName: "客户标签",
              fields: [{ name: "name", type: "string", required: true }]
            }
          ],
          relations: [],
          rules: [
            {
              id: "rule-tag-trace",
              name: "客户标签变更必须留痕",
              statement: "客户标签变更必须留痕",
              linkedEntityIds: ["entity_customer_tag"],
              linkedSurfaceIds: [],
              linkedApiIds: []
            }
          ],
          reviewTasks: [
            {
              id: "review-1",
              type: "rule_confirmation",
              title: "确认客户标签留痕规则",
              description: "确认业务规则口径",
              blocking: true
            }
          ],
          derivedFromSnapshotId: null,
          createdAt: "2026-03-17T08:00:00.000Z"
        }
      ];
    },
    getLatestPublishedSnapshot() {
      return null;
    },
    saveCandidateSnapshot() {}
  };
}

test("ContinuousModelingWorkspaceService validates project and iteration before planning", () => {
  const workspaceRepo = createWorkspaceRepository();
  const modelingRepo = createModelingRepository();
  const service = new ContinuousModelingWorkspaceService(new ContinuousModelingService(modelingRepo), workspaceRepo, modelingRepo);

  const missingProject = service.planIterationModeling({
    projectId: 999,
    iterationId: 21,
    baselineSnapshot: null,
    businessInputs: [],
    ontologyTerms: [],
    entities: [],
    relations: [],
    rules: []
  });
  assert.equal(missingProject.ok, false);
  if (missingProject.ok) {
    return;
  }
  assert.equal(missingProject.reason, "project_not_found");

  const missingIteration = service.planIterationModeling({
    projectId: 11,
    iterationId: 999,
    baselineSnapshot: null,
    businessInputs: [],
    ontologyTerms: [],
    entities: [],
    relations: [],
    rules: []
  });
  assert.equal(missingIteration.ok, false);
  if (missingIteration.ok) {
    return;
  }
  assert.equal(missingIteration.reason, "iteration_not_found");
});

test("ContinuousModelingWorkspaceService builds compatibility summary from unified model view", () => {
  const workspaceRepo = createWorkspaceRepository();
  const modelingRepo = createModelingRepository();
  const service = new ContinuousModelingWorkspaceService(new ContinuousModelingService(modelingRepo), workspaceRepo, modelingRepo);

  const summary = service.buildCompatibilityBusinessSummary(11, 21);

  assert.equal(summary?.source, "model-view-compat");
  assert.equal(summary?.model, "project_model_view");
  assert.match(summary?.summary || "", /候选模型快照/);
  assert(summary?.focus.some((item) => item.includes("关键术语")), "compat summary should include ontology focus");
  assert(summary?.risks.some((item) => item.includes("阻断型")), "compat summary should include blocking review risk");
});

test("buildProjectModelView merges project knowledge and latest snapshot into one unified context", () => {
  const workspaceRepo = createWorkspaceRepository();
  const modelingRepo = createModelingRepository();

  const view = buildProjectModelView(workspaceRepo, modelingRepo, 11, 21);
  assert.ok(view);
  if (!view) {
    return;
  }
  assert.equal(view.projectName, "统一建模项目");
  assert.equal(view.iterationName, "客户档案增量建模");
  assert.equal(view.latestSnapshotId, "snapshot-11-21-candidate");
  assert.ok(view.ontologyTerms.some((item) => item.businessTerm === "客户档案"));
  assert.ok(view.ontologyTerms.some((item) => item.businessTerm === "客户标签"));
  assert.ok(view.rules.some((item) => item.name === "客户档案必须唯一"));
  assert.ok(view.rules.some((item) => item.name === "客户标签变更必须留痕"));
  assert.equal(view.reviewTasks.length, 1);
});
