import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { IterationArtifactStage } from '../../../domain/workspace/types';
import { normalizeIteration } from '../shared/workspaceSupport';
import { defaultIterationChangeControl, writeAuditLog } from '../shared/common';
import { artifactStageOrder, ensureArtifactWorkflow, markDownstreamStale } from './artifactWorkflow';
import { publishArtifactReferenceMessage, publishChangeImpactMessage } from './conversationPolicy';


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
  // 纯读取：计算 workflow 视图但不写回数据库，避免并发覆盖
  return ensureArtifactWorkflow(normalized, current, now);
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
  const ARTIFACT_CONTENT_LIMIT = 256000;
  const rawContent = input.content.trim();
  item.draft = {
    content: rawContent.slice(0, ARTIFACT_CONTENT_LIMIT),
    media: Array.isArray(input.media) ? input.media.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 24) : [],
    updatedAt: now,
    updatedBy: input.actor?.trim() || "human"
  };
  if (rawContent.length > ARTIFACT_CONTENT_LIMIT) {
    writeAuditLog(repo, "iteration_artifact_draft_truncated", `iteration:${iterationId}`, `artifact=${artifactId};originalLen=${rawContent.length};limit=${ARTIFACT_CONTENT_LIMIT}`);
  }
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
  const staleAfterCommit = markDownstreamStale(workflow.items, artifactId);
  if (staleAfterCommit.length > 0) publishChangeImpactMessage(repo, iterationId, staleAfterCommit);
  normalized.changeControl = { ...current, artifactWorkflow: workflow };
  repo.updateIteration(normalized);
  publishArtifactReferenceMessage(repo, iterationId, {
    title: item.title,
    summary: item.summary,
    evidence: item.evidence,
    prompt: `交付物「${item.title}」已提交（版本 ${item.outputVersion}），请继续推进后续环节。`,
    draftContent: item.draft.content
  });
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
  const created = publishArtifactReferenceMessage(repo, iterationId, {
    title: item.title,
    summary: item.summary,
    evidence: item.evidence,
    prompt: input.prompt?.trim() || "请基于该交付物继续推进下一步，并明确影响范围。",
    draftContent: item.draft.content
  });
  if (created) {
    writeAuditLog(repo, "iteration_artifact_added_to_chat", `iteration:${iterationId}`, `artifact=${artifactId};messageId=${created.id}`);
  }
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
  if (toIndex <= fromIndex) {
    return {
      ok: false as const,
      reason: "invalid_stage_order",
      expectedNext: artifactStageOrder[fromIndex + 1] || fromStage
    };
  }
  // 只检查当前阶段的门禁，允许跨阶段前进
  // 空门禁阶段（如 interaction）没有已提交交付物，不应阻断推进
  // 已提交交付物的门禁状态和 stale 状态仍需检查
  const blockers: string[] = [];
  const fromStageItems = workflow.items.filter((item) => item.stage === fromStage);
  const committedItems = fromStageItems.filter((item) => item.outputVersion > 0);
  for (const item of committedItems) {
    if (item.gateStatus !== "passed") {
      blockers.push(`「${item.title}」门禁尚未通过`);
    }
    if (item.stale) {
      blockers.push(`「${item.title}」因上游变更需要更新`);
    }
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
    publishArtifactReferenceMessage(repo, iterationId, {
      title: item.title,
      summary: item.summary,
      evidence: item.evidence,
      prompt: "已进入新阶段，请先确认该交付物内容后继续执行。",
      draftContent: item.draft.content
    });
  }
  writeAuditLog(
    repo,
    "iteration_artifact_stage_transitioned",
    `iteration:${iterationId}`,
    `from=${fromStage};to=${toStage};inputVersion=${inheritedInputVersion};by=${input.actor || "human"};note=${input.note || ""}`
  );
  return { ok: true as const, workflow };
}
