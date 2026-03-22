import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelPath = new URL("../src/pages/projects/IterationWorkspacePanel.tsx", import.meta.url);
const stylesPath = new URL("../src/styles/deliverable-preview.css", import.meta.url);
const previewPanelPath = new URL("../src/pages/projects/ArtifactPreviewPanel.tsx", import.meta.url);
const reviewFooterPath = new URL("../src/pages/projects/ArtifactReviewFooter.tsx", import.meta.url);
const composerPath = new URL("../src/pages/projects/ChatComposer.tsx", import.meta.url);
const drawerContentPath = new URL("../src/pages/projects/AnalysisDrawerContent.tsx", import.meta.url);

test("artifact drawer uses flat content layout without nested stage cards", () => {
  const previewSource = readFileSync(previewPanelPath, "utf8");
  const footerSource = readFileSync(reviewFooterPath, "utf8");
  const drawerSource = readFileSync(drawerContentPath, "utf8");

  assert.match(footerSource, /className="artifact-review-footer"/, "artifact drawer should use a footer confirmation area");
  assert.match(previewSource, /showTitle=\{false\}/, "artifact drawer should suppress duplicate inline editor titles");
  assert.match(previewSource, /profile="prd"/, "prd drawer should pass document profile for structured viewing");
  assert.match(previewSource, /profile="design-spec"/, "design spec drawer should pass document profile for structured viewing");
  assert.match(previewSource, /profile="technical-architecture"/, "technical architecture drawer should pass document profile for structured viewing");
  assert.doesNotMatch(drawerSource, /deliverable-stage-view/, "artifact drawer should not wrap content in nested deliverable stage cards");
  assert.doesNotMatch(drawerSource, /artifact-review-stage/, "artifact confirmation should not render as a separate nested card");
  assert.doesNotMatch(drawerSource, />分析报告抽屉</, "artifact drawer should not render an extra nested section title for analysis");
});

test("artifact drawer styles define flat structured content and footer", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(styles, /\.artifact-drawer-structured-content,\s*\.artifact-drawer-composer\s*\{[\s\S]*?display:grid/, "drawer content should use flat structured layout helpers");
  assert.match(styles, /\.artifact-review-footer\s*\{[\s\S]*?border-top:1px solid var\(--border-default\)/, "review footer should be a flat footer separated by a top border");
  assert.doesNotMatch(styles, /\.deliverable-stage-view\s*\{/, "legacy nested stage card styles should be removed");
});

test("chat composer only surfaces transient send feedback", () => {
  const source = readFileSync(composerPath, "utf8");

  assert.match(source, /chatSendStatus === "sending" \|\| chatSendStatus === "failed"/, "composer should only show sending and failed statuses");
  assert.match(source, /chatSendStatus === "sending" \? "发送中\.\.\." : "发送失败，请重试"/, "composer should not render a sent label after successful send");
  assert.doesNotMatch(source, /chatSendStatus === "sent" \? "已发送"/, "composer should not show a sent confirmation label");
});
