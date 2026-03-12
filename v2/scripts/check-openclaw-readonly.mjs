#!/usr/bin/env node
import { execSync } from 'node:child_process';

const target = '/Users/zqs/Downloads/project/dependencies/openclaw';
try {
  const status = execSync(`git -C "${target}" status --short`, { encoding: 'utf-8' }).trim();
  const changed = status.split('\n').filter(Boolean).length;
  console.log(JSON.stringify({ ok: true, target, changed, status }, null, 2));
  if (changed > 0) process.exit(2);
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
}
