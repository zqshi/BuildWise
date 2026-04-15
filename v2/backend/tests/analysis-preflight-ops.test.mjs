import { describe, test } from "node:test";
import assert from "node:assert/strict";

const {
  parseExecutionPolicyCandidate,
  resolveExecutionPolicyHeuristically,
  listExecutionPolicyMissingReasons,
  parseFolderSelectionCandidate,
  listFolderSelectionMissingReasons
} = await import(
  "../dist/application/workspace/analysis/preflightOps.js"
);

// ─── parseExecutionPolicyCandidate ───

describe("parseExecutionPolicyCandidate", () => {
  test("valid JSON with all fields returns parsed object", () => {
    const content = JSON.stringify({
      degraded: true,
      reason: "token limit exceeded",
      enforceSingleAgent: false,
      forceMultiAgent: true,
      promptBudgetRisk: "high"
    });
    const result = parseExecutionPolicyCandidate(content);
    assert.equal(result.degraded, true);
    assert.equal(result.reason, "token limit exceeded");
    assert.equal(result.enforceSingleAgent, false);
    assert.equal(result.forceMultiAgent, true);
    assert.equal(result.promptBudgetRisk, "high");
  });

  test("invalid promptBudgetRisk falls back to medium", () => {
    const content = JSON.stringify({
      degraded: false,
      reason: "ok",
      enforceSingleAgent: true,
      forceMultiAgent: false,
      promptBudgetRisk: "critical"
    });
    const result = parseExecutionPolicyCandidate(content);
    assert.equal(result.promptBudgetRisk, "medium");
  });

  test("empty/garbage content returns default structure", () => {
    const result = parseExecutionPolicyCandidate("not json at all ~~~");
    assert.equal(result.degraded, false);
    assert.equal(result.reason, "");
    assert.equal(result.enforceSingleAgent, false);
    assert.equal(result.forceMultiAgent, false);
    assert.equal(result.promptBudgetRisk, "medium");
  });

  test("JSON embedded in markdown code fence is extracted", () => {
    const content = [
      "Here is the result:",
      "```json",
      JSON.stringify({
        degraded: false,
        reason: "within budget",
        enforceSingleAgent: true,
        forceMultiAgent: false,
        promptBudgetRisk: "low"
      }),
      "```"
    ].join("\n");
    const result = parseExecutionPolicyCandidate(content);
    assert.equal(result.reason, "within budget");
    assert.equal(result.enforceSingleAgent, true);
    assert.equal(result.promptBudgetRisk, "low");
  });
});

// ─── resolveExecutionPolicyHeuristically ───

describe("resolveExecutionPolicyHeuristically", () => {
  test("simple single-file within bounds returns policy with degraded false", () => {
    const result = resolveExecutionPolicyHeuristically({
      sourceType: "single-file",
      excerptLength: 5000,
      chunkCount: 1,
      totalFiles: 1,
      binaryFiles: 0
    });
    assert.notEqual(result, null);
    assert.equal(result.degraded, false);
    assert.equal(result.enforceSingleAgent, true);
    assert.equal(result.forceMultiAgent, false);
    assert.equal(result.promptBudgetRisk, "low");
  });

  test("forceMultiAgentHint true returns null", () => {
    const result = resolveExecutionPolicyHeuristically({
      sourceType: "single-file",
      excerptLength: 5000,
      chunkCount: 1,
      totalFiles: 1,
      binaryFiles: 0,
      forceMultiAgentHint: true
    });
    assert.equal(result, null);
  });

  test("sourceType folder returns null", () => {
    const result = resolveExecutionPolicyHeuristically({
      sourceType: "folder",
      excerptLength: 5000,
      chunkCount: 1,
      totalFiles: 1,
      binaryFiles: 0
    });
    assert.equal(result, null);
  });

  test("totalFiles > 1 returns null", () => {
    const result = resolveExecutionPolicyHeuristically({
      sourceType: "single-file",
      excerptLength: 5000,
      chunkCount: 1,
      totalFiles: 2,
      binaryFiles: 0
    });
    assert.equal(result, null);
  });

  test("excerptLength 0 returns null", () => {
    const result = resolveExecutionPolicyHeuristically({
      sourceType: "single-file",
      excerptLength: 0,
      chunkCount: 1,
      totalFiles: 1,
      binaryFiles: 0
    });
    assert.equal(result, null);
  });

  test("excerptLength > 12000 returns null", () => {
    const result = resolveExecutionPolicyHeuristically({
      sourceType: "single-file",
      excerptLength: 12001,
      chunkCount: 1,
      totalFiles: 1,
      binaryFiles: 0
    });
    assert.equal(result, null);
  });

  test("chunkCount > 1 returns null", () => {
    const result = resolveExecutionPolicyHeuristically({
      sourceType: "single-file",
      excerptLength: 5000,
      chunkCount: 2,
      totalFiles: 1,
      binaryFiles: 0
    });
    assert.equal(result, null);
  });

  test("binaryFiles > 0 returns null", () => {
    const result = resolveExecutionPolicyHeuristically({
      sourceType: "single-file",
      excerptLength: 5000,
      chunkCount: 1,
      totalFiles: 1,
      binaryFiles: 1
    });
    assert.equal(result, null);
  });
});

