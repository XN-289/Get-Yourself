import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  canonicalizeEvidencePackage,
  EvidencePackageError,
  importEvidencePackage,
  inspectEvidencePackage,
} from '../evidence-package.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(cliRoot, 'templates/evidence-package.example.json');

function readExample() {
  return JSON.parse(readFileSync(examplePath, 'utf8'));
}

function writePackage(root, name, packageData) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(packageData, null, 2)}\n`, 'utf8');
  return path;
}

test('canonicalizes a valid evidence package and computes a stable content hash', () => {
  const result = canonicalizeEvidencePackage(readExample());
  assert.equal(result.package.schema, 'get-yourself.evidence-package');
  assert.equal(result.summary.abilityCount, 3);
  assert.equal(result.summary.evidenceCount, 3);
  assert.match(result.summary.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    canonicalizeEvidencePackage(readExample()).contentHash,
    result.contentHash,
  );
});

test('rejects unknown fields, invalid scores, and broken evidence references', () => {
  const unknownField = readExample();
  unknownField.contact = 'private';
  assert.throws(() => canonicalizeEvidencePackage(unknownField), /unknown field/i);

  const invalidScore = readExample();
  invalidScore.abilities[0].score = 101;
  assert.throws(() => canonicalizeEvidencePackage(invalidScore), /0 to 100/);

  const brokenReference = readExample();
  brokenReference.abilities[0].evidenceRefs[0] = 'missing-evidence';
  assert.throws(() => canonicalizeEvidencePackage(brokenReference), /unknown id/i);
});

test('evidence import dry-run and apply are explicit and idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-evidence-'));
  try {
    const packageData = readExample();
    const source = writePackage(root, 'incoming.json', packageData);

    const dryRun = importEvidencePackage(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/evidence-package.json')), false);

    const applied = importEvidencePackage(source, { root, apply: true });
    assert.equal(applied.action, 'imported');
    const installed = JSON.parse(readFileSync(join(root, 'data/evidence-package.json'), 'utf8'));
    assert.equal(installed.packageId, packageData.packageId);
    assert.equal(installed.secret, undefined);

    const unchanged = importEvidencePackage(source, { root, apply: true });
    assert.equal(unchanged.action, 'unchanged');
    assert.equal(unchanged.backupPath, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacing a different package requires explicit replace and creates a backup', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-evidence-replace-'));
  try {
    const first = writePackage(root, 'first.json', readExample());
    importEvidencePackage(first, { root, apply: true });

    const backupDir = join(root, 'data/evidence-package-backups');
    mkdirSync(backupDir, { recursive: true });
    const oldestBackup = 'evidence-package-2026-01-01T00-00-00-000Z-aaaaaaaaaaaa.json';
    for (const [index, name] of [
      oldestBackup,
      'evidence-package-2026-01-02T00-00-00-000Z-bbbbbbbbbbbb.json',
      'evidence-package-2026-01-03T00-00-00-000Z-cccccccccccc.json',
      'evidence-package-2026-01-04T00-00-00-000Z-dddddddddddd.json',
      'evidence-package-2026-01-05T00-00-00-000Z-eeeeeeeeeeee.json',
      'evidence-package-2026-01-06T00-00-00-000Z-ffffffffffff.json',
      'evidence-package-2026-01-07T00-00-00-000Z-111111111111.json',
      'evidence-package-2026-01-08T00-00-00-000Z-222222222222.json',
      'evidence-package-2026-01-09T00-00-00-000Z-333333333333.json',
      'evidence-package-2026-01-10T00-00-00-000Z-444444444444.json',
    ].entries()) {
      writeFileSync(join(backupDir, name), `old-${index}\n`, 'utf8');
    }

    const secondData = readExample();
    secondData.packageId = 'replacement-package';
    secondData.generatedAt = '2026-09-02T00:00:00.000Z';
    const second = writePackage(root, 'second.json', secondData);

    assert.throws(
      () => importEvidencePackage(second, { root, apply: true }),
      error => error instanceof EvidencePackageError && error.code === 'different-package',
    );
    assert.equal(JSON.parse(readFileSync(join(root, 'data/evidence-package.json'), 'utf8')).packageId, readExample().packageId);

    const replaced = importEvidencePackage(second, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'replaced');
    assert.equal(replaced.backupPath !== null, true);
    assert.equal(existsSync(replaced.backupPath), true);
    assert.equal(JSON.parse(readFileSync(join(root, 'data/evidence-package.json'), 'utf8')).packageId, 'replacement-package');
    const remainingBackups = readdirSync(backupDir);
    assert.equal(remainingBackups.length, 10);
    assert.equal(remainingBackups.includes(oldestBackup), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('status inspection reports missing, ready, and invalid without writing', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-evidence-status-'));
  try {
    assert.deepEqual(inspectEvidencePackage(root), { state: 'missing', available: false });
    assert.deepEqual(readdirSync(root), []);

    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(join(root, 'data/evidence-package.json'), 'not-json', 'utf8');
    assert.equal(inspectEvidencePackage(root).state, 'invalid');

    rmSync(join(root, 'data/evidence-package.json'));
    const source = join(root, 'package.json');
    writeFileSync(source, readFileSync(examplePath));
    importEvidencePackage(source, { root, apply: true });
    const ready = inspectEvidencePackage(root);
    assert.equal(ready.state, 'ready');
    assert.equal(ready.available, true);
    assert.equal(ready.schemaVersion, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
