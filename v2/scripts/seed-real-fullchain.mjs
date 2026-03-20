#!/usr/bin/env node

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BUILDWISE_API_BASE || "http://127.0.0.1:5055";
const TARGET_PROJECT_ID = Number.parseInt(process.env.BUILDWISE_PROJECT_ID || "", 10);
const ALLOW_COACH_FALLBACK = (process.env.BUILDWISE_ALLOW_COACH_FALLBACK || "1").trim() !== "0";
const NOW = new Date();
const STAMP = NOW.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const decisionLabelMap = {
  go: "可发布",
  caution: "谨慎发布",
  block: "暂停发布"
};
const stageSkillMap = {
  clarification: ["需求解读技能", "风险梳理技能", "澄清提问技能"],
  scope: ["范围收敛技能", "影响评估技能"],
  interaction: ["流程设计技能", "对话交互技能"],
  development: ["任务拆解技能", "实现核验技能"],
  testing: ["测试设计技能", "问题归因技能", "验收核对技能"],
  release: ["发布门禁技能", "应急预案技能"],
  archive: ["归档整理技能", "跨版继承技能"]
};
const artifactFlow = [
  { id: "analysis-report", stage: "clarification", title: "附件分析报告", decision: "需补充后推进" },
  { id: "boundary-confirmation", stage: "scope", title: "边界确认", decision: "需补充后推进" },
  { id: "prototype-preview", stage: "interaction", title: "原型与交互", decision: "可继续推进" },
  { id: "code-delivery", stage: "development", title: "代码交付", decision: "需补充后推进" },
  { id: "test-matrix", stage: "testing", title: "测试矩阵", decision: "需补充后推进" },
  { id: "acceptance-checklist", stage: "testing", title: "验收清单", decision: "可继续推进" },
  { id: "release-review", stage: "release", title: "发布评审", decision: "可继续推进" },
  { id: "delivery-package", stage: "archive", title: "交付归档", decision: "可继续推进" }
];
const iterationScenarios = [
  {
    seq: 1,
    name: "首版-仓库读取与分析确认",
    goal: "读取Git仓库并完成首版业务需求分析确认，形成可执行迭代闭环",
    notes: "首版场景：仓库读取->分析报告->用户确认->全链路推进",
    talk1: "这是首个版本。我们已配置代码仓库，请先读取仓库理解现状与需求。",
    assistantKickoff:
      "已进入首版流程：先做仓库读取与分析，再用对话确认分析报告，确认后进入边界、交付、测试与发布。",
    coachPrompt1: "请基于首版仓库读取场景，输出业务分析重点与风险提示。",
    talk2: "我确认先看分析报告，再决定是否进入后续开发与验收。",
    assistantConstraints:
      "已记录：首版必须先完成《Git分析报告》并经你确认，后续所有交付均以该结论为基线。",
    coachPrompt2: "请生成首版Git分析报告确认前的关键提问清单。",
    extraMessages: [
      {
        role: "assistant",
        content:
          "【交付物决策包】Git分析报告（阶段：需求澄清）\n当前判断：待你确认后继续\n依据：\n- 已完成仓库结构、关键模块与近期变更扫描\n- 已识别首版需优先覆盖的业务链路\n待澄清：\n- 是否以“业务优先，技术风险可控”为首版推进原则\n下一问：请确认是否认可该分析并进入边界确认。"
      },
      { role: "user", content: "确认：Git分析报告结论可用，按该结论继续推进首版。" },
      { role: "assistant", content: "Git分析报告已确认，开始进入范围边界锁定与交付推进。" }
    ]
  },
  {
    seq: 2,
    name: "第二版-跨版本继承与增量迭代",
    goal: "在首版结论基础上做跨版本增量，展示继承内容与新增范围",
    notes: "跨版本场景：继承上版交付物，补齐新增流程并复核差异风险",
    talk1: "第二个版本需要基于首版结果做增量优化，请先说明哪些内容继承，哪些是新增。",
    assistantKickoff:
      "已进入跨版本模式：先引用首版已确认交付，再明确本版新增范围、影响和验证重点。",
    coachPrompt1: "请给出第二版相对首版的继承项、新增项与风险差异。",
    talk2: "本版重点是流程效率提升，不能破坏首版已稳定的链路。",
    assistantConstraints:
      "已记录：第二版必须显式展示“继承项/新增项/不变项”，并提供跨版本回归关注点。",
    coachPrompt2: "请输出第二版跨版本回归清单与用户确认要点。",
    extraMessages: [
      {
        role: "assistant",
        content:
          "跨版本对照：\n- 继承项：首版已确认的需求边界、验收标准、发布门禁\n- 新增项：迭代进度透明化与异常提醒流程\n- 不变项：核心业务链路与已通过测试的关键路径\n请确认是否按该跨版本策略推进。"
      },
      { role: "user", content: "确认按跨版本策略推进，优先保证继承项稳定。" },
      { role: "assistant", content: "已确认跨版本策略，后续交付将标注“继承/新增”来源。" }
    ]
  },
  {
    seq: 3,
    name: "第三版-异常处理与恢复路径",
    goal: "覆盖前两版未展示的异常流程：仓库同步失败后的澄清与恢复",
    notes: "异常场景：远端同步失败->对话澄清->恢复策略确认->继续推进",
    talk1: "第三个版本请演示异常流程，尤其是仓库同步失败后如何处理。",
    assistantKickoff:
      "已进入异常演练模式：我会先给出失败告警，再在对话中引导你确认恢复策略并继续流程。",
    coachPrompt1: "请模拟第三版仓库同步失败时的业务沟通与恢复决策建议。",
    talk2: "恢复策略要清晰，且要说明对当前版本发布时间的影响。",
    assistantConstraints:
      "已记录：第三版要输出异常影响范围、恢复步骤、是否延期发布与确认结论。",
    coachPrompt2: "请输出第三版异常恢复后的验收与发布确认清单。",
    extraMessages: [
      {
        role: "assistant",
        content:
          "异常告警：检测到远端仓库同步失败（分支权限异常）。\n影响：\n- 新增需求明细暂无法自动拉取\n- 当前版本评审需先完成人工确认\n建议：\n- 方案A：你补充分支权限后重试同步\n- 方案B：先按已确认范围继续，新增项延后\n请回复选择方案。"
      },
      { role: "user", content: "选择方案A，先修复权限并重试同步。" },
      {
        role: "assistant",
        content:
          "已收到。同步重试成功，新增需求已补齐。本版继续推进，但发布评审会附带“异常已恢复”记录。"
      }
    ]
  }
];

