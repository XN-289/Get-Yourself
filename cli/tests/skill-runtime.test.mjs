import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  canonicalizeSkillRunPlan,
  canonicalizeSkillRunRecord,
  inspectSkillRuntime,
  listSkillRegistry,
  runSkillPlan,
} from '../skill-runtime.mjs';
import { buildStatusPayload } from '../gy.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(cliRoot, 'templates/skill-runtime.example.json');

function buildPlan(overrides = {}, toolOverrides = {}) {
  const plan = JSON.parse(readFileSync(examplePath, 'utf8'));
  return {
    ...plan,
    ...overrides,
    toolCalls: plan.toolCalls.map(call => ({ ...call, ...toolOverrides })),
  };
}

function writePlan(root, name, plan) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return path;
}

test('runtime registry is a closed repository set', () => {
  const registry = listSkillRegistry();
  assert.equal(registry.skillCount, 6);
  assert.deepEqual(
    registry.skills.map(skill => skill.skillKey),
    [
      'experience-structuring',
      'jd-analysis',
      'scam-check',
      'resume-generation',
      'interview-preparation',
      'interview-review',
    ],
  );
  assert.ok(registry.skills.every(skill => skill.downgrade.length > 0));
  assert.equal(
    registry.tools.find(tool => tool.toolKey === 'resume-final.import').command,
    'node resume-final.mjs apply <contract.json>',
  );
});

test('skill plans require confirmation, registration, tools, and scoped targets', () => {
  assert.throws(
    () => canonicalizeSkillRunPlan(buildPlan({ confirmation: 'agent_confirmed' })),
    /confirmation/,
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildPlan({ skillKey: 'dynamic-web-skill' })),
    error => error.code === 'unregistered-skill',
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildPlan({}, { toolKey: 'job-analysis.import' })),
    error => error.code === 'undeclared-tool',
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildPlan({}, {
      targetObjects: ['data/job-analysis/report.json'],
    })),
    error => error.code === 'target-out-of-scope',
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildPlan({}, {
      targetObjects: ['../data/applications.md'],
    })),
    /normalized/,
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildPlan({
      inputFingerprints: [{
        inputKind: 'pasted_jd',
        contentHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      }],
    })),
    error => error.code === 'invalid-input-kind',
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildPlan({ rawInput: '我的完整实习经历' })),
    /unknown field/i,
  );
  assert.throws(
    () => canonicalizeSkillRunPlan({
      ...buildPlan({
        skillKey: 'resume-generation',
        inputFingerprints: [{
          inputKind: 'resume_materials',
          contentHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        }],
      }),
      toolCalls: [{
        toolKey: 'resume-final.import',
        targetObjects: ['data/resume-render/render.json'],
      }],
    }),
    error => error.code === 'target-out-of-scope',
  );
});

test('skill run records are explicit, idempotent, isolated, and replace-protected', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-runtime-'));
  try {
    const source = writePlan(root, 'skill-plan.json', buildPlan());
    const dryRun = runSkillPlan(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/skill-runs')), false);
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
    assert.equal(existsSync(join(root, 'interview-prep/story-bank.md')), false);

    const applied = runSkillPlan(source, { root, apply: true });
    assert.equal(applied.action, 'recorded');
    const recordPath = join(root, 'data/skill-runs/skill-run-experience-demo-2026-09-03.json');
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(record.execution.mode, 'approval-ledger');
    assert.equal(record.execution.dispatchedToolCount, 0);
    assert.equal(record.execution.targetWriteCount, 0);
    assert.equal(record.userIntent, buildPlan().userIntent);
    assert.equal('rawInput' in record, false);
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
    assert.equal(existsSync(join(root, 'interview-prep/story-bank.md')), false);

    const unchanged = runSkillPlan(source, { root, apply: true });
    assert.equal(unchanged.action, 'unchanged');
    assert.equal(unchanged.changed, false);

    const changedSource = writePlan(root, 'skill-plan-v2.json', buildPlan({
      userIntent: '把同一段实习整理成另一个岗位的素材候选',
      runId: 'skill-run-experience-demo-v2',
    }));
    const changed = runSkillPlan(changedSource, { root, apply: true });
    assert.equal(changed.action, 'recorded');
    assert.equal(inspectSkillRuntime(root).state, 'ready');
    assert.equal(buildStatusPayload(root).skillRuntime.state, 'ready');

    const conflictSource = writePlan(root, 'skill-plan-conflict.json', buildPlan({
      userIntent: '复用 runId 但变更用户意图摘要',
    }));
    assert.throws(
      () => runSkillPlan(conflictSource, { root, apply: true }),
      error => error.code === 'skill-run-conflict',
    );
    const replaced = runSkillPlan(conflictSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'replaced');
    assert.equal(existsSync(replaced.backupPath), true);
    const replacement = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(replacement.replacesPlanContentHash, applied.plan.contentHash);

    const statusBefore = JSON.stringify(inspectSkillRuntime(root));
    inspectSkillRuntime(root);
    assert.equal(JSON.stringify(inspectSkillRuntime(root)), statusBefore);

    const driftedRecord = JSON.parse(readFileSync(recordPath, 'utf8'));
    driftedRecord.targetObjects = ['data/resume-materials.json'];
    assert.throws(
      () => canonicalizeSkillRunRecord(driftedRecord),
      error => error.code === 'invalid-run-record',
    );

    const recordWithExtraExecutionField = JSON.parse(readFileSync(recordPath, 'utf8'));
    recordWithExtraExecutionField.execution.shell = 'forbidden';
    assert.throws(
      () => canonicalizeSkillRunRecord(recordWithExtraExecutionField),
      /unknown field/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
