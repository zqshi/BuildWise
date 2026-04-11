import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { ALLOWED_EXECUTION_STATUSES } from "../../domain/workspace/iterationTypes";
import type { IterationChangeBoundary } from "../../domain/workspace/types";
import { normalizeIteration } from "./workspaceSupport";
import { defaultIterationChangeControl, resolveClarificationSelection, writeAuditLog } from "./workspaceServiceCommon";
import { extractKnowledgeBaseUpdateOp } from "./ontologyService";
import { detectOntologyCollisionsOp } from "./ontologyCollisionDetector";
import { syncProjectWorkspaceKnowledge } from "./projectWorkspaceKnowledgeService";
import {
  ensureArtifactWorkflow,
  markDownstreamStale,
  summarizeMatrixExecution,
  type TestMatrixExecutionUpdate
} from "./workspaceServiceChangeControlArtifactWorkflow";
import { publishArtifactReferenceMessage, publishChangeImpactMessage } from "./workspaceArtifactConversationPolicy";

function mergeAcceptanceChecks(...sources: Array<string[] | undefined>) {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }
    for (const rawItem of source) {
      const item = rawItem.trim();
      if (!item || seen.has(item)) {
        continue;
      }
      seen.add(item);
      merged.push(item);
    }
  }
  return merged;
}

export function getIterationChangeControlOp(repo: WorkspaceRepository, iterationId: number) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  normalized.changeControl = {
    ...current,
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  repo.updateIteration(normalized);
  return normalized.changeControl ?? null;
}

