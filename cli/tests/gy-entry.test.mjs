import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildStatusPayload, parseArguments } from '../gy.mjs';

test('parses one-shot and status arguments', () => {
  assert.deepEqual(
    parseArguments(['node', 'gy.mjs', '--json', '帮我整理这段实习经历']),
    { json: true, status: false, query: '帮我整理这段实习经历' },
  );
  assert.deepEqual(
    parseArguments(['node', 'gy.mjs', '--status', '--json']),
    { json: true, status: true, query: '' },
  );
});

test('status inspection is read-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-status-'));
  try {
    const payload = buildStatusPayload(root);
    assert.equal(payload.status, 'onboarding-needed');
    assert.equal(payload.evidencePackage.state, 'missing');
    assert.equal(payload.resumeMaterials.state, 'missing');
    assert.equal(payload.resumeFinal.state, 'blocked');
    assert.equal(payload.interviewPrep.state, 'blocked');
    assert.equal(payload.interviewReview.state, 'blocked');
    assert.ok(payload.missing.includes('cv.md'));
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('json one-shot mode routes without echoing the user query', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-route-'));
  const query = '这家公司值得投吗';
  try {
    const child = spawnSync(
      process.execPath,
      [join(dirname(fileURLToPath(import.meta.url)), '../gy.mjs'), '--json', query],
      { env: { ...process.env, GET_YOURSELF_ROOT: root }, encoding: 'utf8' },
    );
    assert.equal(child.status, 0, child.stderr);
    const payload = JSON.parse(child.stdout);
    assert.equal(payload.route.intent, 'evaluate_job');
    assert.equal(payload.doctor.status, 'onboarding-needed');
    assert.equal(payload.route.securityNotes.length > 0, true);
    assert.equal(child.stdout.includes(query), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
