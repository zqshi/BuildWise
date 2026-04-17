import { useEffect, useMemo, useRef, useState } from "react";
import type { Iteration, ArtifactPreviewKind } from "../pages/projects/iterationWorkspacePanelTypes";
import { extractArtifactPrototypeHtml } from "../pages/projects/artifactEditorModel";
import { resolveArtifactPreviewKind, instrumentHtmlPreview } from "../pages/projects/iterationWorkspacePanelUtils";
import { parseAnalysisArtifactSections } from "../pages/projects/analysisArtifactPresenter";
import type { UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";

/* ── sub-hook: 制品选择 & 派生数据 ── */

function useArtifactSelection(
  currentIteration: Iteration | null,
  selectedHtmlPreview: UploadedAttachmentMeta["htmlPreviews"][number] | null,
  interactionEditMode: boolean,
) {
  const artifactItems = currentIteration?.changeControl?.artifactWorkflow?.items || [];
  const activeArtifactStage = currentIteration?.changeControl?.artifactWorkflow?.activeStage || "clarification";

  const [analysisDrawerArtifactId, setAnalysisDrawerArtifactId] = useState<string | null>(null);

  const artifactMap = useMemo(() => new Map(artifactItems.map((item) => [item.id, item])), [artifactItems]);
  const selectedDrawerArtifact = analysisDrawerArtifactId ? artifactMap.get(analysisDrawerArtifactId) || null : null;
  const selectedArtifactKind = selectedDrawerArtifact ? resolveArtifactPreviewKind(selectedDrawerArtifact.id) : null;
  const artifactDraftContent = selectedDrawerArtifact?.draft?.content || "";

  const editableTextArtifactKinds: ArtifactPreviewKind[] = [
    "product-requirements-doc", "design-spec", "technical-architecture", "document",
  ];
  const isEditableTextArtifact = selectedArtifactKind ? editableTextArtifactKinds.includes(selectedArtifactKind) : false;
  const artifactEditorSource = isEditableTextArtifact ? artifactDraftContent || selectedDrawerArtifact?.summary || "" : artifactDraftContent;

  const extractedHtml = useMemo(() => extractArtifactPrototypeHtml(artifactDraftContent), [artifactDraftContent]);
  const selectedArtifactHtmlContent =
    selectedArtifactKind === "html-prototype" ? (extractedHtml || selectedHtmlPreview?.content || "") : "";
  const selectedArtifactHtmlPreview = useMemo(
    () => (selectedArtifactKind === "html-prototype" && selectedArtifactHtmlContent ? instrumentHtmlPreview(selectedArtifactHtmlContent, interactionEditMode) : ""),
    [selectedArtifactKind, selectedArtifactHtmlContent, interactionEditMode],
  );
  const analysisDraftSections = useMemo(
    () => (selectedArtifactKind === "analysis-report" ? parseAnalysisArtifactSections(artifactDraftContent) : []),
    [selectedArtifactKind, artifactDraftContent],
  );

  const selectedArtifactAwaitingConfirmation = Boolean(
    selectedDrawerArtifact &&
    selectedDrawerArtifact.gateStatus !== "passed" &&
    (selectedDrawerArtifact.id === "analysis-report" ||
     selectedDrawerArtifact.outputVersion > 0 ||
     (selectedDrawerArtifact.draft?.content || "").trim().length > 0),
  );
  const canEditSelectedTextArtifact = isEditableTextArtifact && selectedDrawerArtifact?.editCapability !== "none";

  return {
    artifactItems, activeArtifactStage,
    analysisDrawerArtifactId, setAnalysisDrawerArtifactId,
    artifactMap, selectedDrawerArtifact, selectedArtifactKind, artifactDraftContent,
    isEditableTextArtifact, artifactEditorSource,
    selectedArtifactHtmlContent, selectedArtifactHtmlPreview, analysisDraftSections,
    selectedArtifactAwaitingConfirmation, canEditSelectedTextArtifact,
  };
}

/* ── sub-hook: 编辑器状态 & 副作用 ── */

function useArtifactEditor(
  currentIteration: Iteration | null,
  selectedDrawerArtifact: ReturnType<typeof useArtifactSelection>["selectedDrawerArtifact"],
  artifactEditorSource: string,
  setAnalysisDrawerArtifactId: (id: string | null) => void,
) {
  const [artifactEditorValue, setArtifactEditorValue] = useState("");
  const [artifactEditorDirty, setArtifactEditorDirty] = useState(false);
  const [artifactEditorBusy, setArtifactEditorBusy] = useState(false);
  const [artifactEditorMode, setArtifactEditorMode] = useState<"view" | "edit">("view");

  useEffect(() => {
    setArtifactEditorValue(artifactEditorSource);
    setArtifactEditorDirty(false);
    setArtifactEditorMode("view");
  }, [selectedDrawerArtifact?.id, artifactEditorSource]);

  const prevIterationIdRef = useRef(currentIteration?.id);
  useEffect(() => {
    const nextId = currentIteration?.id;
    const prevId = prevIterationIdRef.current;
    prevIterationIdRef.current = nextId;
    if (nextId !== undefined && prevId !== undefined && nextId !== prevId) {
      setAnalysisDrawerArtifactId(null);
    }
  }, [currentIteration?.id, setAnalysisDrawerArtifactId]);

  return {
    artifactEditorValue, setArtifactEditorValue,
    artifactEditorDirty, setArtifactEditorDirty,
    artifactEditorBusy, setArtifactEditorBusy,
    artifactEditorMode, setArtifactEditorMode,
  };
}

/* ── 组合 hook：保持原始返回结构 ── */

export function useArtifactEditorState(
  currentIteration: Iteration | null,
  selectedHtmlPreview: UploadedAttachmentMeta["htmlPreviews"][number] | null,
  interactionEditMode: boolean,
) {
  const selection = useArtifactSelection(currentIteration, selectedHtmlPreview, interactionEditMode);
  const editor = useArtifactEditor(
    currentIteration,
    selection.selectedDrawerArtifact,
    selection.artifactEditorSource,
    selection.setAnalysisDrawerArtifactId,
  );

  return { ...selection, ...editor };
}
