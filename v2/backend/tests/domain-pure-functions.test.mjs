import { describe, test } from "node:test";
import assert from "node:assert/strict";

// ── iterationStateMachine ──

const {
  canTransitionTo,
  allowedTransitionsFrom,
  suggestNextTransition,
} = await import("../dist/domain/workspace/iterationStateMachine.js");

describe("canTransitionTo — 迭代状态合法转换", () => {
  test("planned → in-progress 合法", () => {
    assert.equal(canTransitionTo("planned", "in-progress"), true);
  });

  test("planned → blocked 合法", () => {
    assert.equal(canTransitionTo("planned", "blocked"), true);
  });

  test("planned → completed 非法（不可跳过中间状态）", () => {
    assert.equal(canTransitionTo("planned", "completed"), false);
  });

  test("planned → review 非法", () => {
    assert.equal(canTransitionTo("planned", "review"), false);
  });

  test("in-progress → review 合法", () => {
    assert.equal(canTransitionTo("in-progress", "review"), true);
  });

  test("in-progress → completed 合法", () => {
    assert.equal(canTransitionTo("in-progress", "completed"), true);
  });

  test("review → completed 合法", () => {
    assert.equal(canTransitionTo("review", "completed"), true);
  });

  test("review → in-progress 合法（打回）", () => {
    assert.equal(canTransitionTo("review", "in-progress"), true);
  });

  test("blocked → in-progress 合法（解除阻塞）", () => {
    assert.equal(canTransitionTo("blocked", "in-progress"), true);
  });

  test("completed → 任何状态都非法（终态）", () => {
    assert.equal(canTransitionTo("completed", "planned"), false);
    assert.equal(canTransitionTo("completed", "in-progress"), false);
    assert.equal(canTransitionTo("completed", "review"), false);
    assert.equal(canTransitionTo("completed", "blocked"), false);
  });
});

describe("allowedTransitionsFrom — 获取可达状态集", () => {
  test("planned 可达 in-progress 和 blocked", () => {
    assert.deepEqual(allowedTransitionsFrom("planned"), ["in-progress", "blocked"]);
  });

  test("in-progress 可达 review/blocked/completed", () => {
    assert.deepEqual(allowedTransitionsFrom("in-progress"), ["review", "blocked", "completed"]);
  });

  test("completed 可达状态为空", () => {
    assert.deepEqual(allowedTransitionsFrom("completed"), []);
  });

  test("不存在的状态返回空数组", () => {
    assert.deepEqual(allowedTransitionsFrom("nonexistent"), []);
  });
});

describe("suggestNextTransition — 推荐下一步状态", () => {
  test("planned 推荐 in-progress", () => {
    assert.equal(suggestNextTransition("planned"), "in-progress");
  });

  test("in-progress 推荐 review", () => {
    assert.equal(suggestNextTransition("in-progress"), "review");
  });

  test("review 推荐 in-progress（preferredOrder 中 in-progress 优先于 completed）", () => {
    assert.equal(suggestNextTransition("review"), "in-progress");
  });

  test("blocked 推荐 in-progress", () => {
    assert.equal(suggestNextTransition("blocked"), "in-progress");
  });

  test("completed 返回 null（终态无推荐）", () => {
    assert.equal(suggestNextTransition("completed"), null);
  });
});

// ── versioning ──

const {
  nextThreePartVersion,
  normalizeThreePartVersion,
  SemanticVersion,
} = await import("../dist/domain/workspace/versioning.js");

describe("nextThreePartVersion — 版本号递增", () => {
  test("空数组返回初始版本 1.0.0", () => {
    assert.equal(nextThreePartVersion([]), "1.0.0");
  });

  test("无有效版本返回 1.0.0", () => {
    assert.equal(nextThreePartVersion([{ version: "abc" }, {}]), "1.0.0");
  });

  test("patch 递增", () => {
    assert.equal(nextThreePartVersion([{ version: "1.2.3" }], "patch"), "1.2.4");
  });

  test("minor 递增（patch 归零）", () => {
    assert.equal(nextThreePartVersion([{ version: "1.2.3" }], "minor"), "1.3.0");
  });

  test("major 递增（minor 和 patch 归零）", () => {
    assert.equal(nextThreePartVersion([{ version: "1.2.3" }], "major"), "2.0.0");
  });

  test("多版本取最高版本递增", () => {
    assert.equal(
      nextThreePartVersion([{ version: "1.0.0" }, { version: "2.1.0" }, { version: "1.5.3" }], "patch"),
      "2.1.1"
    );
  });

  test("默认递增类型为 patch", () => {
    assert.equal(nextThreePartVersion([{ version: "1.0.0" }]), "1.0.1");
  });
});

