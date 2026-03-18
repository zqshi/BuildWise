import { useEffect, useRef, useState } from "react";
import type {
  HtmlPreviewInteractionPayload,
  HtmlPreviewHistoryItem,
  IterationVisualEditResponse,
} from "./iterationWorkspacePanelTypes";
import type { ArtifactPreviewKind } from "./iterationWorkspacePanelTypes";

export type HtmlPreviewInteractionState = {
  hoveredHtmlElement: HtmlPreviewInteractionPayload | null;
  setHoveredHtmlElement: React.Dispatch<React.SetStateAction<HtmlPreviewInteractionPayload | null>>;
  selectedHtmlElement: HtmlPreviewInteractionPayload | null;
  setSelectedHtmlElement: React.Dispatch<React.SetStateAction<HtmlPreviewInteractionPayload | null>>;
  htmlPreviewHistory: HtmlPreviewHistoryItem[];
  setHtmlPreviewHistory: React.Dispatch<React.SetStateAction<HtmlPreviewHistoryItem[]>>;
  htmlPreviewFrameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  artifactHtmlPreviewFrameRef: React.MutableRefObject<HTMLIFrameElement | null>;
  applyActionsToHtmlContent: (source: string, selector: string, result: IterationVisualEditResponse) => string;
  getActiveHtmlPreviewWindow: () => WindowProxy | null;
  applyHtmlActionsToPreview: (selector: string, result: IterationVisualEditResponse) => void;
  handleUndoHtmlPreview: () => void;
};

export function useHtmlPreviewInteraction(
  interactionEditMode: boolean,
  showAnalysisPanel: boolean,
  selectedArtifactKind: ArtifactPreviewKind | null,
  onSaveArtifactDraft: (artifactId: string, payload: { content: string; media?: string[]; actor?: string }) => void | Promise<void>,
  onPatchUploadedHtmlPreview?: (path: string, content: string) => void,
): HtmlPreviewInteractionState {
  const [hoveredHtmlElement, setHoveredHtmlElement] = useState<HtmlPreviewInteractionPayload | null>(null);
  const [selectedHtmlElement, setSelectedHtmlElement] = useState<HtmlPreviewInteractionPayload | null>(null);
  const [htmlPreviewHistory, setHtmlPreviewHistory] = useState<HtmlPreviewHistoryItem[]>([]);
  const htmlPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const artifactHtmlPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);

  /* ── iframe postMessage listener ── */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
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

  const applyActionsToHtmlContent = (source: string, selector: string, result: IterationVisualEditResponse): string => {
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
              action.value,
            );
          }
          continue;
        }
        if (action.op === "toggle-visibility") {
          (target as HTMLElement).style.display = action.value === "hidden" ? "none" : "";
        }
      }
      return doc.documentElement.outerHTML;
    } catch {
      return source;
    }
  };

  const getActiveHtmlPreviewWindow = (): WindowProxy | null => {
    if (showAnalysisPanel && selectedArtifactKind === "html-prototype") {
      return artifactHtmlPreviewFrameRef.current?.contentWindow || null;
    }
    return htmlPreviewFrameRef.current?.contentWindow || null;
  };

  const applyHtmlActionsToPreview = (selector: string, result: IterationVisualEditResponse) => {
    const frameWindow = getActiveHtmlPreviewWindow();
    if (!frameWindow || result.actions.length === 0) {
      return;
    }
    frameWindow.postMessage(
      {
        source: "buildwise-visual-edit-host",
        type: "apply-actions",
        payload: {
          selector,
          actions: result.actions,
        },
      },
      "*",
    );
  };

  const handleUndoHtmlPreview = () => {
    const latest = htmlPreviewHistory[0];
    if (!latest) {
      return;
    }
    const frameWindow = getActiveHtmlPreviewWindow();
    if (!frameWindow) {
      return;
    }
    frameWindow.postMessage(
      {
        source: "buildwise-visual-edit-host",
        type: "restore-snapshot",
        payload: {
          selector: latest.selector,
          snapshot: {
            text: latest.text,
            styles: latest.styles,
          },
        },
      },
      "*",
    );
    if (latest.artifactId) {
      void onSaveArtifactDraft(latest.artifactId, { content: latest.content, actor: "OpenClaw Agent" });
    } else if (latest.path) {
      onPatchUploadedHtmlPreview?.(latest.path, latest.content);
    }
    setHtmlPreviewHistory((prev) => prev.slice(1));
  };

  return {
    hoveredHtmlElement,
    setHoveredHtmlElement,
    selectedHtmlElement,
    setSelectedHtmlElement,
    htmlPreviewHistory,
    setHtmlPreviewHistory,
    htmlPreviewFrameRef,
    artifactHtmlPreviewFrameRef,
    applyActionsToHtmlContent,
    getActiveHtmlPreviewWindow,
    applyHtmlActionsToPreview,
    handleUndoHtmlPreview,
  };
}
