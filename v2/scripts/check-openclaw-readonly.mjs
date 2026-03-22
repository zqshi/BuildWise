#!/usr/bin/env node
import { execSync } from 'node:child_process';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const target = process.env.OPENCLAW_SOURCE_PATH || resolve(__dirname, '..', '..', '..', 'longxia', '【0228】openclaw');
try {
  const status = execSync(`git -C "${target}" status --short`, { encoding: 'utf-8' }).trim();
  const changed = status.split('\n').filter(Boolean).length;
  console.log(JSON.stringify({ ok: true, target, changed, status }, null, 2));
  if (changed > 0) process.exit(2);
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
}
