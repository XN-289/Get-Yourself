import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  plan.schemaVersion = 1;
  plan.toolCalls = plan.toolCalls.map(call => {
    const { contractFile, contractFileHash, ...legacyCall } = call;
    return { ...legacyCall, ...toolOverrides };
  });
  return {
    ...plan,
    ...overrides,
  };
}

function buildDispatchPlan(overrides = {}, toolOverrides = {}) {
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

function byteHash(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function writeMaterialsContract(root, name = 'materials.json', mutate = () => {}) {
  const materials = JSON.parse(readFileSync(join(cliRoot, 'templates/resume-materials.example.json'), 'utf8'));
  mutate(materials);
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(materials, null, 2)}\n`, 'utf8');
  return { path, materials };
}

function dispatchPlanFor(root, contractName = 'materials.json', overrides = {}) {
  const contractPath = join(root, contractName);
  return buildDispatchPlan({
    runId: `skill-dispatch-${contractName.replace(/\.json$/, '')}`,
    ...overrides,
  }, {
    contractFile: contractName,
    contractFileHash: byteHash(contractPath),
  });
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
  assert.deepEqual(
    registry.tools.filter(tool => tool.dispatchable).map(tool => tool.toolKey),
    ['resume-materials.import'],
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

test('dispatch plans are versioned, hash-bound, and limited to one implemented bridge', () => {
  assert.equal(buildDispatchPlan().schemaVersion, 2);
  assert.equal(canonicalizeSkillRunPlan(buildDispatchPlan()).summary.dispatchable, true);

  const legacyShapeWithDispatchFields = buildDispatchPlan({ schemaVersion: 1 });
  assert.throws(
    () => canonicalizeSkillRunPlan(legacyShapeWithDispatchFields),
    /unknown field/i,
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildDispatchPlan({}, { contractFile: '../materials.json' })),
    /normalized/,
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildDispatchPlan({}, { toolKey: 'shell.exec' })),
    error => error.code === 'undeclared-tool',
  );
  assert.throws(
    () => canonicalizeSkillRunPlan(buildDispatchPlan({}, {
      targetObjects: ['data/resume-materials.json'],
    })),
    error => error.code === 'invalid-dispatch-targets',
  );
});

test('dispatch dry-run is read-only and apply executes the resume materials bridge', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-dispatch-'));
  try {
    writeMaterialsContract(root);
    const source = writePlan(root, 'dispatch-plan.json', dispatchPlanFor(root));

    const dryRun = runSkillPlan(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(dryRun.dispatch.action, 'dry-run');
    assert.deepEqual(
      dryRun.dispatch.before.map(item => item.state),
      ['missing', 'missing'],
    );
    assert.equal(existsSync(join(root, 'data/skill-runs')), false);
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
    assert.equal(existsSync(join(root, 'interview-prep/story-bank.md')), false);

    const applied = runSkillPlan(source, { root, apply: true });
    assert.equal(applied.action, 'dispatched');
    assert.equal(applied.record.status, 'dispatched');
    assert.equal(applied.record.mode, 'contract-dispatch');
    assert.equal(applied.record.dispatchedToolCount, 1);
    assert.equal(applied.record.targetWriteCount, 2);
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), true);
    assert.equal(existsSync(join(root, 'interview-prep/story-bank.md')), true);

    const recordPath = join(root, 'data/skill-runs/skill-dispatch-materials.json');
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(record.schemaVersion, 2);
    assert.equal(record.execution.status, 'dispatched');
    assert.deepEqual(record.targetFingerprints.before.map(item => item.state), ['missing', 'missing']);
    assert.deepEqual(record.targetFingerprints.after.map(item => item.state), ['file', 'file']);
    assert.equal(record.execution.toolResults[0].packageId, 'resume-materials-demo-2026-09-01');

    const unchanged = runSkillPlan(source, { root, apply: true });
    assert.equal(unchanged.action, 'unchanged');
    assert.equal(unchanged.changed, false);
    assert.equal(inspectSkillRuntime(root).state, 'ready');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatch replaces only after explicit confirmation and never silently overwrites drift', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-dispatch-replace-'));
  try {
    writeMaterialsContract(root, 'first.json');
    const firstSource = writePlan(root, 'first-plan.json', dispatchPlanFor(root, 'first.json'));
    runSkillPlan(firstSource, { root, apply: true });

    writeMaterialsContract(root, 'second.json', materials => {
      materials.packageId = 'replacement-materials';
      materials.entries[0].bullet = '设计并实现宿舍报修小程序的后端接口，支撑 30 间宿舍试用';
    });
    const secondSource = writePlan(root, 'second-plan.json', dispatchPlanFor(root, 'second.json'));

    const dryRun = runSkillPlan(secondSource, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(dryRun.dispatch.action, 'dry-run-replace-required');
    assert.throws(
      () => runSkillPlan(secondSource, { root, apply: true }),
      error => error.code === 'skill-target-conflict',
    );
    assert.equal(JSON.parse(readFileSync(join(root, 'data/resume-materials.json'), 'utf8')).packageId, 'resume-materials-demo-2026-09-01');
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-second.json')), false);

    const replaced = runSkillPlan(secondSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'dispatched');
    assert.equal(JSON.parse(readFileSync(join(root, 'data/resume-materials.json'), 'utf8')).packageId, 'replacement-materials');
    const replacementRecord = JSON.parse(readFileSync(join(root, 'data/skill-runs/skill-dispatch-second.json'), 'utf8'));
    assert.equal(replacementRecord.execution.toolResults[0].backupPaths.materials !== null, true);
    assert.equal(existsSync(join(root, replacementRecord.execution.toolResults[0].backupPaths.materials)), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatch stops before approval when the contract or target shape is unsafe', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-dispatch-invalid-'));
  try {
    writeMaterialsContract(root);
    const source = writePlan(root, 'dispatch-plan.json', dispatchPlanFor(root));
    writeMaterialsContract(root, 'materials.json', materials => {
      materials.entries[0].bullet = '契约文件在计划确认后被修改';
    });
    assert.throws(
      () => runSkillPlan(source, { root, apply: true }),
      error => error.code === 'dispatch-contract-drift',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs')), false);

    writeMaterialsContract(root);
    const validSource = writePlan(root, 'valid-dispatch-plan.json', dispatchPlanFor(root));
    mkdirSync(join(root, 'data'), { recursive: true });
    mkdirSync(join(root, 'data/resume-materials.json'));
    assert.throws(
      () => runSkillPlan(validSource, { root, apply: true }),
      error => error.code === 'invalid-target-state',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
