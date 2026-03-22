import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modalStylesPath = new URL("../src/styles/modal.css", import.meta.url);
const responsiveStylesPath = new URL("../src/styles/responsive.css", import.meta.url);

test("iteration modal card uses adaptive viewport sizing instead of fixed min-height", () => {
  const styles = readFileSync(modalStylesPath, "utf8");
  const rule = styles.match(/\.iteration-modal-card\s*\{[\s\S]*?\}/);

  assert.ok(rule, "missing .iteration-modal-card rule");
  assert.match(rule[0], /max-height:min\(860px,calc\(100vh - 24px\)\)/, "iteration modal card should cap height with viewport adaptation");
  assert.doesNotMatch(rule[0], /min-height\s*:\s*1072px/, "iteration modal card must not keep a fixed 1072px min-height");
});

test("iteration modal title and mask spacing are adaptive", () => {
  const styles = readFileSync(modalStylesPath, "utf8");

  assert.match(styles, /\.iteration-modal-title h3\s*\{[\s\S]*?font-size:clamp\(20px,2vw,24px\)/, "title must use adaptive but compact font size");
  assert.match(styles, /\.modal-mask\s*\{[\s\S]*?padding:clamp\(12px,4vh,36px\)\s+14px/, "mask padding should adapt with viewport height");
});

test("mobile breakpoint keeps iteration modal usable with compact typography", () => {
  const styles = readFileSync(responsiveStylesPath, "utf8");

  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.iteration-modal-title h3\s*\{[\s\S]*?font-size:21px/, "mobile must reduce modal title size");
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.iteration-modal-actions\s*\{[\s\S]*?flex-wrap:wrap/, "mobile actions must wrap to avoid clipping");
});

test("iteration modal keeps action bar outside scroll region", () => {
  const styles = readFileSync(modalStylesPath, "utf8");

  assert.match(styles, /\.iteration-modal-card\s*\{[\s\S]*?grid-template-rows:auto\s+minmax\(0,1fr\)\s+auto/, "card must reserve a dedicated fixed row for actions");
  assert.doesNotMatch(styles, /\.iteration-modal-actions\s*\{[\s\S]*?position:sticky/, "actions bar should not rely on sticky scrolling behavior");
});
