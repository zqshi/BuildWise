#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const cfgPath = resolve(process.cwd(), 'v2/backend/openclaw/runtime.config.json');
if (!existsSync(cfgPath)) {
  console.error(JSON.stringify({ ok: false, error: 'runtime.config.json missing' }));
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
const skill = (process.argv[2] || '').trim();
const inputRaw = process.argv[3] || '{}';
const input = JSON.parse(inputRaw);

if (!skill) {
  console.error(JSON.stringify({ ok: false, error: 'skill id required' }));
  process.exit(1);
}

const openclawRoot = cfg?.openclaw?.sourcePath || '';
const profile = cfg?.openclaw?.profile || 'buildwise-local';
const agentId = cfg?.openclaw?.agentId || 'main';
const strictLiveModel = cfg?.openclaw?.strictLiveModel !== false;
const entry = resolve(openclawRoot, cfg?.openclaw?.entry || 'openclaw.mjs');
const skillPath = resolve(process.cwd(), 'v2/backend/skills/buildwise-openclaw', skill, 'SKILL.md');

if (!openclawRoot || !existsSync(entry)) {
  console.error(JSON.stringify({ ok: false, error: `openclaw entry missing: ${entry}` }));
  process.exit(1);
}
if (!existsSync(skillPath)) {
  console.error(JSON.stringify({ ok: false, error: `skill file missing: ${skillPath}` }));
  process.exit(1);
}

const skillSpec = readFileSync(skillPath, 'utf-8').slice(0, 3000);
const prompt = [
  '你是 BuildWise 的 OpenClaw Agent，必须严格按给定 skill 执行。',
  `skill_id=${skill}`,
  '输出必须是 JSON，且仅输出 JSON。',
  '返回结构：{"status","summary","artifacts","questions","risks","next_actions","evidence"}',
  '限制：status 只能是 success|need_user_input|blocked|error',
  `input=${JSON.stringify(input)}`,
  'skill_spec_begin',
  skillSpec,
  'skill_spec_end'
].join('\n');

let text = '';
try {
  text = execFileSync('node', [entry, '--profile', profile, 'agent', '--local', '--agent', agentId, '-m', prompt], {
    cwd: openclawRoot,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024,
    timeout: 45000
  }).trim();
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: `openclaw agent failed: ${detail}` }));
  process.exit(1);
}

let parsed = null;
try {
  parsed = JSON.parse(text);
} catch {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }
}

if (!parsed || typeof parsed !== 'object') {
  console.error(JSON.stringify({ ok: false, error: 'model output is not valid JSON', raw: text.slice(0, 500) }));
  process.exit(1);
}

const status = String(parsed.status || '').trim();
if (!['success', 'need_user_input', 'blocked', 'error'].includes(status)) {
  console.error(JSON.stringify({ ok: false, error: `invalid status from model: ${status}`, parsed }));
  process.exit(1);
}
if (strictLiveModel && String(parsed.summary || '').trim().length === 0) {
  console.error(JSON.stringify({ ok: false, error: 'strict mode requires non-empty summary' }));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  mode: 'openclaw-native',
  skill,
  result: parsed
}, null, 2));
