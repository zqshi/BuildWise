import { useCallback } from "react";
import type {
  IterationVisualEditResponse
} from "../../domain/workspace/types";
import type {
  PrototypeElement
} from "./iterationWorkspacePanelTypes";
import type { Dispatch, SetStateAction } from "react";

type SendInteractionDeps = {
  interactionEditMode: boolean;
  showInteractionPanel: boolean;
  showAnalysisPanel: boolean;
  selectedArtifactKind: string | null;
  selectedHtmlElement: { selector: string; tag: string; text: string; styles: Record<string, string> } | null;
  selectedHtmlPreview: { path: string; content: string } | null;
  selectedDrawerArtifact: { id: string } | null;
  selectedArtifactHtmlContent: string;
  selectedPrototypeElement: PrototypeElement | null;
  selectedImagePreview: { name: string; path: string } | null;
  selectedImageRegion: { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number } | null;
  selectedImagePoint: { xPercent: number; yPercent: number } | null;
  imageSelectionSummary: string;
  htmlPreviewHistory: Array<{ path: string; artifactId?: string; content: string; selector: string; text: string; styles: Record<string, string> }>;
  setHtmlPreviewHistory: Dispatch<SetStateAction<Array<{ path: string; artifactId?: string; content: string; selector: string; text: string; styles: Record<string, string> }>>>;
  applyActionsToHtmlContent: (src: string, selector: string, result: IterationVisualEditResponse) => string;
  applyHtmlActionsToPreview: (selector: string, result: IterationVisualEditResponse, showPanel: boolean, kind: string | null) => void;
  getActiveHtmlPreviewWindow: (showPanel: boolean, kind: string | null) => Window | null;
  applyPrototypeInstruction: (instruction: string) => { summary: string };
  onChatSend: (opts?: {
    overrideText?: string;
    prototypeTarget?: string | null;
    prototypeSummary?: string;
    interactionContext?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: { selector?: string; tag?: string; text?: string; styles?: Record<string, string> };
    };
  }) => Promise<IterationVisualEditResponse | null>;
  onSaveArtifactDraft: (id: string, payload: { content: string; media?: string[]; actor?: string }) => void | Promise<void>;
  onPatchUploadedHtmlPreview?: (path: string, content: string) => void;
};

export function useInteractionInstruction(deps: SendInteractionDeps) {
  const handleUndoHtmlPreview = useCallback(() => {
    const latest = deps.htmlPreviewHistory[0];
    if (!latest) return;
    const frameWindow = deps.getActiveHtmlPreviewWindow(deps.showAnalysisPanel, deps.selectedArtifactKind);
    if (!frameWindow) return;
    frameWindow.postMessage({
      source: "buildwise-visual-edit-host",
      type: "restore-snapshot",
      payload: { selector: latest.selector, snapshot: { text: latest.text, styles: latest.styles } }
    }, "*");
    if (latest.artifactId) {
      void deps.onSaveArtifactDraft(latest.artifactId, { content: latest.content, actor: "BuildWise Agent" });
    } else if (latest.path) {
      deps.onPatchUploadedHtmlPreview?.(latest.path, latest.content);
    }
    deps.setHtmlPreviewHistory((prev) => prev.slice(1));
  }, [deps.htmlPreviewHistory, deps.showAnalysisPanel, deps.selectedArtifactKind]);

  const sendInteractionInstruction = useCallback(async (instruction: string) => {
    const text = instruction.trim();
    if (!text) return;

    const htmlInteractionInDrawer = deps.showAnalysisPanel && deps.selectedArtifactKind === "html-prototype" && deps.selectedDrawerArtifact;
    const htmlInteractionEnabled = deps.interactionEditMode && (deps.showInteractionPanel || htmlInteractionInDrawer);
    const htmlInteractionSource = htmlInteractionInDrawer ? deps.selectedArtifactHtmlContent : deps.selectedHtmlPreview?.content || "";
    const htmlInteractionPath = htmlInteractionInDrawer ? "" : deps.selectedHtmlPreview?.path || "";

    // undo shortcut
    if (htmlInteractionEnabled && /撤销|回退/.test(text) && deps.htmlPreviewHistory.length > 0) {
      handleUndoHtmlPreview();
      await deps.onChatSend({
        overrideText: text,
        prototypeTarget: deps.selectedHtmlElement?.selector || "当前元素",
        prototypeSummary: "已撤销上一步预览修改",
        interactionContext: { mode: "html", target: deps.selectedHtmlElement?.selector || "当前元素", summary: "undo-last-step" }
      });
      return;
    }

    // HTML element editing
    if (htmlInteractionEnabled && htmlInteractionSource && deps.selectedHtmlElement) {
      const el = deps.selectedHtmlElement;
      const summary = `selector=${el.selector}; tag=${el.tag}; text=${el.text || "无"}; color=${el.styles.color}; bg=${el.styles.backgroundColor}; fontSize=${el.styles.fontSize}`;
      const result = await deps.onChatSend({
        overrideText: text,
        prototypeTarget: el.selector || el.tag,
        prototypeSummary: summary,
        interactionContext: { mode: "html", target: el.selector || el.tag, summary, html: { selector: el.selector, tag: el.tag, text: el.text, styles: el.styles } }
      });
      if (result?.actions?.length) {
        const nextContent = deps.applyActionsToHtmlContent(htmlInteractionSource, el.selector, result);
        if (nextContent !== htmlInteractionSource) {
          if (htmlInteractionInDrawer && deps.selectedDrawerArtifact) {
            await deps.onSaveArtifactDraft(deps.selectedDrawerArtifact.id, { content: nextContent, actor: "BuildWise Agent" });
          } else if (htmlInteractionPath) {
            deps.onPatchUploadedHtmlPreview?.(htmlInteractionPath, nextContent);
          }
        }
        deps.setHtmlPreviewHistory((prev) => [{
          path: htmlInteractionPath,
          artifactId: htmlInteractionInDrawer && deps.selectedDrawerArtifact ? deps.selectedDrawerArtifact.id : undefined,
          content: htmlInteractionSource,
          selector: el.selector,
          text: el.text,
          styles: { color: el.styles.color, backgroundColor: el.styles.backgroundColor, fontSize: el.styles.fontSize, fontWeight: el.styles.fontWeight }
        }, ...prev].slice(0, 20));
        deps.applyHtmlActionsToPreview(el.selector, result, deps.showAnalysisPanel, deps.selectedArtifactKind);
      }
      return;
    }

    // Image region editing
    if (deps.showInteractionPanel && deps.interactionEditMode && deps.selectedImagePreview && (deps.selectedImageRegion || deps.selectedImagePoint)) {
      const summary = `${deps.imageSelectionSummary}; 文件=${deps.selectedImagePreview.path}`;
      await deps.onChatSend({
        overrideText: text, prototypeTarget: `截图:${deps.selectedImagePreview.name}`, prototypeSummary: summary,
        interactionContext: { mode: "image", target: `截图:${deps.selectedImagePreview.name}`, summary }
      });
      return;
    }

    // Prototype element editing
    if (deps.showInteractionPanel && deps.selectedPrototypeElement) {
      const result = deps.applyPrototypeInstruction(text);
      await deps.onChatSend({
        overrideText: text, prototypeTarget: deps.selectedPrototypeElement.label, prototypeSummary: result.summary,
        interactionContext: { mode: "prototype", target: deps.selectedPrototypeElement.label, summary: result.summary }
      });
      return;
    }

    // Plain text send
    await deps.onChatSend({ overrideText: text });
  }, [deps, handleUndoHtmlPreview]);

  return { sendInteractionInstruction, handleUndoHtmlPreview };
}