describe("normalizeThreePartVersion — 版本号格式容错", () => {
  test("标准格式直通", () => {
    assert.equal(normalizeThreePartVersion("1.2.3"), "1.2.3");
  });

  test("横线分隔转点分隔", () => {
    assert.equal(normalizeThreePartVersion("1-2-3"), "1.2.3");
  });

  test("前后空白忽略", () => {
    assert.equal(normalizeThreePartVersion("  1.0.0  "), "1.0.0");
  });

  test("undefined 返回空字符串", () => {
    assert.equal(normalizeThreePartVersion(undefined), "");
  });

  test("非法格式返回空字符串", () => {
    assert.equal(normalizeThreePartVersion("abc"), "");
    assert.equal(normalizeThreePartVersion("1.2"), "");
    assert.equal(normalizeThreePartVersion(""), "");
  });
});

describe("SemanticVersion — 值对象", () => {
  test("parse 标准格式", () => {
    const v = SemanticVersion.parse("2.3.4");
    assert.notEqual(v, null);
    assert.equal(v.toString(), "2.3.4");
  });

  test("parse 非法格式返回 null", () => {
    assert.equal(SemanticVersion.parse("bad"), null);
    assert.equal(SemanticVersion.parse(undefined), null);
  });

  test("initial 返回 1.0.0", () => {
    assert.equal(SemanticVersion.initial().toString(), "1.0.0");
  });

  test("bump patch", () => {
    assert.equal(SemanticVersion.parse("1.2.3").bump("patch").toString(), "1.2.4");
  });

  test("bump minor", () => {
    assert.equal(SemanticVersion.parse("1.2.3").bump("minor").toString(), "1.3.0");
  });

  test("bump major", () => {
    assert.equal(SemanticVersion.parse("1.2.3").bump("major").toString(), "2.0.0");
  });

  test("compareTo 正确排序", () => {
    const v1 = SemanticVersion.parse("1.0.0");
    const v2 = SemanticVersion.parse("2.0.0");
    assert.ok(v1.compareTo(v2) < 0);
    assert.ok(v2.compareTo(v1) > 0);
    assert.equal(v1.compareTo(v1), 0);
  });

  test("isNewerThan", () => {
    const v1 = SemanticVersion.parse("1.0.0");
    const v2 = SemanticVersion.parse("1.0.1");
    assert.equal(v2.isNewerThan(v1), true);
    assert.equal(v1.isNewerThan(v2), false);
  });
});

// ── repositoryNaming ──

const { toRepoSlug } = await import("../dist/domain/workspace/repositoryNaming.js");

describe("toRepoSlug — 仓库名称安全转换", () => {
  test("英文正常转换", () => {
    assert.equal(toRepoSlug("My Project", "fallback"), "my-project");
  });

  test("中文被替换为横线", () => {
    assert.equal(toRepoSlug("我的项目", "fallback"), "fallback");
  });

  test("特殊字符全部替换", () => {
    assert.equal(toRepoSlug("hello@world!123", "fb"), "hello-world-123");
  });

  test("空字符串返回 fallback", () => {
    assert.equal(toRepoSlug("", "default"), "default");
  });

  test("纯特殊字符返回 fallback", () => {
    assert.equal(toRepoSlug("!!!@@@", "fb"), "fb");
  });

  test("首尾横线被移除", () => {
    assert.equal(toRepoSlug("-hello-", "fb"), "hello");
  });
});

// ── agentRunner 类型守卫 ──

const { isGatewayCapableRunner } = await import("../dist/domain/shared/agentRunner.js");

describe("isGatewayCapableRunner — 类型守卫", () => {
  test("有 probe 方法的 runner 识别为 GatewayCapable", () => {
    const runner = {
      run: async () => ({ content: "" }),
      runWithHistory: async () => ({ content: "" }),
      probe: async () => ({ reachable: true, error: "" }),
    };
    assert.equal(isGatewayCapableRunner(runner), true);
  });

  test("无 probe 方法的 runner 不是 GatewayCapable", () => {
    const runner = {
      run: async () => ({ content: "" }),
      runWithHistory: async () => ({ content: "" }),
    };
    assert.equal(isGatewayCapableRunner(runner), false);
  });

  test("probe 不是函数时返回 false", () => {
    const runner = {
      run: async () => ({ content: "" }),
      runWithHistory: async () => ({ content: "" }),
      probe: "not a function",
    };
    assert.equal(isGatewayCapableRunner(runner), false);
  });
});
