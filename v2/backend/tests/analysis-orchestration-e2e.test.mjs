import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { analyzeAttachmentOp } from "../dist/application/workspace/analysis/analysisOps.js";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const COMPACT_EXCERPT =
  "本项目旨在构建一个统一的项目管理平台，支持多租户隔离、迭代管理、需求追踪和自动化分析。" +
  "核心模块包括项目创建、迭代规划、附件上传与分析、质量门禁和交付包生成。";

const COMPACT_INPUT = {
  fileName: "requirement.md",
  mimeType: "text/markdown",
  size: Buffer.byteLength(COMPACT_EXCERPT, "utf8"),
  excerpt: COMPACT_EXCERPT
};

const noopTransition = () => ({ ok: true });

// ────────────────────────────────────────────────────────────────
// LLM unavailable — must throw, not produce fake analysis
// ────────────────────────────────────────────────────────────────

describe("analyzeAttachmentOp — LLM unavailable", () => {
  test("null agentRunner throws LlmUnavailableError (no heuristic fallback)", async () => {
    const repo = createInMemoryWorkspaceRepo();
    const project = repo.createProject({
      name: "test",
      description: "d",
      tenantId: "t1",
      ownerUserId: "u1"
    });
    const iteration = repo.createIteration(project.id, {
      name: "iter",
      description: "d"
    });

    await assert.rejects(
      () => analyzeAttachmentOp(repo, null, noopTransition, iteration.id, COMPACT_INPUT),
      (err) => {
        assert.ok(err.message.includes("LLM is not configured"), `unexpected message: ${err.message}`);
        return true;
      }
    );
  });
});

// ────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────

describe("analyzeAttachmentOp — edge cases", () => {
  test("non-existent iteration returns null without throwing", async () => {
    const repo = createInMemoryWorkspaceRepo();

    const report = await analyzeAttachmentOp(
      repo,
      null,
      noopTransition,
      999,
      COMPACT_INPUT
    );

    assert.equal(report, null);
  });
});
