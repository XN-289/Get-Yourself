import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { importResumeMaterials, loadInstalledResumeMaterials } from '../resume-materials.mjs';
import { applyResumeFinalPlan } from '../resume-final.mjs';
import { importResumeRender } from '../resume-render.mjs';
import { importResumeLibrary } from '../resume-library.mjs';
import { auditResumeFactChain } from '../resume-fact-chain.mjs';
import { buildStatusPayload } from '../gy.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const materialsExamplePath = join(cliRoot, 'templates/resume-materials.example.json');
const finalExamplePath = join(cliRoot, 'templates/resume-final.example.json');
const renderExamplePath = join(cliRoot, 'templates/resume-render.example.json');
const libraryExamplePath = join(cliRoot, 'templates/resume-library.example.json');

function writeJson(root, name, value) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

function snapshot(root, directory = root, files = new Map()) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) snapshot(root, path, files);
    else {
      files.set(relative(root, path).replaceAll('\\', '/'), {
        bytes: statSync(path).size,
        content: readFileSync(path, 'utf8'),
      });
    }
  }
  return files;
}

function buildRenderSource(materials, renderId = 'demo-java-backend-classic', templateId = 'classic-ats') {
  const render = JSON.parse(readFileSync(renderExamplePath, 'utf8'));
  render.renderId = renderId;
  render.templateId = templateId;
  render.materialsPackageId = materials.package.packageId;
  render.materialsContentHash = materials.contentHash;
  return render;
}

function setupFactChain(root, options = {}) {
  importResumeMaterials(materialsExamplePath, { root, apply: true });
  const materials = loadInstalledResumeMaterials(root);
  applyResumeFinalPlan(finalExamplePath, { root, apply: true });

  importResumeRender(
    writeJson(root, 'render.json', buildRenderSource(materials)),
    { root, apply: true },
  );
  if (options.secondRender) {
    importResumeRender(
      writeJson(root, 'render-second.json', buildRenderSource(
        materials,
        'demo-java-backend-modern',
        'modern-sidebar',
      )),
      { root, apply: true },
    );
  }

  const cv = readFileSync(join(root, 'cv.md'), 'utf8');
  const library = JSON.parse(readFileSync(libraryExamplePath, 'utf8'));
  const active = library.documents[0].versions.find(version => {
    return version.versionId === library.documents[0].activeVersionId;
  });
  active.content = cv;
  importResumeLibrary(writeJson(root, 'library.json', library), { root, apply: true });
  return { materials, cv, library };
}

