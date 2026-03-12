#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BUILDWISE_API_BASE || "http://127.0.0.1:5055";
const TARGET_ITERATION_ID = Number.parseInt(process.env.BUILDWISE_ITERATION_ID || "", 10);
const TARGET_PROJECT_ID = Number.parseInt(process.env.BUILDWISE_PROJECT_ID || "", 10);
const STOP_STAGE = (process.env.BUILDWISE_STOP_STAGE || "archive").trim();
const NOW = new Date();
const STAMP = NOW.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const ACTOR = "mock-seed-agent";

const stageOrder = ["clarification", "scope", "interaction", "development", "testing", "release", "archive"];
const decisionLabelMap = {
  go: "可继续推进",
  hold: "需补充后推进",
  block: "需暂停处理"
};

const artifactSeeds = [
  {
    id: "analysis-report",
    stage: "clarification",
    title: "附件分析报告",
    source: "需求访谈与历史反馈",
    depth: "high",
    goal: "确认业务理解是否正确，识别关键风险与假设。",
    draft:
      "<h3>分析环节（高深度）</h3><p>本轮输入包含 PRD、上版本评审记录、客服反馈与仓库分支快照。综合判断当前版本的核心目标是‘以对话驱动交付物决策’，并将确认动作从固定区域迁移到会话闭环。</p><ul><li>核心意图：减少固定面板依赖，提高决策透明度</li><li>主要风险：边界口径不一致导致后续开发偏航</li><li>关键假设：业务方优先关注闭环决策而非全量信息罗列</li><li>冲突点：历史流程依赖右侧面板说明</li></ul>",
    summary: "完成高深度分析，输出可执行澄清清单与风险链路。",
    evidence: ["业务访谈纪要", "历史问题清单", "版本目标说明", "客户反馈摘要"],
    skillRuns: [
      "需求解读技能：完成业务目标拆解与假设识别",
      "风险梳理技能：输出关键风险链路与影响说明",
      "澄清提问技能：生成待确认问题与确认话术"
    ],
    note: "分析报告确认通过：按对话驱动推进范围定义。",
    packet: {
      decision: "hold",
      why: [
        "业务目标已收敛为‘对话驱动闭环’",
        "历史流程仍存在固定区域依赖",
        "边界定义口径尚未由业务方确认"
      ],
      gap: [
        "是否接受‘分析环节全面展示，后续按需展示’策略？",
        "首版是否要求保留回退开关？"
      ],
      ask: "请确认分析策略：A.全面展示分析结果并逐项确认；B.仅保留摘要后按需追问。",
      impact: "若不确认分析策略，边界定义将缺少统一口径，影响后续开发与验收。",
      nextInput: "边界清单（需求项、功能模块、影响范围）"
    },
    dialogue: [
      {
        user: "确认采用 A：分析环节全面展示并逐项确认。",
        assistant: "收到，我将按高深度输出分析证据，并把未决项转为边界确认输入。"
      },
      {
        user: "首版保留回退开关，避免一次性切换风险。",
        assistant: "已记录回退策略为发布评审前置条件，并写入后续交付物。"
      }
    ]
  },
  {
    id: "boundary-confirmation",
    stage: "scope",
    title: "边界确认",
    source: "范围共识会",
    depth: "medium-high",
    goal: "锁定本版本要做与不做的范围，并形成后续执行输入。",
    draft:
      "<h3>范围边界定义（中高深度）</h3><p>围绕‘对话驱动闭环’，本轮边界明确覆盖：澄清触发、确认回写、阶段推进、风险回退。</p><ul><li>需求边界：REQ-401/402/405</li><li>组件边界：会话窗口、交付物消息卡、阶段推进引擎</li><li>代码边界：v2/src/pages/projects、v2/src/app、v2/backend/src/application/workspace</li><li>验收口径：所有确认动作必须在对话完成</li></ul>",
    summary: "完成“需求项-功能模块-影响范围”三维边界锁定。",
    evidence: ["本版本要做项清单", "本版本不做项清单", "影响业务环节列表"],
    skillRuns: [
      "范围收敛技能：完成要做/不做项划分",
      "影响评估技能：标注业务环节影响面"
    ],
    note: "边界确认通过：进入交互方案设计。",
    packet: {
      decision: "hold",
      why: [
        "边界已初步锁定",
        "仍需确认本版本不做项清单",
        "测试与发布口径已可对齐"
      ],
      gap: ["是否将‘固定侧栏展示完整交付物详情’明确列为本版本不做项？"],
      ask: "请确认本版本不做项是否包含：固定侧栏展示完整交付物详情。",
      impact: "若本版本不做项不明确，交互与开发可能再次引入冗余展示。",
      nextInput: "交互方案输入与阶段推进计划"
    },
    dialogue: [
      {
        user: "确认，固定侧栏全量详情设为本版本不做项。",
        assistant: "已确认并写入边界说明，后续仅保留对话入口与必要交互抽屉。"
      }
    ]
  },
  {
    id: "prototype-preview",
    stage: "interaction",
    title: "原型与交互",
    source: "流程原型评审",
    depth: "medium",
    goal: "验证关键流程可用性与澄清交互可达性。",
    draft:
      "<h3>交互方案（中深度）</h3><p>会话消息卡仅保留‘继续澄清 / 确认通过 / 标记阻断’动作，点击后自动注入对话指令。原型抽屉仅用于可视化选择，不承担决策确认。</p><ul><li>主流程：决策包 -> 澄清 -> 回显确认 -> 推进</li><li>异常流程：澄清失败 -> 标记阻断并说明风险</li><li>约束：同一轮只推进一个关键决策</li></ul>",
    media: ["prototype/iteration-v4.html"],
    summary: "交互链路与对话推进节奏已形成闭环。",
    evidence: ["关键流程草图", "异常流程草图", "操作路径说明"],
    skillRuns: [
      "流程设计技能：梳理主流程与异常流程",
      "对话交互技能：将操作转成会话动作"
    ],
    note: "交互方案确认通过，进入开发实现。",
    packet: {
      decision: "go",
      why: ["关键流程与异常流程均可达", "决策动作已统一转入对话", "交互抽屉角色边界明确"],
      gap: [],
      ask: "若无新增约束，请确认进入开发实现。",
      impact: "继续停留将延迟后续代码验证与测试执行。",
      nextInput: "开发计划与交付记录"
    },
    dialogue: [
      {
        user: "确认进入开发实现。",
        assistant: "收到，下一步将提交代码映射与风险点，并回写交付物。"
      }
    ]
  },
  {
    id: "code-delivery",
    stage: "development",
    title: "代码交付",
    source: "开发实现与评审",
    depth: "medium",
    goal: "证明实现覆盖边界且具备追溯能力。",
    draft:
      "<h3>开发实现（中深度）</h3><p>完成会话驱动确认逻辑、消息卡动作注入、分析抽屉冗余移除与阶段推进联动。</p><ul><li>前端：会话按钮注入指令与自动推进</li><li>后端：交付物流程接口与状态回写保持一致</li><li>追溯：分支/提交/PR/路径映射完整</li></ul>",
    media: ["v2/src/pages/projects/IterationWorkspacePanel.tsx", "v2/backend/src/application/workspace/workspaceServiceChangeControlArtifactOps.ts"],
    summary: "代码实现与边界映射闭合，可进入测试验证。",
    evidence: ["开发任务完成记录", "代码评审通过记录", "影响范围回写记录"],
    skillRuns: [
      "任务拆解技能：产出可执行开发任务",
      "实现核验技能：检查范围与实现一致性"
    ],
    note: "代码交付确认通过，进入测试矩阵执行。",
    packet: {
      decision: "hold",
      why: ["核心功能已实现", "边界映射完整", "仍需验证回退策略开关生效"],
      gap: ["回退开关在异常链路下是否可用？"],
      ask: "请确认是否将‘回退开关冒烟验证’作为测试门禁必选项。",
      impact: "若不验证回退，发布评审将缺少关键风险控制证据。",
      nextInput: "测试结果与回退策略"
    },
    dialogue: [
      {
        user: "确认，回退开关冒烟验证作为必选门禁。",
        assistant: "已写入测试矩阵前置条件，后续将回填执行证据。"
      }
    ]
  },
  {
    id: "test-matrix",
    stage: "testing",
    title: "测试矩阵",
    source: "测试验证执行",
    depth: "medium",
    goal: "判定是否满足发布门禁。",
    draft:
      "<h3>测试验证（中深度）</h3><p>覆盖会话澄清、确认推进、阻断回退、跨阶段流转与回退开关冒烟。</p><ul><li>总用例：22</li><li>通过：20</li><li>失败：1（澄清回显文案歧义）</li><li>阻塞：1（回退脚本环境变量缺失）</li></ul>",
    media: ["tests/generated/iteration-1/acceptance-checklist.md"],
    summary: "测试发现 2 项关键问题，需修复后再发布。",
    evidence: ["关键场景验证记录", "异常场景验证记录", "问题修复复测记录"],
    skillRuns: [
      "测试设计技能：生成关键验证场景",
      "问题归因技能：输出失败原因与修复建议"
    ],
    note: "测试问题已澄清并修复，允许进入发布评审。",
    packet: {
      decision: "hold",
      why: ["存在 1 失败 + 1 阻塞", "失败项影响澄清可理解性", "阻塞项影响回退可执行性"],
      gap: ["是否接受先修复后发布，而非带风险放行？"],
      ask: "请确认发布策略：先修复两项问题再进入发布评审。",
      impact: "若直接发布，可能出现澄清误导或回退不可执行风险。",
      nextInput: "验收结论与待处理风险项"
    },
    dialogue: [
      {
        user: "确认，先修复后发布。",
        assistant: "已记录并回填测试结论：两项问题修复完成，准备进入验收与发布评审。"
      }
    ]
  },
  {
    id: "acceptance-checklist",
    stage: "testing",
    title: "验收清单",
    source: "业务验收评审",
    depth: "medium",
    goal: "确认业务验收口径与证据完整。",
    draft:
      "<h3>验收清单（中深度）</h3><ul><li>所有澄清问题可在对话完成闭环</li><li>确认通过后阶段状态自动推进</li><li>阻断场景可在对话明确风险与回退条件</li><li>不依赖固定区域即可完成端到端流程</li></ul>",
    summary: "验收口径与证据闭环，满足发布前置条件。",
    evidence: ["业务验收结论", "回归关注点记录", "关键对话确认记录"],
    skillRuns: ["验收核对技能：对齐验收口径与证据", "回归治理技能：确认遗留风险可控"],
    note: "验收确认通过：进入发布评审。",
    packet: {
      decision: "go",
      why: ["关键验收项已通过", "失败/阻塞项已有修复证据", "回归关注点可追踪"],
      gap: [],
      ask: "请确认进入发布评审。",
      impact: "继续停留将延迟版本交付节奏。",
      nextInput: "发布结论与回退预案"
    },
    dialogue: [
      {
        user: "确认进入发布评审。",
        assistant: "收到，发布评审将聚焦阻断项清零与回滚可行性。"
      }
    ]
  },
  {
    id: "release-review",
    stage: "release",
    title: "发布评审",
    source: "发布决策会议",
    depth: "medium",
    goal: "形成“可发布/谨慎发布/暂停发布”决策与回滚策略。",
    draft:
      "<h3>发布评审（中深度）</h3><p>结论：GO（附条件）。阻断项清零，回退开关经冒烟验证可执行。</p><ul><li>风险等级：中低</li><li>附加条件：首日观测澄清对话完成率</li><li>回滚条件：对话确认失败率连续 30 分钟 > 5%</li></ul>",
    summary: "发布评审结论 GO，附带观测与回滚条件。",
    evidence: ["发布决策纪要", "风险与应对清单", "回退演练结果"],
    skillRuns: [
      "发布门禁技能：形成发布结论",
      "应急预案技能：确认回退触发条件与动作"
    ],
    note: "发布评审通过，进入交付归档。",
    packet: {
      decision: "go",
      why: ["阻断项已清零", "回滚演练通过", "风险监控指标明确"],
      gap: [],
      ask: "请确认按 GO 结论归档，并作为下迭代基线。",
      impact: "若不归档，将影响跨迭代继承输入质量。",
      nextInput: "归档摘要与跨版本遗留风险"
    },
    dialogue: [
      {
        user: "确认 GO 并归档。",
        assistant: "已确认，进入归档并沉淀下迭代继承要点。"
      }
    ]
  },
  {
    id: "delivery-package",
    stage: "archive",
    title: "交付归档",
    source: "版本归档与交接",
    depth: "low-medium",
    goal: "形成可继承的跨迭代输入。",
    draft:
      "<h3>交付归档（低到中深度）</h3><p>归档本迭代决策包、关键证据、发布结论与遗留风险，并生成下一迭代启动清单。</p><ul><li>继承项：对话驱动确认协议、回退开关策略</li><li>遗留风险：极端场景下澄清文案歧义</li><li>责任人：产品/研发/测试三方共担</li></ul>",
    summary: "归档完成，可作为下迭代起点。",
    evidence: ["本版关键结论", "遗留风险清单", "下版启动输入清单"],
    skillRuns: [
      "归档整理技能：沉淀版本关键结论",
      "跨版继承技能：生成下版本输入清单"
    ],
    note: "归档完成：本迭代闭环结束并可跨版本继承。",
    packet: {
      decision: "go",
      why: ["继承项明确", "遗留风险与责任人明确", "下迭代输入已成文"],
      gap: [],
      ask: "请确认将本归档作为下一版本 baseline。",
      impact: "若不设为 baseline，下迭代需重复澄清，增加启动成本。",
      nextInput: "下一版本启动输入（继承结论、风险、关键决策）"
    },
    dialogue: [
      {
        user: "确认作为下一版本 baseline。",
        assistant: "已确认，本迭代闭环完成。"
      }
    ]
  }
];

