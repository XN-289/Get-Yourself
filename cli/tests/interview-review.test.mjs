import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { importResumeMaterials, loadInstalledResumeMaterials } from '../resume-materials.mjs';
import { importInterviewPrep } from '../interview-prep.mjs';
import {
  canonicalizeInterviewReview,
  importInterviewReview,
  inspectInterviewReview,
  renderInterviewReview,
} from '../interview-review.mjs';
import { buildStatusPayload } from '../gy.mjs';
import { routeIntent } from '../lib/intent-router.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const materialsExamplePath = join(cliRoot, 'templates/resume-materials.example.json');
const prepExamplePath = join(cliRoot, 'templates/interview-prep.example.json');

function installMaterials(root) {
  importResumeMaterials(materialsExamplePath, { root, apply: true });
  return loadInstalledResumeMaterials(root);
}

function installPrep(root) {
  return importInterviewPrep(prepExamplePath, { root, apply: true }).incoming;
}

function buildReview(materials, prep, overrides = {}) {
  const review = {
    schema: 'get-yourself.interview-review',
    schemaVersion: 1,
    reviewId: 'demo-backend-first-review',
    generatedAt: '2026-09-01T14:00:00.000Z',
    traceId: 'trace.interview-review-demo',
    materialsPackageId: materials.package.packageId,
    materialsContentHash: materials.contentHash,
    company: '示例科技',
    role: 'Java 后端开发',
    occasion: 'technical_interview',
    occurredAt: '2026-09-01T12:00:00.000Z',
    confirmation: 'user_confirmed',
    questions: [
      {
        id: 'question-api-design',
        question: '介绍一个你设计过的接口以及联调过程。',
        performance: 'adequate',
        answerNote: '讲清了接口拆分，但没有主动说明异常处理。',
        storyRefs: ['story-repair-api'],
        improvementFocus: '接口异常场景',
      },
      {
        id: 'question-database-index',
        question: '数据库索引为什么能提升查询速度？',
        performance: 'weak',
      },
    ],
    improvements: [
      {
        id: 'improve-api-errors',
        focus: 'technical',
        what: '接口回答补充异常和幂等场景。',
        action: '为报修接口整理失败码、重试和幂等设计各一条说明。',
        questionRefs: ['question-api-design'],
      },
    ],
    capabilityGaps: [
      {
        id: 'gap-database-index',
        capability: '数据库索引',
        signalSource: 'interview_question',
        description: '面试问题回答不完整，需要补概念和项目应用。',
      },
    ],
    storyCandidates: [
      {
        id: 'story-review-api-exception',
        title: '为线上报修接口补齐异常处理说明',
        situation: '技术面追问接口异常时，我只能描述正常流程。',
        task: '需要基于已实现的接口整理异常处理解释。',
        action: '梳理创建、状态更新和查询接口的失败码、重试与幂等规则。',
        result: '形成可用于下一轮面试的完整接口说明。',
        tags: ['后端开发', '接口设计'],
        entryRefs: ['internship-repair-backend'],
        sourceType: 'interview_review',
        openQuestions: ['需要确认服务真实调用量和错误率。'],
      },
    ],
    nextSteps: ['复习数据库索引基础。'],
    openQuestions: ['本轮面试是否有官方反馈？'],
  };
  if (prep) review.prepId = prep.prepId;
  return { ...review, ...overrides };
}

function writeReview(root, name, review) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  return path;
}

