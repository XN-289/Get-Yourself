import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
import { importEvidencePackage } from '../evidence-package.mjs';
import { importResumeMaterials, loadInstalledResumeMaterials } from '../resume-materials.mjs';
import { importJobAnalysis, loadInstalledJobAnalysis } from '../job-analysis.mjs';
import { loadCompanyOpportunity } from '../company-opportunity.mjs';

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

function writeJobAnalysisContract(root, name = 'job-analysis.json', mutate = () => {}) {
  const analysis = JSON.parse(readFileSync(join(cliRoot, 'templates/job-analysis.example.json'), 'utf8'));
  mutate(analysis);
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
  return { path, analysis };
}

function writeCompanyTemplateContract(root, templateName, name, mutate = () => {}) {
  const contract = JSON.parse(readFileSync(join(cliRoot, 'templates', templateName), 'utf8'));
  mutate(contract);
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  return { path, contract };
}

function installOpportunityDependencies(root) {
  const materials = writeMaterialsContract(root);
  importResumeMaterials(materials.path, { root, apply: true });
  const analysis = writeJobAnalysisContract(root);
  importJobAnalysis(analysis.path, { root, apply: true });
  return {
    materials: loadInstalledResumeMaterials(root),
    analysis: loadInstalledJobAnalysis(
      root,
      analysis.analysis.analysisId,
      loadInstalledResumeMaterials(root),
    ),
  };
}

function companyDispatchPlan(root, contractName, toolKey, inputKind, targetObjects, overrides = {}) {
  const contractPath = join(root, contractName);
  return buildDispatchPlan({
    runId: `skill-dispatch-${toolKey.replace(/\./g, '-')}`,
    skillKey: 'opportunity-management',
    userIntent: '执行用户已确认的公司机会管理合同',
    inputFingerprints: [{
      inputKind,
      contentHash: byteHash(contractPath),
    }],
    ...overrides,
  }, {
    toolKey,
    targetObjects,
    contractFile: contractName,
    contractFileHash: byteHash(contractPath),
  });
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

function jobDispatchPlanFor(root, contractName = 'job-analysis.json', overrides = {}, targetOverrides = {}) {
  const contractPath = join(root, contractName);
  return buildDispatchPlan({
    runId: `skill-dispatch-${contractName.replace(/\.json$/, '')}`,
    skillKey: 'jd-analysis',
    userIntent: '分析用户粘贴的岗位描述并沉淀本地报告',
    inputFingerprints: [{
      inputKind: 'pasted_jd',
      contentHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    }],
    ...overrides,
  }, {
    toolKey: 'job-analysis.import',
    targetObjects: [
      'data/job-analysis/job-analysis-demo-2026-09-02.json',
      'reports/job-analysis/job-analysis-demo-2026-09-02.md',
    ],
    contractFile: contractName,
    contractFileHash: byteHash(contractPath),
    ...targetOverrides,
  });
}

async function installMaterials(root) {
  writeMaterialsContract(root);
  const source = writePlan(root, 'materials-plan.json', dispatchPlanFor(root, 'materials.json', {
    runId: 'skill-dispatch-materials-install',
  }));
  return await runSkillPlan(source, { root, apply: true });
}

const TEST_INPUT_HASH = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';

const TOOL_DISPATCH_CASES = new Map([
  ['scam-check.import', {
    template: 'scam-check.example.json',
    skillKey: 'scam-check',
    inputKind: 'company_evidence',
    idField: 'checkId',
    targets: contract => [
      `data/scam-check/${contract.checkId}.json`,
      `reports/scam-check/${contract.checkId}.md`,
    ],
    documentBackupKey: 'markdown',
    backupKeys: ['package', 'markdown'],
  }],
  ['resume-final.import', {
    template: 'resume-final.example.json',
    skillKey: 'resume-generation',
    inputKind: 'resume_materials',
    idField: 'planId',
    targets: () => ['data/resume-final-plan.json', 'cv.md'],
    documentBackupKey: 'cv',
    backupKeys: ['plan', 'cv'],
  }],
  ['resume-render.import', {
    template: 'resume-render.example.json',
    skillKey: 'resume-generation',
    inputKind: 'resume_materials',
    idField: 'renderId',
    targets: contract => [
      `data/resume-render/${contract.renderId}.json`,
      `output/resume/${contract.renderId}.html`,
    ],
    documentBackupKey: 'html',
    backupKeys: ['package', 'html'],
  }],
  ['interview-prep.import', {
    template: 'interview-prep.example.json',
    skillKey: 'interview-preparation',
    inputKind: 'resume_materials',
    idField: 'prepId',
    targets: contract => [
      `data/interview-prep/${contract.prepId}.json`,
      `interview-prep/${contract.prepId}.md`,
    ],
    documentBackupKey: 'markdown',
    backupKeys: ['package', 'markdown'],
  }],
  ['interview-review.import', {
    template: 'interview-review.example.json',
    skillKey: 'interview-review',
    inputKind: 'interview_notes',
    idField: 'reviewId',
    targets: contract => [
      `data/interview-review/${contract.reviewId}.json`,
      `interview-prep/sessions/${contract.reviewId}.md`,
    ],
    documentBackupKey: 'markdown',
    backupKeys: ['package', 'markdown'],
  }],
  ['capability-feedback.import', {
    template: 'capability-feedback.example.json',
    skillKey: 'interview-review',
    inputKind: 'interview_notes',
    idField: 'feedbackId',
    targets: contract => [
      `data/capability-feedback/${contract.feedbackId}.json`,
      `reports/capability-feedback/${contract.feedbackId}.md`,
    ],
    documentBackupKey: 'markdown',
    backupKeys: ['package', 'markdown'],
  }],
]);

function writeToolContract(root, templateName, name, mutate = () => {}) {
  const contract = JSON.parse(readFileSync(join(cliRoot, 'templates', templateName), 'utf8'));
  mutate(contract);
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  return { path, contract };
}

function runtimeToolPlanFor(root, toolKey, contractName, overrides = {}, targetOverrides = {}) {
  const testCase = TOOL_DISPATCH_CASES.get(toolKey);
  const contractPath = join(root, contractName);
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  return buildDispatchPlan({
    runId: `skill-dispatch-${contract[testCase.idField]}`,
    skillKey: testCase.skillKey,
    userIntent: '执行用户已确认的本地求职合同',
    inputFingerprints: [{
      inputKind: testCase.inputKind,
      contentHash: TEST_INPUT_HASH,
    }],
    ...overrides,
  }, {
    toolKey,
    targetObjects: testCase.targets(contract),
    contractFile: contractName,
    contractFileHash: byteHash(contractPath),
    ...targetOverrides,
  });
}

function writeRuntimeToolPlan(root, toolKey, contractName, overrides = {}, targetOverrides = {}) {
  return writePlan(
    root,
    `${toolKey.replace(/\./g, '-')}-plan.json`,
    runtimeToolPlanFor(root, toolKey, contractName, overrides, targetOverrides),
  );
}

async function installRuntimeMaterials(root) {
  writeMaterialsContract(root);
  const source = writePlan(root, 'materials-dependency-plan.json', dispatchPlanFor(root, 'materials.json', {
    runId: 'skill-dispatch-materials-dependency',
  }));
  return await runSkillPlan(source, { root, apply: true });
}

function relativeFileSet(root, prefix = '') {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true });
  return new Set(entries.flatMap(entry => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return [...relativeFileSet(root, relativePath)];
    return entry.isFile() ? [relativePath] : [];
  }));
}