test('fact chain audit reports a clean empty workspace without writing files', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-fact-chain-empty-'));
  try {
    const audit = auditResumeFactChain(root);
    assert.equal(audit.state, 'blocked');
    assert.equal(audit.objects.materials.state, 'missing');
    assert.equal(audit.objects.storyBank.state, 'missing');
    assert.equal(audit.objects.finalPlan.state, 'missing');
    assert.equal(audit.objects.finalDocument.state, 'missing');
    assert.deepEqual(audit.objects.renderPackages, []);
    assert.equal(audit.objects.resumeLibrary.state, 'missing');
    assert.deepEqual(audit.objects.currentApplicationVersions, []);
    assert.equal(audit.execution.mode, 'read-only-audit');
    assert.equal(audit.execution.writeCount, 0);
    assert.equal(audit.execution.automaticRepair, false);
    assert.equal(audit.execution.backupDirectoryUsed, null);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fact chain proves observable links and honestly reports contract binding gaps', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-fact-chain-ready-'));
  try {
    setupFactChain(root);
    const before = snapshot(root);
    const audit = auditResumeFactChain(root);
    const second = auditResumeFactChain(root);

    assert.deepEqual(second, audit);
    assert.deepEqual(snapshot(root), before);
    assert.equal(audit.state, 'binding-gap');
    assert.equal(audit.objects.materials.state, 'ready');
    assert.equal(audit.objects.storyBank.state, 'ready');
    assert.equal(audit.objects.storyBank.consistency, 'current');
    assert.equal(audit.objects.finalPlan.state, 'ready');
    assert.equal(audit.objects.finalDocument.state, 'ready');
    assert.equal(audit.objects.finalDocument.consistency, 'current');
    assert.equal(audit.objects.renderPackages.length, 1);
    assert.equal(audit.objects.renderPackages[0].state, 'ready');
    assert.equal(audit.objects.renderPackages[0].materialsBinding, 'current');
    assert.equal(audit.objects.renderPackages[0].html.state, 'ready');
    assert.equal(audit.objects.resumeLibrary.state, 'ready');
    assert.equal(audit.objects.currentApplicationVersions.length, 1);
    assert.equal(audit.objects.currentApplicationVersions[0].finalDocumentContentState, 'current');
    assert.equal(audit.objects.currentApplicationVersions[0].reverseWriteAllowed, false);
    assert.equal(audit.links.materialsToFinalPlan.state, 'proven');
    assert.equal(audit.links.finalPlanToFinalDocument.state, 'proven');
    assert.equal(audit.links.finalDocumentToRenderPackages[0].state, 'unproven');
    assert.equal(audit.links.finalDocumentToCurrentApplicationVersions[0].state, 'unproven');
    assert.ok(audit.drifts.some(item => item.driftId === 'render-final-binding-missing'));
    assert.ok(audit.drifts.some(item => item.driftId === 'library-final-binding-missing'));
    assert.ok(audit.drifts.every(item => item.automaticRepair === false));
    assert.equal(audit.execution.writeCount, 0);
    assert.equal(buildStatusPayload(root).resumeFactChain.state, 'binding-gap');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fact chain audit detects user edits without repairing them', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-fact-chain-drift-'));
  try {
    setupFactChain(root);
    const cvPath = join(root, 'cv.md');
    const cv = readFileSync(cvPath, 'utf8');
    writeFileSync(cvPath, `${cv}\n<!-- 用户手工补充 -->\n`, 'utf8');

    const storyPath = join(root, 'interview-prep/story-bank.md');
    writeFileSync(storyPath, `${readFileSync(storyPath, 'utf8')}\n<!-- 手工故事 -->\n`, 'utf8');

    const htmlPath = join(root, 'output/resume/demo-java-backend-classic.html');
    writeFileSync(htmlPath, '<!doctype html><html><body>手工 HTML</body></html>', 'utf8');

    const libraryPath = join(root, 'data/resume-library.json');
    const library = JSON.parse(readFileSync(libraryPath, 'utf8'));
    const active = library.documents[0].versions.find(version => {
      return version.versionId === library.documents[0].activeVersionId;
    });
    active.content = `${readFileSync(cvPath, 'utf8')}\n<!-- 外部版本 -->\n`;
    writeFileSync(libraryPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8');

    const before = snapshot(root);
    const audit = auditResumeFactChain(root);
    assert.deepEqual(snapshot(root), before);
    assert.equal(audit.state, 'drifted');
    assert.equal(audit.objects.storyBank.consistency, 'different');
    assert.equal(audit.objects.finalDocument.consistency, 'different');
    assert.equal(audit.objects.renderPackages[0].html.state, 'different');
    assert.equal(audit.objects.currentApplicationVersions[0].finalDocumentContentState, 'different');
    for (const driftId of [
      'story-bank-different',
      'final-document-different',
      'render-html-different',
      'library-current-version-different',
    ]) {
      const item = audit.drifts.find(candidate => candidate.driftId === driftId);
      assert.ok(item, driftId);
      assert.equal(item.automaticRepair, false);
    }
    assert.equal(audit.execution.writeCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fact chain audit lists multiple candidates instead of choosing one', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-fact-chain-ambiguous-'));
  try {
    setupFactChain(root, { secondRender: true });
    const audit = auditResumeFactChain(root);
    assert.equal(audit.state, 'ambiguous');
    assert.equal(audit.candidates.renderPackageCount, 2);
    assert.deepEqual(audit.candidates.renderPackageIds, [
      'demo-java-backend-classic',
      'demo-java-backend-modern',
    ]);
    assert.ok(audit.drifts.some(item => item.driftId === 'render-candidate-ambiguous'));
    const ambiguity = audit.drifts.find(item => item.driftId === 'render-candidate-ambiguous');
    assert.match(ambiguity.suggestedAction, /不要自动选择/);
    assert.ok(audit.drifts.some(item => item.driftId === 'render-final-binding-missing'));
    assert.equal(audit.execution.writeCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fact chain audit blocks when downstream objects are missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-fact-chain-downstream-'));
  try {
    setupFactChain(root);
    rmSync(join(root, 'data/resume-render'), { recursive: true, force: true });
    rmSync(join(root, 'output/resume'), { recursive: true, force: true });

    const emptyLibrary = JSON.parse(readFileSync(libraryExamplePath, 'utf8'));
    emptyLibrary.documents = [];
    importResumeLibrary(writeJson(root, 'empty-library.json', emptyLibrary), {
      root,
      apply: true,
      replace: true,
    });

    const audit = auditResumeFactChain(root);
    assert.equal(audit.state, 'blocked');
    assert.deepEqual(audit.objects.renderPackages, []);
    assert.equal(audit.objects.resumeLibrary.state, 'ready');
    assert.deepEqual(audit.objects.currentApplicationVersions, []);
    assert.equal(audit.links.finalDocumentToRenderPackages.length, 0);
    assert.equal(audit.links.finalDocumentToCurrentApplicationVersions.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
