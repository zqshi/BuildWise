import test from "node:test";
import assert from "node:assert/strict";

const {
  inferCyclePhase,
  shouldUseCompactSingleFileAnalysis,
} = await import("../dist/application/workspace/shared/supportAgent.js");

// ─── 1. inferCyclePhase ─────────────────────────────────────────────

test('inferCyclePhase: "planned" → "scope-clarified"', () => {
  assert.equal(inferCyclePhase("planned"), "scope-clarified");
});

test('inferCyclePhase: "in-progress" → "build-in-progress"', () => {
  assert.equal(inferCyclePhase("in-progress"), "build-in-progress");
});

test('inferCyclePhase: "review" → "qa-review"', () => {
  assert.equal(inferCyclePhase("review"), "qa-review");
});

test('inferCyclePhase: "completed" → "ready-for-release"', () => {
  assert.equal(inferCyclePhase("completed"), "ready-for-release");
});

test('inferCyclePhase: "blocked" → "task-planning"', () => {
  assert.equal(inferCyclePhase("blocked"), "task-planning");
});

test('inferCyclePhase: unknown status falls back to "task-planning"', () => {
  assert.equal(inferCyclePhase("something-unknown"), "task-planning");
});

// ─── 2. shouldUseCompactSingleFileAnalysis ──────────────────────────

test("shouldUseCompactSingleFileAnalysis: all conditions met → true", () => {
  const result = shouldUseCompactSingleFileAnalysis({
    attachmentSignals: {
      sourceType: "single-file",
      totalFiles: 1,
      hasDocumentEvidence: true,
      hasPrototypeEvidence: false,
    },
  });
  assert.equal(result, true);
});

test('shouldUseCompactSingleFileAnalysis: sourceType "folder" → false', () => {
  const result = shouldUseCompactSingleFileAnalysis({
    attachmentSignals: {
      sourceType: "folder",
      totalFiles: 1,
      hasDocumentEvidence: true,
      hasPrototypeEvidence: false,
    },
  });
  assert.equal(result, false);
});

test("shouldUseCompactSingleFileAnalysis: totalFiles > 1 → false", () => {
  const result = shouldUseCompactSingleFileAnalysis({
    attachmentSignals: {
      sourceType: "single-file",
      totalFiles: 2,
      hasDocumentEvidence: true,
      hasPrototypeEvidence: false,
    },
  });
  assert.equal(result, false);
});

test("shouldUseCompactSingleFileAnalysis: hasDocumentEvidence false → false", () => {
  const result = shouldUseCompactSingleFileAnalysis({
    attachmentSignals: {
      sourceType: "single-file",
      totalFiles: 1,
      hasDocumentEvidence: false,
      hasPrototypeEvidence: false,
    },
  });
  assert.equal(result, false);
});

test("shouldUseCompactSingleFileAnalysis: hasPrototypeEvidence true → false", () => {
  const result = shouldUseCompactSingleFileAnalysis({
    attachmentSignals: {
      sourceType: "single-file",
      totalFiles: 1,
      hasDocumentEvidence: true,
      hasPrototypeEvidence: true,
    },
  });
  assert.equal(result, false);
});

test("shouldUseCompactSingleFileAnalysis: no attachmentSignals → false", () => {
  assert.equal(shouldUseCompactSingleFileAnalysis({}), false);
});