async function requestJson(path, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function assertOk(label, fn) {
  const result = await fn();
  if (!result.ok) {
    throw new Error(`${label} failed: status=${result.status} body=${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function detectIteration() {
  if (Number.isFinite(TARGET_ITERATION_ID) && TARGET_ITERATION_ID > 0) {
    return { iterationId: TARGET_ITERATION_ID, projectId: TARGET_PROJECT_ID || 0 };
  }
  const projects = await assertOk("listProjects", () => requestJson("/api/projects"));
  const sortedProjects = Array.isArray(projects) ? [...projects].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)) : [];
  const candidateProjects =
    Number.isFinite(TARGET_PROJECT_ID) && TARGET_PROJECT_ID > 0
      ? sortedProjects.filter((item) => Number(item?.id) === TARGET_PROJECT_ID)
      : sortedProjects;
  for (const project of candidateProjects) {
    const iterations = await assertOk(`listIterations#${project.id}`, () => requestJson(`/api/projects/${project.id}/iterations`));
    const sortedIterations = Array.isArray(iterations) ? [...iterations].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)) : [];
    if (sortedIterations.length > 0) {
      return { iterationId: Number(sortedIterations[0].id), projectId: Number(project.id) };
    }
  }
  throw new Error("no iteration found, please create an iteration first");
}

