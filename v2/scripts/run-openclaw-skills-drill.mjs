#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BUILDWISE_API_BASE || 'http://127.0.0.1:5055';
const NOW = new Date();
const STAMP = NOW.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

const SKILL_CHAIN = [
  '00-orchestrator-sop',
  '01-ontology-mapping',
  '02-impact-analysis',
  '03-deliverable-governance',
  '04-cross-iteration',
  '05-exception-recovery',
  '06-quality-release-gate',
  '07-audit-trace'
];

const ARTIFACT_IDS = [
  'analysis-report',
  'boundary-confirmation',
  'prototype-preview',
  'code-delivery',
  'test-matrix',
  'acceptance-checklist',
  'release-review',
  'delivery-package'
];

async function req(path, options = {}, timeout = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal
    });
    const raw = await res.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function must(label, fn) {
  const r = await fn();
  if (!r.ok) throw new Error(`${label} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

async function postMessage(iterationId, role, content) {
  return must(`message#${iterationId}`, () => req(`/api/iterations/${iterationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ role, content })
  }));
}

function runSkill(skill, input) {
  const bridge = resolve(process.cwd(), 'v2/backend/openclaw/run-skill-bridge.mjs');
  const out = execFileSync('node', [bridge, skill, JSON.stringify(input)], { encoding: 'utf-8' });
  return JSON.parse(out);
}

async function processArtifacts(iterationId, prefix) {
  for (const aid of ARTIFACT_IDS) {
    await req(`/api/iterations/${iterationId}/change-control/artifacts/${aid}/draft`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'openclaw-bridge', content: `<p>${prefix}-${aid} draft</p>`, media: [] })
    });
    await req(`/api/iterations/${iterationId}/change-control/artifacts/${aid}/commit`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'openclaw-bridge', summary: `${prefix}-${aid} committed`, source: 'openclaw+skills drill', evidence: ['chat', 'skill-output'] })
    });
    await req(`/api/iterations/${iterationId}/change-control/artifacts/${aid}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'openclaw-bridge', passed: true, note: `${prefix}-${aid} confirmed` })
    });
    await req(`/api/iterations/${iterationId}/change-control/artifacts/${aid}/add-to-chat`, {
      method: 'POST',
      body: JSON.stringify({ actor: 'openclaw-bridge', prompt: `请基于${aid}继续推进。` })
    });
  }
}

async function main() {
  const report = {
    createdAt: NOW.toISOString(),
    base: BASE,
    runtime: 'openclaw+skills-bridge',
    projectId: 0,
    iterationIds: [],
    skillRuns: [],
    checks: []
  };

  const project = await must('createProject', () => req('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: `OpenClaw+Skills真实演练-${STAMP}`,
      description: '单Agent+skills全链路真实演练'
    })
  }));
  report.projectId = project.id;

  await must('scaffold', () => req(`/api/projects/${project.id}/repository/scaffold`, {
    method: 'POST',
    body: JSON.stringify({ initializeGit: true, createInitialCommit: true, dryRun: false })
  }));

  const scenarios = [
    {
      name: `首版-Git读取与分析确认-${STAMP}`,
      goal: '首版读取仓库并确认分析报告',
      opening: '首版已配置仓库，请先读取并输出分析报告。',
      special: [
        '【交付物决策包】Git分析报告（阶段：需求澄清）\n当前判断：待确认后继续\n下一问：请确认是否认可结论。',
        '确认：Git分析报告结论可用，继续推进。',
        'Git分析报告已确认，进入范围边界锁定。'
      ]
    },
    {
      name: `二版-跨版本继承与增量-${STAMP}`,
      goal: '展示跨版本继承与新增项',
      opening: '二版请明确继承项/新增项/不变项。',
      special: [
        '跨版本对照：继承项、新增项、不变项均已生成，请确认。',
        '确认：按跨版本策略推进，优先保证继承项稳定。'
      ]
    },
    {
      name: `三版-异常处理与恢复-${STAMP}`,
      goal: '展示同步失败后的恢复链路',
      opening: '三版请演示仓库同步失败后的恢复流程。',
      special: [
        '异常告警：远端仓库同步失败（分支权限异常），请选择恢复方案A/B。',
        '选择方案A，修复权限后重试同步。',
        '同步重试成功，新增需求已补齐，继续推进。'
      ]
    }
  ];

  for (let i = 0; i < scenarios.length; i += 1) {
    const s = scenarios[i];
    const iteration = await must(`createIteration#${i + 1}`, () => req(`/api/projects/${project.id}/iterations`, {
      method: 'POST',
      body: JSON.stringify({ name: s.name, goal: s.goal, notes: `openclaw-skills-drill-${STAMP}` })
    }));
    report.iterationIds.push(iteration.id);

    await postMessage(iteration.id, 'user', s.opening);

    for (const skill of SKILL_CHAIN) {
      const skillOut = runSkill(skill, { iterationId: iteration.id, scenario: s.name, index: i + 1 });
      report.skillRuns.push({ iterationId: iteration.id, skill, mode: skillOut.mode, status: skillOut.result.status });
      await postMessage(iteration.id, 'system', `技能执行：${skill}\n${JSON.stringify(skillOut.result)}`);
    }

    for (const content of s.special) {
      const role = content.startsWith('确认') || content.startsWith('选择') ? 'user' : 'assistant';
      await postMessage(iteration.id, role, content);
    }

    await processArtifacts(iteration.id, `iter${i + 1}`);
    await req(`/api/iterations/${iteration.id}/state/transition`, {
      method: 'POST',
      body: JSON.stringify({ toStatus: 'review', reason: 'skills chain completed' })
    });
    await req(`/api/iterations/${iteration.id}/state/transition`, {
      method: 'POST',
      body: JSON.stringify({ toStatus: 'completed', reason: 'release gate passed in drill' })
    });

    const messages = await must(`messages#${iteration.id}`, () => req(`/api/iterations/${iteration.id}/messages`));
    const refs = messages.filter((m) => typeof m.content === 'string' && m.content.includes('【交付物引用】')).length;
    const skillMsgs = messages.filter((m) => typeof m.content === 'string' && m.content.startsWith('技能执行：')).length;
    report.checks.push({ iterationId: iteration.id, messageCount: messages.length, deliverableRefs: refs, skillMessages: skillMsgs });
  }

  const outDir = join(process.cwd(), 'v2/backend/.runtime/recordings');
  mkdirSync(outDir, { recursive: true });
  const output = join(outDir, `openclaw-skills-drill-${STAMP}.json`);
  writeFileSync(output, JSON.stringify(report, null, 2), 'utf-8');

  console.log(JSON.stringify({ ok: true, output, projectId: report.projectId, iterationIds: report.iterationIds, checks: report.checks }, null, 2));
}

main().catch((err) => {
  console.error(`[openclaw-skills-drill] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
