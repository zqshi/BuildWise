import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEvidenceSignal,
  buildLabeledSignal,
  formatSignalItems
} from "../src/pages/projects/iterationWorkspaceSignalPresenter.ts";

test("formatSignalItems joins non-empty values with full-width separator", () => {
  assert.equal(formatSignalItems([" 阻断一 ", "", "阻断二 "]), "阻断一；阻断二");
});

test("formatSignalItems returns fallback when no values exist", () => {
  assert.equal(formatSignalItems([], "-"), "-");
  assert.equal(formatSignalItems(undefined, "-"), "-");
});

test("buildLabeledSignal returns empty string for empty values", () => {
  assert.equal(buildLabeledSignal("阻断项", []), "");
});

test("buildLabeledSignal formats hint text consistently", () => {
  assert.equal(buildLabeledSignal("阻断项", ["门禁失败", "回滚未验证"]), "阻断项：门禁失败；回滚未验证");
});

test("buildEvidenceSignal normalizes missing evidence", () => {
  assert.equal(buildEvidenceSignal("sync_status=ok"), "evidence：sync_status=ok");
  assert.equal(buildEvidenceSignal(""), "evidence：-");
});
