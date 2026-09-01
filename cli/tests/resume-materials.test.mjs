import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { importEvidencePackage } from '../evidence-package.mjs';
import {
  canonicalizeResumeMaterials,
  importResumeMaterials,
  inspectResumeMaterials,
  renderStoryBank,
  ResumeMaterialsError,
} from '../resume-materials.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(cliRoot, 'templates/resume-materials.example.json');
const evidenceExamplePath = join(cliRoot, 'templates/evidence-package.example.json');

function readExample() {
  return JSON.parse(readFileSync(examplePath, 'utf8'));
}

function writeMaterials(root, name, materials) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(materials, null, 2)}\n`, 'utf8');
  return path;
}

test('canonicalizes valid materials and keeps generation time out of the semantic hash', () => {
  const result = canonicalizeResumeMaterials(readExample());
  assert.equal(result.package.schema, 'get-yourself.resume-materials');
  assert.equal(result.summary.entryCount, 2);
  assert.equal(result.summary.storyCount, 1);
  assert.match(result.summary.contentHash, /^sha256:[0-9a-f]{64}$/);

  const regenerated = readExample();
  regenerated.generatedAt = '2026-09-02T00:00:00.000Z';
  assert.equal(canonicalizeResumeMaterials(regenerated).contentHash, result.contentHash);
});

test('rejects unknown fields, unconfirmed packages, invalid enums, and broken story references', () => {
  const unknownField = readExample();
  unknownField.contact = 'private';
  assert.throws(() => canonicalizeResumeMaterials(unknownField), /unknown field/i);

  const unconfirmed = readExample();
  unconfirmed.confirmation = 'pending';
  assert.throws(() => canonicalizeResumeMaterials(unconfirmed), /confirmation/i);

  const invalidSection = readExample();
  invalidSection.entries[0].section = 'education';
  assert.throws(() => canonicalizeResumeMaterials(invalidSection), /section/i);

  const brokenReference = readExample();
  brokenReference.stories[0].entryRefs[0] = 'missing-entry';
  assert.throws(() => canonicalizeResumeMaterials(brokenReference), /unknown id/i);

  const jdAsStoryFact = readExample();
  jdAsStoryFact.stories[0].sourceType = 'jd_analysis';
  assert.throws(() => canonicalizeResumeMaterials(jdAsStoryFact), /sourceType/i);

  const externalWithoutJd = readExample();
  externalWithoutJd.entries[0].evidenceStatus = 'external';
  assert.throws(() => canonicalizeResumeMaterials(externalWithoutJd), /external/i);

  const jdAsConfirmedFact = readExample();
  jdAsConfirmedFact.entries[0].sourceType = 'jd_analysis';
  assert.throws(() => canonicalizeResumeMaterials(jdAsConfirmedFact), /external/i);
});

test('validates evidence references against the installed evidence package', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-materials-evidence-'));
  try {
    importEvidencePackage(evidenceExamplePath, { root, apply: true });

    const evidenceBacked = readExample();
    evidenceBacked.entries[0].sourceType = 'evidence_package';
    evidenceBacked.entries[0].sourceId = 'demo-evidence-2026-09-01';
    evidenceBacked.entries[0].evidenceStatus = 'verified';
    evidenceBacked.entries[0].evidenceRefs = ['evidence-backend-1'];
    const source = writeMaterials(root, 'evidence-backed.json', evidenceBacked);
    const result = importResumeMaterials(source, { root });
    assert.equal(result.action, 'dry-run');

    const broken = readExample();
    broken.entries[0].sourceType = 'evidence_package';
    broken.entries[0].sourceId = 'demo-evidence-2026-09-01';
    broken.entries[0].evidenceRefs = ['missing-evidence'];
    const brokenSource = writeMaterials(root, 'broken-evidence.json', broken);
    assert.throws(
      () => importResumeMaterials(brokenSource, { root }),
      error => error instanceof ResumeMaterialsError && error.code === 'invalid-materials',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const noEvidenceRoot = mkdtempSync(join(tmpdir(), 'gy-materials-no-evidence-'));
  try {
    const evidenceBacked = readExample();
    evidenceBacked.entries[0].sourceType = 'evidence_package';
    evidenceBacked.entries[0].evidenceRefs = ['evidence-backend-1'];
    const source = writeMaterials(noEvidenceRoot, 'evidence-backed.json', evidenceBacked);
    assert.throws(
      () => importResumeMaterials(source, { root: noEvidenceRoot }),
      error => error instanceof ResumeMaterialsError && error.code === 'evidence-package-unavailable',
    );
  } finally {
    rmSync(noEvidenceRoot, { recursive: true, force: true });
  }
});

test('materials import dry-run and apply are explicit, idempotent, and never touch cv.md', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-materials-import-'));
  try {
    const source = writeMaterials(root, 'incoming.json', readExample());
    const dryRun = importResumeMaterials(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
    assert.equal(existsSync(join(root, 'interview-prep/story-bank.md')), false);

    const applied = importResumeMaterials(source, { root, apply: true });
    assert.equal(applied.action, 'imported');
    const installed = JSON.parse(readFileSync(join(root, 'data/resume-materials.json'), 'utf8'));
    assert.equal(installed.confirmation, 'user_confirmed');
    assert.equal(installed.secret, undefined);
    assert.equal(existsSync(join(root, 'cv.md')), false);
    const storyBank = readFileSync(join(root, 'interview-prep/story-bank.md'), 'utf8');
    assert.match(storyBank, /不是简历定稿/);
    assert.match(storyBank, /### Result/);

    const regenerated = readExample();
    regenerated.generatedAt = '2026-09-03T00:00:00.000Z';
    const regeneratedSource = writeMaterials(root, 'regenerated.json', regenerated);
    assert.equal(importResumeMaterials(regeneratedSource, { root, apply: true }).action, 'unchanged');
    assert.equal(inspectResumeMaterials(root).storyBankState, 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacing canonical materials or a manually changed story bank requires explicit replace', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-materials-replace-'));
  try {
    const source = writeMaterials(root, 'first.json', readExample());
    importResumeMaterials(source, { root, apply: true });

    const secondData = readExample();
    secondData.packageId = 'replacement-materials';
    secondData.entries[0].bullet = '设计并实现宿舍报修小程序的后端接口，支撑 30 间宿舍试用';
    const secondSource = writeMaterials(root, 'second.json', secondData);
    assert.throws(
      () => importResumeMaterials(secondSource, { root, apply: true }),
      error => error instanceof ResumeMaterialsError && error.code === 'different-materials',
    );

    const replaced = importResumeMaterials(secondSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'replaced');
    assert.equal(existsSync(replaced.backupPaths.materials), true);
    assert.equal(replaced.backupPaths.storyBank, null);
    assert.equal(
      JSON.parse(readFileSync(join(root, 'data/resume-materials.json'), 'utf8')).packageId,
      'replacement-materials',
    );

    writeFileSync(join(root, 'interview-prep/story-bank.md'), '# 手工故事库\n', 'utf8');
    assert.throws(
      () => importResumeMaterials(secondSource, { root, apply: true }),
      error => error instanceof ResumeMaterialsError && error.code === 'different-materials',
    );
    const storyRepair = importResumeMaterials(secondSource, { root, apply: true, replace: true });
    assert.equal(storyRepair.action, 'replaced');
    assert.equal(storyRepair.backupPaths.materials, null);
    assert.equal(existsSync(storyRepair.backupPaths.storyBank), true);
    assert.equal(inspectResumeMaterials(root).storyBankState, 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('status inspection reports missing, ready, and invalid without writing', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-materials-status-'));
  try {
    assert.deepEqual(inspectResumeMaterials(root), { state: 'missing', available: false });
    assert.deepEqual(readdirSync(root), []);

    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(join(root, 'data/resume-materials.json'), 'not-json', 'utf8');
    const invalid = inspectResumeMaterials(root);
    assert.equal(invalid.state, 'invalid');
    assert.equal(invalid.available, false);
    assert.match(invalid.error, /invalid/i);

    rmSync(join(root, 'data/resume-materials.json'));
    const source = writeMaterials(root, 'incoming.json', readExample());
    importResumeMaterials(source, { root, apply: true });
    const ready = inspectResumeMaterials(root);
    assert.equal(ready.state, 'ready');
    assert.equal(ready.available, true);
    assert.equal(ready.entryCount, 2);
    assert.equal(ready.storyCount, 1);
    assert.equal(ready.storyBankState, 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('story bank rendering is deterministic and keeps provenance visible', () => {
  const materials = canonicalizeResumeMaterials(readExample()).package;
  const first = renderStoryBank(materials);
  const second = renderStoryBank(materials);
  assert.equal(first, second);
  assert.match(first, /关联素材：internship-repair-backend/);
  assert.match(first, /来源：用户陈述/);
});