// ─── listExecutionPolicyMissingReasons ───

describe("listExecutionPolicyMissingReasons", () => {
  test("valid candidate returns empty array", () => {
    const candidate = {
      degraded: false,
      reason: "all good",
      enforceSingleAgent: true,
      forceMultiAgent: false,
      promptBudgetRisk: "low"
    };
    assert.deepEqual(listExecutionPolicyMissingReasons(candidate), []);
  });

  test("empty reason includes missing reason message", () => {
    const candidate = {
      degraded: false,
      reason: "",
      enforceSingleAgent: false,
      forceMultiAgent: false,
      promptBudgetRisk: "medium"
    };
    const reasons = listExecutionPolicyMissingReasons(candidate);
    assert.ok(reasons.some((r) => r.includes("执行策略原因缺失")));
  });

  test("enforceSingleAgent + forceMultiAgent both true includes conflict message", () => {
    const candidate = {
      degraded: false,
      reason: "some reason",
      enforceSingleAgent: true,
      forceMultiAgent: true,
      promptBudgetRisk: "high"
    };
    const reasons = listExecutionPolicyMissingReasons(candidate);
    assert.ok(reasons.some((r) => r.includes("冲突")));
  });
});

// ─── parseFolderSelectionCandidate ───

describe("parseFolderSelectionCandidate", () => {
  test("valid JSON returns parsed object", () => {
    const content = JSON.stringify({
      includedPaths: ["src/index.ts", "src/app.ts"],
      ignoredFiles: [{ path: "dist/bundle.js", reason: "build artifact" }],
      sampleReason: "main source files"
    });
    const result = parseFolderSelectionCandidate(content);
    assert.deepEqual(result.includedPaths, ["src/index.ts", "src/app.ts"]);
    assert.equal(result.ignoredFiles.length, 1);
    assert.equal(result.ignoredFiles[0].path, "dist/bundle.js");
    assert.equal(result.sampleReason, "main source files");
  });

  test("empty content returns defaults", () => {
    const result = parseFolderSelectionCandidate("");
    assert.deepEqual(result.includedPaths, []);
    assert.deepEqual(result.ignoredFiles, []);
    assert.equal(result.sampleReason, "");
  });

  test("large arrays are truncated to limits", () => {
    const paths = Array.from({ length: 1000 }, (_, i) => `file-${i}.ts`);
    const ignored = Array.from({ length: 500 }, (_, i) => ({
      path: `ignored-${i}.ts`,
      reason: "not needed"
    }));
    const content = JSON.stringify({ includedPaths: paths, ignoredFiles: ignored });
    const result = parseFolderSelectionCandidate(content);
    assert.equal(result.includedPaths.length, 800);
    assert.equal(result.ignoredFiles.length, 400);
  });
});

// ─── listFolderSelectionMissingReasons ───

describe("listFolderSelectionMissingReasons", () => {
  test("has includedPaths returns empty array", () => {
    const candidate = { includedPaths: ["src/index.ts"], ignoredFiles: [], sampleReason: "" };
    assert.deepEqual(listFolderSelectionMissingReasons(candidate), []);
  });

  test("empty includedPaths includes missing message", () => {
    const candidate = { includedPaths: [], ignoredFiles: [], sampleReason: "" };
    const reasons = listFolderSelectionMissingReasons(candidate);
    assert.ok(reasons.length > 0);
    assert.ok(reasons.some((r) => r.includes("已选文件路径为空")));
  });
});