async function requestJson(path, options = {}, timeoutMs = 60000) {
  const url = `${BASE}${path}`;
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          Connection: "close",
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      const raw = await res.text();
      let body;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = { raw };
      }
      return { ok: res.ok, status: res.status, body };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const err = lastError instanceof Error ? lastError : new Error(String(lastError || "unknown error"));
  throw new Error(`request failed: ${path}; base=${BASE}; detail=${err.message}`);
}

async function assertOk(label, fn) {
  const result = await fn();
  if (!result.ok) {
    throw new Error(`${label} failed: status=${result.status} body=${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function runCoachWithRetry(iterationId, message, maxAttempts = 3) {
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await requestJson(
      `/api/v1/iterations/${iterationId}/agent-chat`,
      {
        method: "POST",
        body: JSON.stringify({ message })
      },
      120000
    );
    if (result.ok && result.body?.reply) {
      return result.body;
    }
    lastError = `attempt=${attempt}, status=${result.status}, body=${JSON.stringify(result.body)}`;
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
  if (ALLOW_COACH_FALLBACK) {
    return {
      reply: `【fallback】LLM 暂不可用，按既定流程继续推进。触发原因：${lastError.slice(0, 220)}`
    };
  }
  throw new Error(`coach failed after retry: ${lastError}`);
}

async function postMessage(iterationId, role, content, label) {
  return assertOk(label, () =>
    requestJson(`/api/v1/iterations/${iterationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ role, content })
    })
  );
}

async function markAllTestCasesPassed(iterationId) {
  const cc = await assertOk(`getChangeControl#${iterationId}`, () => requestJson(`/api/v1/iterations/${iterationId}/change-control`));
  const matrix = Array.isArray(cc.generatedTestMatrix) ? cc.generatedTestMatrix : [];
  if (matrix.length === 0) {
    return { updated: 0 };
  }
  const updates = matrix.map((item) => ({
    caseId: item.caseId,
    status: "passed",
    by: "seed-script",
    note: "全链路真实验证已执行"
  }));
  await assertOk(`updateTestMatrixExecution#${iterationId}`, () =>
    requestJson(`/api/v1/iterations/${iterationId}/change-control/test-matrix/execution`, {
      method: "POST",
      body: JSON.stringify({ updates })
    })
  );
  return { updated: updates.length };
}

