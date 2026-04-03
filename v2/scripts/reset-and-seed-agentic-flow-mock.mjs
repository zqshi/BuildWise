#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgenticFlowContinuousModelingStore } from "./seed/agenticFlowModelingFixtures.mjs";

const now = Date.now();
const isoHoursAgo = (hoursAgo = 0) => new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
const dayAgo = (daysAgo = 0) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const time = {
  t0: isoHoursAgo(24 * 7),
  t1: isoHoursAgo(24 * 6.5),
  t2: isoHoursAgo(24 * 6),
  t3: isoHoursAgo(24 * 5.5),
  t4: isoHoursAgo(24 * 5),
  t5: isoHoursAgo(24 * 4.5),
  t6: isoHoursAgo(24 * 4),
  t7: isoHoursAgo(24 * 1.5),
  t8: isoHoursAgo(28),
  t9: isoHoursAgo(24),
  t10: isoHoursAgo(18),
  t11: isoHoursAgo(12),
  t12: isoHoursAgo(8),
  t13: isoHoursAgo(6),
  t14: isoHoursAgo(4),
  t15: isoHoursAgo(3),
  t16: isoHoursAgo(2),
  t17: isoHoursAgo(1),
  t18: isoHoursAgo(0.2)
};

const lines = (...items) => items.join("\n");
const rich = (...sections) => sections.join("\n\n");
const msg = (id, iterationId, role, content, createdAt) => ({ id, iterationId, role, content, createdAt });
const snapshot = (id, iterationId, source, note, assessment, scope, status, progress, createdAt) => ({
  id,
  iterationId,
  source,
  note,
  assessment,
  scope,
  status,
  progress,
  createdAt
});
const transition = (id, iterationId, fromStatus, toStatus, note, reason, source, operator, operatorRole, createdAt) => ({
  id,
  iterationId,
  fromStatus,
  toStatus,
  note,
  reason,
  source,
  operator,
  operatorRole,
  createdAt
});

const artifactDefs = [
  ["analysis-report", "clarification", "需求分析报告", "分析报告", "沉淀目标理解、业务对象、排除项与待确认问题。", "analysisReport", "rich-text", ["scope", "interaction", "development", "testing", "release", "archive"]],
  ["product-requirements-doc", "clarification", "产品需求文档", "PRD", "沉淀问题定义、用户场景、功能需求、非功能要求与验收标准。", "analysisReport.prd", "rich-text", ["scope", "interaction", "development", "testing", "release", "archive"]],
  ["boundary-confirmation", "scope", "边界确认", "范围定义", "沉淀本轮纳入项、排除项、验收口径与影响边界。", "changeControl.boundary", "rich-text", ["interaction", "development", "testing", "release", "archive"]],
  ["prototype-preview", "interaction", "原型与交互", "HTML/原型", "沉淀受影响页面、布局与关键交互。", "uploadedFile.htmlPreviews/imagePreviews", "prototype-select", ["development", "testing", "release", "archive"]],
  ["design-spec", "interaction", "设计规范", "设计规范", "沉淀视觉方向、布局规则、字体、颜色、间距与响应式要求。", "changeControl.uxArtifacts", "rich-text", ["development", "testing", "release", "archive"]],
  ["technical-architecture", "development", "技术架构", "技术架构", "沉淀模块职责、数据流、接口边界、依赖变化与回滚点。", "iteration.architecture", "rich-text", ["testing", "release", "archive"]],
  ["code-delivery", "development", "代码交付", "开发实现", "沉淀新增实现、修改点、继承不变模块与影响范围。", "iteration.codeLink", "rich-text", ["testing", "release", "archive"]],
  ["test-matrix", "testing", "测试矩阵", "测试验证", "维护增量测试与回归测试执行结果。", "changeControl.generatedTestMatrix", "rich-text", ["release", "archive"]],
  ["acceptance-checklist", "testing", "验收清单", "测试验证", "沉淀业务验收口径与上线前确认项。", "changeControl.qualityArtifacts", "rich-text", ["release", "archive"]],
  ["release-review", "release", "发布评审", "发布评审", "输出 go/caution/block 结论与回滚策略。", "changeControl.lastReleaseReview*", "rich-text", ["archive"]],
  ["delivery-package", "archive", "交付归档", "交付归档", "归档版本结论、物料与下版本继承基线。", "qualityArtifacts.materializedFiles", "rich-text", []]
];

const artifactTemplate = (updatedAt) =>
  artifactDefs.map(([id, stage, title, category, description, source, editCapability, downstreamImpacts]) => ({
    id,
    stage,
    title,
    category,
    description,
    status: "pending",
    gateStatus: "pending",
    inputVersionRef: 0,
    outputVersion: 0,
    stale: false,
    downstreamImpacts,
    source,
    editCapability,
    summary: "",
    evidence: [],
    draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
    lastConfirmedBy: "",
    lastConfirmedAt: "",
    updatedAt
  }));

const applyArtifactState = (items, stateById, updatedAt) =>
  items.map((item) => {
    const state = stateById[item.id];
    if (!state) return item;
    return {
      ...item,
      title: state.title ?? item.title,
      description: state.description ?? item.description,
      source: state.source ?? item.source,
      status: state.status ?? item.status,
      gateStatus: state.gateStatus ?? item.gateStatus,
      outputVersion: state.outputVersion ?? item.outputVersion,
      summary: state.summary ?? item.summary,
      evidence: state.evidence ?? item.evidence,
      stale: state.stale ?? item.stale,
      draft: state.draft ? { ...item.draft, ...state.draft } : item.draft,
      lastConfirmedBy: state.lastConfirmedBy ?? item.lastConfirmedBy,
      lastConfirmedAt: state.lastConfirmedAt ?? item.lastConfirmedAt,
      updatedAt
    };
  });

const testCase = (type, caseId, focus, expected, evidence, executionStatus, executionUpdatedAt, executionBy, executionNote) => ({
  type,
  caseId,
  focus,
  expected,
  evidence,
  executionStatus,
  executionUpdatedAt,
  executionBy,
  executionNote
});

const deliverableReferenceMessage = ({ title, stage, type, status, summary, evidence = [], prompt }) =>
  [
    `【交付物引用】${title}`,
    `阶段：${stage || "-"}`,
    `类型：${type || "-"}`,
    `状态：${status || "-"}`,
    `摘要：${summary || "-"}`,
    `证据：${evidence.filter(Boolean).join("；") || "-"}`,
    prompt || `请基于「${title}」继续推进下一阶段。`
  ].join("\n");

