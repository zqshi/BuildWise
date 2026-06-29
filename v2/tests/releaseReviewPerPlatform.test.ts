import test from "node:test";
import assert from "node:assert/strict";
import { describeReleaseReviewPerPlatform } from "../src/pages/projects/releaseReviewPerPlatformPresenter.ts";

// 发布评审按端展示纯函数单测（v0.29.0 T6.7）：各端 decision 映射业务语言，
// block 端聚合阻断项、caution/go 端给出就绪描述；无 perPlatform 时降级为空（由组件回退整体展示）。

test("按端格式化：go 端给「通过+就绪」，block 端给「阻断+阻断项」", () => {
  const result = describeReleaseReviewPerPlatform([
    { platform: "web", decision: "go", reason: "", blockers: [] },
    { platform: "ios", decision: "block", reason: "缺测试", blockers: ["无 UI 自测", "无崩溃日志"] },
  ]);
  assert.equal(result.length, 2, "应按端逐项输出");
  assert.equal(result[0].platform, "web");
  assert.equal(result[0].decisionLabel, "通过");
  assert.equal(result[0].detail, "该端就绪", "go 端无 reason 时给默认就绪描述");
  assert.equal(result[1].platform, "ios");
  assert.equal(result[1].decisionLabel, "阻断");
  assert.equal(result[1].detail, "无 UI 自测；无崩溃日志", "block 端聚合阻断项（至多 3 项，分号分隔）");
});

test("未声明 perPlatform 或为空数组时返回空（组件据此降级整体展示）", () => {
  assert.deepEqual(describeReleaseReviewPerPlatform(undefined), []);
  assert.deepEqual(describeReleaseReviewPerPlatform([]), []);
});

test("caution 端给「有条件通过」+ reason 描述", () => {
  const result = describeReleaseReviewPerPlatform([
    { platform: "android", decision: "caution", reason: "灰度放量中", blockers: [] },
  ]);
  assert.equal(result[0].decisionLabel, "有条件通过");
  assert.equal(result[0].detail, "灰度放量中");
});

test("block 端无 blockers 时用 reason 兜底，reason 也空时给默认阻断描述", () => {
  const withReason = describeReleaseReviewPerPlatform([
    { platform: "harmony", decision: "block", reason: "未构建产物", blockers: [] },
  ]);
  assert.equal(withReason[0].detail, "未构建产物", "block 无 blockers 用 reason");

  const empty = describeReleaseReviewPerPlatform([
    { platform: "harmony", decision: "block", reason: "", blockers: [] },
  ]);
  assert.equal(empty[0].detail, "存在阻断项", "block 无 blockers 无 reason 时给默认");
});