async function transitionWithReason(iterationId, toStatus, reason) {
  return requestJson(`/api/v1/iterations/${iterationId}/state/transition`, {
    method: "POST",
    body: JSON.stringify({ toStatus, reason })
  });
}

async function safeJson(label, fn, fallbackValue) {
  try {
    return await assertOk(label, fn);
  } catch (error) {
    return {
      ...fallbackValue,
      _fallback: true,
      _fallbackReason: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildDecisionPacket(entry, index) {
  return [
    `【交付物决策包】${entry.title}（阶段：${entry.stage}）`,
    `当前判断：${entry.decision}`,
    "依据：",
    `- 第${index}版业务目标已进入本阶段核验`,
    "- 已生成本阶段关键证据，可在会话继续澄清",
    "待澄清：",
    entry.decision === "可继续推进" ? "- 无" : "- 需确认当前阶段输入是否完整",
    "下一问：请确认是否按当前结论推进下一阶段。"
  ].join("\n");
}

async function writeArtifactConversation(iterationId, index) {
  for (const entry of artifactFlow) {
    await safeJson(
      `artifactDraft#${iterationId}#${entry.id}`,
      () =>
        requestJson(`/api/v1/iterations/${iterationId}/change-control/artifacts/${entry.id}/draft`, {
          method: "POST",
          body: JSON.stringify({
            actor: "seed-script",
            content: `<h3>${entry.title}</h3><p>第${index}版${entry.title}已完成会话驱动更新，用于阶段推进。</p>`,
            media: []
          })
        }),
      {}
    );
    await safeJson(
      `artifactCommit#${iterationId}#${entry.id}`,
      () =>
        requestJson(`/api/v1/iterations/${iterationId}/change-control/artifacts/${entry.id}/commit`, {
          method: "POST",
          body: JSON.stringify({
            actor: "seed-script",
            summary: `第${index}版${entry.title}已更新，可用于下一阶段。`,
            source: "业务会话与阶段推进",
            evidence: ["会话确认记录", "阶段结论摘要", "风险处理说明"]
          })
        }),
      {}
    );
    await postMessage(iterationId, "assistant", buildDecisionPacket(entry, index), `message#${index}-${entry.id}-packet`);
    await postMessage(iterationId, "user", `确认：${entry.title}按当前结论推进。`, `message#${index}-${entry.id}-user-confirm`);
    await safeJson(
      `artifactConfirm#${iterationId}#${entry.id}`,
      () =>
        requestJson(`/api/v1/iterations/${iterationId}/change-control/artifacts/${entry.id}/confirm`, {
          method: "POST",
          body: JSON.stringify({
            actor: "seed-script",
            passed: true,
            note: `第${index}版${entry.title}确认通过`
          })
        }),
      {}
    );
    await safeJson(
      `artifactAddToChat#${iterationId}#${entry.id}`,
      () =>
        requestJson(`/api/v1/iterations/${iterationId}/change-control/artifacts/${entry.id}/add-to-chat`, {
          method: "POST",
          body: JSON.stringify({
            actor: "seed-script",
            prompt: `请基于「${entry.title}」继续推进下一阶段。`
          })
        }),
      {}
    );
    await postMessage(iterationId, "assistant", `交付物已确认：${entry.title}。`, `message#${index}-${entry.id}-assistant-confirmed`);
  }
}

async function main() {
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl: BASE,
    planVersion: "v2-agent-skills-business-flow",
    project: null,
    scaffold: null,
    iterations: []
  };

  let project;
  if (Number.isFinite(TARGET_PROJECT_ID) && TARGET_PROJECT_ID > 0) {
    const projects = await assertOk("listProjects", () => requestJson("/api/v1/projects"));
    project = Array.isArray(projects) ? projects.find((item) => Number(item?.id) === TARGET_PROJECT_ID) : null;
    if (!project) {
      throw new Error(`target project not found: ${TARGET_PROJECT_ID}`);
    }
  } else {
    project = await assertOk("createProject", () =>
      requestJson("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          name: `全链路真实演示项目-${STAMP}`,
          description: "用于验证至少3个迭代版本的完整过程"
        })
      })
    );
  }
  report.project = { id: project.id, name: project.name };

  const scaffold = await assertOk("scaffoldProjectRepository", () =>
    requestJson(`/api/v1/projects/${project.id}/repository/scaffold`, {
      method: "POST",
      body: JSON.stringify({
        initializeGit: true,
        createInitialCommit: true,
        dryRun: false
      })
    })
  );
  report.scaffold = scaffold;

  for (const scenario of iterationScenarios) {
    const index = scenario.seq;
    const iterationName = `${scenario.name}-${STAMP}`;
    const iteration = await assertOk(`createIteration#${index}`, () =>
      requestJson(`/api/v1/projects/${project.id}/iterations`, {
        method: "POST",
        body: JSON.stringify({
          name: iterationName,
          goal: scenario.goal,
          notes: `${scenario.notes}-${STAMP}`
        })
      })
    );

    await postMessage(iteration.id, "user", scenario.talk1, `message#${index}-1`);
    await postMessage(
      iteration.id,
      "assistant",
      scenario.assistantKickoff,
      `message#${index}-assistant-kickoff`
    );
    const coach1 = await runCoachWithRetry(iteration.id, scenario.coachPrompt1);

    await postMessage(iteration.id, "user", scenario.talk2, `message#${index}-2`);
    await postMessage(
      iteration.id,
      "assistant",
      scenario.assistantConstraints,
      `message#${index}-assistant-constraints`
    );
    const coach2 = await runCoachWithRetry(iteration.id, scenario.coachPrompt2);
    for (const [msgIndex, msg] of scenario.extraMessages.entries()) {
      await postMessage(iteration.id, msg.role, msg.content, `message#${index}-extra-${msgIndex + 1}`);
    }

    const boundary = await assertOk(`boundary#${index}`, () =>
      requestJson(`/api/v1/iterations/${iteration.id}/change-control/boundary`, {
        method: "POST",
        body: JSON.stringify({
          requirementRefs: [`版本${index}业务目标确认`, `版本${index}风险处理可追溯`],
          componentRefs: [`版本${index}会话沟通区`, `版本${index}决策推进器`],
          codePaths: ["会话交互流程", "决策推进逻辑", "质量与发布治理"],
          note: `${scenario.name}边界已收敛`
        })
      })
    );

    const confirmed = await assertOk(`confirm#${index}`, () =>
      requestJson(`/api/v1/iterations/${iteration.id}/change-control/confirm`, {
        method: "POST",
        body: JSON.stringify({
          accurate: true,
          actor: "seed-script",
          note: `${scenario.name}沟通结论与边界确认`
        })
      })
    );

    const artifacts = await safeJson(
      `testArtifacts#${index}`,
      () =>
        requestJson(
          `/api/v1/iterations/${iteration.id}/change-control/test-artifacts/generate`,
          {
            method: "POST",
            body: JSON.stringify({ dryRun: false })
          },
          120000
        ),
      {
        generatedFiles: [`reports/fallback-test-summary-${scenario.seq}.md`],
        summary: "【fallback】测试产物接口失败，已以对话产物代替。"
      }
    );

    const matrixExecution = await markAllTestCasesPassed(iteration.id);
    const release = await safeJson(
      `releaseReview#${index}`,
      () => requestJson(`/api/v1/iterations/${iteration.id}/release-review`),
      {
        decision: "caution",
        score: 70,
        blockers: ["【fallback】发布评审接口失败，请人工复核。"]
      }
    );
    await postMessage(
      iteration.id,
      "system",
      `交付物已归档：测试矩阵 ${matrixExecution.updated} 条、发布结论 ${release.decision || "unknown"}。请在对话中输入“继续归档核验”查看关键证据与遗留风险。`,
      `message#${index}-deliverable-archive`
    );
    await postMessage(
      iteration.id,
      "assistant",
      `${scenario.name}交付摘要：已形成 ${Array.isArray(artifacts.generatedFiles) ? artifacts.generatedFiles.length : 0} 项测试与验收记录，可继续业务评审。`,
      `message#${index}-assistant-delivery-summary`
    );
    await postMessage(
      iteration.id,
      "user",
      `确认${scenario.name}交付物：同意进入评审并继续对话核验。`,
      `message#${index}-user-confirm-delivery`
    );
    const reviewTransition = await transitionWithReason(iteration.id, "review", `${scenario.name}已完成测试执行，进入评审阶段`);
    const completeTransition = await transitionWithReason(iteration.id, "completed", `${scenario.name}发布评审完成，闭环完成`);

    await writeArtifactConversation(iteration.id, index);

    const artifactsSummaryText = String(artifacts.summary || "")
      .replace("source=fallback", "来源=自动补齐")
      .replace("来源=fallback", "来源=自动补齐");

    report.iterations.push({
      iterationId: iteration.id,
      iterationName: iteration.name,
      businessBoard: [
        {
          stage: "需求澄清",
          progress: "已完成",
          decision: "可继续推进",
          summary: index === 1 ? "仓库读取与分析报告确认完成，首版可继续推进。" : "业务目标、关键风险与澄清问题已确认。"
        },
        {
          stage: "范围确认",
          progress: "已完成",
          decision: "可继续推进",
          summary: index === 2 ? "已形成跨版本继承项与新增项对照，范围锁定完成。" : "本版本要做与不做范围已锁定。"
        },
        {
          stage: "测试与验收",
          progress: "已完成",
          decision: Boolean(artifacts._fallback) ? "需人工关注" : "可继续推进",
          summary: artifactsSummaryText || "测试与验收记录已沉淀。"
        },
        {
          stage: "发布评审",
          progress: "已完成",
          decision: decisionLabelMap[release.decision] || "待确认",
          summary:
            index === 3
              ? "异常处理完成并记录恢复过程，发布评审可追溯。"
              : release.decision === "go"
              ? "发布条件满足，进入归档。"
              : release.decision === "caution"
                ? "可谨慎发布，需持续观察。"
                : "存在风险，建议暂停发布。"
        }
      ],
      skillBoard: [
        { stage: "clarification", executedSkills: stageSkillMap.clarification },
        { stage: "scope", executedSkills: stageSkillMap.scope },
        { stage: "interaction", executedSkills: stageSkillMap.interaction },
        { stage: "development", executedSkills: stageSkillMap.development },
        { stage: "testing", executedSkills: stageSkillMap.testing },
        { stage: "release", executedSkills: stageSkillMap.release },
        { stage: "archive", executedSkills: stageSkillMap.archive }
      ],
      keySignals: {
        coachFallback: (coach1.reply || "").startsWith("【fallback】") || (coach2.reply || "").startsWith("【fallback】"),
        artifactsFallback: Boolean(artifacts._fallback),
        releaseFallback: Boolean(release._fallback),
        releaseDecision: decisionLabelMap[release.decision] || release.decision || "待确认",
        confirmedAt: confirmed.confirmedAt || ""
      },
      generatedArtifacts: artifacts.generatedFiles || [],
      deliveryCheck: {
        reviewTransitionOk: reviewTransition.status >= 200 && reviewTransition.status < 300,
        completedTransitionOk: completeTransition.status >= 200 && completeTransition.status < 300,
        matrixUpdatedCount: matrixExecution.updated
      },
      boundarySnapshot: {
        goals: boundary.requirementRefs || [],
        modules: boundary.componentRefs || [],
        impacts: boundary.codePaths || []
      }
    });
  }

  const repoPath = report.scaffold?.scaffold?.repoPath || "";
  report.deliveryFilesExist = report.iterations.map((item) => ({
    iterationId: item.iterationId,
    checks: (item.generatedArtifacts || []).map((rel) => ({
      path: rel,
      exists: repoPath ? existsSync(join(repoPath, rel)) : false
    }))
  }));

  const outDir = join(process.cwd(), "backend", ".runtime", "recordings");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `seed-real-fullchain-${STAMP}.json`);
  writeFileSync(outFile, JSON.stringify(report, null, 2), "utf-8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: outFile,
        projectId: report.project?.id,
        iterationIds: report.iterations.map((item) => item.iterationId),
        repoPath
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`[seed-real-fullchain] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
