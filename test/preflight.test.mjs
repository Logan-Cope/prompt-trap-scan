import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './helpers.mjs';

test('preflight fails fast with the install command when Chromium is missing', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'no-browsers-'));
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/preflight.mjs')], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: empty },
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /npx playwright install chromium/);
  assert.ok(Date.now() - started < 10000, 'should fail in seconds, not minutes');
});

test('preflight passes silently when Chromium is installed', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/preflight.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});
