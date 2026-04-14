import test from "node:test";
import assert from "node:assert/strict";

import { splitExcerptByBoundary, planChunks, batchArray } from "../backend/src/application/workspace/analysis/chunkingOps.ts";

// ---------------------------------------------------------------------------
// splitExcerptByBoundary
// ---------------------------------------------------------------------------

test("短文本不分片直接返回", () => {
  const text = "这是一段很短的文本";
  const result = splitExcerptByBoundary(text, 1000);
  assert.equal(result.length, 1);
  assert.equal(result[0], text);
});

test("按文件标记边界切分", () => {
  const text = [
    "[file 1] src/main.ts\nconst a = 1;",
    "[file 2] src/utils.ts\nfunction util() {}",
    "[file 3] README.md\n# Hello"
  ].join("\n");
  // budget 足够容纳前两个文件但不够三个
  const result = splitExcerptByBoundary(text, 60);
  assert.ok(result.length >= 2, `期望至少 2 片，实际 ${result.length}`);
  // 每片都包含完整的 [file N] 标记
  for (const chunk of result) {
    assert.ok(chunk.includes("[file "), `每片应包含完整文件: ${chunk.slice(0, 40)}`);
  }
});

test("按章节标记切分", () => {
  const text = [
    "# 第一章\n这是第一章内容，相当长的一段话来填充。",
    "## 第二节\n这是第二节内容，也有一些篇幅。",
    "# 第三章\n第三章开始了。"
  ].join("\n");
  const result = splitExcerptByBoundary(text, 40);
  assert.ok(result.length >= 2, `期望至少 2 片，实际 ${result.length}`);
});

test("按段落切分（双换行）", () => {
  const para1 = "这是第一段话，内容足够长，需要有足够的字符数来超过分片预算。".repeat(10);
  const para2 = "这是第二段话，内容也足够长，填充更多字符确保超过阈值。".repeat(10);
  const para3 = "这是第三段话，继续填充以确保总长度远超单片预算。".repeat(10);
  const text = [para1, para2, para3].join("\n\n");
  const result = splitExcerptByBoundary(text, 500);
  assert.ok(result.length >= 2, `期望至少 2 片，实际 ${result.length}（总长 ${text.length}）`);
});

test("超大段落走硬切+重叠", () => {
  const text = "A".repeat(5000);
  const result = splitExcerptByBoundary(text, 2000, 300);
  assert.ok(result.length >= 3, `期望至少 3 片，实际 ${result.length}`);
  // 每片不超过 budget
  for (const chunk of result) {
    assert.ok(chunk.length <= 2000, `每片应 ≤ 2000 字符，实际 ${chunk.length}`);
  }
});

test("全量覆盖：所有内容都出现在分片中", () => {
  const lines = Array.from({ length: 50 }, (_, i) => `[file ${i + 1}] path${i}.ts\ncontent-${i}`);
  const text = lines.join("\n");
  const result = splitExcerptByBoundary(text, 200);
  const joined = result.join("\n");
  for (let i = 0; i < 50; i++) {
    assert.ok(joined.includes(`content-${i}`), `内容 content-${i} 应存在于分片中`);
  }
});

// ---------------------------------------------------------------------------
// planChunks
// ---------------------------------------------------------------------------

test("planChunks 为短文本生成单片计划", () => {
  const plan = planChunks("短文本", "digest-test", 10000);
  assert.equal(plan.chunkCount, 1);
  assert.equal(plan.chunks[0].index, 0);
  assert.equal(plan.chunks[0].total, 1);
  assert.equal(plan.digest, "digest-test");
});

test("planChunks 为长文本生成多片计划且总字符数正确", () => {
  const text = "X".repeat(10000);
  const plan = planChunks(text, "test-digest", 3000, 200);
  assert.ok(plan.chunkCount >= 4, `期望至少 4 片，实际 ${plan.chunkCount}`);
  assert.equal(plan.totalChars, 10000);
  // 每片 charRange 合理
  for (const chunk of plan.chunks) {
    assert.equal(chunk.index + 1 <= chunk.total, true);
    assert.ok(chunk.text.length > 0);
  }
});

// ---------------------------------------------------------------------------
// batchArray
// ---------------------------------------------------------------------------

test("batchArray 正确分批", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  const batches = batchArray(items, 3);
  assert.equal(batches.length, 3);
  assert.deepEqual(batches[0], [1, 2, 3]);
  assert.deepEqual(batches[1], [4, 5, 6]);
  assert.deepEqual(batches[2], [7]);
});

test("batchArray 空数组返回空", () => {
  assert.deepEqual(batchArray([], 5), []);
});
