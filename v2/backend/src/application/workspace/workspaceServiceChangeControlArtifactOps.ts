import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { IterationArtifactStage } from "../../domain/workspace/types";
import { normalizeIteration } from "./workspaceSupport";
import { defaultIterationChangeControl, writeAuditLog } from "./workspaceServiceCommon";
import { artifactStageOrder, ensureArtifactWorkflow, markDownstreamStale } from "./workspaceServiceChangeControlArtifactWorkflow";

function resolveArtifactKindLabel(artifactId: string) {
  if (artifactId === "prototype-preview") return "html-prototype";
  if (artifactId === "code-delivery") return "code";
  if (artifactId === "test-matrix" || artifactId === "acceptance-checklist") return "test-cases";
  if (artifactId === "release-review") return "release-review";
  if (artifactId === "delivery-package") return "delivery-package";
  return "document";
}

function buildArtifactReferenceMessage(
  item: {
    id: string;
    stage: string;
    title: string;
    status: string;
    gateStatus: string;
    summary: string;
    evidence: string[];
  },
  prompt: string
) {
  const evidence = item.evidence.map((entry) => entry.trim()).filter(Boolean);
  const summary = item.summary.trim();
  return [
    `【交付物引用】${item.title}`,
    `摘要：${summary || "请打开交付物查看详情。"}`,
    evidence.length > 0 ? `关注点：${evidence.slice(0, 3).join("；")}` : "",
    prompt
  ]
    .filter(Boolean)
    .join("\n");
}

function notifyAdminConfirmation(
  repo: WorkspaceRepository,
  iterationId: number,
  payload: {
    title: string;
    stage: string;
    reason: string;
    note?: string;
  }
) {
  const note = payload.note?.trim();
  repo.createMessage(
    iterationId,
    "system",
    [
      "【管理员确认请求】",
      `交付物：${payload.title}（${payload.stage}）`,
      `原因：${payload.reason}`,
      note ? `补充：${note}` : "",
      "请项目管理员在对话中回复：管理员确认 通过/驳回 + 说明。"
    ]
      .filter(Boolean)
      .join("\n")
  );
}

export function getIterationArtifactWorkflowOp(repo: WorkspaceRepository, iterationId: number) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  normalized.changeControl = {
    ...current,
    artifactWorkflow: ensureArtifactWorkflow(normalized, current, now)
  };
  repo.updateIteration(normalized);
  return normalized.changeControl.artifactWorkflow;
}

export function saveIterationArtifactDraftOp(
  repo: WorkspaceRepository,
  iterationId: number,
  artifactId: string,
  input: { content: string; media?: string[]; actor?: string }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const workflow = ensureArtifactWorkflow(normalized, current, now);
  const item = workflow.items.find((entry) => entry.id === artifactId);
  if (!item) return undefined;
  item.draft = {
    content: input.content.trim().slice(0, 8000),
    media: Array.isArray(input.media) ? input.media.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 24) : [],
    updatedAt: now,
    updatedBy: input.actor?.trim() || "human"
  };
  item.status = item.outputVersion > 0 ? "ready" : "partial";
  item.updatedAt = now;
  normalized.changeControl = {
    ...current,
    artifactWorkflow: workflow
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "iteration_artifact_draft_saved", `iteration:${iterationId}`, `artifact=${artifactId}`);
  return workflow;
}

export function commitIterationArtifactOp(
  repo: WorkspaceRepository,
  iterationId: number,
  artifactId: string,
  input: { actor?: string; summary?: string; evidence?: string[]; source?: string }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const workflow = ensureArtifactWorkflow(normalized, current, now);
  const item = workflow.items.find((entry) => entry.id === artifactId);
  if (!item) return undefined;
  item.summary = input.summary?.trim() || item.summary || item.draft.content.slice(0, 220);
  if (Array.isArray(input.evidence)) {
    item.evidence = input.evidence.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 20);
  }
  if (input.source?.trim()) {
    item.source = input.source.trim();
  }
  item.outputVersion += 1;
  item.status = "ready";
  item.gateStatus = "pending";
  item.stale = false;
  item.updatedAt = now;
  markDownstreamStale(workflow.items, artifactId);
  normalized.changeControl = { ...current, artifactWorkflow: workflow };
  repo.updateIteration(normalized);
  repo.createMessage(
    iterationId,
    "assistant",
    buildArtifactReferenceMessage(item, "请查看并确认该交付物；如需修改可直接在交付物抽屉编辑后再确认。")
  );
  writeAuditLog(repo, "iteration_artifact_committed", `iteration:${iterationId}`, `artifact=${artifactId};version=${item.outputVersion}`);
  return workflow;
}