async function postMessage(iterationId, role, content) {
  return assertOk(`message:${role}`, () =>
    requestJson(`/api/iterations/${iterationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ role, content })
    })
  );
}

function buildDecisionPacket(seed) {
  const header = `【交付物决策包】${seed.title}（阶段：${seed.stage}，展示深度：${seed.depth}）`;
  const why = seed.packet.why.map((item) => `- ${item}`).join("\n") || "- 无";
  const gaps = seed.packet.gap.length > 0 ? seed.packet.gap.map((item) => `- ${item}`).join("\n") : "- 无";
  const skillRuns = Array.isArray(seed.skillRuns) && seed.skillRuns.length > 0 ? seed.skillRuns.map((item) => `- ${item}`).join("\n") : "- 无";
  return [
    header,
    `当前判断：${decisionLabelMap[seed.packet.decision] || seed.packet.decision}`,
    `目标：${seed.goal}`,
    "本轮已执行技能：",
    skillRuns,
    "依据：",
    why,
    "待澄清：",
    gaps,
    `下一问：${seed.packet.ask}`,
    `影响：${seed.packet.impact}`,
    `下一步沉淀：${seed.packet.nextInput}`
  ].join("\n");
}

async function applyArtifactSeed(iterationId, seed) {
  await assertOk(`draft:${seed.id}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${seed.id}/draft`, {
      method: "POST",
      body: JSON.stringify({
        actor: ACTOR,
        content: seed.draft,
        media: Array.isArray(seed.media) ? seed.media : []
      })
    })
  );

  await assertOk(`commit:${seed.id}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${seed.id}/commit`, {
      method: "POST",
      body: JSON.stringify({
        actor: ACTOR,
        summary: seed.summary,
        source: seed.source,
        evidence: seed.evidence
      })
    })
  );

  await postMessage(iterationId, "assistant", buildDecisionPacket(seed));

  for (const turn of seed.dialogue) {
    await postMessage(iterationId, "user", turn.user);
    await postMessage(iterationId, "assistant", turn.assistant);
  }

  if (seed.packet.decision === "hold") {
    await assertOk(`confirm-blocked:${seed.id}`, () =>
      requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${seed.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          actor: ACTOR,
          passed: false,
          note: "需管理员在对话确认后继续。"
        })
      })
    );
    await postMessage(iterationId, "user", "管理员确认：同意继续，请按既定边界推进。");
    await postMessage(iterationId, "assistant", "已收到管理员确认，恢复推进。");
  }

  await assertOk(`confirm-pass:${seed.id}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${seed.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({
        actor: ACTOR,
        passed: true,
        note: seed.note
      })
    })
  );

  await postMessage(iterationId, "assistant", `交付物已确认：${seed.title}。下一步将基于对话结论推进 ${seed.packet.nextInput}。`);
}