async function assertDispatchLifecycle(root, toolKey, source) {
  const testCase = TOOL_DISPATCH_CASES.get(toolKey);
  const plan = JSON.parse(readFileSync(source, 'utf8'));
  const contract = JSON.parse(readFileSync(join(root, plan.toolCalls[0].contractFile), 'utf8'));
  const targets = [...plan.toolCalls[0].targetObjects];
  const recordPath = `data/skill-runs/${plan.runId}.json`;
  const before = relativeFileSet(root);

  const dryRun = await runSkillPlan(source, { root });
  assert.equal(dryRun.action, 'dry-run');
  assert.equal(dryRun.dispatch.action, 'dry-run');
  assert.deepEqual([...relativeFileSet(root)], [...before]);
  assert.equal(existsSync(join(root, recordPath)), false);
  for (const target of targets) assert.equal(existsSync(join(root, target)), false);

  const applied = await runSkillPlan(source, { root, apply: true });
  assert.equal(applied.action, 'dispatched');
  assert.equal(applied.record.status, 'dispatched');
  assert.deepEqual(
    [...relativeFileSet(root)].filter(item => !before.has(item)).sort(),
    [recordPath, ...targets].sort(),
  );
  const record = JSON.parse(readFileSync(join(root, recordPath), 'utf8'));
  assert.deepEqual(Object.keys(record.execution.toolResults[0].backupPaths).sort(), testCase.backupKeys.sort());
  for (const key of testCase.backupKeys) {
    assert.equal(record.execution.toolResults[0].backupPaths[key], null);
  }
  assert.equal(record.execution.toolResults[0].objectId, contract[testCase.idField]);

  const unchanged = await runSkillPlan(source, { root, apply: true });
  assert.equal(unchanged.action, 'unchanged');
  assert.equal(unchanged.changed, false);

  writeFileSync(join(root, targets[1]), '# 手工修改的本地产物\n', 'utf8');
  const driftedDryRun = await runSkillPlan(source, { root });
  assert.equal(driftedDryRun.action, 'dry-run-unchanged');
  assert.equal(driftedDryRun.dispatch.action, 'dry-run-replace-required');
    await assert.rejects(
      () => runSkillPlan(source, { root, apply: true }),
      error => error.code === 'skill-target-conflict',
    );
  assert.equal(readFileSync(join(root, targets[1]), 'utf8'), '# 手工修改的本地产物\n');

  const repaired = await runSkillPlan(source, { root, apply: true, replace: true });
  assert.equal(repaired.action, 'replaced-and-dispatched');
  const repairedRecord = JSON.parse(readFileSync(join(root, recordPath), 'utf8'));
  const documentBackup = repairedRecord.execution.toolResults[0].backupPaths[testCase.documentBackupKey];
  assert.notEqual(documentBackup, null);
  assert.equal(existsSync(join(root, documentBackup)), true);
  assert.notEqual(readFileSync(join(root, targets[1]), 'utf8'), '# 手工修改的本地产物\n');
}

test('runtime registry is a closed repository set', async () => {
  const registry = listSkillRegistry();
  assert.equal(registry.skillCount, 7);
  assert.deepEqual(
    registry.skills.map(skill => skill.skillKey),
    [
      'experience-structuring',
      'jd-analysis',
      'scam-check',
      'resume-generation',
      'interview-preparation',
      'interview-review',
      'opportunity-management',
    ],
  );
  assert.ok(registry.skills.every(skill => skill.downgrade.length > 0));
  assert.equal(
    registry.tools.find(tool => tool.toolKey === 'resume-final.import').command,
    'node resume-final.mjs apply <contract.json>',
  );
  assert.deepEqual(
    registry.tools.filter(tool => tool.dispatchable).map(tool => tool.toolKey),
    [
      'resume-materials.import',
      'job-analysis.import',
      'scam-check.import',
      'resume-final.import',
      'resume-render.import',
      'interview-prep.import',
      'interview-review.import',
      'capability-feedback.import',
      'company-opportunity.import',
      'company-opportunity-node.mutate',
      'company-opportunity-artifact.mount',
    ],
  );
});

