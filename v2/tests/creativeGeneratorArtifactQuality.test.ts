import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtifactSummary,
  isMeaningfulArtifactContent,
  normalizeArtifactContent
} from "../scripts/creativeGeneratorArtifactQuality.mjs";

test("normalizeArtifactContent strips internal skills noise", () => {
  assert.equal(
    normalizeArtifactContent("[skills] hidden\n问题定义：创意生成器\n"),
    "问题定义：创意生成器"
  );
});

test("isMeaningfulArtifactContent rejects placeholder analysis replies", () => {
  assert.equal(
    isMeaningfulArtifactContent("analysis-report", "已输出首版需求分析报告，以下是需要你确认的待处理点。"),
    false
  );
});

test("isMeaningfulArtifactContent accepts structured analysis content", () => {
  const content = [
    "目标用户：内容运营和营销团队",
    "问题定义：快速生成创意标题与卖点",
    "核心场景：输入主题后生成多组创意结果",
    "待确认点：是否需要导出源码"
  ].join("\n");
  assert.equal(isMeaningfulArtifactContent("analysis-report", content), true);
});

test("buildArtifactSummary extracts user-facing sections from正文", () => {
  const content = [
    "目标用户：内容运营和营销团队",
    "问题定义：快速生成创意标题与卖点",
    "核心场景：输入主题后生成多组创意结果"
  ].join("\n");
  assert.equal(
    buildArtifactSummary("analysis-report", content),
    "目标用户：内容运营和营销团队；问题定义：快速生成创意标题与卖点"
  );
});