async function transition(iterationId, toStage) {
  await assertOk(`transition:${toStage}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/stage/transition`, {
      method: "POST",
      body: JSON.stringify({
        toStage,
        actor: ACTOR,
        note: `mock 对话闭环推进到 ${toStage}`
      })
    })
  );
}

async function main() {
  if (!stageOrder.includes(STOP_STAGE)) {
    throw new Error(`invalid BUILDWISE_STOP_STAGE=${STOP_STAGE}`);
  }

  const target = await detectIteration();
  const iterationId = target.iterationId;
  const beforeWorkflow = await assertOk("artifacts:before", () => requestJson(`/api/iterations/${iterationId}/change-control/artifacts`));
  const currentStage = stageOrder.includes(beforeWorkflow?.activeStage) ? beforeWorkflow.activeStage : "clarification";

  await postMessage(
    iterationId,
    "assistant",
    "Agent 已进入对话驱动模式：后续每个交付物都将先输出决策包（决策/证据/缺口/下一问），再进行澄清与确认推进。"
  );

  await assertOk("interactionState", () =>
    requestJson(`/api/iterations/${iterationId}/interaction-state`, {
      method: "POST",
      body: JSON.stringify({
        hasPrototypeAssets: true,
        uploadKind: "prototype",
        lastAttachmentName: "prototype/iteration-v4.html"
      })
    })
  );

  await assertOk("boundary", () =>
    requestJson(`/api/iterations/${iterationId}/change-control/boundary`, {
      method: "POST",
      body: JSON.stringify({
        requirementRefs: ["目标确认闭环", "澄清问题可追踪", "风险处理可回溯"],
        componentRefs: ["会话沟通区", "决策卡片", "阶段推进器"],
        codePaths: [
          "会话交互流程",
          "决策推进逻辑",
          "质量与发布治理"
        ],
        note: "mock: 对话驱动交付物闭环边界"
      })
    })
  );

  await assertOk("codeLink", () =>
    requestJson(`/api/iterations/${iterationId}/code-link`, {
      method: "POST",
      body: JSON.stringify({
        branch: "dialog-driven-business-flow",
        tag: "business-flow-mock-v2",
        commit: "bizflow-v2",
        pr: "内部评审已通过",
        paths: ["会话交互流程", "交付物决策包", "测试与发布链路"],
        note: "mock：Agent+Skills 业务闭环演示"
      })
    })
  );

  for (const seed of artifactSeeds) {
    await applyArtifactSeed(iterationId, seed);
  }

  const stopIndex = stageOrder.indexOf(STOP_STAGE);
  const currentIndex = stageOrder.indexOf(currentStage);
  for (let i = Math.max(0, currentIndex); i < stopIndex; i += 1) {
    await transition(iterationId, stageOrder[i + 1]);
  }

  const workflow = await assertOk("artifacts", () => requestJson(`/api/iterations/${iterationId}/change-control/artifacts`));
  const out = {
    ok: true,
    apiBase: BASE,
    planVersion: "v2-agent-skills-business-flow",
    projectId: target.projectId,
    iterationId,
    initialStage: currentStage,
    stopStage: STOP_STAGE,
    activeStage: workflow.activeStage,
    businessBoard: Array.isArray(workflow.items)
      ? workflow.items.map((item) => ({
          id: item.id,
          stage: item.stage,
          progress:
            item.status === "ready"
              ? "已完成"
              : item.status === "partial"
                ? "进行中"
                : "待启动",
          decision:
            item.gateStatus === "passed"
              ? "可继续推进"
              : item.gateStatus === "blocked"
                ? "需暂停处理"
                : "待确认",
          summary: item.summary
        }))
      : [],
    skillBoard: artifactSeeds.map((seed) => ({
      id: seed.id,
      stage: seed.stage,
      goal: seed.goal,
      depth: seed.depth,
      decision: decisionLabelMap[seed.packet.decision] || seed.packet.decision,
      gapCount: seed.packet.gap.length,
      ask: seed.packet.ask,
      executedSkills: seed.skillRuns || []
    }))
  };

  const outDir = join(process.cwd(), "backend", ".runtime", "recordings");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `seed-deliverable-style-mock-${STAMP}.json`);
  writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify({ ...out, output: outFile }, null, 2));
}

main().catch((error) => {
  console.error(`[seed-deliverable-style-mock] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
