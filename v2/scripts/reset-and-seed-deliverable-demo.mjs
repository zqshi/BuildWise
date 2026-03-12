#!/usr/bin/env node

const BASE = (process.env.BUILDWISE_API_BASE || "http://127.0.0.1:5055").replace(/\/+$/, "");
const DEMO_PROJECT_NAME = (process.env.BUILDWISE_DEMO_PROJECT_NAME || "真实流程演示项目").trim();
const CLEANUP_PATTERN = new RegExp(process.env.BUILDWISE_CLEANUP_PROJECT_PATTERN || "(mock|演示|demo|示例|临时|tmp)", "i");

function buildIterationPayload(name, description) {
  return {
    name,
    description,
    versionType: "minor",
    goals: ["对话驱动交付物治理", "管理员对话确认", "门禁与阶段流转闭环"],
    scope: {
      inScope: [
        "交付物引用卡自动插入",
        "交付物按类型详情渲染",
        "交付物 draft/commit/confirm",
        "管理员对话确认并继续执行"
      ],
      outOfScope: ["独立冲突包", "多人实时冲突自动合并"],
      acceptanceCriteria: [
        "每阶段均可看到对应类型交付物",
        "阻断后会话中出现管理员确认请求",
        "管理员确认后可继续阶段推进",
        "归档阶段可查看交付文件清单"
      ]
    },
    aiSummary: "以真实业务流程演示交付物治理与质量门禁链路。"
  };
}

const artifactSeeds = [
  {
    id: "analysis-report",
    stage: "clarification",
    title: "需求与现状分析报告",
    type: "document",
    draft: [
      "# 需求与现状分析报告",
      "",
      "## 业务目标",
      "- 将质量门禁和协同确认融合到迭代对话流程。",
      "- 确保交付物可查看、可编辑、可确认、可追溯。",
      "",
      "## 风险点",
      "- 若交付物确认失败，必须触发管理员确认。",
      "- 阶段推进需确保上游门禁通过。"
    ].join("\n"),
    summary: "完成需求与风险分析，进入边界确认。",
    evidence: ["需求澄清记录", "历史迭代回顾", "门禁规则草案"],
    source: "requirements/docs"
  },
  {
    id: "boundary-confirmation",
    stage: "scope",
    title: "范围边界确认",
    type: "document",
    draft: [
      "requirementRefs:",
      "- REQ-ITERATION-CHAT-GATE",
      "- REQ-DELIVERABLE-TYPED-PREVIEW",
      "componentRefs:",
      "- IterationWorkspacePanel",
      "- WorkspaceServiceChangeControlArtifactOps",
      "codePaths:",
      "- v2/src/pages/projects/IterationWorkspacePanel.tsx",
      "- v2/backend/src/application/workspace/workspaceServiceChangeControlArtifactOps.ts"
    ].join("\n"),
    summary: "边界锁定为迭代工作区与交付物治理主链路。",
    evidence: ["边界评审纪要", "路径白名单"],
    source: "scope/review"
  },
  {
    id: "prototype-preview",
    stage: "interaction",
    title: "HTML 原型（交付物抽屉）",
    type: "html-prototype",
    draft: [
      "<!doctype html>",
      "<html><head><meta charset='utf-8'><style>",
      "body{font-family:ui-sans-serif;background:#f5f7fb;padding:24px;color:#1f2937}",
      ".card{background:#fff;border:1px solid #dbe2ea;border-radius:12px;padding:16px;max-width:760px}",
      ".tag{display:inline-block;background:#ecfeff;color:#155e75;border-radius:999px;padding:4px 10px;font-size:12px}",
      "h2{margin:10px 0 6px} ul{margin:0 0 0 18px}",
      "</style></head><body>",
      "<div class='card'><span class='tag'>html-prototype</span>",
      "<h2>交付物抽屉流程</h2><ul>",
      "<li>查看交付物详情（按类型）</li><li>编辑并提交</li>",
      "<li>阻断时通知管理员对话确认</li><li>确认后继续执行</li>",
      "</ul></div></body></html>"
    ].join(""),
    summary: "原型确认通过，进入开发实现。",
    evidence: ["交互原型HTML", "流程走查截图"],
    source: "prototype/html"
  },
  {
    id: "code-delivery",
    stage: "development",
    title: "代码交付记录",
    type: "code",
    draft: [
      "diff --git a/v2/src/pages/projects/IterationWorkspacePanel.tsx b/v2/src/pages/projects/IterationWorkspacePanel.tsx",
      "+ type ArtifactPreviewKind = ...",
      "+ handleSaveCurrentArtifactDraft()",
      "+ handleCommitCurrentArtifact()",
      "+ handleConfirmCurrentArtifact()",
      "diff --git a/v2/backend/src/application/workspace/workspaceServiceChangeControlArtifactOps.ts b/...",
      "+ buildArtifactReferenceMessage()",
      "+ notifyAdminConfirmation()",
      "+ commit/transition auto append deliverable cards"
    ].join("\n"),
    summary: "前后端实现已交付，等待测试验证。",
    evidence: ["代码路径映射", "契约测试通过记录"],
    source: "git/iteration"
  },
  {
    id: "test-matrix",
    stage: "testing",
    title: "测试矩阵执行",
    type: "test-cases",
    draft: [
      "- CASE-1: commit 后自动插入交付物引用卡 -> passed",
      "- CASE-2: blocked 时触发管理员确认消息 -> blocked(等待管理员确认)",
      "- CASE-3: 类型化详情渲染(document/html/code/test) -> passed"
    ].join("\n"),
    summary: "测试发现 1 个阻断项，需要管理员确认继续推进。",
    evidence: ["合同测试日志", "手工验收记录"],
    source: "qa/matrix"
  },
  {
    id: "acceptance-checklist",
    stage: "testing",
    title: "验收清单",
    type: "test-cases",
    draft: [
      "- [x] 交付物支持查看与编辑",
      "- [x] 阻断时管理员确认通知",
      "- [x] 确认后可继续执行",
      "- [x] 全链路可追溯"
    ].join("\n"),
    summary: "验收项满足，准备发布评审。",
    evidence: ["验收会议纪要"],
    source: "qa/acceptance"
  },
  {
    id: "release-review",
    stage: "release",
    title: "发布评审结论",
    type: "release-review",
    draft: JSON.stringify(
      {
        decision: "go",
        reason: "核心门禁通过，管理员确认链路可用",
        blockers: [],
        rollback: {
          trigger: "管理员确认失败率持续异常",
          actions: ["冻结发布", "回滚上版", "复盘审计日志"]
        }
      },
      null,
      2
    ),
    summary: "发布评审结论 GO。",
    evidence: ["发布评审记录", "回滚演练记录"],
    source: "release/review"
  },
  {
    id: "delivery-package",
    stage: "archive",
    title: "交付归档包",
    type: "delivery-package",
    draft: JSON.stringify(
      {
        files: [
          "deliverables/iteration-X/release-review.md",
          "deliverables/iteration-X/delivery-manifest.json",
          "tests/generated/iteration-X/acceptance-checklist.md"
        ],
        handover: "下版本继承交付物治理模式与管理员确认机制"
      },
      null,
      2
    ),
    summary: "归档完成，作为下一迭代基线。",
    evidence: ["交付清单", "交接记录"],
    source: "archive/package"
  }
];

