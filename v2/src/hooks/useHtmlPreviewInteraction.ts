import { useEffect, useRef, useState } from "react";
import type {
  HtmlPreviewInteractionPayload,
  HtmlPreviewHistoryItem,
  IterationVisualEditResponse,
} from "../pages/projects/iterationWorkspacePanelTypes";
import type { UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";

export function useHtmlPreviewInteraction(
  uploadedFile: UploadedAttachmentMeta | null,
  interactionEditMode: boolean,
) {
  const htmlPrototypePreviews = uploadedFile?.htmlPreviews ?? [];
  const htmlPreviewPathsKey = htmlPrototypePreviews.map((item) => item.path).join("|");

  const [selectedHtmlPreviewPath, setSelectedHtmlPreviewPath] = useState("");
  const [hoveredHtmlElement, setHoveredHtmlElement] = useState<HtmlPreviewInteractionPayload | null>(null);
  const [selectedHtmlElement, setSelectedHtmlElement] = useState<HtmlPreviewInteractionPayload | null>(null);
  const [htmlPreviewHistory, setHtmlPreviewHistory] = useState<HtmlPreviewHistoryItem[]>([]);
  const [interactionInstruction, setInteractionInstruction] = useState("");

  const htmlPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const artifactHtmlPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);

  const selectedHtmlPreview =
    htmlPrototypePreviews.find((item) => item.path === selectedHtmlPreviewPath) || htmlPrototypePreviews[0] || null;

  useEffect(() => {
    const previews = uploadedFile?.htmlPreviews ?? [];
    if (previews.length === 0) {
      setSelectedHtmlPreviewPath("");
      setSelectedHtmlElement(null);
      setHoveredHtmlElement(null);
      setHtmlPreviewHistory([]);
      return;
    }
    setSelectedHtmlPreviewPath((prev) => (previews.some((item) => item.path === prev) ? prev : previews[0].path));
  }, [uploadedFile?.iterationId, htmlPreviewPathsKey]);

  useEffect(() => {
    if (interactionEditMode) {
      return;
    }
    setSelectedHtmlElement(null);
    setHoveredHtmlElement(null);
  }, [interactionEditMode]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin && event.origin !== "null") {
        return;
      }
      const data = event.data as
        | {
            source?: string;
            type?: "hover" | "select";
            payload?: HtmlPreviewInteractionPayload;
          }
        | null
        | undefined;
      if (!data || data.source !== "buildwise-html-preview") {
        return;
      }
      if (!interactionEditMode || !data.payload) {
        return;
      }
      if (data.type === "hover") {
        setHoveredHtmlElement(data.payload as HtmlPreviewInteractionPayload);
        return;
      }
      if (data.type === "select") {
        setSelectedHtmlElement(data.payload as HtmlPreviewInteractionPayload);
        setHoveredHtmlElement(data.payload as HtmlPreviewInteractionPayload);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [interactionEditMode]);

  const applyActionsToHtmlContent = (source: string, selector: string, result: IterationVisualEditResponse) => {
    if (!source.trim() || result.actions.length === 0) {
      return source;
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(source, "text/html");
      const target = selector ? doc.querySelector(selector) : null;
      if (!target) {
        return source;
      }
      for (const action of result.actions) {
        if (action.op === "set-text") {
          target.textContent = action.value;
          continue;
        }
        if (action.op === "set-style" || action.op === "resize") {
          if (action.property) {
            (target as HTMLElement).style.setProperty(
              action.property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`),
              action.value
            );
          }
          continue;
        }
        if (action.op === "toggle-visibility") {
          (target as HTMLElement).style.display = action.value === "hidden" ? "none" : "";
        }
      }
      return doc.documentElement.outerHTML;
    } catch (err) {
      console.debug("[useHtmlPreviewInteraction] HTML 编辑失败，返回原始内容", err);
      return source;
    }
  };

  const getActiveHtmlPreviewWindow = (showAnalysisPanel: boolean, selectedArtifactKind: string | null) => {
    if (showAnalysisPanel && selectedArtifactKind === "html-prototype") {
      return artifactHtmlPreviewFrameRef.current?.contentWindow || null;
    }
    return htmlPreviewFrameRef.current?.contentWindow || null;
  };

  const applyHtmlActionsToPreview = (selector: string, result: IterationVisualEditResponse, showAnalysisPanel: boolean, selectedArtifactKind: string | null) => {
    const frameWindow = getActiveHtmlPreviewWindow(showAnalysisPanel, selectedArtifactKind);
    if (!frameWindow || result.actions.length === 0) {
      return;
    }
    frameWindow.postMessage(
      {
        source: "buildwise-visual-edit-host",
        type: "apply-actions",
        payload: {
          selector,
          actions: result.actions
        }
      },
      "*" // srcdoc iframe has origin "null", targetOrigin must be "*"; security enforced by source field check on receive side
    );
  };

  return {
    htmlPrototypePreviews,
    selectedHtmlPreviewPath, setSelectedHtmlPreviewPath,
    hoveredHtmlElement, setHoveredHtmlElement,
    selectedHtmlElement, setSelectedHtmlElement,
    htmlPreviewHistory, setHtmlPreviewHistory,
    interactionInstruction, setInteractionInstruction,
    htmlPreviewFrameRef,
    artifactHtmlPreviewFrameRef,
    selectedHtmlPreview,
    applyActionsToHtmlContent,
    getActiveHtmlPreviewWindow,
    applyHtmlActionsToPreview,
  };
}
