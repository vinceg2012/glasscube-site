#!/usr/bin/env node
// Seamless "commit and push" flow:
//   1. Run SEO auto-fix
//   2. Run tests
//   3. Stage everything
//   4. Prompt for a commit message (or use --message / -m)
//   5. Commit and push to current branch
//
// Usage:
//   npm run ship
//   npm run ship -- -m "your message"
//   npm run ship -- --no-push

import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin, stdout, exit, argv } from 'node:process';

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`\n✗ ${cmd} ${args.join(' ')} failed (exit ${r.status})`);
    exit(r.status ?? 1);
  }
}

function shCapture(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

function getArg(name, short) {
  const i = argv.findIndex((a) => a === name || a === short || a.startsWith(`${name}=`));
  if (i === -1) return null;
  const a = argv[i];
  if (a.includes('=')) return a.split('=').slice(1).join('=');
  return argv[i + 1] ?? null;
}

const noPush = argv.includes('--no-push');
let message = getArg('--message', '-m');

console.log('▸ Running SEO auto-fix…');
sh('node', ['scripts/seo-fix.mjs']);

console.log('\n▸ Running tests…');
sh('node', ['--test', 'test/**/*.test.mjs']);

const status = shCapture('git', ['status', '--porcelain']).stdout || '';
if (!status.trim()) {
  console.log('\n✓ Working tree clean — nothing to commit.');
  if (!noPush) {
    console.log('▸ Pushing in case local is ahead…');
    sh('git', ['push']);
  }
  exit(0);
}

console.log('\n▸ Changes to commit:');
console.log(status);

if (!message) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  message = (await rl.question('Commit message: ')).trim();
  rl.close();
}
if (!message) {
  console.error('✗ Empty commit message — aborting.');
  exit(1);
}

sh('git', ['add', '-A']);
sh('git', ['commit', '-m', message]);

if (noPush) {
  console.log('\n✓ Committed (skipped push).');
  exit(0);
}

console.log('\n▸ Pushing…');
sh('git', ['push']);
console.log('\n✓ Done.');
