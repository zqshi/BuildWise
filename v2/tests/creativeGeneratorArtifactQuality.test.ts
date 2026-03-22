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
    "# 首版需求分析报告",
    "",
    "## 目标用户",
    "内容运营团队和营销部门的业务人员，他们需要快速生成多组创意标题与卖点文案来支持日常内容生产和营销活动投放。这些用户通常不具备技术背景，依赖可视化工具和自然语言交互完成工作。主要包括两类角色：内容编辑负责日常内容产出，营销策划负责活动文案准备。",
    "",
    "## 问题定义",
    "当前内容生产流程中，创意标题和卖点文案的撰写高度依赖人工经验，效率低且质量不稳定。业务人员每天需要撰写数十条创意文案，重复劳动严重。需要一个智能化的创意生成器，输入主题后自动产出多组可选创意结果，提升内容生产效率和质量一致性。",
    "",
    "## 核心场景",
    "用户输入主题关键词后，系统自动生成多组创意标题和卖点文案。用户可以浏览、筛选、收藏和导出创意结果，也可以对单条结果进行微调后再保存。生成结果支持流式展示，用户无需等待全部完成即可开始浏览。",
    "",
    "## 本轮纳入项",
    "- 主题输入与多组创意结果生成",
    "- 创意结果列表展示与收藏功能",
    "- 右侧详情抽屉查看和编辑单条创意",
    "- 生成历史记录保存与回溯",
    "",
    "## 本轮排除项",
    "- 多语言支持暂不纳入首版",
    "- 团队协作与权限管理留待后续版本",
    "- 与外部内容平台的对接集成",
    "",
    "## 交互原则",
    "操作路径尽量短，核心流程三步内完成。反馈即时，生成结果流式展示。错误状态要有明确提示和恢复路径，不允许静默失败。",
    "",
    "## 关键风险",
    "- 生成质量不稳定，需要兜底策略和质量评分机制，建议引入人工审核环节作为最后一道防线",
    "- 大模型响应延迟可能影响用户体验，需要流式输出和超时兜底，建议设置 30 秒超时阈值",
    "- 生成内容可能触及品牌合规红线，需要后置过滤机制，建议对接企业禁用词词库",
    "- 并发请求过多可能导致 API 限流，需要做请求队列和降级策略",
    "",
    "## 待确认点",
    "- 是否需要导出为文件格式（Word/PDF），导出模板由谁提供",
    "- 创意结果的存储周期和清理策略，默认保留 90 天是否合理",
    "- 单次生成的结果数量上限，建议默认 5 组，最多 10 组"
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