const firstArtifacts = applyArtifactState(
  artifactTemplate(time.t6),
  {
    "analysis-report": {
      title: "首版需求分析报告",
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "已完成首版目标、业务对象、纳入项与排除项梳理。",
      evidence: ["需求原文", "业务澄清纪要", "V1 排除项确认"],
      draft: {
        content: lines("项目目标：建立客户经理线索协同看板的首版基线。", "业务对象：线索、状态、跟进记录。", "问题定义：当前录入、状态推进、跟进沉淀分散在多个页面，客户经理需要单页闭环。", "本轮纳入：线索录入、状态推进、跟进记录。", "本轮排除：审批流、移动端、导出。", "交互原则：列表承载主任务流，详情通过右侧抽屉承载上下文。", "待确认点：详情展示采用抽屉而非独立页面。", "- 首版不引入角色差异视图", "- 首版不拆多模块导航"),
        media: ["report"],
        updatedAt: time.t2,
        updatedBy: "owner"
      },
      lastConfirmedBy: "owner",
      lastConfirmedAt: time.t2
    },
    "product-requirements-doc": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "PRD 已明确问题定义、用户场景、功能清单、非功能要求与验收标准。",
      evidence: ["docs/v1-prd.md", "需求澄清纪要", "验收标准确认"],
      draft: {
        content: rich("一、问题定义\n客户经理缺少统一的线索跟进工作台，导致录入、推进、记录沉淀割裂。", "二、目标用户与场景\n目标用户：客户经理、销售主管。\n核心场景：录入线索、推进状态、沉淀跟进记录、回看历史。", "三、功能需求\n1. 线索录入\n2. 状态推进\n3. 跟进记录\n4. 详情抽屉查看当前上下文", "四、非功能要求\n桌面 Web 优先；首屏 3 秒内可用；变更需可追溯。", "五、排除项\n审批流、移动端、导出能力。", "六、验收标准\n客户经理可在单页完成录入-推进-记录闭环；主管能回看最近跟进。"),
        media: ["document"],
        updatedAt: time.t2,
        updatedBy: "pm"
      },
      lastConfirmedBy: "pm",
      lastConfirmedAt: time.t2
    },
    "boundary-confirmation": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "V1 仅覆盖录入、状态推进、跟进记录，其他能力明确排除。",
      evidence: ["in-scope 清单", "out-of-scope 清单", "验收口径确认"],
      draft: {
        content: lines("纳入范围：", "- 线索录入", "- 线索状态推进", "- 跟进记录沉淀", "排除范围：", "- 审批流", "- 移动端", "- 导出能力"),
        media: ["document"],
        updatedAt: time.t3,
        updatedBy: "owner"
      },
      lastConfirmedBy: "owner",
      lastConfirmedAt: time.t3
    },
    "prototype-preview": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "已确认列表页 + 详情抽屉的首版原型交互。",
      evidence: ["prototype/v1-leads.html", "抽屉式详情评审结论"],
      draft: {
        content: "<!doctype html><html><body style='font-family:Arial;padding:20px;background:#f8fafc'><h2>线索协同看板 V1</h2><div style='display:grid;grid-template-columns:1.2fr .8fr;gap:16px'><section style='background:#fff;padding:16px;border-radius:12px'><h3>线索列表</h3><p>录入 / 状态推进 / 跟进记录</p></section><aside style='background:#fff;padding:16px;border-radius:12px'><h3>详情抽屉</h3><p>展示当前线索与跟进记录</p></aside></div></body></html>",
        media: ["html"],
        updatedAt: time.t4,
        updatedBy: "pm"
      },
      lastConfirmedBy: "pm",
      lastConfirmedAt: time.t4
    },
    "design-spec": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "已定义首版 UI 样式、布局规则与详情抽屉交互规范。",
      evidence: ["design/v1-spec.md", "prototype/v1-leads.html"],
      draft: {
        content: rich("视觉方向\n专业、轻量、信息密度适中，避免营销化装饰。", "布局规则\n左侧主列表 + 右侧详情抽屉；列表优先承担推进动作，不使用独立详情页。", "文字规则\n标题突出；状态、最近跟进、负责人采用明确层级；辅助信息使用弱文本色。", "颜色规则\n主操作使用品牌蓝，状态使用语义色，不引入多主题切换。", "间距规则\n列表卡片 12px 内边距，抽屉区块 16px 内边距，模块间距 20px。", "响应式要求\n桌面优先；窄屏时抽屉覆盖主内容并保持操作区固定。"),
        media: ["document"],
        updatedAt: time.t4,
        updatedBy: "designer"
      },
      lastConfirmedBy: "designer",
      lastConfirmedAt: time.t4
    },
    "technical-architecture": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "已明确前后端模块边界、数据流与首版回滚点。",
      evidence: ["docs/v1-architecture.md", "apps/web/src/leads", "apps/api/src/leads"],
      draft: {
        content: rich("前端模块\nLeadList、LeadDetailDrawer、FollowupComposer。", "后端模块\n线索查询/更新服务、跟进记录写入服务。", "数据流\n录入 -> API 落库 -> 列表刷新 -> 抽屉详情同步。", "接口边界\n线索创建、状态更新、跟进记录追加三个核心接口。", "存储约束\n跟进记录必须和线索主记录保持同一业务上下文。", "回滚点\n若跟进记录写入不稳定，可回滚到只读详情展示。"),
        media: ["document"],
        updatedAt: time.t5,
        updatedBy: "architect"
      },
      lastConfirmedBy: "architect",
      lastConfirmedAt: time.t5
    },
    "code-delivery": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "首版实现已覆盖三项核心能力，未引入额外扩展功能。",
      evidence: ["PR#101", "review-pass", "apps/web/src/leads"],
      draft: {
        content: lines("export function submitLead(payload) {", "  return api.post('/leads', payload);", "}", "", "export function appendFollowup(leadId, content) {", "  return api.post(`/leads/${leadId}/followups`, { content });", "}", "", "// 页面结构：列表页 + 详情抽屉", "// 首版无历史模块需要兼容"),
        media: ["code"],
        updatedAt: time.t5,
        updatedBy: "developer"
      },
      lastConfirmedBy: "developer",
      lastConfirmedAt: time.t5
    },
    "test-matrix": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "首版关键流程测试通过，可进入发布评审。",
      evidence: ["matrix-run-v1", "state-transition.log", "followup-record.log"],
      draft: {
        content: lines("V1-TC-001: 线索录入成功 = passed", "V1-TC-002: 状态流转合法性 = passed", "V1-TC-003: 跟进记录保存 = passed"),
        media: ["table"],
        updatedAt: time.t5,
        updatedBy: "qa"
      },
      lastConfirmedBy: "qa",
      lastConfirmedAt: time.t5
    },
    "acceptance-checklist": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "业务验收通过，V1 可作为后续版本基线。",
      evidence: ["UAT-signoff", "owner-go"],
      lastConfirmedBy: "pm",
      lastConfirmedAt: time.t6
    },
    "release-review": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "首版发布评审结论 GO。",
      evidence: ["release-note-v1", "go-live-checklist"],
      draft: {
        content: rich("发布结论\nGO", "原因\n核心流程通过，排除项已明确，不存在未处理阻断。", "上线前检查\n1. 核心接口健康\n2. 跟进记录写入稳定\n3. 回滚包已准备", "回滚策略\n若发布后 30 分钟内跟进记录异常率升高，回滚到只读详情抽屉版本。"),
        media: ["document"],
        updatedAt: time.t6,
        updatedBy: "owner"
      },
      lastConfirmedBy: "owner",
      lastConfirmedAt: time.t6
    },
    "delivery-package": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 1,
      summary: "V1 已归档，成为 V1.1 的继承基线。",
      evidence: ["delivery/v1.0.0", "baseline/v1.0.0.json"],
      draft: {
        content: rich("归档内容\n分析报告、边界确认、原型、代码说明、测试矩阵、发布结论。", "基线结论\nV1 可作为 V1.1 的继承基线。", "下版本继承约束\n录入、状态推进、跟进记录主路径不可被后续增量破坏。"),
        media: ["archive"],
        updatedAt: time.t6,
        updatedBy: "owner"
      },
      lastConfirmedBy: "owner",
      lastConfirmedAt: time.t6
    }
  },
  time.t6
);

