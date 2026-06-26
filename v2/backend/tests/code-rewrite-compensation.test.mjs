import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const { applyRewriteEditsAtomic } = await import(
  "../dist/application/workspace/quality/codeRewriteOps.js"
);

function setupRepo(files) {
  const repoPath = mkdtempSync(join(tmpdir(), "bw-rewrite-"));
  for (const [path, content] of Object.entries(files)) {
    const abs = join(repoPath, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf-8");
  }
  return repoPath;
}

function ctx(repoPath, candidateFiles, boundaryCodePaths, maxFiles = 6) {
  return {
    projectId: 1, repoPath, boundaryCodePaths,
    acceptanceCriteria: [], acceptanceChecks: [],
    candidateFiles, fileSnippets: [], maxFiles,
  };
}

const realFs = { read: (p) => readFileSync(p, "utf-8"), write: (p, c) => writeFileSync(p, c, "utf-8") };

test("全部成功 → 无回滚，rolledBackFiles 空，文件已更新", () => {
  const repoPath = setupRepo({ "src/a.ts": "old-a", "src/b.ts": "old-b" });
  try {
    const result = applyRewriteEditsAtomic({
      rawEdits: [
        { path: "src/a.ts", reason: "r", content: "new-a" },
        { path: "src/b.ts", reason: "r", content: "new-b" },
      ],
      ctx: ctx(repoPath, ["src/a.ts", "src/b.ts"], ["src/a.ts", "src/b.ts"], 6),
      dryRun: false, fs: realFs,
    });
    assert.equal(result.rolledBackFiles.length, 0);
    assert.deepEqual(result.appliedFiles, ["src/a.ts", "src/b.ts"]);
    assert.equal(readFileSync(join(repoPath, "src/a.ts"), "utf-8"), "new-a");
    assert.equal(readFileSync(join(repoPath, "src/b.ts"), "utf-8"), "new-b");
  } finally { rmSync(repoPath, { recursive: true, force: true }); }
});

test("第 2 个写盘失败 → 第 1 个已写文件回滚为改前内容（原子化，不半改写）", () => {
  const repoPath = setupRepo({ "src/a.ts": "old-a", "src/b.ts": "old-b" });
  try {
    let writeCount = 0;
    const failingFs = {
      read: (p) => readFileSync(p, "utf-8"),
      write: (p, c) => {
        writeCount += 1;
        if (writeCount === 2) throw new Error("disk full");
        writeFileSync(p, c, "utf-8");
      },
    };
    assert.throws(
      () => applyRewriteEditsAtomic({
        rawEdits: [
          { path: "src/a.ts", reason: "r", content: "new-a" },
          { path: "src/b.ts", reason: "r", content: "new-b" },
        ],
        ctx: ctx(repoPath, ["src/a.ts", "src/b.ts"], ["src/a.ts", "src/b.ts"], 6),
        dryRun: false, fs: failingFs,
      }),
      /改写写盘失败.*已回滚 1 个已写文件/
    );
    // a 已写又被回滚 → 恢复 old-a（非 new-a，非空）
    assert.equal(readFileSync(join(repoPath, "src/a.ts"), "utf-8"), "old-a");
    assert.equal(readFileSync(join(repoPath, "src/b.ts"), "utf-8"), "old-b");
  } finally { rmSync(repoPath, { recursive: true, force: true }); }
});

test("越界文件 → 不写盘、不回滚（校验阶段拦截）", () => {
  const repoPath = setupRepo({ "src/a.ts": "old-a", "other/x.ts": "old-x" });
  try {
    const result = applyRewriteEditsAtomic({
      rawEdits: [
        { path: "src/a.ts", reason: "r", content: "new-a" },
        { path: "other/x.ts", reason: "r", content: "new-x" }, // 越界
      ],
      ctx: ctx(repoPath, ["src/a.ts", "other/x.ts"], ["src/a.ts"], 6),
      dryRun: false, fs: realFs,
    });
    assert.equal(result.rolledBackFiles.length, 0);
    assert.deepEqual(result.appliedFiles, ["src/a.ts"]);
    assert.deepEqual(result.outOfBoundaryFiles, ["other/x.ts"]);
    assert.equal(readFileSync(join(repoPath, "src/a.ts"), "utf-8"), "new-a");
    assert.equal(readFileSync(join(repoPath, "other/x.ts"), "utf-8"), "old-x");
  } finally { rmSync(repoPath, { recursive: true, force: true }); }
});

test("dryRun → 不写盘、无回滚", () => {
  const repoPath = setupRepo({ "src/a.ts": "old-a" });
  try {
    const result = applyRewriteEditsAtomic({
      rawEdits: [{ path: "src/a.ts", reason: "r", content: "new-a" }],
      ctx: ctx(repoPath, ["src/a.ts"], ["src/a.ts"], 6),
      dryRun: true, fs: realFs,
    });
    assert.equal(result.appliedFiles.length, 0);
    assert.equal(result.rolledBackFiles.length, 0);
    assert.equal(readFileSync(join(repoPath, "src/a.ts"), "utf-8"), "old-a");
  } finally { rmSync(repoPath, { recursive: true, force: true }); }
});

test("内容相同 → skip，不写盘不回滚", () => {
  const repoPath = setupRepo({ "src/a.ts": "same" });
  try {
    const result = applyRewriteEditsAtomic({
      rawEdits: [{ path: "src/a.ts", reason: "r", content: "same" }],
      ctx: ctx(repoPath, ["src/a.ts"], ["src/a.ts"], 6),
      dryRun: false, fs: realFs,
    });
    assert.deepEqual(result.skippedFiles, ["src/a.ts"]);
    assert.equal(result.appliedFiles.length, 0);
  } finally { rmSync(repoPath, { recursive: true, force: true }); }
});

test("回滚后文件内容 == 改前完整内容（验证非截断 preview）", () => {
  const longBefore = "X".repeat(1000); // 远超 previewText 320
  const repoPath = setupRepo({ "src/a.ts": longBefore, "src/b.ts": "old-b" });
  try {
    let writeCount = 0;
    const failingFs = {
      read: (p) => readFileSync(p, "utf-8"),
      write: (p, c) => {
        writeCount += 1;
        if (writeCount === 2) throw new Error("fail");
        writeFileSync(p, c, "utf-8");
      },
    };
    assert.throws(() => applyRewriteEditsAtomic({
      rawEdits: [
        { path: "src/a.ts", reason: "r", content: "new-a" },
        { path: "src/b.ts", reason: "r", content: "new-b" },
      ],
      ctx: ctx(repoPath, ["src/a.ts", "src/b.ts"], ["src/a.ts", "src/b.ts"], 6),
      dryRun: false, fs: failingFs,
    }));
    // 回滚后 a 恢复完整 1000 字符（非 320 截断）
    assert.equal(readFileSync(join(repoPath, "src/a.ts"), "utf-8"), longBefore);
    assert.equal(readFileSync(join(repoPath, "src/a.ts"), "utf-8").length, 1000);
  } finally { rmSync(repoPath, { recursive: true, force: true }); }
});
