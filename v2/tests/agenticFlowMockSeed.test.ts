import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const v2Dir = resolve(testDir, "..");
const scriptPath = resolve(v2Dir, "scripts", "reset-and-seed-agentic-flow-mock.mjs");
const dataPath = resolve(v2Dir, "backend", "data.json");

test("agentic flow seed aligns V1 and V1.1 with business-script contract", () => {
  execFileSync("node", [scriptPath], { cwd: v2Dir, stdio: "pipe" });
  const data = JSON.parse(readFileSync(dataPath, "utf-8")) as Record<string, any>;

  assert.equal(Array.isArray(data.projects), true);
  assert.equal(Array.isArray(data.iterations), true);
  assert.equal(Array.isArray(data.messages), true);
  assert.equal(Array.isArray(data.snapshots), true);
  assert.equal(Array.isArray(data.transitions), true);
  assert.equal(Array.isArray(data.mockContracts), true);

  const project = data.projects.find((item: any) => item.id === 1);
  assert.ok(project, "missing demo project");
  assert.ok(project.knowledgeBase, "missing project knowledge base");
  assert.ok(Array.isArray(project.knowledgeBase.ontologyTerms) && project.knowledgeBase.ontologyTerms.length >= 2, "missing ontology terms");
  assert.ok(
    project.knowledgeBase.stableRules.some((item: any) => String(item.rule).includes("详情展示默认采用右侧抽屉")),
    "missing stable rule for drawer detail"
  );
  assert.ok(
    project.knowledgeBase.componentInventory.some((item: any) => String(item.component).includes("LeadDetailDrawer")),
    "missing component inventory"
  );
  assert.ok(
    project.knowledgeBase.changePatterns.some((item: any) => String(item.pattern).includes("后续版本优先在列表顶部加增量入口")),
    "missing change pattern"
  );

  const firstIteration = data.iterations.find((item: any) => item.version === "1.0.0");
  const followUpIteration = data.iterations.find((item: any) => item.version === "1.1.0");
  assert.ok(firstIteration, "missing first iteration");
  assert.ok(followUpIteration, "missing follow-up iteration");

  assert.equal(firstIteration.status, "completed");
  assert.equal(firstIteration.continuity.inheritedFromIterationId, null);
  assert.equal(firstIteration.changeControl.artifactWorkflow.activeStage, "archive");
  const firstAnalysis = firstIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "analysis-report");
  assert.ok(firstAnalysis, "missing first analysis artifact");
  assert.equal(firstAnalysis.title, "首版需求分析报告");
  assert.doesNotMatch(firstAnalysis.title, /继承差异|历史版本/);
  assert.deepEqual(
    firstIteration.changeControl.artifactWorkflow.items
      .filter((item: any) => item.gateStatus === "passed")
      .map((item: any) => item.id),
    [
      "analysis-report",
      "product-requirements-doc",
      "boundary-confirmation",
      "prototype-preview",
      "design-spec",
      "technical-architecture",
      "code-delivery",
      "test-matrix",
      "acceptance-checklist",
      "release-review",
      "delivery-package"
    ]
  );
  const firstPrd = firstIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "product-requirements-doc");
  const firstDesignSpec = firstIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "design-spec");
  const firstArchitecture = firstIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "technical-architecture");
  assert.match(String(firstPrd?.draft?.content ?? ""), /问题定义|验收标准/);
  assert.match(String(firstDesignSpec?.draft?.content ?? ""), /布局规则|颜色规则/);
  assert.match(String(firstArchitecture?.draft?.content ?? ""), /数据流|接口边界/);
  assert.match(String(firstAnalysis?.draft?.content ?? ""), /问题定义|交互原则|待确认点/);
  assert.equal(firstIteration.changeControl.changeSource.type, "mixed");
  assert.match(String(firstIteration.changeControl.changeSource.rawInput), /自然语言|文档/);
  assert.ok(firstIteration.changeControl.changeSource.attachments.includes("docs/v1-business-brief.md"));
  assert.deepEqual(firstIteration.changeControl.knowledgeConflicts, []);
  assert.deepEqual(firstIteration.changeControl.normalizedFunctionalPoints, ["线索录入", "状态推进", "跟进记录", "详情抽屉展示"]);
  assert.ok(Array.isArray(firstIteration.changeControl.mappingAuditTrail) && firstIteration.changeControl.mappingAuditTrail.length >= 3);
  assert.ok(
    firstIteration.changeControl.mappingAuditTrail.some(
      (item: any) =>
        item.functionalPoint === "跟进记录" &&
        item.componentRefs.includes("FollowupComposer") &&
        item.impactedArtifacts.includes("code-delivery")
    ),
    "missing first iteration mapping audit for followup flow"
  );
  const firstCode = firstIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "code-delivery");
  const firstRelease = firstIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "release-review");
  const firstArchive = firstIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "delivery-package");
  assert.match(String(firstCode?.draft?.content ?? ""), /export function|详情抽屉/);
  assert.match(String(firstRelease?.draft?.content ?? ""), /发布结论|回滚策略/);
  assert.match(String(firstArchive?.draft?.content ?? ""), /归档内容|基线结论/);

  const firstMessages = data.messages.filter((item: any) => item.iterationId === 1).map((item: any) => String(item.content ?? ""));
  assert.ok(firstMessages.some((text: string) => text.includes("这是首个版本")), "missing first-version kickoff message");
  assert.ok(firstMessages.some((text: string) => text.includes("【交付物引用】首版需求分析报告")), "missing first analysis reference");
  assert.ok(firstMessages.some((text: string) => text.includes("【交付物引用】产品需求文档")), "missing first prd reference");
  assert.ok(firstMessages.some((text: string) => text.includes("【交付物引用】设计规范")), "missing first design spec reference");
  assert.ok(firstMessages.some((text: string) => text.includes("【交付物引用】技术架构")), "missing first architecture reference");
  assert.ok(firstMessages.some((text: string) => text.includes("【交付物引用】交付归档")), "missing archive reference");
  assert.equal(firstMessages.some((text: string) => /继承差异|flow_route|skill-creator/.test(text)), false);

  assert.equal(followUpIteration.status, "in-progress");
  assert.equal(followUpIteration.continuity.inheritedFromIterationId, 1);
  assert.equal(followUpIteration.changeControl.lastOpsRollbackSuggested, true);
  assert.match(followUpIteration.aiSummary, /导出|回滚/);
  const followUpAnalysis = followUpIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "analysis-report");
  const followUpPrd = followUpIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "product-requirements-doc");
  const followUpDesignSpec = followUpIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "design-spec");
  const followUpArchitecture = followUpIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "technical-architecture");
  const followUpBoundary = followUpIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "boundary-confirmation");
  const followUpRelease = followUpIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "release-review");
  assert.equal(followUpAnalysis.title, "继承差异分析报告");
  assert.match(String(followUpPrd?.draft?.content ?? ""), /延期条件|验收标准/);
  assert.match(String(followUpDesignSpec?.draft?.content ?? ""), /变更区域|撤回项/);
  assert.match(String(followUpArchitecture?.draft?.content ?? ""), /导出任务接口|回滚点/);
  assert.match(String(followUpAnalysis?.draft?.content ?? ""), /变更目标|回归关注|待决策项/);
  assert.equal(followUpIteration.changeControl.changeSource.type, "mixed");
  assert.ok(followUpIteration.changeControl.changeSource.attachments.includes("docs/v1_1-change-brief.md"));
  assert.ok(followUpIteration.changeControl.changeSource.attachments.includes("prototype/v1.1-export.html"));
  assert.ok(
    followUpIteration.changeControl.knowledgeHits.some((text: string) => text.includes("后续版本默认局部修改")),
    "missing follow-up knowledge hit"
  );
  assert.ok(
    followUpIteration.changeControl.knowledgeConflicts.some((text: string) => text.includes("通知链路不得阻塞跟进记录保存")),
    "missing follow-up knowledge conflict"
  );
  assert.ok(
    followUpIteration.changeControl.normalizedFunctionalPoints.includes("通知链路回滚"),
    "missing normalized rollback functional point"
  );
  assert.ok(Array.isArray(followUpIteration.changeControl.mappingAuditTrail) && followUpIteration.changeControl.mappingAuditTrail.length >= 4);
  assert.ok(
    followUpIteration.changeControl.mappingAuditTrail.some(
      (item: any) =>
        item.sourceType === "history-reference" &&
        item.functionalPoint === "通知链路回滚" &&
        item.codePaths.includes("apps/api/src/notifications")
    ),
    "missing history-reference rollback mapping"
  );
  const followUpCode = followUpIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "code-delivery");
  const followUpArchive = followUpIteration.changeControl.artifactWorkflow.items.find((item: any) => item.id === "delivery-package");
  assert.match(String(followUpCode?.draft?.content ?? ""), /export async function|mentionFeatureEnabled/);
  assert.match(String(followUpRelease?.draft?.content ?? ""), /发布结论|二次评审前置条件/);
  assert.match(String(followUpArchive?.draft?.content ?? ""), /当前归档物料|下版本候选继承项/);
  assert.match(followUpBoundary.summary, /仅保留导出|@提醒延后/);
  assert.equal(followUpRelease.gateStatus, "failed");

  const followUpMessages = data.messages.filter((item: any) => item.iterationId === 2).map((item: any) => String(item.content ?? ""));
  assert.ok(followUpMessages.some((text: string) => text.includes("我已继承 V1 基线")), "missing inherited-baseline kickoff");
  assert.ok(followUpMessages.some((text: string) => text.includes("【交付物引用】产品需求文档")), "missing follow-up prd reference");
  assert.ok(followUpMessages.some((text: string) => text.includes("【交付物引用】设计规范")), "missing follow-up design spec reference");
  assert.ok(followUpMessages.some((text: string) => text.includes("【交付物引用】技术架构")), "missing follow-up architecture reference");
  assert.ok(followUpMessages.some((text: string) => text.includes("导出")), "missing export discussion");
  assert.ok(followUpMessages.some((text: string) => text.includes("@提醒")), "missing mention discussion");
  assert.ok(followUpMessages.some((text: string) => text.includes("回滚 @提醒")), "missing rollback discussion");
  assert.equal(followUpMessages.some((text: string) => /flow_route|skill-creator/.test(text)), false);

  const rollbackTransition = data.transitions.find(
    (item: any) => item.iterationId === 2 && item.fromStatus === "review" && item.toStatus === "in-progress"
  );
  assert.ok(rollbackTransition, "missing review->in-progress rollback transition");
  assert.match(String(rollbackTransition.reason), /导出|回滚|@提醒/);

  const rollbackSnapshot = data.snapshots.find((item: any) => item.iterationId === 2 && /回滚 @提醒/.test(String(item.note ?? "")));
  assert.ok(rollbackSnapshot, "missing rollback snapshot");

  const contractV1 = data.mockContracts.find((item: any) => item.iterationVersion === "1.0.0");
  const contractV11 = data.mockContracts.find((item: any) => item.iterationVersion === "1.1.0");
  assert.deepEqual(contractV1.expectedMessageSequence, [
    "analysis-report",
    "boundary-confirmation",
    "prototype-preview",
    "code-delivery",
    "test-matrix",
    "release-review",
    "delivery-package"
  ]);
  assert.deepEqual(contractV11.expectedTransitions, ["planned->in-progress", "in-progress->review", "review->in-progress"]);

  assert.ok(Array.isArray(data.projectPolicies) && data.projectPolicies.length > 0, "missing project policy baseline");
  assert.ok(Array.isArray(data.policyExecutionLogs) && data.policyExecutionLogs.length > 0, "missing policy execution logs");
  const skillsEvidence = data.policyExecutionLogs.flatMap((item: any) => item.evidence || []);
  assert.ok(skillsEvidence.some((text: string) => /skills=/.test(text)), "missing Agent+skills evidence");
  assert.equal(skillsEvidence.some((text: string) => /skill-creator|flow_route/.test(text)), false);
});
