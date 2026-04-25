#!/usr/bin/env node
// Configures git to use ./.githooks as the hooks dir and makes hooks executable.
// Runs automatically via `npm install` (the "prepare" script).

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

if (!existsSync('.git')) process.exit(0); // not a git checkout (e.g. tarball install)

const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
if (r.status !== 0) process.exit(0);

if (existsSync('.githooks')) {
  for (const f of readdirSync('.githooks')) {
    try { chmodSync(join('.githooks', f), 0o755); } catch {}
  }
}
console.log('✓ git hooks installed (core.hooksPath=.githooks)');
