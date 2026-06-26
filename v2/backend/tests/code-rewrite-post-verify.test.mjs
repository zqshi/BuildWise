import test from "node:test";
import assert from "node:assert/strict";

const { verifyCodingAgentChanges } = await import(
  "../dist/application/workspace/quality/codeRewritePostVerify.js"
);

const REPO = "/tmp/demo-repo";

function file(path, before, after) {
  return { path, beforeContent: before, afterContent: after };
}

test("全部改动在白名单内 → 生成 edits，无违规", () => {
  const result = verifyCodingAgentChanges({
    whitelist: ["src/Button.tsx", "src/App.tsx"],
    repoPath: REPO,
    changedFiles: [
      file("src/Button.tsx", "old button", "new button"),
      file("src/App.tsx", "<App/>", "<App><Button/></App>"),
    ],
  });
  assert.equal(result.edits.length, 2);
  assert.equal(result.violations.length, 0);
  assert.equal(result.violationPaths.length, 0);
  assert.equal(result.edits[0].path, "src/Button.tsx");
  assert.ok(result.edits[0].afterPreview.includes("new button"));
});

test("越界改动 → 标记 reverted，不生成 edit，violationPaths 含越界路径", () => {
  const result = verifyCodingAgentChanges({
    whitelist: ["src/Button.tsx"],
    repoPath: REPO,
    changedFiles: [
      file("src/Button.tsx", "old", "new"),
      file("src/secret.ts", "key=123", "key=456"),
    ],
  });
  assert.equal(result.edits.length, 1);
  assert.equal(result.edits[0].path, "src/Button.tsx");
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].path, "src/secret.ts");
  assert.equal(result.violations[0].action, "reverted");
  assert.deepEqual(result.violationPaths, ["src/secret.ts"]);
});

test("改动前后内容相同 → 不生成 edit（无实质改动）", () => {
  const result = verifyCodingAgentChanges({
    whitelist: ["src/a.ts"],
    repoPath: REPO,
    changedFiles: [file("src/a.ts", "same", "same")],
  });
  assert.equal(result.edits.length, 0);
});

test("空白名单 → 全部视为合法（不阻断，由调用方决定是否允许无边界改写）", () => {
  const result = verifyCodingAgentChanges({
    whitelist: [],
    repoPath: REPO,
    changedFiles: [file("src/a.ts", "old", "new")],
  });
  assert.equal(result.edits.length, 1);
  assert.equal(result.violations.length, 0);
});

test("before/after preview 截断到 320 字符并压缩空白", () => {
  const longBefore = "x".repeat(400);
  const longAfter = "y".repeat(400);
  const result = verifyCodingAgentChanges({
    whitelist: ["src/a.ts"],
    repoPath: REPO,
    changedFiles: [file("src/a.ts", longBefore, longAfter)],
  });
  assert.ok(result.edits[0].beforePreview.length <= 320);
  assert.ok(result.edits[0].afterPreview.length <= 320);
});