export function confirmIterationAnalysisOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: {
    accurate: boolean;
    note?: string;
    actor?: string;
    force?: boolean;
    boundary?: Partial<IterationChangeBoundary>;
    resolvedClarificationQuestions?: string[];
  }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return { ok: false as const, reason: "iteration_not_found" };
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const note = input.note?.trim() || "";
  const acceptanceChecks = mergeAcceptanceChecks(
    normalized.scope.acceptanceCriteria,
    current?.qualityArtifacts?.acceptanceChecklist || [],
    current?.executableConstraints?.acceptanceChecks || []
  );
  const resolution = resolveClarificationSelection(
    Array.isArray(current?.clarificationQuestions) ? current.clarificationQuestions : [],
    input.resolvedClarificationQuestions ??
      (Array.isArray(current?.clarificationDraftResolvedQuestions) ? current?.clarificationDraftResolvedQuestions : []),
    now
  );
  if (!input.accurate) {
    normalized.changeControl = {
      ...current,
      pendingHumanConfirmation: true,
      clarificationRounds: (current?.clarificationRounds || 0) + 1,
      clarificationQuestions: Array.isArray(current?.clarificationQuestions) ? current.clarificationQuestions : [],
      clarificationDraftResolvedQuestions: resolution.resolvedQuestions,
      clarificationDraftUpdatedAt: now,
      lastClarificationResolution: resolution,
      lastClarificationNote: note,
      confirmedAt: "",
      confirmedBy: "",
      artifactWorkflow: ensureArtifactWorkflow(
        normalized,
        {
          ...current,
          pendingHumanConfirmation: true
        },
        now
      )
    };
    repo.updateIteration(normalized);
    writeAuditLog(repo, "iteration_analysis_clarification_requested", `iteration:${iterationId}`, note || "用户要求继续澄清附件分析结果");
    return { ok: true as const, data: normalized.changeControl };
  }

  if (current.lastReportPublishable === false && current.lastAnalysisAt && !input.force) {
    return {
      ok: false as const,
      reason: "report_not_publishable",
      quality: {
        score: current.lastReportQualityScore,
        summary: current.lastReportQualitySummary
      }
    };
  }
  if (resolution.unresolvedQuestions.length > 0) {
    return {
      ok: false as const,
      reason: "clarification_questions_unresolved",
      unresolvedQuestions: resolution.unresolvedQuestions
    };
  }

  const boundary = input.boundary;
  normalized.changeControl = {
    ...current,
    pendingHumanConfirmation: false,
    clarificationQuestions: [],
    clarificationDraftResolvedQuestions: [],
    clarificationDraftUpdatedAt: now,
    lastClarificationResolution: resolution,
    lastClarificationNote: note,
    confirmedAt: now,
    confirmedBy: input.actor?.trim() || "human",
    boundary: {
      requirementRefs: Array.isArray(boundary?.requirementRefs)
        ? boundary.requirementRefs.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.requirementRefs || [],
      componentRefs: Array.isArray(boundary?.componentRefs)
        ? boundary.componentRefs.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.componentRefs || [],
      codePaths: Array.isArray(boundary?.codePaths)
        ? boundary.codePaths.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.codePaths || [],
      note: boundary?.note?.trim() || current?.boundary.note || "",
      updatedAt: now
    },
    executableConstraints: {
      componentWhitelist: Array.isArray(boundary?.componentRefs)
        ? boundary.componentRefs.map((item) => item.trim()).filter(Boolean)
        : current?.executableConstraints?.componentWhitelist || [],
      codePathWhitelist: Array.isArray(boundary?.codePaths)
        ? boundary.codePaths.map((item) => item.trim()).filter(Boolean)
        : current?.executableConstraints?.codePathWhitelist || [],
      acceptanceChecks,
      generatedAt: now
    },
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  const analysisItem = normalized.changeControl.artifactWorkflow.items.find((item) => item.id === "analysis-report");
  if (analysisItem) {
    analysisItem.gateStatus = "passed";
    analysisItem.lastConfirmedBy = normalized.changeControl.confirmedBy;
    analysisItem.lastConfirmedAt = now;
    analysisItem.outputVersion += 1;
    analysisItem.updatedAt = now;
    analysisItem.stale = false;
    const staleAfterAnalysis = markDownstreamStale(normalized.changeControl.artifactWorkflow.items, analysisItem.id);
    if (staleAfterAnalysis.length > 0) publishChangeImpactMessage(repo, iterationId, staleAfterAnalysis);
  }
  writeAuditLog(repo, "iteration_analysis_confirmed", `iteration:${iterationId}`, `confirmedBy=${normalized.changeControl.confirmedBy}`);

  // 知识沉淀：通过 OntologyService 填充 KB 全部 7 字段 + 碰撞检测
  const domainEntries = normalized.changeControl.domainKnowledgeEntries;
  if (Array.isArray(domainEntries) && domainEntries.length > 0) {
    const project = repo.findProject(normalized.projectId);
    if (project) {
      const kb = project.knowledgeBase ?? {
        ontologyTerms: [],
        stableRules: [],
        componentInventory: [],
        codeMap: [],
        decisionLog: [],
        knownRisks: [],
        changePatterns: [],
        updatedAt: ""
      };

      // 碰撞检测 — 填充 knowledgeHits / knowledgeConflicts / termCollisions
      const collisions = detectOntologyCollisionsOp(kb, domainEntries);
      normalized.changeControl.knowledgeHits = collisions.knowledgeHits;
      normalized.changeControl.knowledgeConflicts = [
        ...collisions.knowledgeConflicts,
        ...collisions.termCollisions.map((tc) =>
          `术语碰撞：「${tc.newTerm}」(${tc.newDefinition}) 与已有规则「${tc.existingRule}」可能矛盾`
        )
      ];

      // 构建 OntologyInput — 从 changeControl 中提取可用的 traceability/boundary 数据
      const boundary = normalized.changeControl.boundary;
      const riskAreas = (normalized.changeControl as Record<string, unknown>).knownRisks;
      const traceabilitySnapshot = normalized.changeControl.traceabilitySnapshot;
      const traceabilityMap = traceabilitySnapshot
        ? {
            pages: (boundary?.requirementRefs || []).map((req) => ({
              name: req,
              path: req,
              components: boundary?.componentRefs || []
            })),
            apis: domainEntries
              .filter((e) => e.mappedApis.length > 0)
              .map((e) => ({
                path: e.mappedApis[0] || e.term,
                method: "GET",
                description: e.term
              })),
            entities: domainEntries
              .filter((e) => e.mappedEntities.length > 0)
              .map((e) => ({ name: e.term, fields: e.mappedEntities }))
          }
        : null;
      const ontologyResult = extractKnowledgeBaseUpdateOp(kb, {
        domainKnowledgeEntries: domainEntries,
        traceabilityMap,
        boundary: {
          codePaths: boundary?.codePaths || [],
          requirementRefs: boundary?.requirementRefs || [],
          riskAreas: Array.isArray(riskAreas) ? riskAreas as Array<{ risk: string; mitigation: string; trigger: string }> : undefined
        },
        analysisReport: null
      });

      repo.updateProject({ ...project, knowledgeBase: ontologyResult.updatedKb });
      syncProjectWorkspaceKnowledge(repo, normalized.projectId);
      writeAuditLog(
        repo,
        "project_knowledge_base_updated",
        `project:${normalized.projectId}`,
        `terms=${ontologyResult.updatedKb.ontologyTerms.length};rules=${ontologyResult.updatedKb.stableRules.length};components=${ontologyResult.updatedKb.componentInventory.length};hits=${collisions.knowledgeHits.length};conflicts=${collisions.knowledgeConflicts.length}`
      );
    }
  }
  repo.updateIteration(normalized);

  // 分析确认后，为当前阶段已就绪的交付物发布引用消息到对话流
  const confirmedWorkflow = normalized.changeControl?.artifactWorkflow;
  if (confirmedWorkflow) {
    for (const artifact of confirmedWorkflow.items) {
      if (artifact.status === "ready" && artifact.gateStatus === "passed") {
        publishArtifactReferenceMessage(repo, iterationId, {
          title: artifact.title,
          summary: artifact.summary || artifact.description,
          evidence: artifact.evidence,
          draftContent: artifact.draft?.content || "",
          prompt: `请围绕交付物「${artifact.title}」继续与用户确认，不要直接跨阶段推进。`
        });
      }
    }
  }

  return { ok: true as const, data: normalized.changeControl };
}