export function confirmIterationArtifactOp(
  repo: WorkspaceRepository,
  iterationId: number,
  artifactId: string,
  input: { actor?: string; passed?: boolean; note?: string }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const workflow = ensureArtifactWorkflow(normalized, current, now);
  const item = workflow.items.find((entry) => entry.id === artifactId);
  if (!item) return undefined;
  item.gateStatus = input.passed === false ? "blocked" : "passed";
  item.lastConfirmedBy = input.actor?.trim() || "human";
  item.lastConfirmedAt = now;
  if (input.note?.trim()) {
    item.summary = input.note.trim();
  }
  item.status = input.passed === false ? "partial" : "ready";
  item.updatedAt = now;
  item.stale = false;
  normalized.changeControl = { ...current, artifactWorkflow: workflow };
  repo.updateIteration(normalized);
  if (input.passed === false) {
    notifyAdminConfirmation(repo, iterationId, {
      title: item.title,
      stage: item.stage,
      reason: "交付物确认被阻断，需管理员裁决是否继续推进。",
      note: input.note
    });
  }
  writeAuditLog(repo, "iteration_artifact_confirmed", `iteration:${iterationId}`, `artifact=${artifactId};gate=${item.gateStatus}`);
  return workflow;
}

export function appendIterationArtifactToConversationOp(
  repo: WorkspaceRepository,
  iterationId: number,
  artifactId: string,
  input: { actor?: string; prompt?: string }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const workflow = ensureArtifactWorkflow(normalized, current, new Date().toISOString());
  const item = workflow.items.find((entry) => entry.id === artifactId);
  if (!item) return undefined;
  const message = buildArtifactReferenceMessage(item, input.prompt?.trim() || "请基于该交付物继续推进下一步，并明确影响范围。");
  const created = repo.createMessage(iterationId, "assistant", message);
  writeAuditLog(repo, "iteration_artifact_added_to_chat", `iteration:${iterationId}`, `artifact=${artifactId};messageId=${created.id}`);
  return { workflow, message: created };
}

export function transitionIterationArtifactStageOp(
  repo: WorkspaceRepository,
  iterationId: number,
  toStage: IterationArtifactStage,
  input: { actor?: string; note?: string }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return { ok: false as const, reason: "iteration_not_found" };
  const normalized = normalizeIteration(iteration);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  const now = new Date().toISOString();
  const workflow = ensureArtifactWorkflow(normalized, current, now);
  const fromStage = workflow.activeStage;
  const fromIndex = artifactStageOrder.indexOf(fromStage);
  const toIndex = artifactStageOrder.indexOf(toStage);
  if (toIndex < 0 || fromIndex < 0) {
    return { ok: false as const, reason: "invalid_stage" };
  }
  if (toIndex !== fromIndex + 1) {
    return {
      ok: false as const,
      reason: "invalid_stage_order",
      expectedNext: artifactStageOrder[fromIndex + 1] || fromStage
    };
  }
  const blockers: string[] = [];
  const fromStageItems = workflow.items.filter((item) => item.stage === fromStage);
  if (fromStageItems.some((item) => item.gateStatus !== "passed")) {
    blockers.push(`stage ${fromStage} gate not passed`);
  }
  if (fromStageItems.some((item) => item.stale)) {
    blockers.push(`stage ${fromStage} has stale artifacts`);
  }
  if (fromStageItems.some((item) => item.outputVersion <= 0)) {
    blockers.push(`stage ${fromStage} has no committed output`);
  }
  if (blockers.length > 0) {
    notifyAdminConfirmation(repo, iterationId, {
      title: `${fromStage} 阶段`,
      stage: fromStage,
      reason: blockers.join("；"),
      note: input.note
    });
    return { ok: false as const, reason: "upstream_gate_not_passed", blockers };
  }
  const inheritedInputVersion = fromStageItems.reduce((max, item) => Math.max(max, item.outputVersion), 0);
  for (const item of workflow.items) {
    if (item.stage === toStage) {
      item.inputVersionRef = Math.max(item.inputVersionRef, inheritedInputVersion);
      item.updatedAt = now;
    }
  }
  workflow.activeStage = toStage;
  workflow.updatedAt = now;
  normalized.changeControl = { ...current, artifactWorkflow: workflow };
  repo.updateIteration(normalized);
  const toStageItems = workflow.items.filter((item) => item.stage === toStage);
  for (const item of toStageItems) {
    repo.createMessage(
      iterationId,
      "assistant",
      buildArtifactReferenceMessage(item, "已进入新阶段，请先确认该交付物内容后继续执行。")
    );
  }
  writeAuditLog(
    repo,
    "iteration_artifact_stage_transitioned",
    `iteration:${iterationId}`,
    `from=${fromStage};to=${toStage};inputVersion=${inheritedInputVersion};by=${input.actor || "human"};note=${input.note || ""}`
  );
  return { ok: true as const, workflow };
}