test('skill plans require confirmation, registration, tools, and scoped targets', async () => {
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

test('dispatch plans are versioned, hash-bound, and limited to implemented bridges', async () => {
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
  assert.throws(
    () => canonicalizeSkillRunPlan(jobDispatchPlanFor(cliRoot, 'templates/job-analysis.example.json', {
      runId: 'skill-dispatch-job-targets',
    }, {
      targetObjects: [
        'data/job-analysis/one-analysis.json',
        'reports/job-analysis/another-analysis.md',
      ],
    })),
    error => error.code === 'invalid-dispatch-targets',
  );
});

test('job-analysis dispatch is read-only by default and writes only its declared targets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-job-dispatch-'));
  try {
    await installMaterials(root);
    writeJobAnalysisContract(root);
    const source = writePlan(root, 'job-dispatch-plan.json', jobDispatchPlanFor(root));

    const dryRun = await runSkillPlan(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(dryRun.dispatch.action, 'dry-run');
    assert.deepEqual(
      dryRun.dispatch.before.map(item => item.state),
      ['missing', 'missing'],
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-job-analysis.json')), false);
    assert.equal(existsSync(join(root, 'data/job-analysis/job-analysis-demo-2026-09-02.json')), false);
    assert.equal(existsSync(join(root, 'reports/job-analysis/job-analysis-demo-2026-09-02.md')), false);

    const applied = await runSkillPlan(source, { root, apply: true });
    assert.equal(applied.action, 'dispatched');
    assert.equal(applied.record.status, 'dispatched');
    assert.equal(applied.record.targetWriteCount, 2);
    assert.equal(existsSync(join(root, 'data/job-analysis/job-analysis-demo-2026-09-02.json')), true);
    assert.equal(existsSync(join(root, 'reports/job-analysis/job-analysis-demo-2026-09-02.md')), true);

    const record = JSON.parse(readFileSync(join(root, 'data/skill-runs/skill-dispatch-job-analysis.json'), 'utf8'));
    assert.equal(record.execution.toolResults[0].objectId, 'job-analysis-demo-2026-09-02');
    assert.equal(record.execution.toolResults[0].backupPaths.package, null);
    assert.equal(record.execution.toolResults[0].backupPaths.markdown, null);
    assert.deepEqual(record.targetFingerprints.after.map(item => item.state), ['file', 'file']);

    const unchanged = await runSkillPlan(source, { root, apply: true });
    assert.equal(unchanged.action, 'unchanged');
    assert.equal(unchanged.changed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('job-analysis replacement requires explicit replace and records backups', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-job-replace-'));
  try {
    await installMaterials(root);
    writeJobAnalysisContract(root, 'first-job.json', analysis => {
      analysis.analysisId = 'same-job-analysis';
    });
    const firstSource = writePlan(root, 'first-job-plan.json', jobDispatchPlanFor(root, 'first-job.json', {
      runId: 'skill-dispatch-first-job',
    }, {
      targetObjects: [
        'data/job-analysis/same-job-analysis.json',
        'reports/job-analysis/same-job-analysis.md',
      ],
    }));
    await runSkillPlan(firstSource, { root, apply: true });

    writeJobAnalysisContract(root, 'second-job.json', analysis => {
      analysis.analysisId = 'same-job-analysis';
      analysis.company = '替换示例科技';
    });
    const secondSource = writePlan(root, 'second-job-plan.json', jobDispatchPlanFor(root, 'second-job.json', {
      runId: 'skill-dispatch-second-job',
    }, {
      targetObjects: [
        'data/job-analysis/same-job-analysis.json',
        'reports/job-analysis/same-job-analysis.md',
      ],
    }));

    const dryRun = await runSkillPlan(secondSource, { root });
    assert.equal(dryRun.dispatch.action, 'dry-run-replace-required');
    await assert.rejects(
      () => runSkillPlan(secondSource, { root, apply: true }),
      error => error.code === 'skill-target-conflict',
    );
    assert.equal(JSON.parse(readFileSync(join(root, 'data/job-analysis/same-job-analysis.json'), 'utf8')).company, '示例科技');
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-second-job.json')), false);

    const replaced = await runSkillPlan(secondSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'dispatched');
    assert.equal(JSON.parse(readFileSync(join(root, 'data/job-analysis/same-job-analysis.json'), 'utf8')).company, '替换示例科技');
    const record = JSON.parse(readFileSync(join(root, 'data/skill-runs/skill-dispatch-second-job.json'), 'utf8'));
    assert.equal(record.execution.toolResults[0].backupPaths.package !== null, true);
    assert.equal(existsSync(join(root, record.execution.toolResults[0].backupPaths.package)), true);
    assert.equal(record.execution.toolResults[0].backupPaths.markdown !== null, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatch dry-run is read-only and apply executes the resume materials bridge', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-dispatch-'));
  try {
    writeMaterialsContract(root);
    const source = writePlan(root, 'dispatch-plan.json', dispatchPlanFor(root));

    const dryRun = await runSkillPlan(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(dryRun.dispatch.action, 'dry-run');
    assert.deepEqual(
      dryRun.dispatch.before.map(item => item.state),
      ['missing', 'missing'],
    );
    assert.equal(existsSync(join(root, 'data/skill-runs')), false);
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
    assert.equal(existsSync(join(root, 'interview-prep/story-bank.md')), false);

    const applied = await runSkillPlan(source, { root, apply: true });
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

    const unchanged = await runSkillPlan(source, { root, apply: true });
    assert.equal(unchanged.action, 'unchanged');
    assert.equal(unchanged.changed, false);
    assert.equal(inspectSkillRuntime(root).state, 'ready');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatch replaces only after explicit confirmation and never silently overwrites drift', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-dispatch-replace-'));
  try {
    writeMaterialsContract(root, 'first.json');
    const firstSource = writePlan(root, 'first-plan.json', dispatchPlanFor(root, 'first.json'));
    await runSkillPlan(firstSource, { root, apply: true });

    writeMaterialsContract(root, 'second.json', materials => {
      materials.packageId = 'replacement-materials';
      materials.entries[0].bullet = '设计并实现宿舍报修小程序的后端接口，支撑 30 间宿舍试用';
    });
    const secondSource = writePlan(root, 'second-plan.json', dispatchPlanFor(root, 'second.json'));

    const dryRun = await runSkillPlan(secondSource, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(dryRun.dispatch.action, 'dry-run-replace-required');
    await assert.rejects(
      () => runSkillPlan(secondSource, { root, apply: true }),
      error => error.code === 'skill-target-conflict',
    );
    assert.equal(JSON.parse(readFileSync(join(root, 'data/resume-materials.json'), 'utf8')).packageId, 'resume-materials-demo-2026-09-01');
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-second.json')), false);

    const replaced = await runSkillPlan(secondSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'dispatched');
    assert.equal(JSON.parse(readFileSync(join(root, 'data/resume-materials.json'), 'utf8')).packageId, 'replacement-materials');
    const replacementRecord = JSON.parse(readFileSync(join(root, 'data/skill-runs/skill-dispatch-second.json'), 'utf8'));
    assert.equal(replacementRecord.execution.toolResults[0].backupPaths.materials !== null, true);
    assert.equal(existsSync(join(root, replacementRecord.execution.toolResults[0].backupPaths.materials)), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatch stops before approval when the contract or target shape is unsafe', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-dispatch-invalid-'));
  try {
    writeMaterialsContract(root);
    const source = writePlan(root, 'dispatch-plan.json', dispatchPlanFor(root));
    writeMaterialsContract(root, 'materials.json', materials => {
      materials.entries[0].bullet = '契约文件在计划确认后被修改';
    });
    await assert.rejects(
      () => runSkillPlan(source, { root, apply: true }),
      error => error.code === 'dispatch-contract-drift',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs')), false);

    writeMaterialsContract(root);
    const validSource = writePlan(root, 'valid-dispatch-plan.json', dispatchPlanFor(root));
    mkdirSync(join(root, 'data'), { recursive: true });
    mkdirSync(join(root, 'data/resume-materials.json'));
    await assert.rejects(
      () => runSkillPlan(validSource, { root, apply: true }),
      error => error.code === 'invalid-target-state',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('job-analysis dispatch binds targets to contract identity, shape, and dependencies', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-job-invalid-'));
  try {
    await installMaterials(root);
    writeJobAnalysisContract(root);
    const mismatchSource = writePlan(root, 'job-mismatch-plan.json', jobDispatchPlanFor(root, 'job-analysis.json', {
      runId: 'skill-dispatch-job-mismatch',
    }, {
      targetObjects: [
        'data/job-analysis/plan-claimed-analysis.json',
        'reports/job-analysis/plan-claimed-analysis.md',
      ],
    }));
    await assert.rejects(
      () => runSkillPlan(mismatchSource, { root, apply: true }),
      error => error.code === 'dispatch-target-contract-mismatch',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-job-mismatch.json')), false);
    assert.equal(existsSync(join(root, 'data/job-analysis/plan-claimed-analysis.json')), false);

    const validSource = writePlan(root, 'valid-job-plan.json', jobDispatchPlanFor(root, 'job-analysis.json', {
      runId: 'skill-dispatch-valid-job',
    }));
    mkdirSync(join(root, 'data/job-analysis/job-analysis-demo-2026-09-02.json'), { recursive: true });
    await assert.rejects(
      () => runSkillPlan(validSource, { root, apply: true }),
      error => error.code === 'invalid-target-state',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-valid-job.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('job-analysis dispatch does not implicitly install missing resume materials', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-job-dependency-'));
  try {
    writeJobAnalysisContract(root);
    const source = writePlan(root, 'job-dependency-plan.json', jobDispatchPlanFor(root));
    await assert.rejects(
      () => runSkillPlan(source, { root, apply: true }),
      error => error.code === 'skill-dispatch-failed' && error.details.toolErrorCode === 'materials-missing',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-job-analysis.json')), false);
    assert.equal(existsSync(join(root, 'data/job-analysis/job-analysis-demo-2026-09-02.json')), false);
    assert.equal(existsSync(join(root, 'reports/job-analysis/job-analysis-demo-2026-09-02.md')), false);
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('company opportunity import is explicit, tracker-linked, and replace-protected', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-opportunity-import-'));
  try {
    const { analysis } = installOpportunityDependencies(root);
    const opportunityId = 'company-opportunity-demo-2026-09-02';
    const packagePath = `data/company-opportunities/${opportunityId}.json`;
    const targets = ['data/applications.md', packagePath];
    writeCompanyTemplateContract(
      root,
      'company-opportunity.example.json',
      'opportunity.json',
      opportunity => {
        opportunity.analysisContentHash = analysis.contentHash;
      },
    );
    const source = writePlan(root, 'opportunity-plan.json', companyDispatchPlan(
      root,
      'opportunity.json',
      'company-opportunity.import',
      'job_analysis',
      targets,
      { runId: 'skill-dispatch-opportunity-import' },
    ));
    const before = relativeFileSet(root);

    const dryRun = await runSkillPlan(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(dryRun.dispatch.action, 'dry-run');
    assert.deepEqual([...relativeFileSet(root)], [...before]);
    assert.equal(existsSync(join(root, packagePath)), false);
    assert.equal(existsSync(join(root, 'data/applications.md')), false);

    const applied = await runSkillPlan(source, { root, apply: true });
    assert.equal(applied.action, 'dispatched');
    assert.equal(applied.record.targetWriteCount, 2);
    const installed = loadCompanyOpportunity(root, opportunityId, loadInstalledResumeMaterials(root));
    assert.equal(installed.opportunity.company, '示例科技');
    const record = JSON.parse(readFileSync(join(root, 'data/skill-runs/skill-dispatch-opportunity-import.json'), 'utf8'));
    assert.equal(record.execution.toolResults[0].objectId, opportunityId);
    assert.deepEqual(
      Object.keys(record.execution.toolResults[0].backupPaths).sort(),
      ['package', 'tracker'],
    );
    assert.match(readFileSync(join(root, 'data/applications.md'), 'utf8'), /\| Evaluated \|/);

    const unchanged = await runSkillPlan(source, { root, apply: true });
    assert.equal(unchanged.action, 'unchanged');

    const secondAnalysis = writeJobAnalysisContract(root, 'analysis-v2.json', input => {
      input.analysisId = 'job-analysis-demo-v2';
    });
    importJobAnalysis(secondAnalysis.path, { root, apply: true });
    const replacementAnalysis = loadInstalledJobAnalysis(
      root,
      secondAnalysis.analysis.analysisId,
      loadInstalledResumeMaterials(root),
    );
    writeCompanyTemplateContract(
      root,
      'company-opportunity.example.json',
      'opportunity-replacement.json',
      opportunity => {
        opportunity.analysisId = replacementAnalysis.analysis.analysisId;
        opportunity.analysisContentHash = replacementAnalysis.contentHash;
      },
    );
    const replacementSource = writePlan(root, 'opportunity-replacement-plan.json', companyDispatchPlan(
      root,
      'opportunity-replacement.json',
      'company-opportunity.import',
      'job_analysis',
      targets,
      { runId: 'skill-dispatch-opportunity-replacement' },
    ));
    const replacementDryRun = await runSkillPlan(replacementSource, { root });
    assert.equal(replacementDryRun.dispatch.action, 'dry-run-replace-required');
    await assert.rejects(
      () => runSkillPlan(replacementSource, { root, apply: true }),
      error => error.code === 'skill-target-conflict',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-opportunity-replacement.json')), false);

    const replaced = await runSkillPlan(replacementSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'dispatched');
    const replacementRecord = JSON.parse(
      readFileSync(join(root, 'data/skill-runs/skill-dispatch-opportunity-replacement.json'), 'utf8'),
    );
    assert.notEqual(replacementRecord.execution.toolResults[0].backupPaths.package, null);
    assert.match(readFileSync(join(root, 'data/applications.md'), 'utf8'), /\| Evaluated \|/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('node mutation and artifact mount update only their declared opportunity records', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-opportunity-chain-'));
  try {
    const { analysis } = installOpportunityDependencies(root);
    const opportunityId = 'company-opportunity-demo-2026-09-02';
    writeCompanyTemplateContract(
      root,
      'company-opportunity.example.json',
      'opportunity.json',
      opportunity => {
        opportunity.analysisContentHash = analysis.contentHash;
      },
    );
    await runSkillPlan(writePlan(root, 'opportunity-plan.json', companyDispatchPlan(
      root,
      'opportunity.json',
      'company-opportunity.import',
      'job_analysis',
      ['data/applications.md', `data/company-opportunities/${opportunityId}.json`],
      { runId: 'skill-dispatch-opportunity-chain-import' },
    )), { root, apply: true });
    const imported = loadCompanyOpportunity(root, opportunityId, loadInstalledResumeMaterials(root));
    const trackerBefore = readFileSync(join(root, 'data/applications.md'), 'utf8');

    writeCompanyTemplateContract(
      root,
      'company-opportunity-node.example.json',
      'node-mutation.json',
      mutation => {
        mutation.expectedOpportunityContentHash = imported.contentHash;
      },
    );
    const mutationTarget = `data/company-opportunity-mutations/${opportunityId}/company-opportunity-node-demo-2026-09-02.json`;
    const mutationSource = writePlan(root, 'node-mutation-plan.json', companyDispatchPlan(
      root,
      'node-mutation.json',
      'company-opportunity-node.mutate',
      'process_nodes',
      [`data/company-opportunities/${opportunityId}.json`, mutationTarget],
      { runId: 'skill-dispatch-node-mutation' },
    ));
    const mutationDryRun = await runSkillPlan(mutationSource, { root });
    assert.equal(mutationDryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, mutationTarget)), false);

    const mutationApplied = await runSkillPlan(mutationSource, { root, apply: true });
    assert.equal(mutationApplied.action, 'dispatched');
    assert.equal(mutationApplied.record.targetWriteCount, 2);
    const mutated = loadCompanyOpportunity(root, opportunityId, loadInstalledResumeMaterials(root));
    assert.equal(mutated.opportunity.processNodes.find(node => node.id === 'written-test')?.status, 'active');
    assert.equal(readFileSync(join(root, 'data/applications.md'), 'utf8'), trackerBefore);
    const mutationRecord = JSON.parse(readFileSync(join(root, 'data/skill-runs/skill-dispatch-node-mutation.json'), 'utf8'));
    assert.equal(mutationRecord.execution.toolResults[0].objectId, 'company-opportunity-node-demo-2026-09-02');
    assert.deepEqual(Object.keys(mutationRecord.execution.toolResults[0].backupPaths), ['opportunity']);
    assert.notEqual(mutationRecord.execution.toolResults[0].backupPaths.opportunity, null);

    const mutationUnchanged = await runSkillPlan(mutationSource, { root, apply: true });
    assert.equal(mutationUnchanged.action, 'unchanged');

    const artifactPath = 'reports/job-analysis/job-analysis-demo-2026-09-02.md';
    writeCompanyTemplateContract(
      root,
      'company-opportunity-artifact.example.json',
      'artifact-mount.json',
      mount => {
        mount.expectedOpportunityContentHash = mutated.contentHash;
        mount.artifact.path = artifactPath;
        mount.artifact.contentHash = byteHash(join(root, artifactPath));
      },
    );
    const mountTarget = `data/company-opportunity-artifact-mounts/${opportunityId}/company-opportunity-artifact-demo-2026-09-02.json`;
    const mountSource = writePlan(root, 'artifact-mount-plan.json', companyDispatchPlan(
      root,
      'artifact-mount.json',
      'company-opportunity-artifact.mount',
      'local_artifact',
      [`data/company-opportunities/${opportunityId}.json`, mountTarget],
      { runId: 'skill-dispatch-artifact-mount' },
    ));
    const mountDryRun = await runSkillPlan(mountSource, { root });
    assert.equal(mountDryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, mountTarget)), false);

    const mountApplied = await runSkillPlan(mountSource, { root, apply: true });
    assert.equal(mountApplied.action, 'dispatched');
    const mounted = loadCompanyOpportunity(root, opportunityId, loadInstalledResumeMaterials(root));
    const mountedNode = mounted.opportunity.processNodes.find(node => node.id === 'jd-analysis');
    assert.equal(mountedNode.artifacts?.[0]?.mountId, 'company-opportunity-artifact-demo-2026-09-02');
    assert.equal(mounted.opportunity.processNodes.find(node => node.id === 'written-test')?.status, 'active');
    assert.equal(mounted.opportunity.trackerStatus, 'Evaluated');
    assert.equal(readFileSync(join(root, 'data/applications.md'), 'utf8'), trackerBefore);
    const mountRecord = JSON.parse(readFileSync(join(root, 'data/skill-runs/skill-dispatch-artifact-mount.json'), 'utf8'));
    assert.equal(mountRecord.execution.toolResults[0].objectId, 'company-opportunity-artifact-demo-2026-09-02');
    assert.notEqual(mountRecord.execution.toolResults[0].backupPaths.opportunity, null);

    const mountUnchanged = await runSkillPlan(mountSource, { root, apply: true });
    assert.equal(mountUnchanged.action, 'unchanged');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('company opportunity import does not implicitly install dependencies', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-opportunity-dependency-'));
  try {
    writeCompanyTemplateContract(
      root,
      'company-opportunity.example.json',
      'opportunity.json',
    );
    const source = writePlan(root, 'opportunity-plan.json', companyDispatchPlan(
      root,
      'opportunity.json',
      'company-opportunity.import',
      'job_analysis',
      [
        'data/applications.md',
        'data/company-opportunities/company-opportunity-demo-2026-09-02.json',
      ],
      { runId: 'skill-dispatch-opportunity-dependency' },
    ));
    await assert.rejects(
      () => runSkillPlan(source, { root, apply: true }),
      error => error.code === 'skill-dispatch-failed' && error.details.toolErrorCode === 'analysis-missing',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-opportunity-dependency.json')), false);
    assert.equal(existsSync(join(root, 'data/company-opportunities')), false);
    assert.equal(existsSync(join(root, 'data/applications.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('company opportunity bridges reject unsafe plans before run records', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-opportunity-invalid-'));
  try {
    const { analysis } = installOpportunityDependencies(root);
    const opportunityId = 'company-opportunity-demo-2026-09-02';
    writeCompanyTemplateContract(
      root,
      'company-opportunity.example.json',
      'opportunity.json',
      opportunity => {
        opportunity.analysisContentHash = analysis.contentHash;
      },
    );
    await runSkillPlan(writePlan(root, 'opportunity-plan.json', companyDispatchPlan(
      root,
      'opportunity.json',
      'company-opportunity.import',
      'job_analysis',
      ['data/applications.md', `data/company-opportunities/${opportunityId}.json`],
      { runId: 'skill-dispatch-opportunity-invalid-import' },
    )), { root, apply: true });
    const installed = loadCompanyOpportunity(root, opportunityId, loadInstalledResumeMaterials(root));

    writeCompanyTemplateContract(
      root,
      'company-opportunity-node.example.json',
      'node-mutation.json',
      mutation => {
        mutation.expectedOpportunityContentHash = installed.contentHash;
      },
    );
    const mismatchSource = writePlan(root, 'node-mismatch-plan.json', companyDispatchPlan(
      root,
      'node-mutation.json',
      'company-opportunity-node.mutate',
      'process_nodes',
      [
        `data/company-opportunities/${opportunityId}.json`,
        `data/company-opportunity-mutations/${opportunityId}/plan-claimed-mutation.json`,
      ],
      { runId: 'skill-dispatch-node-mismatch' },
    ));
    await assert.rejects(
      () => runSkillPlan(mismatchSource, { root, apply: true }),
      error => error.code === 'dispatch-target-contract-mismatch',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-node-mismatch.json')), false);

    const mutationTarget = `data/company-opportunity-mutations/${opportunityId}/company-opportunity-node-demo-2026-09-02.json`;
    const directorySource = writePlan(root, 'node-directory-plan.json', companyDispatchPlan(
      root,
      'node-mutation.json',
      'company-opportunity-node.mutate',
      'process_nodes',
      [`data/company-opportunities/${opportunityId}.json`, mutationTarget],
      { runId: 'skill-dispatch-node-directory' },
    ));
    mkdirSync(join(root, mutationTarget), { recursive: true });
    await assert.rejects(
      () => runSkillPlan(directorySource, { root, apply: true }),
      error => error.code === 'invalid-target-state',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-node-directory.json')), false);
    rmSync(join(root, mutationTarget), { recursive: true, force: true });

    const validMutationSource = writePlan(root, 'node-valid-plan.json', companyDispatchPlan(
      root,
      'node-mutation.json',
      'company-opportunity-node.mutate',
      'process_nodes',
      [`data/company-opportunities/${opportunityId}.json`, mutationTarget],
      { runId: 'skill-dispatch-node-valid' },
    ));
    await runSkillPlan(validMutationSource, { root, apply: true });
    const mutated = loadCompanyOpportunity(root, opportunityId, loadInstalledResumeMaterials(root));
    writeCompanyTemplateContract(
      root,
      'company-opportunity-node.example.json',
      'node-conflict.json',
      mutation => {
        mutation.expectedOpportunityContentHash = mutated.contentHash;
        mutation.changeSummary = '复用 mutationId 但变更节点计划';
      },
    );
    const conflictSource = writePlan(root, 'node-conflict-plan.json', companyDispatchPlan(
      root,
      'node-conflict.json',
      'company-opportunity-node.mutate',
      'process_nodes',
      [`data/company-opportunities/${opportunityId}.json`, mutationTarget],
      { runId: 'skill-dispatch-node-conflict' },
    ));
    await assert.rejects(
      () => runSkillPlan(conflictSource, { root, apply: true, replace: true }),
      error => error.code === 'skill-dispatch-failed' && error.details.toolErrorCode === 'mutation-conflict',
    );
    assert.equal(existsSync(join(root, 'data/skill-runs/skill-dispatch-node-conflict.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scam-check dispatch is explicit, target-scoped, and drift-protected', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-scam-dispatch-'));
  try {
    writeToolContract(root, 'scam-check.example.json', 'scam-check.json');
    const source = writeRuntimeToolPlan(root, 'scam-check.import', 'scam-check.json', {
      runId: 'skill-dispatch-scam-lifecycle',
    });
    await assertDispatchLifecycle(root, 'scam-check.import', source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resume final and render dispatches stay separate and write only declared outputs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-resume-dispatch-'));
  try {
    await installRuntimeMaterials(root);

    writeToolContract(root, 'resume-final.example.json', 'resume-final.json');
    const finalSource = writeRuntimeToolPlan(root, 'resume-final.import', 'resume-final.json', {
      runId: 'skill-dispatch-final-lifecycle',
    });
    await assertDispatchLifecycle(root, 'resume-final.import', finalSource);

    writeToolContract(root, 'resume-render.example.json', 'resume-render.json');
    const renderSource = writeRuntimeToolPlan(root, 'resume-render.import', 'resume-render.json', {
      runId: 'skill-dispatch-render-lifecycle',
    });
    await assertDispatchLifecycle(root, 'resume-render.import', renderSource);

    const chained = runtimeToolPlanFor(root, 'resume-final.import', 'resume-final.json');
    chained.toolCalls = [
      chained.toolCalls[0],
      runtimeToolPlanFor(root, 'resume-render.import', 'resume-render.json').toolCalls[0],
    ];
    assert.throws(
      () => canonicalizeSkillRunPlan(chained),
      /exactly one tool call/i,
    );

    const incompleteFinalTargets = runtimeToolPlanFor(
      root,
      'resume-final.import',
      'resume-final.json',
      {},
      { targetObjects: ['data/resume-final-plan.json'] },
    );
    assert.throws(
      () => canonicalizeSkillRunPlan(incompleteFinalTargets),
      /must exactly match/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('interview preparation dispatch is explicit and drift-protected', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-prep-dispatch-'));
  try {
    await installRuntimeMaterials(root);
    writeToolContract(root, 'interview-prep.example.json', 'interview-prep.json');
    const source = writeRuntimeToolPlan(root, 'interview-prep.import', 'interview-prep.json', {
      runId: 'skill-dispatch-prep-lifecycle',
    });
    await assertDispatchLifecycle(root, 'interview-prep.import', source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('interview review and capability feedback dispatches stay separate', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-review-dispatch-'));
  try {
    importEvidencePackage(join(cliRoot, 'templates/evidence-package.example.json'), { root, apply: true });
    await installRuntimeMaterials(root);
    writeToolContract(root, 'interview-prep.example.json', 'interview-prep.json');
    await runSkillPlan(writeRuntimeToolPlan(root, 'interview-prep.import', 'interview-prep.json', {
      runId: 'skill-dispatch-prep-dependency',
    }), { root, apply: true });

    writeToolContract(root, 'interview-review.example.json', 'interview-review.json');
    const reviewSource = writeRuntimeToolPlan(root, 'interview-review.import', 'interview-review.json', {
      runId: 'skill-dispatch-review-lifecycle',
    });
    await assertDispatchLifecycle(root, 'interview-review.import', reviewSource);

    writeToolContract(root, 'capability-feedback.example.json', 'capability-feedback.json');
    const feedbackSource = writeRuntimeToolPlan(root, 'capability-feedback.import', 'capability-feedback.json', {
      runId: 'skill-dispatch-feedback-lifecycle',
    });
    await assertDispatchLifecycle(root, 'capability-feedback.import', feedbackSource);

    const chained = runtimeToolPlanFor(root, 'interview-review.import', 'interview-review.json');
    chained.toolCalls = [
      chained.toolCalls[0],
      runtimeToolPlanFor(root, 'capability-feedback.import', 'capability-feedback.json').toolCalls[0],
    ];
    assert.throws(
      () => canonicalizeSkillRunPlan(chained),
      /exactly one tool call/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dynamic dispatch targets are bound to their contract identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-target-binding-'));
  try {
    for (const [toolKey, testCase] of TOOL_DISPATCH_CASES) {
      if (toolKey === 'resume-final.import') continue;
      const testCase = TOOL_DISPATCH_CASES.get(toolKey);
      const contractName = `${toolKey.replace(/\./g, '-')}.json`;
      const { contract } = writeToolContract(root, testCase.template, contractName);
      const claimedContract = { ...contract, [testCase.idField]: 'plan-claimed-target' };
      const source = writeRuntimeToolPlan(root, toolKey, contractName, {
        runId: `skill-dispatch-${toolKey.replace(/\./g, '-')}-binding`,
      }, {
        targetObjects: testCase.targets(claimedContract),
      });
      await assert.rejects(
        () => runSkillPlan(source, { root, apply: true }),
        error => error.code === 'dispatch-target-contract-mismatch',
      );
      assert.equal(existsSync(join(root, `data/skill-runs/skill-dispatch-${toolKey.replace(/\./g, '-')}-binding.json`)), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dispatchers reject directory target states before writing run records', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-target-directory-'));
  try {
    for (const toolKey of TOOL_DISPATCH_CASES.keys()) {
      const testCase = TOOL_DISPATCH_CASES.get(toolKey);
      const contractName = `${toolKey.replace(/\./g, '-')}.json`;
      writeToolContract(root, testCase.template, contractName);
      const source = writeRuntimeToolPlan(root, toolKey, contractName, {
        runId: `skill-dispatch-${toolKey.replace(/\./g, '-')}-directory`,
      });
      const plan = JSON.parse(readFileSync(source, 'utf8'));
      const directoryTarget = plan.toolCalls[0].targetObjects[0];
      mkdirSync(join(root, directoryTarget), { recursive: true });
      await assert.rejects(
        () => runSkillPlan(source, { root, apply: true }),
        error => error.code === 'invalid-target-state',
      );
      assert.equal(existsSync(join(root, `data/skill-runs/${plan.runId}.json`)), false);
      rmSync(join(root, directoryTarget), { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('remaining dispatchers do not implicitly install missing dependencies', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-dependency-missing-'));
  try {
    const expectedCodes = new Map([
      ['resume-final.import', 'materials-missing'],
      ['interview-prep.import', 'materials-missing'],
      ['interview-review.import', 'materials-missing'],
      ['capability-feedback.import', 'evidence-package-missing'],
    ]);
    for (const [toolKey, expectedCode] of expectedCodes) {
      const testCase = TOOL_DISPATCH_CASES.get(toolKey);
      const contractName = `${toolKey.replace(/\./g, '-')}.json`;
      writeToolContract(root, testCase.template, contractName);
      const source = writeRuntimeToolPlan(root, toolKey, contractName, {
        runId: `skill-dispatch-${toolKey.replace(/\./g, '-')}-missing`,
      });
      const plan = JSON.parse(readFileSync(source, 'utf8'));
      await assert.rejects(
        () => runSkillPlan(source, { root, apply: true }),
        error => error.code === 'skill-dispatch-failed' && error.details.toolErrorCode === expectedCode,
      );
      assert.equal(existsSync(join(root, `data/skill-runs/${plan.runId}.json`)), false);
      for (const target of plan.toolCalls[0].targetObjects) {
        assert.equal(existsSync(join(root, target)), false);
      }
    }
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
    assert.equal(existsSync(join(root, 'interview-prep/story-bank.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('skill run records are explicit, idempotent, isolated, and replace-protected', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-skill-runtime-'));
  try {
    const source = writePlan(root, 'skill-plan.json', buildPlan());
    const dryRun = await runSkillPlan(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/skill-runs')), false);
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
    assert.equal(existsSync(join(root, 'interview-prep/story-bank.md')), false);

    const applied = await runSkillPlan(source, { root, apply: true });
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

    const unchanged = await runSkillPlan(source, { root, apply: true });
    assert.equal(unchanged.action, 'unchanged');
    assert.equal(unchanged.changed, false);

    const changedSource = writePlan(root, 'skill-plan-v2.json', buildPlan({
      userIntent: '把同一段实习整理成另一个岗位的素材候选',
      runId: 'skill-run-experience-demo-v2',
    }));
    const changed = await runSkillPlan(changedSource, { root, apply: true });
    assert.equal(changed.action, 'recorded');
    assert.equal(inspectSkillRuntime(root).state, 'ready');
    assert.equal(buildStatusPayload(root).skillRuntime.state, 'ready');

    const conflictSource = writePlan(root, 'skill-plan-conflict.json', buildPlan({
      userIntent: '复用 runId 但变更用户意图摘要',
    }));
    await assert.rejects(
      () => runSkillPlan(conflictSource, { root, apply: true }),
      error => error.code === 'skill-run-conflict',
    );
    const replaced = await runSkillPlan(conflictSource, { root, apply: true, replace: true });
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
