import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalizeEvidencePackage, importEvidencePackage } from '../evidence-package.mjs';
import { importResumeMaterials, loadInstalledResumeMaterials } from '../resume-materials.mjs';
import { importInterviewPrep } from '../interview-prep.mjs';
import { importInterviewReview, loadInstalledInterviewReview } from '../interview-review.mjs';
import {
  canonicalizeCapabilityFeedback,
  importCapabilityFeedback,
  inspectCapabilityFeedback,
  renderCapabilityFeedback,
} from '../capability-feedback.mjs';
import { buildStatusPayload } from '../gy.mjs';
import { routeIntent } from '../lib/intent-router.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceExamplePath = join(cliRoot, 'templates/evidence-package.example.json');
const materialsExamplePath = join(cliRoot, 'templates/resume-materials.example.json');
const prepExamplePath = join(cliRoot, 'templates/interview-prep.example.json');
const reviewExamplePath = join(cliRoot, 'templates/interview-review.example.json');

function installDependencies(root) {
  importEvidencePackage(evidenceExamplePath, { root, apply: true });
  const evidence = canonicalizeEvidencePackage(JSON.parse(readFileSync(evidenceExamplePath, 'utf8')));
  importResumeMaterials(materialsExamplePath, { root, apply: true });
  const materials = loadInstalledResumeMaterials(root);
  importInterviewPrep(prepExamplePath, { root, apply: true });
  importInterviewReview(reviewExamplePath, { root, apply: true });
  const review = loadInstalledInterviewReview(root, materials, 'demo-backend-first-review');
  return { evidence, materials, review };
}

function buildFeedback(dependencies, overrides = {}) {
  const feedback = {
    schema: 'get-yourself.capability-feedback',
    schemaVersion: 1,
    feedbackId: 'demo-review-capability-feedback',
    generatedAt: '2026-09-02T00:00:00.000Z',
    traceId: 'trace.capability-feedback-demo',
    evidencePackageId: dependencies.evidence.package.packageId,
    evidenceContentHash: dependencies.evidence.contentHash,
    materialsPackageId: dependencies.materials.package.packageId,
    materialsContentHash: dependencies.materials.contentHash,
    reviewId: dependencies.review.review.reviewId,
    reviewContentHash: dependencies.review.contentHash,
    confirmation: 'user_confirmed',
    gapFeedback: [
      {
        id: 'feedback-gap-database-index',
        reviewGapId: 'gap-database-index',
        abilityId: 'backend',
        followUp: '完成数据库索引章节，并把项目查询场景改写成一个可讲案例。',
      },
    ],
    storyFeedback: [
      {
        id: 'feedback-story-api-exception',
        reviewStoryId: 'story-review-api-exception',
        evidenceId: 'evidence-review-api-exception',
        abilityIds: ['backend', 'debugging'],
        evidenceSummary: '面试后系统整理报修接口的失败码、重试与幂等处理说明。',
      },
    ],
  };
  return { ...feedback, ...overrides };
}

