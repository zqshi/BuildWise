import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement as h } from "react";
import type { AttachmentAnalysisReport } from "../src/pages/projects/iterationWorkspacePanelTypes.ts";

// v0.31.0 T3 前端按端渲染 DOM 验证。
// 用真实 LLM 按端评审产出（2026-06-30 iteration 2，智谱 glm-5-turbo，626s 同步分析）
// 的 perPlatform 数据驱动渲染，验证 AnalysisReportAdvancedSections 在 perPlatform 非空时
// 按端渲染各端结论（perPlatformRows.length>0 不降级整体展示），符合 T3 验证标准第 3 条。

// jsdom 全局注入必须在 @testing-library 加载之前（screen 在模块加载时绑定 document.body）
const dom = new JSDOM("<!DOCTYPE html>", { url: "http://localhost/" });
(globalThis as Record<string, unknown>).window = dom.window;
(globalThis as Record<string, unknown>).document = dom.window.document;

const { render, screen, cleanup } = await import("@testing-library/react");
const { AnalysisReportAdvancedSections } = await import("../src/pages/projects/AnalysisReportAdvancedSections.tsx");

const baseReleaseReview = {
  decision: "block" as const,
  reason: "",
  blockers: [] as string[],
  releaseGates: [] as string[],
  recommendations: [] as string[],
  rollback: { shouldRollback: false, reason: "", trigger: "", actions: [] as string[] },
  qualitySignals: { testCaseCount: 0, p0FindingCount: 0, unknownSignalCount: 0, boundaryCoverage: 0 }
};

test("v0.31.0 T3：perPlatform 非空时按端渲染各端结论（真实 LLM 产出数据，不降级整体）", () => {
  const releaseReview = {
    ...baseReleaseReview,
    reason: "多端均阻断",
    qualitySignals: { testCaseCount: 12, p0FindingCount: 2, unknownSignalCount: 0, boundaryCoverage: 60 },
    perPlatform: [
      { platform: "web", decision: "block" as const, reason: "存在P1级并发重复风险(Date.now())", blockers: ["使用Date.now()生成ID存在并发覆盖风险", "测试用例通过率为0%"] },
      { platform: "ios", decision: "block" as const, reason: "存在2个P0级阻断", blockers: ["列表项缺失点击切换完成状态交互逻辑", "新增待办未做空值校验", "测试用例通过率为0%"] }
    ]
  };
  render(h(AnalysisReportAdvancedSections, { analysisReport: {} as AttachmentAnalysisReport, showAdvancedReportSections: true, releaseReview }));
  assert.ok(screen.getByText("按目标端评审："), "按端区块提示应渲染（perPlatformRows.length>0）");
  assert.ok(screen.getByText(/网页：阻断/), "web 端应渲染中文端标签+阻断结论");
  assert.ok(screen.getByText(/iOS：阻断/), "ios 端应渲染中文端标签+阻断结论");
  assert.ok(screen.getByText(/使用Date\.now/), "web 端 blockers 应渲染");
  assert.ok(screen.getByText(/列表项缺失点击切换/), "ios 端 blockers 应渲染");
  cleanup();
});

test("v0.31.0 T3：perPlatform 为空时降级整体展示，不渲染按端区块", () => {
  const releaseReview = { ...baseReleaseReview, reason: "整体阻断", blockers: ["整体阻断项"] };
  render(h(AnalysisReportAdvancedSections, { analysisReport: {} as AttachmentAnalysisReport, showAdvancedReportSections: true, releaseReview }));
  assert.throws(() => screen.getByText("按目标端评审："), "无 perPlatform 不应渲染按端区块");
  assert.ok(screen.getByText(/整体阻断项/), "降级为整体展示");
  cleanup();
});
