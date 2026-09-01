import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { importResumeMaterials, loadInstalledResumeMaterials } from '../resume-materials.mjs';
import {
  applyResumeFinalPlan,
  canonicalizeResumeFinalPlan,
  inspectResumeFinal,
} from '../resume-final.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const materialsExamplePath = join(cliRoot, 'templates/resume-materials.example.json');
const finalExamplePath = join(cliRoot, 'templates/resume-final.example.json');

function readMaterialsExample() {
  return JSON.parse(readFileSync(materialsExamplePath, 'utf8'));
}

function installMaterials(root) {
  importResumeMaterials(materialsExamplePath, { root, apply: true });
  return loadInstalledResumeMaterials(root);
}

function buildPlan(materials, overrides = {}) {
  return {
    schema: 'get-yourself.resume-final-plan',
    schemaVersion: 1,
    planId: 'resume-final-demo',
    generatedAt: '2026-09-01T12:00:00.000Z',
    traceId: 'trace.resume-final-demo',
    materialsPackageId: materials.package.packageId,
    materialsContentHash: materials.contentHash,
    confirmation: 'user_confirmed',
    sections: [
      { section: 'internship', entryRefs: ['internship-repair-backend'] },
      { section: 'project', entryRefs: ['project-frontend-contract'] },
    ],
    ...overrides,
  };
}

function writePlan(root, name, plan) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return path;
}

test('validates a final plan against the exact installed materials package', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-resume-final-check-'));
  try {
    const materials = installMaterials(root);
    const result = canonicalizeResumeFinalPlan(buildPlan(materials), materials);
    assert.equal(result.summary.selectedEntryCount, 2);
    assert.match(result.summary.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(
      canonicalizeResumeFinalPlan(JSON.parse(readFileSync(finalExamplePath, 'utf8')), materials).summary.selectedEntryCount,
      2,
    );

    const unknown = buildPlan(materials, { extra: 'forbidden' });
    assert.throws(() => canonicalizeResumeFinalPlan(unknown, materials), /unknown field/i);

    const stale = buildPlan(materials, { materialsContentHash: 'sha256:0'.repeat(64) });
    assert.throws(() => canonicalizeResumeFinalPlan(stale, materials), /materialsContentHash/);

    const missing = readMaterialsExample();
    missing.entries[0].evidenceStatus = 'missing';
    importResumeMaterials(writePlan(root, 'missing.json', missing), { root, apply: true, replace: true });
    const changedMaterials = loadInstalledResumeMaterials(root);
    assert.throws(
      () => canonicalizeResumeFinalPlan(buildPlan(changedMaterials), changedMaterials),
      /cannot enter the final resume/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('final apply is explicit, idempotent, auditable, and never invents facts', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-resume-final-apply-'));
  try {
    const materials = installMaterials(root);
    const source = writePlan(root, 'final.json', buildPlan(materials));
    const dryRun = applyResumeFinalPlan(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/resume-final-plan.json')), false);
    assert.equal(existsSync(join(root, 'cv.md')), false);
    assert.match(dryRun.desiredMarkdown, /## 实习经历/);
    assert.match(dryRun.desiredMarkdown, /### 校园技术团队｜后端开发实习生/);

    const applied = applyResumeFinalPlan(source, { root, apply: true });
    assert.equal(applied.action, 'applied');
    const cv = readFileSync(join(root, 'cv.md'), 'utf8');
    assert.match(cv, /## 项目经历/);
    assert.doesNotMatch(cv, /还需要用户补充/);
    const plan = JSON.parse(readFileSync(join(root, 'data/resume-final-plan.json'), 'utf8'));
    assert.equal(plan.materialsContentHash, materials.contentHash);
    assert.deepEqual(plan.sections[0].entryRefs, ['internship-repair-backend']);
    assert.equal(inspectResumeFinal(root).cvState, 'current');
    assert.equal(applyResumeFinalPlan(source, { root, apply: true }).action, 'unchanged');

    writeFileSync(join(root, 'cv.md'), `${cv}\n<!-- manual edit -->\n`, 'utf8');
    assert.equal(inspectResumeFinal(root).cvState, 'different');
    assert.throws(
      () => applyResumeFinalPlan(source, { root, apply: true }),
      error => error.code === 'different-final-plan',
    );
    const repaired = applyResumeFinalPlan(source, { root, apply: true, replace: true });
    assert.equal(repaired.action, 'replaced');
    assert.equal(existsSync(repaired.backupPaths.cv), true);
    assert.equal(inspectResumeFinal(root).cvState, 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacing target sections preserves unrelated resume content and backs up the old plan', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-resume-final-preserve-'));
  try {
    const materials = installMaterials(root);
    writeFileSync(join(root, 'cv.md'), [
      '# 我的简历',
      '',
      '## 教育背景',
      '',
      '- 本科，计算机科学',
      '',
      '## 实习经历',
      '',
      '- 旧经历',
      '',
      '## 自我评价',
      '',
      '- 保持不变',
      '',
    ].join('\n'), 'utf8');
    const source = writePlan(root, 'final.json', buildPlan(materials));
    assert.throws(
      () => applyResumeFinalPlan(source, { root, apply: true }),
      error => error.code === 'different-final-plan',
    );
    const result = applyResumeFinalPlan(source, { root, apply: true, replace: true });
    assert.equal(result.action, 'applied');
    const cv = readFileSync(join(root, 'cv.md'), 'utf8');
    assert.match(cv, /## 教育背景/);
    assert.match(cv, /本科，计算机科学/);
    assert.match(cv, /校园技术团队/);
    assert.match(cv, /## 自我评价/);
    assert.doesNotMatch(cv, /旧经历/);
    assert.equal(existsSync(result.backupPaths.cv), true);

    const secondPlan = buildPlan(materials, {
      planId: 'resume-final-second',
      sections: [{ section: 'internship', entryRefs: ['internship-repair-backend'] }],
    });
    const secondSource = writePlan(root, 'second.json', secondPlan);
    assert.throws(
      () => applyResumeFinalPlan(secondSource, { root, apply: true }),
      error => error.code === 'different-final-plan',
    );
    const replaced = applyResumeFinalPlan(secondSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'replaced');
    assert.equal(existsSync(replaced.backupPaths.plan), true);
    assert.equal(existsSync(replaced.backupPaths.cv), true);
    assert.doesNotMatch(readFileSync(join(root, 'cv.md'), 'utf8'), /## 项目经历/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