const followUpArtifacts = applyArtifactState(
  artifactTemplate(time.t16),
  {
    "analysis-report": {
      title: "继承差异分析报告",
      status: "ready",
      gateStatus: "passed",
      outputVersion: 2,
      summary: "已确认 V1.1 在 V1 基线上新增导出与 @提醒，两者影响范围不同。",
      evidence: ["V1 基线归档", "V1.1 增量需求", "差异分析纪要"],
      draft: {
        content: lines("继承不变：线索录入、状态推进、跟进记录基础能力。", "本轮新增：线索导出、跟进记录 @同事提醒。", "变更目标：提升线索带出效率，并尝试引入协作提醒。", "受影响区域：列表顶部操作区、跟进记录输入区、通知链路。", "回归关注：跟进记录保存主路径、状态推进一致性、详情抽屉稳定性。", "无需重做：基础详情抽屉结构、状态推进主路径。", "待决策项：若 @提醒影响主链路，优先保留导出并移除 @提醒。"),
        media: ["report"],
        updatedAt: time.t10,
        updatedBy: "owner"
      },
      lastConfirmedBy: "owner",
      lastConfirmedAt: time.t10
    },
    "product-requirements-doc": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 2,
      summary: "增量 PRD 已明确导出与 @提醒的业务目标、约束、验收标准与延期条件。",
      evidence: ["docs/v1.1-prd.md", "V1 基线归档", "变更需求说明"],
      draft: {
        content: rich("一、增量目标\n在 V1 基线之上提升数据带出效率与协作提醒能力。", "二、新增需求\n1. 线索导出\n2. 跟进记录 @同事提醒", "三、继承能力\n录入、状态推进、基础跟进记录保持不变。", "四、非功能约束\n不得破坏 V1 跟进记录主路径；导出需在 5 秒内返回结果。", "五、延期条件\n若 @提醒影响跟进记录保存，则本轮必须移除并延期。", "六、验收标准\n导出可独立上线；@提醒若失败必须被剥离。"),
        media: ["document"],
        updatedAt: time.t10,
        updatedBy: "pm"
      },
      lastConfirmedBy: "pm",
      lastConfirmedAt: time.t10
    },
    "boundary-confirmation": {
      status: "partial",
      gateStatus: "pending",
      outputVersion: 2,
      summary: "回滚后仅保留导出能力，@提醒延后到下一版本。",
      evidence: ["增量范围确认", "回滚决策记录", "owner 最新确认"],
      draft: {
        content: lines("当前保留：线索导出。", "当前移除：跟进记录 @同事提醒。", "继承保持：录入、状态推进、跟进记录基础能力沿用 V1。"),
        media: ["document"],
        updatedAt: time.t16,
        updatedBy: "owner"
      }
    },
    "prototype-preview": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 2,
      summary: "导出入口已调整至列表顶部，未改动原有详情抽屉结构。",
      evidence: ["prototype/v1.1-export.html", "原型反馈记录"],
      draft: {
        content: "<!doctype html><html><body style='font-family:Arial;padding:20px;background:#f8fafc'><header style='display:flex;justify-content:space-between;align-items:center'><h2>线索协同看板 V1.1</h2><button style='padding:8px 12px;border:0;border-radius:8px;background:#0f766e;color:#fff'>导出线索</button></header><div style='display:grid;grid-template-columns:1.2fr .8fr;gap:16px;margin-top:16px'><section style='background:#fff;padding:16px;border-radius:12px'><h3>线索列表</h3><p>保持 V1 列表结构</p></section><aside style='background:#fff;padding:16px;border-radius:12px'><h3>详情抽屉</h3><p>@提醒入口已撤回，保留基础跟进记录</p></aside></div></body></html>",
        media: ["html"],
        updatedAt: time.t12,
        updatedBy: "pm"
      },
      lastConfirmedBy: "pm",
      lastConfirmedAt: time.t12
    },
    "design-spec": {
      status: "ready",
      gateStatus: "passed",
      outputVersion: 2,
      summary: "增量设计规范已明确顶部导出入口、维持原详情抽屉，并撤回 @提醒相关视觉入口。",
      evidence: ["design/v1.1-spec.md", "prototype/v1.1-export.html"],
      draft: {
        content: rich("变更区域\n列表顶部工具栏新增导出按钮。", "保持不变\n详情抽屉结构、状态推进主路径、基础跟进记录输入区。", "视觉规则\n导出按钮为高优先级次主操作，避免压过主业务操作。", "交互规则\n导出完成后提供结果反馈，不新增独立弹窗流程。", "撤回项\n@提醒输入提示与相关徽标本轮移除。", "响应式补充\n窄屏时工具栏折叠，但导出入口必须在首屏可见。"),
        media: ["document"],
        updatedAt: time.t12,
        updatedBy: "designer"
      },
      lastConfirmedBy: "designer",
      lastConfirmedAt: time.t12
    },
    "technical-architecture": {
      status: "partial",
      gateStatus: "pending",
      outputVersion: 2,
      summary: "已明确导出链路与通知链路边界，当前仅保留导出架构进入二次评审。",
      evidence: ["docs/v1.1-architecture.md", "apps/api/src/export", "apps/api/src/notifications"],
      draft: {
        content: rich("新增模块\n导出任务接口、导出文件生成器。", "尝试新增后回滚\n@提醒通知链路。", "数据流\n列表顶部导出 -> 导出接口 -> 文件生成 -> 下载。", "接口边界\n导出服务可独立部署；通知服务不得阻塞跟进记录保存。", "通知边界\n@提醒依赖通知服务，因影响跟进记录保存已从本轮主链路移除。", "回滚点\n保留导出链路，关闭通知服务写入。"),
        media: ["document"],
        updatedAt: time.t16,
        updatedBy: "architect"
      }
    },
    "code-delivery": {
      status: "partial",
      gateStatus: "pending",
      outputVersion: 2,
      summary: "导出实现保留，@提醒相关实现已回滚，待二次评审确认。",
      evidence: ["PR#128-export", "revert#129-mention", "apps/api/src/export"],
      draft: {
        content: lines("export async function exportLeads(params) {", "  return api.get('/leads/export', { params, responseType: 'blob' });", "}", "", "// reverted: mention notification side effects", "export const mentionFeatureEnabled = false;", "", "// inherited: create lead / update status / append followup keep V1 behavior"),
        media: ["code"],
        updatedAt: time.t16,
        updatedBy: "developer"
      }
    },
    "test-matrix": {
      status: "partial",
      gateStatus: "failed",
      outputVersion: 2,
      summary: "首轮测试因 @提醒导致保存失败而阻断，回滚后正准备二次验证。",
      evidence: ["mention-save-failed.log", "rollback-rerun.log", "export-regression.log"],
      draft: {
        content: lines("V1.1-TC-001: 线索导出成功 = passed", "V1.1-TC-002: 跟进记录 @提醒保存 = failed", "V1.1-TC-003: 原有状态流转不受影响 = passed"),
        media: ["table"],
        updatedAt: time.t14,
        updatedBy: "qa"
      }
    },
    "acceptance-checklist": {
      status: "partial",
      gateStatus: "pending",
      outputVersion: 2,
      summary: "当前只待确认导出能力上线是否可接受，@提醒已延期。",
      evidence: ["uat-v1.1-round2.md"]
    },
    "release-review": {
      status: "partial",
      gateStatus: "failed",
      outputVersion: 1,
      summary: "首轮发布评审 BLOCK，要求回滚 @提醒并重新确认增量边界。",
      evidence: ["release-review-block.md", "rollback-plan-v1.1.md"],
      draft: {
        content: rich("发布结论\nBLOCK", "阻断原因\n@提醒导致跟进记录保存失败。", "建议动作\n回滚 @提醒，仅保留导出能力进入二次评审。", "二次评审前置条件\n1. 导出回归通过\n2. 录入与跟进主链路通过\n3. 回滚变更已合入。"),
        media: ["document"],
        updatedAt: time.t15,
        updatedBy: "owner"
      }
    },
    "delivery-package": {
      status: "partial",
      gateStatus: "pending",
      outputVersion: 1,
      summary: "已沉淀首轮阻断与回滚复盘，最终交付待二次评审。",
      evidence: ["delivery/v1.1.0/rollback-postmortem.md"]
      ,
      draft: {
        content: rich("当前归档物料\n阻断复盘、回滚决策、导出保留方案。", "未完成项\n@提醒未纳入本版交付。", "下版本候选继承项\n若通知服务与跟进保存解耦，可重新评估 @提醒。"),
        media: ["archive"],
        updatedAt: time.t16,
        updatedBy: "owner"
      }
    }
  },
  time.t16
);