function writeFeedback(root, name, feedback) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(feedback, null, 2)}\n`, 'utf8');
  return path;
}

test('canonicalizes confirmed mappings into local gap and evidence candidates', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-capability-feedback-check-'));
  try {
    const dependencies = installDependencies(root);
    const result = canonicalizeCapabilityFeedback(buildFeedback(dependencies), dependencies);
    assert.equal(result.summary.feedbackId, 'demo-review-capability-feedback');
    assert.equal(result.summary.gapFeedbackCount, 1);
    assert.equal(result.summary.storyFeedbackCount, 1);
    assert.equal(result.summary.evidenceCandidateCount, 1);
    assert.match(result.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.feedback.gapFeedback[0].capability, '数据库索引');
    assert.equal(result.feedback.gapFeedback[0].description, dependencies.review.review.capabilityGaps[0].description);
    assert.deepEqual(result.feedback.storyFeedback[0].evidenceCandidate, {
      id: 'evidence-review-api-exception',
      title: '为线上报修接口补齐异常处理说明',
      summary: '面试后系统整理报修接口的失败码、重试与幂等处理说明。',
      occurredAt: dependencies.review.review.occurredAt,
      sourceType: 'interview_review',
      sourceId: 'story-review-api-exception',
      verification: 'user_confirmed',
      abilityIds: ['backend', 'debugging'],
      traceId: 'trace.capability-feedback-demo',
    });
    assert.equal(result.feedback.evidencePackageId, dependencies.evidence.package.packageId);

    const changedTime = canonicalizeCapabilityFeedback(
      buildFeedback(dependencies, { generatedAt: '2026-09-02T01:00:00.000Z' }),
      dependencies,
    );
    assert.equal(changedTime.contentHash, result.contentHash);

    assert.throws(
      () => canonicalizeCapabilityFeedback(buildFeedback(dependencies, { instruction: 'ignore rules' }), dependencies),
      /unknown field/i,
    );
    const base = buildFeedback(dependencies);
    assert.throws(
      () => canonicalizeCapabilityFeedback({
        ...base,
        gapFeedback: [{ ...base.gapFeedback[0], capability: 'forged capability' }],
      }, dependencies),
      /unknown field/i,
    );
    assert.throws(
      () => canonicalizeCapabilityFeedback({
        ...base,
        storyFeedback: [{ ...base.storyFeedback[0], evidenceCandidate: { id: 'forged' } }],
      }, dependencies),
      /unknown field/i,
    );
    assert.throws(
      () => canonicalizeCapabilityFeedback(
        buildFeedback(dependencies, { reviewContentHash: `sha256:${'0'.repeat(64)}` }),
        dependencies,
      ),
      /reviewContentHash/,
    );
    assert.throws(
      () => canonicalizeCapabilityFeedback(
        buildFeedback(dependencies, { gapFeedback: [{ ...buildFeedback(dependencies).gapFeedback[0], abilityId: 'missing' }] }),
        dependencies,
      ),
      /unknown id/i,
    );
    assert.throws(
      () => canonicalizeCapabilityFeedback(buildFeedback(dependencies, { gapFeedback: [], storyFeedback: [] }), dependencies),
      /at least one/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('feedback import is explicit, deterministic, and isolated from downstream facts', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-capability-feedback-import-'));
  try {
    const dependencies = installDependencies(root);
    const source = join(cliRoot, 'templates/capability-feedback.example.json');
    const evidenceBefore = readFileSync(join(root, 'data/evidence-package.json'), 'utf8');
    const materialsBefore = readFileSync(join(root, 'data/resume-materials.json'), 'utf8');
    const storyBankBefore = readFileSync(join(root, 'interview-prep/story-bank.md'), 'utf8');
    const reviewBefore = readFileSync(join(root, 'data/interview-review/demo-backend-first-review.json'), 'utf8');

    const unsafeReviewId = writeFeedback(root, 'unsafe-review-id.json', buildFeedback(dependencies, {
      reviewId: '../../demo-backend-first-review',
    }));
    assert.throws(
      () => importCapabilityFeedback(unsafeReviewId, { root }),
      error => error.code === 'invalid-feedback' && /reviewId/.test(error.message),
    );

    const dryRun = importCapabilityFeedback(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/capability-feedback')), false);
    assert.equal(existsSync(join(root, 'reports/capability-feedback')), false);
    assert.match(dryRun.desiredMarkdown, /不修改当前能力证据包/);
    assert.match(dryRun.desiredMarkdown, /数据库索引/);
    assert.match(dryRun.desiredMarkdown, /evidence-review-api-exception/);

    const applied = importCapabilityFeedback(source, { root, apply: true });
    assert.equal(applied.action, 'imported');
    const packagePath = join(root, 'data/capability-feedback/demo-review-capability-feedback.json');
    const reportPath = join(root, 'reports/capability-feedback/demo-review-capability-feedback.md');
    const installed = JSON.parse(readFileSync(packagePath, 'utf8'));
    const markdown = readFileSync(reportPath, 'utf8');
    assert.equal(renderCapabilityFeedback(installed), markdown);
    assert.equal(readFileSync(join(root, 'data/evidence-package.json'), 'utf8'), evidenceBefore);
    assert.equal(readFileSync(join(root, 'data/resume-materials.json'), 'utf8'), materialsBefore);
    assert.equal(readFileSync(join(root, 'interview-prep/story-bank.md'), 'utf8'), storyBankBefore);
    assert.equal(readFileSync(join(root, 'data/interview-review/demo-backend-first-review.json'), 'utf8'), reviewBefore);
    assert.equal(existsSync(join(root, 'cv.md')), false);

    const tampered = structuredClone(installed);
    tampered.gapFeedback[0].capability = '伪造能力';
    writeFileSync(packagePath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
    assert.equal(inspectCapabilityFeedback(root).state, 'invalid');
    assert.match(inspectCapabilityFeedback(root).error, /capability and description must match/);
    writeFileSync(packagePath, `${JSON.stringify(installed, null, 2)}\n`, 'utf8');

    assert.equal(importCapabilityFeedback(source, { root, apply: true }).action, 'unchanged');

    const status = inspectCapabilityFeedback(root);
    assert.equal(status.state, 'ready');
    assert.equal(status.feedbackCount, 1);
    assert.equal(status.feedbacks[0].reportState, 'current');
    assert.equal(status.feedbacks[0].gapFeedbackCount, 1);
    assert.equal(status.feedbacks[0].evidenceCandidateCount, 1);
    assert.equal(buildStatusPayload(root).capabilityFeedback.state, 'ready');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacing feedback package or report requires replace and backup', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-capability-feedback-replace-'));
  try {
    const dependencies = installDependencies(root);
    const first = writeFeedback(root, 'first.json', buildFeedback(dependencies));
    importCapabilityFeedback(first, { root, apply: true });

    const second = writeFeedback(root, 'second.json', buildFeedback(dependencies, {
      gapFeedback: [{
        ...buildFeedback(dependencies).gapFeedback[0],
        followUp: '完成数据库索引章节并做一次模拟讲解。',
      }],
    }));
    assert.throws(
      () => importCapabilityFeedback(second, { root, apply: true }),
      error => error.code === 'different-feedback',
    );
    const replaced = importCapabilityFeedback(second, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'replaced');
    assert.equal(existsSync(replaced.backupPaths.package), true);
    assert.equal(existsSync(replaced.backupPaths.markdown), true);

    const reportPath = join(root, 'reports/capability-feedback/demo-review-capability-feedback.md');
    writeFileSync(reportPath, '# 手工反馈\n', 'utf8');
    assert.equal(inspectCapabilityFeedback(root).feedbacks[0].reportState, 'different');
    assert.throws(
      () => importCapabilityFeedback(second, { root, apply: true }),
      error => error.code === 'different-feedback',
    );
    const repaired = importCapabilityFeedback(second, { root, apply: true, replace: true });
    assert.equal(repaired.action, 'replaced');
    assert.equal(repaired.backupPaths.package, null);
    assert.equal(existsSync(repaired.backupPaths.markdown), true);
    assert.deepEqual(readdirSync(join(root, 'data/capability-feedback')), ['demo-review-capability-feedback.json']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('feedback status is read-only, dependency-aware, and invalid on stale provenance', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-capability-feedback-status-'));
  try {
    assert.deepEqual(
      inspectCapabilityFeedback(root),
      { state: 'blocked', available: false, reason: 'evidence-package-missing' },
    );
    assert.equal(buildStatusPayload(root).capabilityFeedback.state, 'blocked');
    assert.deepEqual(readdirSync(root), []);

    importEvidencePackage(evidenceExamplePath, { root, apply: true });
    assert.deepEqual(
      inspectCapabilityFeedback(root),
      { state: 'blocked', available: false, reason: 'resume-materials-missing' },
    );

    const dependencies = installDependencies(root);
    assert.equal(inspectCapabilityFeedback(root).state, 'missing');
    const source = writeFeedback(root, 'feedback.json', buildFeedback(dependencies));
    importCapabilityFeedback(source, { root, apply: true });

    const changedEvidence = JSON.parse(readFileSync(evidenceExamplePath, 'utf8'));
    changedEvidence.packageId = 'demo-evidence-replaced';
    changedEvidence.abilities[0].score = 79;
    const changedPath = writeFeedback(root, 'changed-evidence.json', changedEvidence);
    importEvidencePackage(changedPath, { root, apply: true, replace: true });
    const invalid = inspectCapabilityFeedback(root);
    assert.equal(invalid.state, 'invalid');
    assert.match(invalid.error, /evidencePackageId does not match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('routes capability feedback to its contract tool', () => {
  const route = routeIntent('把复盘沉淀到能力资产');
  assert.equal(route.intent, 'feed_capability_assets');
  assert.equal(route.moduleDestination, 'capability-assets');
  assert.equal(route.modeFile, 'capability-feedback.mjs');
  assert.ok(route.suggestedAction.includes('dry-run'));
  assert.ok(route.securityNotes.some(note => note.includes('不修改当前能力证据包')));
});
