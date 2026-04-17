import { useCallback } from "react";
import type { IterationArtifactWorkflowItem } from "../domain/workspace/types";
import {
  buildArtifactCommitSummary,
  buildArtifactRevisionPrompt,
  resolveArtifactActionErrorMessage,
  shouldCloseDrawerAfterRevisionRequest,
} from "../pages/projects/artifactEditorModel";

type ArtifactEditorActionsDeps = {
  selectedDrawerArtifact: IterationArtifactWorkflowItem | null;
  artifactEditorValue: string;
  artifactEditorDirty: boolean;
  artifactEditorBusy: boolean;
  chatInput: string;
  setArtifactEditorBusy: (v: boolean) => void;
  setArtifactEditorDirty: (v: boolean) => void;
  setArtifactEditorMode: (v: "view" | "edit") => void;
  setChangeControlNotice: (v: string) => void;
  setAnalysisDrawerArtifactId: (v: string | null) => void;
  onSaveArtifactDraft: (artifactId: string, payload: { content: string; media?: string[]; actor?: string }) => void | Promise<void>;
  onCommitArtifact: (artifactId: string, payload: { actor?: string; summary?: string; evidence?: string[]; source?: string }) => void | Promise<void>;
  onConfirmArtifact: (artifactId: string, payload: { actor?: string; passed?: boolean; note?: string }) => void | Promise<void>;
  onConfirmAnalysis?: () => void | Promise<void>;
  onTriggerCoachFollowUp?: (message: string) => void | Promise<void>;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
  onChatInputChange: (v: string) => void;
  chatComposerInputRef: React.RefObject<HTMLTextAreaElement | null>;
};

async function autoCommitAndConfirm(deps: ArtifactEditorActionsDeps) {
  const artifact = deps.selectedDrawerArtifact!;
  if (artifact.outputVersion === 0 && (artifact.draft?.content || "").trim().length > 0) {
    await deps.onCommitArtifact(artifact.id, {
      actor: "BuildWise Agent",
      summary: buildArtifactCommitSummary(artifact.draft?.content || artifact.summary || "", artifact.summary),
    });
  }
  await deps.onConfirmArtifact(artifact.id, { actor: "项目负责人", passed: true, note: artifact.summary });
  if (artifact.id === "analysis-report" && deps.onConfirmAnalysis) {
    await deps.onConfirmAnalysis();
  } else if (deps.onTriggerCoachFollowUp) {
    await deps.onTriggerCoachFollowUp(`我已确认「${artifact.title}」，请继续推进下一步。`);
  }
}

async function saveDraftAndCommit(deps: ArtifactEditorActionsDeps) {
  const artifact = deps.selectedDrawerArtifact!;
  if (deps.artifactEditorDirty) {
    await deps.onSaveArtifactDraft(artifact.id, { content: deps.artifactEditorValue, actor: "BuildWise Agent" });
  }
  await deps.onCommitArtifact(artifact.id, {
    actor: "BuildWise Agent",
    summary: buildArtifactCommitSummary(deps.artifactEditorValue || artifact.summary || "", artifact.summary),
  });
  deps.setArtifactEditorDirty(false);
  deps.setArtifactEditorMode("view");
}

function focusChatComposer(ref: React.RefObject<HTMLTextAreaElement | null>) {
  requestAnimationFrame(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(ref.current.value.length, ref.current.value.length);
  });
}

export function useArtifactEditorActions(deps: ArtifactEditorActionsDeps) {
  const handleSaveArtifactEditor = useCallback(async () => {
    if (!deps.selectedDrawerArtifact || !deps.artifactEditorDirty || deps.artifactEditorBusy) return;
    deps.setArtifactEditorBusy(true);
    try {
      await deps.onSaveArtifactDraft(deps.selectedDrawerArtifact.id, { content: deps.artifactEditorValue, actor: "BuildWise Agent" });
      deps.setArtifactEditorDirty(false);
      deps.setChangeControlNotice("交付物正文已保存。");
    } catch (error) {
      deps.setChangeControlNotice(resolveArtifactActionErrorMessage(error, "交付物正文保存失败，请稍后重试。"));
    } finally {
      deps.setArtifactEditorBusy(false);
    }
  }, [deps.selectedDrawerArtifact, deps.artifactEditorValue, deps.artifactEditorDirty, deps.artifactEditorBusy]);

  const handleSubmitArtifactForReview = useCallback(async () => {
    if (!deps.selectedDrawerArtifact || deps.artifactEditorBusy) return;
    deps.setArtifactEditorBusy(true);
    try {
      await saveDraftAndCommit(deps);
      deps.setChangeControlNotice("交付物已提交，等待你确认。");
    } catch (error) {
      deps.setChangeControlNotice(resolveArtifactActionErrorMessage(error, "交付物提交失败，请稍后重试。"));
    } finally {
      deps.setArtifactEditorBusy(false);
    }
  }, [deps.selectedDrawerArtifact, deps.artifactEditorValue, deps.artifactEditorDirty, deps.artifactEditorBusy]);

  const handleConfirmSelectedArtifact = useCallback(async () => {
    if (!deps.selectedDrawerArtifact || deps.artifactEditorBusy) return;
    deps.setArtifactEditorBusy(true);
    try {
      await autoCommitAndConfirm(deps);
      deps.setChangeControlNotice("分析已确认。");
    } catch (error) {
      deps.setChangeControlNotice(resolveArtifactActionErrorMessage(error, "分析确认失败，请稍后重试。"));
    } finally {
      deps.setArtifactEditorBusy(false);
    }
  }, [deps.selectedDrawerArtifact, deps.artifactEditorBusy]);

  const handleRequestArtifactRevision = useCallback(() => {
    if (!deps.selectedDrawerArtifact) return;
    deps.onChatInputChange(buildArtifactRevisionPrompt(deps.selectedDrawerArtifact.title, deps.chatInput));
    if (shouldCloseDrawerAfterRevisionRequest()) {
      deps.onCloseAnalysisPanel();
    } else {
      deps.setAnalysisDrawerArtifactId(deps.selectedDrawerArtifact.id);
      deps.onOpenAnalysisPanel();
    }
    deps.setArtifactEditorMode("view");
    deps.setChangeControlNotice("已带入对话输入框，可直接继续补充修改意见。");
    focusChatComposer(deps.chatComposerInputRef);
  }, [deps.selectedDrawerArtifact, deps.chatInput]);

  return { handleSaveArtifactEditor, handleSubmitArtifactForReview, handleConfirmSelectedArtifact, handleRequestArtifactRevision };
}