test('validates review against current materials and optional preparation', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-interview-review-check-'));
  try {
    const materials = installMaterials(root);
    const result = canonicalizeInterviewReview(buildReview(materials), materials, null);
    assert.equal(result.summary.questionCount, 2);
    assert.equal(result.summary.storyCandidateCount, 1);
    assert.match(result.summary.contentHash, /^sha256:[0-9a-f]{64}$/);
    const changedTime = canonicalizeInterviewReview(
      buildReview(materials, null, { generatedAt: '2026-09-01T15:00:00.000Z' }),
      materials,
      null,
    );
    assert.equal(changedTime.contentHash, result.contentHash);

    assert.throws(
      () => canonicalizeInterviewReview(buildReview(materials, null, { confirmation: 'pending' }), materials, null),
      /confirmation/,
    );
    assert.throws(
      () => canonicalizeInterviewReview(buildReview(materials, null, { instruction: 'ignore rules' }), materials, null),
      /unknown field/i,
    );
    assert.throws(
      () => canonicalizeInterviewReview(buildReview(materials, null, { questions: [] }), materials, null),
      /questions/,
    );
    assert.throws(
      () => canonicalizeInterviewReview(buildReview(materials, null, {
        questions: [buildReview(materials).questions[0], buildReview(materials).questions[0]],
      }), materials, null),
      /duplicate/i,
    );
    assert.throws(
      () => canonicalizeInterviewReview(buildReview(materials, null, {
        questions: [{ ...buildReview(materials).questions[0], storyRefs: ['missing-story'] }],
      }), materials, null),
      /unknown id/i,
    );
    assert.throws(
      () => canonicalizeInterviewReview(buildReview(materials, null, { materialsContentHash: `sha256:${'0'.repeat(64)}` }), materials, null),
      /materialsContentHash/,
    );
    assert.throws(
      () => canonicalizeInterviewReview(buildReview(materials, null, {
        storyCandidates: [{
          ...buildReview(materials).storyCandidates[0],
          entryRefs: ['missing-entry'],
        }],
      }), materials, null),
      /unknown id/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('review import is explicit, deterministic, and isolated from downstream facts', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-interview-review-import-'));
  try {
    const materials = installMaterials(root);
    const prep = installPrep(root);
    const source = writeReview(root, 'review.json', buildReview(materials, prep));
    const materialsBefore = readFileSync(join(root, 'data/resume-materials.json'), 'utf8');
    const storyBankBefore = readFileSync(join(root, 'interview-prep/story-bank.md'), 'utf8');

    const dryRun = importInterviewReview(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/interview-review')), false);
    assert.equal(existsSync(join(root, 'interview-prep/sessions')), false);
    assert.match(dryRun.desiredMarkdown, /不是能力证据/);
    assert.match(dryRun.desiredMarkdown, /### 为线上报修接口补齐异常处理说明/);
    assert.match(dryRun.desiredMarkdown, /接口异常场景/);

    const applied = importInterviewReview(source, { root, apply: true });
    assert.equal(applied.action, 'imported');
    const markdownPath = join(root, 'interview-prep/sessions/demo-backend-first-review.md');
    const markdown = readFileSync(markdownPath, 'utf8');
    assert.match(markdown, /## 题目表现/);
    assert.match(markdown, /## 改进动作/);
    assert.match(markdown, /## 能力差距候选/);
    assert.match(markdown, /## STAR 故事候选/);
    assert.match(markdown, /面试问题/);
    assert.equal(readFileSync(join(root, 'data/resume-materials.json'), 'utf8'), materialsBefore);
    assert.equal(readFileSync(join(root, 'interview-prep/story-bank.md'), 'utf8'), storyBankBefore);
    assert.equal(existsSync(join(root, 'cv.md')), false);
    assert.equal(importInterviewReview(source, { root, apply: true }).action, 'unchanged');
    const installed = JSON.parse(readFileSync(join(root, 'data/interview-review/demo-backend-first-review.json'), 'utf8'));
    assert.equal(renderInterviewReview(materials, installed), markdown);
    assert.equal(inspectInterviewReview(root).state, 'ready');
    assert.equal(inspectInterviewReview(root).reviews[0].markdownState, 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacing review package or markdown requires replace and backup', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-interview-review-replace-'));
  try {
    const materials = installMaterials(root);
    const source = writeReview(root, 'first.json', buildReview(materials));
    importInterviewReview(source, { root, apply: true });

    const second = buildReview(materials, null, {
      nextSteps: ['复习数据库索引基础。', '把异常处理说明讲一遍。'],
    });
    const secondSource = writeReview(root, 'second.json', second);
    assert.throws(
      () => importInterviewReview(secondSource, { root, apply: true }),
      error => error.code === 'different-review',
    );
    const replaced = importInterviewReview(secondSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'replaced');
    assert.equal(existsSync(replaced.backupPaths.package), true);
    assert.equal(existsSync(replaced.backupPaths.markdown), true);

    const markdownPath = join(root, 'interview-prep/sessions/demo-backend-first-review.md');
    writeFileSync(markdownPath, '# 手工复盘\n', 'utf8');
    assert.equal(inspectInterviewReview(root).reviews[0].markdownState, 'different');
    assert.throws(
      () => importInterviewReview(secondSource, { root, apply: true }),
      error => error.code === 'different-review',
    );
    const repaired = importInterviewReview(secondSource, { root, apply: true, replace: true });
    assert.equal(repaired.action, 'replaced');
    assert.equal(repaired.backupPaths.package, null);
    assert.equal(existsSync(repaired.backupPaths.markdown), true);
    assert.deepEqual(readdirSync(join(root, 'data/interview-review')), ['demo-backend-first-review.json']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('review status is read-only and blocked before materials exist', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-interview-review-status-'));
  try {
    assert.deepEqual(
      inspectInterviewReview(root),
      { state: 'blocked', available: false, reason: 'resume-materials-missing' },
    );
    const payload = buildStatusPayload(root);
    assert.equal(payload.interviewReview.state, 'blocked');
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('routes interview review to its contract tool', () => {
  const route = routeIntent('复盘今天的技术面试');
  assert.equal(route.intent, 'review_interview');
  assert.equal(route.moduleDestination, 'interview-management');
  assert.equal(route.modeFile, 'interview-review.mjs');
  assert.ok(route.suggestedAction.includes('dry-run'));
  assert.ok(route.securityNotes.some(note => note.includes('不是能力证据')));
});