const data = {
  projects: [
    {
      id: 1,
      name: "线索协同看板演示项目",
      description: "用于演示首版建基线与后续版本继承差异推进的真实迭代业务流。",
      status: "in-progress",
      icon: "layout",
      iconColor: "teal",
      lastUpdated: dayAgo(0),
      repository: {
        id: "repo-1",
        repoMode: "hybrid",
        provider: "github",
        organization: "buildwise",
        name: "lead-collab-demo",
        url: "https://github.com/buildwise/lead-collab-demo",
        defaultBranch: "main",
        structureVersion: "v1",
        layout: [
          { path: "apps/web", purpose: "前端应用", required: true },
          { path: "apps/api", purpose: "后端服务", required: true },
          { path: "docs", purpose: "流程与业务说明", required: true },
          { path: "tests", purpose: "质量验证", required: true }
        ],
        remote: {
          status: "provisioned",
          visibility: "private",
          ownerType: "org",
          providerRepoId: "bw-demo-001",
          htmlUrl: "https://github.com/buildwise/lead-collab-demo",
          cloneUrl: "https://github.com/buildwise/lead-collab-demo.git",
          sshUrl: "git@github.com:buildwise/lead-collab-demo.git",
          lastProvisionedAt: time.t1
        },
        governance: {
          requireRemoteForProduction: true,
          requireRemoteForStaging: false
        },
        health: {
          remoteConfigured: true,
          remoteReachable: true,
          remoteSynced: true,
          lastCheckedAt: time.t16,
          lastError: ""
        },
        createdAt: time.t0,
        updatedAt: time.t16
      },
      knowledgeBase: {
        ontologyTerms: [
          {
            term: "线索详情抽屉",
            aliases: ["详情抽屉", "右侧抽屉"],
            definition: "用于承载当前线索详情、状态推进结果和跟进记录上下文的右侧抽屉区域。",
            evidence: "V1 首版分析报告 / design/v1-spec.md"
          },
          {
            term: "跟进记录",
            aliases: ["跟进", "跟进日志", "followup"],
            definition: "面向客户经理沉淀联系动作、沟通结论与下一步计划的业务记录。",
            evidence: "docs/v1-prd.md / apps/api/src/leads"
          },
          {
            term: "线索导出",
            aliases: ["导出", "导出线索"],
            definition: "在列表顶部触发的批量数据导出能力，可独立于详情抽屉上线。",
            evidence: "docs/v1.1-prd.md / apps/api/src/export"
          }
        ],
        stableRules: [
          {
            rule: "详情展示默认采用右侧抽屉，不拆独立详情页。",
            rationale: "保持列表主任务流连续，减少跳转成本。",
            source: "V1 边界确认"
          },
          {
            rule: "后续版本默认增量修改，不重做已验证的 V1 主路径。",
            rationale: "保证变更可控，降低回归面。",
            source: "V1 归档结论"
          }
        ],
        componentInventory: [
          {
            component: "LeadList",
            responsibility: "承载线索列表与顶部操作区。",
            relatedRequirements: ["REQ-V1-001", "REQ-V1.1-001"],
            relatedCodePaths: ["apps/web/src/leads", "apps/web/src/leads/toolbar"]
          },
          {
            component: "LeadDetailDrawer",
            responsibility: "承载详情展示、状态推进结果和跟进记录上下文。",
            relatedRequirements: ["REQ-V1-002", "REQ-V1-003"],
            relatedCodePaths: ["apps/web/src/leads", "apps/api/src/leads"]
          },
          {
            component: "FollowupComposer",
            responsibility: "沉淀跟进记录输入与保存流程。",
            relatedRequirements: ["REQ-V1-003", "REQ-V1.1-002"],
            relatedCodePaths: ["apps/web/src/leads", "apps/api/src/notifications"]
          }
        ],
        codeMap: [
          {
            capability: "线索录入与状态推进",
            codePaths: ["apps/web/src/leads", "apps/api/src/leads"],
            tests: ["tests/unit/leads.spec.ts", "tests/contract/lead-workflow.contract.ts"]
          },
          {
            capability: "线索导出",
            codePaths: ["apps/web/src/leads/toolbar", "apps/api/src/export"],
            tests: ["tests/unit/export.spec.ts", "tests/contract/export.contract.ts"]
          }
        ],
        decisionLog: [
          {
            decision: "V1 详情展示采用抽屉而非独立详情页。",
            status: "active",
            rationale: "减少主任务流跳转。",
            iterationVersion: "1.0.0"
          },
          {
            decision: "V1.1 在 @提醒阻断后仅保留导出能力。",
            status: "active",
            rationale: "优先保护跟进记录保存主链路。",
            iterationVersion: "1.1.0"
          }
        ],
        knownRisks: [
          {
            risk: "@提醒通知链路可能影响跟进记录保存。",
            mitigation: "将通知链路与保存主路径解耦；必要时回滚。",
            trigger: "V1.1 测试阻断复盘"
          }
        ],
        changePatterns: [
          {
            pattern: "后续版本优先在列表顶部加增量入口，不改详情抽屉主结构。",
            preferredFlow: "先做差异分析，再局部修改原型与代码。",
            avoid: "整页重做或引入不必要的新详情页"
          }
        ],
        updatedAt: time.t16
      }
    }
  ],
  iterations: [
    {
      id: 1,
      projectId: 1,
      version: "1.0.0",
      name: "V1 首版本：建立业务基线",
      description: "从 0 到 1 建立线索协同看板的首版业务基线。",
      goals: ["完成首版交付", "建立后续版本可继承基线"],
      modules: [
        { id: "m1-1", title: "业务澄清与边界确认", status: "completed" },
        { id: "m1-2", title: "原型、开发、测试与发布", status: "completed" }
      ],
      status: "completed",
      progress: 100,
      createdAt: dayAgo(7),
      createdBy: "系统",
      current: false,
      aiSummary: "V1 已完成首版基线建立，可作为后续版本继承输入。",
      scope: {
        inScope: ["线索录入", "状态推进", "跟进记录"],
        outOfScope: ["审批流", "移动端", "导出能力"],
        acceptanceCriteria: ["列表与详情抽屉流程可用", "三项核心能力可用", "关键门禁通过"]
      },
      continuity: {
        inheritedFromIterationId: null,
        inheritedSummary: "首个版本，无继承基线。",
        carriedGoals: [],
        carriedRisks: [],
        carriedDecisions: []
      },
      assessment: {
        baselineIterationId: null,
        baselineIterationName: "",
        currentSummary: "首版基线已建立。",
        deltaInScope: ["首次建立线索协同看板"],
        resolvedItems: ["业务澄清", "边界锁定", "交互确认", "开发实现", "测试验证", "发布归档"],
        pendingItems: [],
        risks: []
      },
      interactionState: {
        hasPrototypeAssets: true,
        uploadKind: "prototype",
        lastUpdatedAt: time.t6,
        lastAttachmentName: "docs/v1-business-brief.md"
      },
      changeControl: {
        pendingHumanConfirmation: false,
        lastAnalysisAt: time.t2,
        lastAnalysisFileName: "docs/v1-business-brief.md",
        lastAnalysisDigest: "v1-baseline-analysis",
        lastUploadedInputFingerprint: "fp-v1-baseline",
        lastUploadedAt: time.t2,
        lastFailedAnalysisInput: "",
        lastFailedAnalysisAt: "",
        lastFailedAnalysisError: "",
        lastAttachmentUploadId: "upl-v1-1",
        lastAttachmentIngestJobId: "ing-v1-1",
        lastAttachmentAnalysisJobId: "job-v1-1",
        lastAttachmentReportId: "report-v1-1",
        clarificationRounds: 2,
        clarificationQuestions: [],
        clarificationDraftResolvedQuestions: [],
        clarificationDraftUpdatedAt: time.t2,
        lastClarificationResolution: {
          resolvedQuestions: ["详情展示采用抽屉", "导出不纳入 V1"],
          unresolvedQuestions: [],
          updatedAt: time.t2
        },
        lastClarificationNote: "首版本理解准确，已确认 V1 的纳入项与排除项。",
        confirmedAt: time.t3,
        confirmedBy: "owner",
        generatedTestMatrix: [
          testCase("functional", "V1-TC-001", "线索录入", "录入成功并写入列表", "tests/lead-create.log", "passed", time.t5, "qa", "通过"),
          testCase("functional", "V1-TC-002", "状态流转", "只允许合法状态变化", "tests/state-transition.log", "passed", time.t5, "qa", "通过"),
          testCase("acceptance", "V1-TC-003", "跟进记录", "新增记录后详情抽屉正确展示", "tests/followup-record.log", "passed", time.t5, "qa", "通过")
        ],
        generatedTestMatrixUpdatedAt: time.t5,
        testMatrixExecutionUpdatedAt: time.t5,
        qualityArtifacts: {
          unitTests: ["tests/unit/leads.spec.ts"],
          contractTests: ["tests/contract/lead-workflow.contract.ts"],
          acceptanceChecklist: ["录入可用", "状态推进可用", "跟进记录可用"],
          regressionPoints: ["详情抽屉", "状态流转"],
          materializedFiles: ["delivery/v1.0.0/release.md", "baseline/v1.0.0.json"],
          updatedAt: time.t6
        },
        uxArtifacts: {
          informationArchitecture: ["线索列表", "详情抽屉", "跟进记录区"],
          interactionFlows: ["录入 -> 列表呈现", "状态推进 -> 抽屉详情更新", "跟进记录 -> 历史沉淀"],
          uiStates: ["初始", "跟进中", "已转化"],
          uxConstraints: ["首版不引入角色差异视图"],
          updatedAt: time.t6
        },
        executableConstraints: {
          componentWhitelist: ["OpenclawWorkspacePanel", "IterationWorkspacePanel"],
          codePathWhitelist: ["v2/src/pages/layout", "v2/src/pages/projects"],
          acceptanceChecks: ["v1 baseline must be archived", "first iteration must not reference inherited history"],
          generatedAt: time.t3
        },
        traceabilitySnapshot: {
          requirementCoverage: 100,
          mappingConfidence: "high",
          unmappedRequirements: [],
          conflicts: [],
          generatedAt: time.t6
        },
        domainKnowledgeEntries: [],
        domainKnowledgeUpdatedAt: time.t6,
        lastAnalysisP0Count: 0,
        lastAnalysisHighValueCount: 3,
        lastAnalysisConsideredFiles: 9,
        lastAnalysisIgnoredFiles: 1,
        lastAnalysisIgnoredFileRatio: 0.1,
        lastReleaseReviewDecision: "go",
        lastReleaseReviewReason: "V1 三项核心能力通过测试且排除项明确。",
        lastReleaseReviewBlockers: [],
        lastReleaseReviewScore: 93,
        lastReleaseReviewUpdatedAt: time.t6,
        lastTraceabilityCoverageScore: 97,
        lastOpsRollbackSuggested: false,
        lastReportPublishable: true,
        lastReportQualityScore: 92,
        lastReportQualitySummary: "首版交付可作为后续基线。",
        lastReportQualityUpdatedAt: time.t6,
        artifactWorkflow: {
          activeStage: "archive",
          items: firstArtifacts,
          updatedAt: time.t6
        },
        changeSource: {
          type: "mixed",
          rawInput: "首版本通过自然语言需求澄清，并补充 business brief 文档建立基线。",
          attachments: ["docs/v1-business-brief.md"],
          references: ["message:2", "artifact:首版需求分析报告"],
          updatedAt: time.t2
        },
        knowledgeHits: [
          "命中项目规则：详情展示默认采用抽屉",
          "命中项目术语：跟进记录=followup"
        ],
        knowledgeConflicts: [],
        normalizedFunctionalPoints: ["线索录入", "状态推进", "跟进记录", "详情抽屉展示"],
        mappingAuditTrail: [
          {
            id: "map-v1-001",
            sourceType: "natural-language",
            functionalPoint: "线索录入",
            mappingConfidence: "high",
            impactedArtifacts: ["analysis-report", "product-requirements-doc", "boundary-confirmation", "code-delivery", "test-matrix"],
            requirementRefs: ["REQ-V1-001"],
            componentRefs: ["LeadList"],
            codePaths: ["apps/web/src/leads", "apps/api/src/leads"],
            createdAt: time.t2
          },
          {
            id: "map-v1-002",
            sourceType: "document",
            functionalPoint: "状态推进",
            mappingConfidence: "high",
            impactedArtifacts: ["analysis-report", "product-requirements-doc", "prototype-preview", "technical-architecture", "test-matrix"],
            requirementRefs: ["REQ-V1-002"],
            componentRefs: ["LeadList", "LeadDetailDrawer"],
            codePaths: ["apps/web/src/leads", "apps/api/src/leads"],
            createdAt: time.t2
          },
          {
            id: "map-v1-003",
            sourceType: "mixed",
            functionalPoint: "跟进记录",
            mappingConfidence: "high",
            impactedArtifacts: ["analysis-report", "boundary-confirmation", "prototype-preview", "code-delivery", "test-matrix"],
            requirementRefs: ["REQ-V1-003"],
            componentRefs: ["LeadDetailDrawer", "FollowupComposer"],
            codePaths: ["apps/web/src/leads", "apps/api/src/leads"],
            createdAt: time.t2
          }
        ],
        boundary: {
          requirementRefs: ["REQ-V1-001", "REQ-V1-002", "REQ-V1-003"],
          componentRefs: ["LeadList", "LeadDetailDrawer", "FollowupComposer"],
          codePaths: ["apps/web/src/leads", "apps/api/src/leads"],
          note: "V1 边界已锁定并归档。",
          updatedAt: time.t3
        }
      }
    },
    {
      id: 2,
      projectId: 1,
      version: "1.1.0",
      name: "V1.1 后续版本：增量变更与回滚修复",
      description: "基于 V1 基线增加导出与 @提醒，并处理测试阻断后的局部回滚。",
      goals: ["确认增量边界", "完成导出能力交付", "处理 @提醒阻断并形成后续候选项"],
      modules: [
        { id: "m2-1", title: "继承差异与增量边界确认", status: "completed" },
        { id: "m2-2", title: "原型局部更新与开发交付", status: "in-progress" },
        { id: "m2-3", title: "测试阻断与回滚修复", status: "in-progress" }
      ],
      status: "in-progress",
      progress: 62,
      createdAt: dayAgo(1),
      createdBy: "系统",
      current: true,
      aiSummary: "V1.1 已完成继承差异分析，首轮测试因 @提醒阻断，当前已回滚至仅保留导出能力并等待二次评审。",
      scope: {
        inScope: ["线索导出", "跟进记录 @提醒"],
        outOfScope: ["重做 V1 基础能力", "审批流", "移动端"],
        acceptanceCriteria: ["继承差异可追溯", "导出能力可独立上线", "@提醒问题需在本轮关闭或延期"]
      },
      continuity: {
        inheritedFromIterationId: 1,
        inheritedSummary: "继承 V1 的录入、状态推进、跟进记录基础能力及发布基线。",
        carriedGoals: ["保持基础主路径稳定"],
        carriedRisks: ["新增通知链路可能影响跟进记录保存"],
        carriedDecisions: ["详情抽屉结构沿用 V1"]
      },
      assessment: {
        baselineIterationId: 1,
        baselineIterationName: "V1 首版本：建立业务基线",
        currentSummary: "V1.1 正在从‘导出 + @提醒’收敛为‘仅导出’的可发布增量。",
        deltaInScope: ["新增线索导出", "新增 @提醒通知链路"],
        resolvedItems: ["继承差异确认", "导出入口原型调整", "回滚策略确认"],
        pendingItems: ["导出二次回归", "二次发布评审"],
        risks: ["若 @提醒回滚不彻底，可能继续影响跟进记录保存"]
      },
      interactionState: {
        hasPrototypeAssets: true,
        uploadKind: "documents",
        lastUpdatedAt: time.t16,
        lastAttachmentName: "docs/v1_1-change-brief.md"
      },
      changeControl: {
        pendingHumanConfirmation: false,
        lastAnalysisAt: time.t10,
        lastAnalysisFileName: "docs/v1_1-change-brief.md",
        lastAnalysisDigest: "v1.1-delta-analysis",
        lastUploadedInputFingerprint: "fp-v1.1-delta",
        lastUploadedAt: time.t10,
        lastFailedAnalysisInput: "",
        lastFailedAnalysisAt: "",
        lastFailedAnalysisError: "",
        lastAttachmentUploadId: "upl-v1.1-1",
        lastAttachmentIngestJobId: "ing-v1.1-1",
        lastAttachmentAnalysisJobId: "job-v1.1-1",
        lastAttachmentReportId: "report-v1.1-1",
        clarificationRounds: 2,
        clarificationQuestions: ["V1.1 是否同时上线导出与 @提醒？", "导出入口应放在列表顶部还是详情抽屉？"],
        clarificationDraftResolvedQuestions: ["V1.1 同时尝试导出与 @提醒", "导出入口放在列表顶部"],
        clarificationDraftUpdatedAt: time.t12,
        lastClarificationResolution: {
          resolvedQuestions: ["本轮新增导出与 @提醒", "导出入口放在列表顶部", "录入与状态流转默认继承"],
          unresolvedQuestions: [],
          updatedAt: time.t12
        },
        lastClarificationNote: "已确认 V1.1 的初始增量为导出与 @提醒；回滚后暂时仅保留导出。",
        confirmedAt: time.t12,
        confirmedBy: "owner",
        generatedTestMatrix: [
          testCase("functional", "V1.1-TC-001", "线索导出", "点击顶部导出后成功下载数据", "tests/export.log", "passed", time.t14, "qa", "通过"),
          testCase("regression", "V1.1-TC-002", "跟进记录 @提醒", "带 @提醒的记录保存成功并触发通知", "tests/mention-save-failed.log", "failed", time.t14, "qa", "保存失败"),
          testCase("regression", "V1.1-TC-003", "原有状态流转", "V1 状态推进能力不受新增功能影响", "tests/export-regression.log", "passed", time.t14, "qa", "通过")
        ],
        generatedTestMatrixUpdatedAt: time.t14,
        testMatrixExecutionUpdatedAt: time.t14,
        qualityArtifacts: {
          unitTests: ["tests/unit/export.spec.ts"],
          contractTests: ["tests/contract/export.contract.ts"],
          acceptanceChecklist: ["导出可用", "@提醒若失败则必须延期", "V1 主路径不回归"],
          regressionPoints: ["跟进记录保存", "状态推进", "导出入口展示"],
          materializedFiles: ["delivery/v1.1.0/rollback-postmortem.md"],
          updatedAt: time.t16
        },
        uxArtifacts: {
          informationArchitecture: ["列表顶部导出按钮", "详情抽屉保持 V1 结构"],
          interactionFlows: ["导出操作", "跟进记录输入（@提醒已撤回）"],
          uiStates: ["增量方案", "阻断回滚", "二次评审准备"],
          uxConstraints: ["后续版本优先局部修改，不重做整套 V1 交互"],
          updatedAt: time.t16
        },
        executableConstraints: {
          componentWhitelist: ["OpenclawWorkspacePanel", "IterationWorkspacePanel"],
          codePathWhitelist: ["apps/web/src/leads", "apps/api/src/export", "apps/api/src/notifications"],
          acceptanceChecks: ["follow-up iteration must start from inherited baseline", "release cannot bypass failed delta tests"],
          generatedAt: time.t12
        },
        traceabilitySnapshot: {
          requirementCoverage: 94,
          mappingConfidence: "high",
          unmappedRequirements: ["@提醒通知投递稳定性，延后到后续版本"],
          conflicts: [],
          generatedAt: time.t16
        },
        domainKnowledgeEntries: [],
        domainKnowledgeUpdatedAt: time.t16,
        lastAnalysisP0Count: 1,
        lastAnalysisHighValueCount: 4,
        lastAnalysisConsideredFiles: 11,
        lastAnalysisIgnoredFiles: 1,
        lastAnalysisIgnoredFileRatio: 0.09,
        lastReleaseReviewDecision: "caution",
        lastReleaseReviewReason: "首轮评审因 @提醒阻断，回滚后仅导出能力具备继续推进条件。",
        lastReleaseReviewBlockers: ["需完成导出二次回归并再次确认上线范围"],
        lastReleaseReviewScore: 74,
        lastReleaseReviewUpdatedAt: time.t15,
        lastTraceabilityCoverageScore: 94,
        lastOpsRollbackSuggested: true,
        lastReportPublishable: true,
        lastReportQualityScore: 88,
        lastReportQualitySummary: "差异分析与回滚链路完整，适合继续演示二次评审前状态。",
        lastReportQualityUpdatedAt: time.t16,
        artifactWorkflow: {
          activeStage: "scope",
          items: followUpArtifacts,
          updatedAt: time.t16
        },
        changeSource: {
          type: "mixed",
          rawInput: "V1.1 通过自然语言描述增量需求，并附加变更说明文档；原型调整引用了 HTML 预览。",
          attachments: ["docs/v1_1-change-brief.md", "prototype/v1.1-export.html"],
          references: ["iteration:1", "artifact:交付归档", "message:14"],
          updatedAt: time.t12
        },
        knowledgeHits: [
          "命中继承规则：后续版本默认局部修改，不重做 V1 主路径",
          "命中组件清单：LeadListToolbar 对应导出入口",
          "命中风险记录：通知链路可能影响跟进记录保存"
        ],
        knowledgeConflicts: [
          "@提醒需求与既有稳定规则冲突：通知链路不得阻塞跟进记录保存"
        ],
        normalizedFunctionalPoints: ["线索导出", "跟进记录 @同事提醒", "列表顶部导出入口", "通知链路回滚"],
        mappingAuditTrail: [
          {
            id: "map-v1.1-001",
            sourceType: "natural-language",
            functionalPoint: "线索导出",
            mappingConfidence: "high",
            impactedArtifacts: ["analysis-report", "product-requirements-doc", "prototype-preview", "design-spec", "technical-architecture", "code-delivery", "test-matrix"],
            requirementRefs: ["REQ-V1.1-001"],
            componentRefs: ["LeadListToolbar"],
            codePaths: ["apps/web/src/leads/toolbar", "apps/api/src/export"],
            createdAt: time.t10
          },
          {
            id: "map-v1.1-002",
            sourceType: "document",
            functionalPoint: "跟进记录 @同事提醒",
            mappingConfidence: "medium",
            impactedArtifacts: ["analysis-report", "product-requirements-doc", "technical-architecture", "code-delivery", "test-matrix", "release-review"],
            requirementRefs: ["REQ-V1.1-002"],
            componentRefs: ["FollowupComposer", "LeadDetailDrawer"],
            codePaths: ["apps/web/src/leads", "apps/api/src/notifications"],
            createdAt: time.t10
          },
          {
            id: "map-v1.1-003",
            sourceType: "html",
            functionalPoint: "列表顶部导出入口",
            mappingConfidence: "high",
            impactedArtifacts: ["prototype-preview", "design-spec", "boundary-confirmation"],
            requirementRefs: ["REQ-V1.1-001"],
            componentRefs: ["LeadListToolbar"],
            codePaths: ["apps/web/src/leads/toolbar"],
            createdAt: time.t12
          },
          {
            id: "map-v1.1-004",
            sourceType: "history-reference",
            functionalPoint: "通知链路回滚",
            mappingConfidence: "high",
            impactedArtifacts: ["analysis-report", "boundary-confirmation", "technical-architecture", "code-delivery", "release-review"],
            requirementRefs: ["REQ-V1.1-002"],
            componentRefs: ["FollowupComposer"],
            codePaths: ["apps/api/src/notifications"],
            createdAt: time.t16
          }
        ],
        boundary: {
          requirementRefs: ["REQ-V1.1-001", "REQ-V1.1-002"],
          componentRefs: ["LeadListToolbar", "LeadDetailDrawer", "FollowupComposer"],
          codePaths: ["apps/web/src/leads/toolbar", "apps/api/src/export", "apps/api/src/notifications"],
          note: "回滚后边界收敛为‘只上线导出，@提醒延期’。",
          updatedAt: time.t16
        }
      }
    }
  ],
  messages: [
    msg(1, 1, "assistant", "这是首个版本，我会先建立业务基线，再逐步推进到发布归档。", time.t1),
    msg(2, 1, "user", "核心先做线索录入、状态推进、跟进记录；审批流、移动端、导出先不做。", time.t2),
    msg(3, 1, "assistant", deliverableReferenceMessage({ title: "首版需求分析报告", stage: "clarification", type: "分析报告", status: "ready/passed", summary: "已完成首版目标、业务对象、纳入项与排除项梳理。", evidence: ["需求原文", "业务澄清纪要", "V1 排除项确认"], prompt: "请确认我对 V1 的理解是否准确；若准确，我将进入边界锁定。" }), time.t2),
    msg(31, 1, "assistant", deliverableReferenceMessage({ title: "产品需求文档", stage: "clarification", type: "PRD", status: "ready/passed", summary: "PRD 已明确问题定义、用户场景、功能清单、非功能要求与验收标准。", evidence: ["docs/v1-prd.md", "验收标准确认"], prompt: "PRD 已补齐，可直接指导范围锁定与设计产出。" }), time.t2),
    msg(4, 1, "user", "理解准确，详情展示采用抽屉。", time.t3),
    msg(5, 1, "assistant", deliverableReferenceMessage({ title: "边界确认", stage: "scope", type: "范围定义", status: "ready/passed", summary: "V1 仅覆盖录入、状态推进、跟进记录，其他能力明确排除。", evidence: ["in-scope 清单", "out-of-scope 清单", "验收口径确认"], prompt: "边界已锁定，我将继续产出原型并给你确认。" }), time.t3),
    msg(6, 1, "assistant", deliverableReferenceMessage({ title: "原型与交互", stage: "interaction", type: "HTML/原型", status: "ready/passed", summary: "已确认列表页 + 详情抽屉的首版原型交互。", evidence: ["prototype/v1-leads.html", "抽屉式详情评审结论"], prompt: "如果原型没有问题，我会进入开发交付。" }), time.t4),
    msg(32, 1, "assistant", deliverableReferenceMessage({ title: "设计规范", stage: "interaction", type: "设计规范", status: "ready/passed", summary: "已定义首版 UI 样式、布局规则与详情抽屉交互规范。", evidence: ["design/v1-spec.md", "prototype/v1-leads.html"], prompt: "设计规范已补齐，可直接指导前端实现。" }), time.t4),
    msg(7, 1, "user", "原型可以，继续推进。", time.t4),
    msg(33, 1, "assistant", deliverableReferenceMessage({ title: "技术架构", stage: "development", type: "技术架构", status: "ready/passed", summary: "已明确前后端模块边界、数据流与首版回滚点。", evidence: ["docs/v1-architecture.md", "apps/web/src/leads"], prompt: "技术架构已锁定，可进入代码实现。" }), time.t5),
    msg(8, 1, "assistant", deliverableReferenceMessage({ title: "代码交付", stage: "development", type: "开发实现", status: "ready/passed", summary: "首版实现已覆盖三项核心能力，未引入额外扩展功能。", evidence: ["PR#101", "review-pass", "apps/web/src/leads"], prompt: "开发交付已完成，下一步进入测试验证。" }), time.t5),
    msg(9, 1, "assistant", deliverableReferenceMessage({ title: "测试矩阵", stage: "testing", type: "测试验证", status: "ready/passed", summary: "首版关键流程测试通过，可进入发布评审。", evidence: ["matrix-run-v1", "state-transition.log", "followup-record.log"], prompt: "测试通过后，我将发起发布评审。" }), time.t5),
    msg(10, 1, "assistant", deliverableReferenceMessage({ title: "发布评审", stage: "release", type: "发布评审", status: "ready/passed", summary: "首版发布评审结论 GO。", evidence: ["release-note-v1", "go-live-checklist"], prompt: "请确认作为 V1 基线发布。" }), time.t6),
    msg(11, 1, "assistant", deliverableReferenceMessage({ title: "交付归档", stage: "archive", type: "交付归档", status: "ready/passed", summary: "V1 已归档，成为 V1.1 的继承基线。", evidence: ["delivery/v1.0.0", "baseline/v1.0.0.json"], prompt: "V1 已归档，后续版本将从这套基线继承。" }), time.t6),
    msg(12, 1, "assistant", "协作记录：本轮由 Agent 调用 skills（需求解读技能、范围收敛技能、交付物治理技能）完成首版闭环。", time.t6),
    msg(13, 2, "assistant", "我已继承 V1 基线。请直接说明本轮变更，我会先做继承差异确认。", time.t9),
    msg(14, 2, "user", "V1.1 增加线索导出，还要让跟进记录支持 @同事提醒。", time.t10),
    msg(15, 2, "assistant", "我先确认差异：新增导出能力，新增跟进记录 @提醒；录入、状态推进和基础详情抽屉默认继承不变。", time.t10),
    msg(16, 2, "assistant", deliverableReferenceMessage({ title: "继承差异分析报告", stage: "clarification", type: "分析报告", status: "ready/passed", summary: "已确认 V1.1 在 V1 基线上新增导出与 @提醒，两者影响范围不同。", evidence: ["V1 基线归档", "V1.1 增量需求", "差异分析纪要"], prompt: "请确认这份差异理解；确认后我将锁定增量边界。" }), time.t10),
    msg(34, 2, "assistant", deliverableReferenceMessage({ title: "产品需求文档", stage: "clarification", type: "PRD", status: "ready/passed", summary: "增量 PRD 已明确导出与 @提醒的业务目标、约束、验收标准与延期条件。", evidence: ["docs/v1.1-prd.md", "变更需求说明"], prompt: "PRD 已补齐，可直接指导增量设计与开发。" }), time.t10),
    msg(17, 2, "user", "确认，导出入口放在列表顶部，不要改动原有详情抽屉结构。", time.t11),
    msg(18, 2, "assistant", deliverableReferenceMessage({ title: "原型与交互", stage: "interaction", type: "HTML/原型", status: "ready/passed", summary: "导出入口已调整至列表顶部，未改动原有详情抽屉结构。", evidence: ["prototype/v1.1-export.html", "原型反馈记录"], prompt: "原型已更新，我将继续生成增量开发交付。" }), time.t12),
    msg(35, 2, "assistant", deliverableReferenceMessage({ title: "设计规范", stage: "interaction", type: "设计规范", status: "ready/passed", summary: "增量设计规范已明确顶部导出入口、维持原详情抽屉，并撤回 @提醒相关视觉入口。", evidence: ["design/v1.1-spec.md", "prototype/v1.1-export.html"], prompt: "设计规范已补齐，可直接指导界面实现与回滚收敛。" }), time.t12),
    msg(36, 2, "assistant", deliverableReferenceMessage({ title: "技术架构", stage: "development", type: "技术架构", status: "partial/pending", summary: "已明确导出链路与通知链路边界，当前仅保留导出架构进入二次评审。", evidence: ["docs/v1.1-architecture.md", "apps/api/src/export"], prompt: "技术架构已更新，当前只保留导出链路继续推进。" }), time.t13),
    msg(19, 2, "assistant", deliverableReferenceMessage({ title: "代码交付", stage: "development", type: "开发实现", status: "partial/pending", summary: "导出实现保留，@提醒相关实现已回滚，待二次评审确认。", evidence: ["PR#128-export", "revert#129-mention", "apps/api/src/export"], prompt: "开发侧已按当前边界收敛，接下来进入测试验证。" }), time.t13),
    msg(20, 2, "assistant", deliverableReferenceMessage({ title: "测试矩阵", stage: "testing", type: "测试验证", status: "partial/failed", summary: "首轮测试因 @提醒导致保存失败而阻断，回滚后正准备二次验证。", evidence: ["mention-save-failed.log", "rollback-rerun.log", "export-regression.log"], prompt: "当前不建议直接发布，请先确认是否回滚 @提醒，仅保留导出。" }), time.t14),
    msg(21, 2, "user", "确认回滚 @提醒，保留导出，本轮先不上 @提醒。", time.t15),
    msg(22, 2, "assistant", deliverableReferenceMessage({ title: "发布评审", stage: "release", type: "发布评审", status: "partial/failed", summary: "首轮发布评审 BLOCK，要求回滚 @提醒并重新确认增量边界。", evidence: ["release-review-block.md", "rollback-plan-v1.1.md"], prompt: "回滚策略已确认，我将更新边界并准备导出能力的二次评审。" }), time.t15),
    msg(23, 2, "assistant", deliverableReferenceMessage({ title: "边界确认", stage: "scope", type: "范围定义", status: "partial/pending", summary: "回滚后仅保留导出能力，@提醒延后到下一版本。", evidence: ["增量范围确认", "回滚决策记录", "owner 最新确认"], prompt: "当前已收敛为可发布的导出增量，下一步是完成二次回归并发起二次评审。" }), time.t16),
    msg(24, 2, "assistant", "协作记录：本轮由 Agent 调用 skills（跨版本继承技能、差异评估技能、异常恢复技能、质量门禁技能）完成差异收敛与回滚修复。", time.t16)
  ],
  snapshots: [
    snapshot(1, 1, "create", "创建 V1 首版本迭代", { baselineIterationId: null, baselineIterationName: "", currentSummary: "V1 首版启动", deltaInScope: ["首次建立线索协同看板"], resolvedItems: [], pendingItems: ["业务澄清", "边界确认", "交付验证"], risks: [] }, { inScope: ["线索录入", "状态推进", "跟进记录"], outOfScope: ["审批流", "移动端", "导出能力"], acceptanceCriteria: ["三项核心能力可用", "关键门禁通过"] }, "in-progress", 0, time.t1),
    snapshot(2, 1, "state-transition", "V1 首版本归档完成", { baselineIterationId: null, baselineIterationName: "", currentSummary: "V1 已建立后续继承基线", deltaInScope: ["V1 首版能力闭环"], resolvedItems: ["业务澄清", "边界确认", "原型确认", "开发", "测试", "发布", "归档"], pendingItems: [], risks: [] }, { inScope: ["线索录入", "状态推进", "跟进记录"], outOfScope: ["审批流", "移动端", "导出能力"], acceptanceCriteria: ["三项核心能力可用", "关键门禁通过"] }, "completed", 100, time.t6),
    snapshot(3, 2, "create", "创建 V1.1 后续版本迭代", { baselineIterationId: 1, baselineIterationName: "V1 首版本：建立业务基线", currentSummary: "V1.1 从 V1 基线出发处理增量需求", deltaInScope: ["线索导出", "跟进记录 @提醒"], resolvedItems: ["继承基线读取"], pendingItems: ["差异确认", "边界收敛", "测试验证"], risks: ["新增通知链路可能影响现有跟进记录主路径"] }, { inScope: ["线索导出", "跟进记录 @提醒"], outOfScope: ["重做 V1 基础能力", "审批流", "移动端"], acceptanceCriteria: ["继承差异可追溯", "导出可独立上线", "@提醒若阻断需延期"] }, "in-progress", 30, time.t9),
    snapshot(4, 2, "state-transition", "V1.1 首轮评审阻断", { baselineIterationId: 1, baselineIterationName: "V1 首版本：建立业务基线", currentSummary: "@提醒导致跟进记录保存失败，首轮评审阻断", deltaInScope: ["新增回滚决策", "增量边界重新收敛"], resolvedItems: ["差异确认", "原型局部更新"], pendingItems: ["@提醒回滚", "导出二次回归", "二次评审"], risks: ["若回滚不彻底，会持续影响跟进记录主路径"] }, { inScope: ["线索导出", "跟进记录 @提醒", "回滚修复策略"], outOfScope: ["重做 V1 基础能力", "审批流", "移动端"], acceptanceCriteria: ["失败增量必须阻断发布", "回滚后边界需重新确认"] }, "review", 55, time.t15),
    snapshot(5, 2, "state-transition", "V1.1 回滚 @提醒后恢复推进", { baselineIterationId: 1, baselineIterationName: "V1 首版本：建立业务基线", currentSummary: "已回滚 @提醒，当前仅保留导出能力等待二次评审", deltaInScope: ["保留导出", "@提醒延期到后续版本"], resolvedItems: ["回滚执行", "增量边界重锁定"], pendingItems: ["导出二次回归", "二次发布评审"], risks: ["需确认导出能力独立上线的业务接受度"] }, { inScope: ["线索导出", "回滚修复策略"], outOfScope: ["@提醒上线", "审批流", "移动端"], acceptanceCriteria: ["导出可独立上线", "延期项记录清晰"] }, "in-progress", 62, time.t16)
  ],
  transitions: [
    transition(1, 1, "planned", "in-progress", "V1 启动执行", "创建后进入首版基线建立", "auto", "system", "system", time.t1),
    transition(2, 1, "in-progress", "review", "V1 进入发布评审", "原型、开发、测试完成", "manual", "owner", "owner", time.t6),
    transition(3, 1, "review", "completed", "V1 发布并归档", "发布评审 GO", "manual", "owner", "owner", time.t6),
    transition(4, 2, "planned", "in-progress", "V1.1 启动执行", "读取 V1 基线后进入增量确认", "auto", "system", "system", time.t9),
    transition(5, 2, "in-progress", "review", "V1.1 首轮评审阻断", "@提醒导致跟进记录保存失败", "manual", "owner", "owner", time.t15),
    transition(6, 2, "review", "in-progress", "V1.1 回滚 @提醒后恢复推进", "仅保留导出能力并重新进入二次评审准备", "manual", "owner", "owner", time.t16)
  ],
  auditLogs: [{ id: 1, actor: "system", action: "mock_reset", resource: "workspace", detail: "reset and seed agentic business-flow dataset", createdAt: isoHoursAgo(0.1) }],
  versionSnapshots: [],
  projectShares: [],
  deployments: [],
  templateRuns: [],
  opsTriageTemplates: [],
  mockContracts: [
    {
      iterationVersion: "1.0.0",
      scenario: "first-version-baseline",
      expectedMessageSequence: ["analysis-report", "boundary-confirmation", "prototype-preview", "code-delivery", "test-matrix", "release-review", "delivery-package"],
      expectedTransitions: ["planned->in-progress", "in-progress->review", "review->completed"],
      prohibitedTerms: ["继承差异", "历史版本分析报告", "flow_route", "skill-creator"]
    },
    {
      iterationVersion: "1.1.0",
      scenario: "follow-up-delta-with-rollback",
      expectedMessageSequence: ["analysis-report", "prototype-preview", "code-delivery", "test-matrix", "release-review", "boundary-confirmation"],
      expectedTransitions: ["planned->in-progress", "in-progress->review", "review->in-progress"],
      requiredTerms: ["继承 V1 基线", "导出", "@提醒", "回滚"],
      prohibitedTerms: ["flow_route", "skill-creator"]
    }
  ],
  projectPolicies: [
    {
      id: 1,
      projectId: 1,
      version: 1,
      status: "active",
      strategy: {
        stages: ["clarification", "scope", "interaction", "development", "testing", "release", "archive"],
        gates: [
          { stage: "scope", requiredArtifacts: ["analysis-report"], requireHumanConfirmation: true },
          { stage: "development", requiredArtifacts: ["boundary-confirmation", "prototype-preview"], requireHumanConfirmation: false },
          { stage: "release", requiredArtifacts: ["test-matrix", "acceptance-checklist"], requireHumanConfirmation: true }
        ],
        requiredConfirmations: {
          firstIterationBaseline: true,
          followUpRollbackDecision: true
        },
        exceptions: [{ key: "delta_test_blocked", fallbackAction: "rollback-and-rescope", requireUserDecision: true }],
        skillsPlan: [
          { stage: "clarification", skills: ["需求解读技能", "范围收敛技能"] },
          { stage: "interaction", skills: ["交付物治理技能"] },
          { stage: "clarification", skills: ["跨版本继承技能", "差异评估技能"] },
          { stage: "release", skills: ["异常恢复技能", "质量门禁技能"] }
        ]
      },
      createdBy: "owner",
      approvedBy: "owner",
      createdAt: time.t2,
      approvedAt: time.t2
    }
  ],
  projectWorkspaceBindings: [
    {
      id: 1,
      projectId: 1,
      assistantProfile: "buildwise-local",
      agentId: "main",
      workspacePath: resolve(dirname(new URL(import.meta.url).pathname), ".."),
      runtimeMode: "native",
      locked: false,
      createdBy: "system",
      createdAt: time.t0,
      updatedAt: time.t16
    }
  ],
  policyExecutionLogs: [
    { id: 1, projectId: 1, iterationId: 1, policyVersion: 1, stage: "clarification", action: "coach_reply_generated", result: "success", evidence: ["intent=clarify", "skills=需求解读技能|范围收敛技能"], createdAt: time.t2 },
    { id: 2, projectId: 1, iterationId: 1, policyVersion: 1, stage: "interaction", action: "artifact_preview_generated", result: "success", evidence: ["artifact=prototype-preview", "skills=交付物治理技能"], createdAt: time.t4 },
    { id: 3, projectId: 1, iterationId: 2, policyVersion: 1, stage: "clarification", action: "delta_analysis_completed", result: "success", evidence: ["artifact=analysis-report", "skills=跨版本继承技能|差异评估技能"], createdAt: time.t10 },
    { id: 4, projectId: 1, iterationId: 2, policyVersion: 1, stage: "release", action: "coach_gate_check", result: "blocked", evidence: ["reason=delta_test_blocked", "skills=异常恢复技能|质量门禁技能"], createdAt: time.t15 }
  ],
  projectRoleBindings: [{ id: 1, projectId: 1, userId: "13800138000", role: "admin", createdAt: time.t0, updatedAt: time.t0 }],
  platformRoleBindings: [{ id: 1, userId: "13800138000", role: "admin", createdAt: time.t0, updatedAt: time.t0 }],
  governanceCustomRoles: []
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, "..", "backend");
const outputPath = resolve(backendDir, "data.json");
const runtimeOutputPath = resolve(backendDir, "data.runtime.json");
const continuousModelingOutputPath = resolve(backendDir, "continuous-modeling.runtime.json");
const payload = `${JSON.stringify(data, null, 2)}\n`;
const continuousModelingPayload = `${JSON.stringify(buildAgenticFlowContinuousModelingStore(time), null, 2)}\n`;

writeFileSync(outputPath, payload, "utf-8");
writeFileSync(runtimeOutputPath, payload, "utf-8");
writeFileSync(continuousModelingOutputPath, continuousModelingPayload, "utf-8");

console.log(
  JSON.stringify(
    {
      ok: true,
      outputPath,
      runtimeOutputPath,
      continuousModelingOutputPath,
      projects: data.projects.length,
      iterations: data.iterations.length,
      messages: data.messages.length,
      snapshots: data.snapshots.length,
      transitions: data.transitions.length
    },
    null,
    2
  )
);