export function updateIterationBoundaryOp(repo: WorkspaceRepository, iterationId: number, input: Partial<IterationChangeBoundary>) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const acceptanceChecks = mergeAcceptanceChecks(
    normalized.scope.acceptanceCriteria,
    current?.qualityArtifacts?.acceptanceChecklist || [],
    current?.executableConstraints?.acceptanceChecks || []
  );
  normalized.changeControl = {
    ...current,
    boundary: {
      requirementRefs: Array.isArray(input.requirementRefs)
        ? input.requirementRefs.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.requirementRefs || [],
      componentRefs: Array.isArray(input.componentRefs)
        ? input.componentRefs.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.componentRefs || [],
      codePaths: Array.isArray(input.codePaths)
        ? input.codePaths.map((item) => item.trim()).filter(Boolean)
        : current?.boundary.codePaths || [],
      note: input.note?.trim() || current?.boundary.note || "",
      updatedAt: now
    },
    executableConstraints: {
      componentWhitelist: Array.isArray(input.componentRefs)
        ? input.componentRefs.map((item) => item.trim()).filter(Boolean)
        : current?.executableConstraints?.componentWhitelist || [],
      codePathWhitelist: Array.isArray(input.codePaths)
        ? input.codePaths.map((item) => item.trim()).filter(Boolean)
        : current?.executableConstraints?.codePathWhitelist || [],
      acceptanceChecks,
      generatedAt: now
    },
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  const boundaryItem = normalized.changeControl.artifactWorkflow.items.find((item) => item.id === "boundary-confirmation");
  if (boundaryItem) {
    boundaryItem.outputVersion += 1;
    boundaryItem.updatedAt = now;
    const staleAfterBoundary = markDownstreamStale(normalized.changeControl.artifactWorkflow.items, boundaryItem.id);
    if (staleAfterBoundary.length > 0) publishChangeImpactMessage(repo, iterationId, staleAfterBoundary);
  }
  repo.updateIteration(normalized);
  writeAuditLog(repo, "iteration_change_boundary_updated", `iteration:${iterationId}`, normalized.changeControl?.boundary.note || "updated");
  return normalized.changeControl ?? defaultIterationChangeControl();
}

