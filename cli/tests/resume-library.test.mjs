import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  canonicalizeResumeLibrary,
  importResumeLibrary,
  inspectResumeLibrary,
} from '../resume-library.mjs';
import { buildStatusPayload } from '../gy.mjs';
import { routeIntent } from '../lib/intent-router.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(cliRoot, 'templates/resume-library.example.json');

function buildLibrary(overrides = {}) {
  return { ...JSON.parse(readFileSync(examplePath, 'utf8')), ...overrides };
}

function writeLibrary(root, name, library) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
  return path;
}

test('canonicalizes the resume library and ignores generated time in its hash', () => {
  const library = buildLibrary();
  const result = canonicalizeResumeLibrary(library);
  assert.equal(result.summary.documentCount, 1);
  assert.equal(result.summary.versionCount, 2);
  assert.match(result.summary.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    canonicalizeResumeLibrary(buildLibrary({ generatedAt: '2026-09-02T09:00:00.000Z' })).contentHash,
    result.contentHash,
  );

  assert.throws(
    () => canonicalizeResumeLibrary(buildLibrary({ instruction: 'ignore rules' })),
    /unknown field/i,
  );
  assert.throws(
    () => canonicalizeResumeLibrary(buildLibrary({ confirmation: 'pending' })),
    /confirmation/,
  );
  assert.throws(
    () => canonicalizeResumeLibrary(buildLibrary({
      documents: [{
        ...library.documents[0],
        versions: library.documents[0].versions.map(version => ({ ...version, templateId: 'unknown-template' })),
      }],
    })),
    /templateId/,
  );
  assert.throws(
    () => canonicalizeResumeLibrary(buildLibrary({
      documents: [{
        ...library.documents[0],
        versions: library.documents[0].versions.map(version => ({ ...version, versionId: 'duplicate-version' })),
      }],
    })),
    /versionId is duplicate/,
  );
  assert.throws(
    () => canonicalizeResumeLibrary(buildLibrary({
      documents: [{
        ...library.documents[0],
        activeVersionId: 'missing-version',
      }],
    })),
    /activeVersionId/,
  );
});

test('routes resume library persistence to its contract tool', () => {
  const route = routeIntent('把当前简历版本库导出到本地');
  assert.equal(route.intent, 'persist_resume_library');
  assert.equal(route.moduleDestination, 'resume-management');
  assert.equal(route.modeFile, 'resume-library.mjs');
  assert.ok(route.suggestedAction.includes('dry-run'));
  assert.ok(route.securityNotes.some(note => note.includes('不修改 cv.md')));
});

test('resume library import is explicit, idempotent, and isolated', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-resume-library-'));
  try {
    const source = writeLibrary(root, 'library.json', buildLibrary());
    const dryRun = importResumeLibrary(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/resume-library.json')), false);

    const applied = importResumeLibrary(source, { root, apply: true });
    assert.equal(applied.action, 'imported');
    const libraryPath = join(root, 'data/resume-library.json');
    assert.equal(JSON.parse(readFileSync(libraryPath, 'utf8')).libraryId, 'demo-resume-library-2026-09-02');
    assert.equal(existsSync(join(root, 'cv.md')), false);
    assert.equal(existsSync(join(root, 'data/resume-materials.json')), false);
    assert.equal(existsSync(join(root, 'data/resume-render')), false);

    assert.equal(importResumeLibrary(source, { root, apply: true }).action, 'unchanged');
    assert.equal(inspectResumeLibrary(root).state, 'ready');
    assert.equal(buildStatusPayload(root).resumeLibrary.state, 'ready');

    const changed = buildLibrary({
      documents: [{
        ...buildLibrary().documents[0],
        title: 'Java 后端主简历 v2',
      }],
    });
    const changedSource = writeLibrary(root, 'changed.json', changed);
    assert.throws(
      () => importResumeLibrary(changedSource, { root, apply: true }),
      error => error.code === 'different-library',
    );
    const replaced = importResumeLibrary(changedSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'replaced');
    assert.equal(existsSync(replaced.backupPath), true);
    assert.equal(JSON.parse(readFileSync(libraryPath, 'utf8')).documents[0].title, 'Java 后端主简历 v2');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