function toJsonHeaders(extra = {}) {
  return { "Content-Type": "application/json", ...extra };
}

async function requestJson(path, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, { ...options, signal: controller.signal });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`network error for ${path}: ${reason}`);
    }
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
    throw new Error(`${label} failed: status=${result.status}; body=${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function createMessage(iterationId, role, content) {
  return assertOk(`createMessage:${role}`, () =>
    requestJson(`/api/iterations/${iterationId}/messages`, {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify({ role, content })
    })
  );
}

async function cleanupMockProjects() {
  const projects = await assertOk("listProjects", () => requestJson("/api/projects"));
  const removed = [];
  for (const project of Array.isArray(projects) ? projects : []) {
    const name = String(project?.name || "");
    if (!CLEANUP_PATTERN.test(name)) continue;
    await requestJson(`/api/projects/${project.id}`, { method: "DELETE" });
    removed.push({ id: project.id, name });
  }
  return removed;
}

async function ensureDemoProject() {
  const projects = await assertOk("listProjectsAfterCleanup", () => requestJson("/api/projects"));
  const existing = Array.isArray(projects) ? projects.find((item) => String(item?.name || "") === DEMO_PROJECT_NAME) : null;
  if (existing) return existing;
  return assertOk("createDemoProject", () =>
    requestJson("/api/projects", {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify({
        name: DEMO_PROJECT_NAME,
        description: "用于演示对话化交付物治理与质量门禁闭环。"
      })
    })
  );
}

async function createDemoIteration(projectId) {
  const created = await assertOk("createDemoIteration", () =>
    requestJson(`/api/projects/${projectId}/iterations`, {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify(buildIterationPayload("V2-真实交付物流程演示", "按真实流程演示交付物生命周期与管理员确认闭环"))
    })
  );
  return created.id;
}

async function stageTransition(iterationId, toStage) {
  await assertOk(`stageTransition:${toStage}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/stage/transition`, {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify({ toStage, actor: "seed-script", note: `seed transition to ${toStage}` })
    })
  );
}

async function seedArtifact(iterationId, seed) {
  await assertOk(`draft:${seed.id}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${seed.id}/draft`, {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify({ actor: "seed-script", content: seed.draft, media: [seed.type] })
    })
  );
  await assertOk(`commit:${seed.id}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${seed.id}/commit`, {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify({
        actor: "seed-script",
        summary: seed.summary,
        source: seed.source,
        evidence: seed.evidence
      })
    })
  );

  if (seed.id === "test-matrix") {
    await assertOk(`confirmBlocked:${seed.id}`, () =>
      requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${seed.id}/confirm`, {
        method: "POST",
        headers: toJsonHeaders(),
        body: JSON.stringify({
          actor: "seed-script",
          passed: false,
          note: "测试矩阵存在阻断项，需管理员在对话窗口确认。"
        })
      })
    );
    await createMessage(iterationId, "user", "管理员确认：阻断项风险可控，允许继续推进并跟踪回归。");
    await createMessage(iterationId, "assistant", "已记录管理员确认，恢复执行并继续后续阶段。");
  }

  await assertOk(`confirm:${seed.id}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${seed.id}/confirm`, {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify({ actor: "seed-script", passed: true, note: `${seed.title}确认通过` })
    })
  );
}