export function updateClarificationDraftOp(repo: WorkspaceRepository, iterationId: number, resolvedQuestions: string[]) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const allowedQuestions = Array.isArray(current.clarificationQuestions) ? current.clarificationQuestions : [];
  const selected = Array.isArray(resolvedQuestions)
    ? resolvedQuestions.map((item) => item.trim()).filter((item) => item.length > 0)
    : [];
  const selectedSet = new Set(selected);
  const filtered = allowedQuestions.filter((item) => selectedSet.has(item));
  normalized.changeControl = {
    ...current,
    clarificationDraftResolvedQuestions: filtered,
    clarificationDraftUpdatedAt: now,
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "iteration_clarification_draft_updated", `iteration:${iterationId}`, `resolved=${filtered.length};total=${allowedQuestions.length}`);
  return normalized.changeControl;
}

export function updateIterationTestMatrixExecutionOp(
  repo: WorkspaceRepository,
  iterationId: number,
  updates: TestMatrixExecutionUpdate[]
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return { ok: false as const, reason: "iteration_not_found" };
  }
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const matrix = Array.isArray(current.generatedTestMatrix) ? current.generatedTestMatrix : [];
  if (matrix.length === 0) {
    return { ok: false as const, reason: "test_matrix_missing" };
  }

  const normalizedUpdates = Array.isArray(updates)
    ? updates
        .map((item) => ({
          caseId: typeof item?.caseId === "string" ? item.caseId.trim() : "",
          status: typeof item?.status === "string" ? item.status.trim().toLowerCase() : "",
          by: typeof item?.by === "string" ? item.by.trim() : "",
          note: typeof item?.note === "string" ? item.note.trim() : ""
        }))
        .filter((item) => item.caseId.length > 0)
    : [];

  if (normalizedUpdates.length === 0 || normalizedUpdates.some((item) => !ALLOWED_EXECUTION_STATUSES.has(item.status))) {
    return { ok: false as const, reason: "invalid_updates" };
  }

  const existingIds = new Set(matrix.map((item) => item.caseId).filter(Boolean));
  const missingCaseIds = normalizedUpdates
    .map((item) => item.caseId)
    .filter((caseId, index, arr) => arr.indexOf(caseId) === index && !existingIds.has(caseId));
  if (missingCaseIds.length > 0) {
    return { ok: false as const, reason: "case_not_found", missingCaseIds };
  }

  const now = new Date().toISOString();
  const updateMap = new Map(normalizedUpdates.map((item) => [item.caseId, item]));
  const updatedMatrix = matrix.map((item) => {
    const update = updateMap.get(item.caseId);
    if (!update) {
      return item;
    }
    return {
      ...item,
      executionStatus: update.status as "pending" | "passed" | "failed" | "blocked" | "skipped",
      executionUpdatedAt: now,
      executionBy: update.by || "qa",
      executionNote: update.note || ""
    };
  });

  normalized.changeControl = {
    ...current,
    generatedTestMatrix: updatedMatrix,
    testMatrixExecutionUpdatedAt: now,
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  const matrixItem = normalized.changeControl.artifactWorkflow.items.find((item) => item.id === "test-matrix");
  if (matrixItem) {
    matrixItem.outputVersion += 1;
    matrixItem.updatedAt = now;
    const staleAfterMatrix = markDownstreamStale(normalized.changeControl.artifactWorkflow.items, matrixItem.id);
    if (staleAfterMatrix.length > 0) publishChangeImpactMessage(repo, iterationId, staleAfterMatrix);
  }
  repo.updateIteration(normalized);

  const summary = summarizeMatrixExecution(updatedMatrix);
  writeAuditLog(
    repo,
    "iteration_test_matrix_execution_updated",
    `iteration:${iterationId}`,
    `updated=${normalizedUpdates.length};executed=${summary.executed};coverage=${summary.coverage};passRate=${summary.passRate}`
  );
  return { ok: true as const, data: normalized.changeControl, summary };
}