async function main() {
  const removedProjects = await cleanupMockProjects();
  const project = await ensureDemoProject();
  const iterationId = await createDemoIteration(project.id);

  await assertOk("updateInteractionState", () =>
    requestJson(`/api/iterations/${iterationId}/interaction-state`, {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify({
        hasPrototypeAssets: true,
        uploadKind: "prototype",
        lastAttachmentName: "prototype/deliverable-drawer.html"
      })
    })
  );

  await assertOk("updateBoundary", () =>
    requestJson(`/api/iterations/${iterationId}/change-control/boundary`, {
      method: "POST",
      headers: toJsonHeaders(),
      body: JSON.stringify({
        requirementRefs: ["REQ-ITERATION-CHAT-GATE", "REQ-DELIVERABLE-TYPED-PREVIEW"],
        componentRefs: ["IterationWorkspacePanel", "ChangeControlArtifactOps"],
        codePaths: [
          "v2/src/pages/projects/IterationWorkspacePanel.tsx",
          "v2/backend/src/application/workspace/workspaceServiceChangeControlArtifactOps.ts"
        ],
        note: "演示流程边界：仅覆盖交付物治理链路。"
      })
    })
  );

  const stageOrder = ["clarification", "scope", "interaction", "development", "testing", "release", "archive"];
  let activeStage = "clarification";

  await createMessage(
    iterationId,
    "assistant",
    "演示已启动：系统将按真实业务流程逐阶段生成并确认不同类型交付物。"
  );

  for (const stage of stageOrder) {
    const stageSeeds = artifactSeeds.filter((item) => item.stage === stage);
    for (const seed of stageSeeds) {
      await seedArtifact(iterationId, seed);
    }
    const nextIndex = stageOrder.indexOf(stage) + 1;
    if (nextIndex < stageOrder.length) {
      const nextStage = stageOrder[nextIndex];
      await stageTransition(iterationId, nextStage);
      activeStage = nextStage;
    }
  }

  const workflow = await assertOk("fetchWorkflow", () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts`)
  );
  const messages = await assertOk("fetchMessages", () => requestJson(`/api/iterations/${iterationId}/messages`));

  const report = {
    ok: true,
    apiBase: BASE,
    removedProjects,
    demoProject: { id: project.id, name: project.name },
    demoIterationId: iterationId,
    activeStage,
    artifactSummary: Array.isArray(workflow?.items)
      ? workflow.items.map((item) => ({
          id: item.id,
          stage: item.stage,
          status: item.status,
          gateStatus: item.gateStatus,
          outputVersion: item.outputVersion
        }))
      : [],
    messageCount: Array.isArray(messages) ? messages.length : 0
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`[reset-and-seed-deliverable-demo] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
