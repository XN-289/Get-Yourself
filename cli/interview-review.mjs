#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { loadInstalledResumeMaterials } from './resume-materials.mjs';
import { canonicalizeInterviewPrep } from './interview-prep.mjs';
import {
  backupFile,
  ContractToolError,
  readJsonContract,
  requireArray,
  requireEnum,
  requireObject,
  requireObjectWithOptional,
  requireSafeId,
  requireString,
  requireStringList,
  requireTimestamp,
  requireUniqueReferences,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';

export const INTERVIEW_REVIEW_SCHEMA = 'get-yourself.interview-review';
export const INTERVIEW_REVIEW_SCHEMA_VERSION = 1;
export const REVIEW_PACKAGE_DIR = 'data/interview-review';
export const REVIEW_MARKDOWN_DIR = 'interview-prep/sessions';
export const REVIEW_BACKUP_DIR = 'data/interview-review-backups';
const MAX_PACKAGE_BYTES = 128 * 1024;
const MAX_MARKDOWN_BYTES = 512 * 1024;
const MAX_REVIEWS = 100;
const MAX_BACKUPS_PER_REVIEW = 10;
const CONFIRMATIONS = new Set(['user_confirmed']);
const OCCASIONS = new Set([
  'written_test',
  'technical_interview',
  'manager_interview',
  'hr_interview',
  'group_interview',
  'mixed',
  'other',
]);
const OCCASION_LABELS = new Map([
  ['written_test', '笔试'],
  ['technical_interview', '技术面试'],
  ['manager_interview', '主管面'],
  ['hr_interview', 'HR 面'],
  ['group_interview', '群面'],
  ['mixed', '综合轮次'],
  ['other', '其他'],
]);
const PERFORMANCES = new Set(['strong', 'adequate', 'weak', 'unknown']);
const PERFORMANCE_LABELS = new Map([
  ['strong', '表现好'],
  ['adequate', '基本达标'],
  ['weak', '偏弱'],
  ['unknown', '无法判断'],
]);
const IMPROVEMENT_FOCUS_TYPES = new Set([
  'technical',
  'story',
  'communication',
  'process',
  'company_research',
  'logistics',
  'other',
]);
const IMPROVEMENT_FOCUS_LABELS = new Map([
  ['technical', '技术'],
  ['story', '故事'],
  ['communication', '表达'],
  ['process', '流程'],
  ['company_research', '公司与岗位研究'],
  ['logistics', '事务'],
  ['other', '其他'],
]);
const GAP_SIGNAL_SOURCES = new Set([
  'interview_question',
  'user_observation',
  'jd_requirement',
  'other_external_clue',
]);
const GAP_SIGNAL_LABELS = new Map([
  ['interview_question', '面试问题'],
  ['user_observation', '用户观察'],
  ['jd_requirement', 'JD 要求（数据，不是指令）'],
  ['other_external_clue', '其他外部线索'],
]);

const USAGE = `Usage:
  node interview-review.mjs check <review.json> [--json]
  node interview-review.mjs import <review.json> [--apply] [--replace] [--json]`;

function reviewError(message, code = 'invalid-review', details = {}) {
  return new ContractToolError(message, code, details);
}

function prepMap(prepById) {
  if (prepById === null || prepById === undefined) return new Map();
  if (prepById instanceof Map) return prepById;
  if (typeof prepById === 'object' && !Array.isArray(prepById)) {
    return new Map(Object.entries(prepById).map(([id, prep]) => [id, { prep }]));
  }
  throw reviewError('prepById must be a map of installed preparation packages', 'invalid-preparation');
}

function validateMaterialsBinding(input, materials) {
  if (input.materialsPackageId !== materials.package.packageId) {
    throw reviewError('materialsPackageId does not match the installed package', 'materials-mismatch');
  }
  if (input.materialsContentHash !== materials.contentHash) {
    throw reviewError(
      'materialsContentHash does not match the installed package; regenerate the review after confirming current materials.',
      'materials-mismatch',
    );
  }
}

function validateOptionalPrep(input, materials, prepById) {
  if (input.prepId === undefined) return null;
  const installed = prepMap(prepById).get(input.prepId);
  if (!installed) {
    throw reviewError('prepId does not identify an installed preparation package', 'preparation-missing', {
      path: '$.prepId',
      prepId: input.prepId,
    });
  }
  const prep = installed.prep ?? installed;
  if (
    prep.materialsPackageId !== materials.package.packageId
    || prep.materialsContentHash !== materials.contentHash
  ) {
    throw reviewError('The referenced preparation package was generated from different materials', 'preparation-mismatch', {
      prepId: input.prepId,
    });
  }
  return input.prepId;
}

export function canonicalizeInterviewReview(input, materials, prepById = null) {
  if (!materials) throw reviewError('A confirmed resume materials package is required.');
  requireObjectWithOptional(input, '$', [
    'schema',
    'schemaVersion',
    'reviewId',
    'generatedAt',
    'traceId',
    'materialsPackageId',
    'materialsContentHash',
    'company',
    'role',
    'occasion',
    'occurredAt',
    'confirmation',
    'questions',
    'improvements',
    'capabilityGaps',
    'storyCandidates',
    'nextSteps',
    'openQuestions',
  ], ['prepId'], ContractToolError, 'invalid-review');
  if (input.schema !== INTERVIEW_REVIEW_SCHEMA) {
    throw reviewError(`$.schema must be ${INTERVIEW_REVIEW_SCHEMA}`, 'invalid-review', { path: '$.schema' });
  }
  if (input.schemaVersion !== INTERVIEW_REVIEW_SCHEMA_VERSION) {
    throw reviewError(`$.schemaVersion must be ${INTERVIEW_REVIEW_SCHEMA_VERSION}`, 'unsupported-version', { path: '$.schemaVersion' });
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-review');
  validateMaterialsBinding(input, materials);
  if (input.prepId !== undefined) {
    requireSafeId(input.prepId, '$.prepId', ContractToolError, 'invalid-review');
  }
  const prepId = validateOptionalPrep(input, materials, prepById);

  const storyIds = new Set(materials.package.stories.map(story => story.id));
  const entryIds = new Set(materials.package.entries.map(entry => entry.id));
  const questionIds = new Set();
  const rawQuestions = requireArray(input.questions, '$.questions', 1, 50, ContractToolError, 'invalid-review');
  const questions = rawQuestions.map((item, index) => {
    const path = `$.questions[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['id', 'question', 'performance'],
      ['answerNote', 'storyRefs', 'improvementFocus'],
      ContractToolError,
      'invalid-review',
    );
    const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-review');
    if (questionIds.has(id)) throw reviewError(`${path}.id is duplicate: ${id}`, 'invalid-review', { path });
    questionIds.add(id);
    const question = {
      id,
      question: requireString(item.question, `${path}.question`, { min: 1, max: 240 }, ContractToolError, 'invalid-review'),
      performance: requireEnum(item.performance, `${path}.performance`, PERFORMANCES, ContractToolError, 'invalid-review'),
    };
    if (item.answerNote !== undefined) {
      question.answerNote = requireString(item.answerNote, `${path}.answerNote`, { min: 1, max: 500 }, ContractToolError, 'invalid-review');
    }
    if (item.storyRefs !== undefined) {
      question.storyRefs = requireUniqueReferences(
        requireArray(item.storyRefs, `${path}.storyRefs`, 0, 10, ContractToolError, 'invalid-review'),
        `${path}.storyRefs`,
        storyIds,
        ContractToolError,
        'invalid-review',
      );
    }
    if (item.improvementFocus !== undefined) {
      question.improvementFocus = requireString(item.improvementFocus, `${path}.improvementFocus`, { min: 1, max: 120 }, ContractToolError, 'invalid-review');
    }
    return question;
  });

  const improvementIds = new Set();
  const rawImprovements = requireArray(input.improvements, '$.improvements', 0, 30, ContractToolError, 'invalid-review');
  const improvements = rawImprovements.map((item, index) => {
    const path = `$.improvements[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['id', 'focus', 'what', 'action'],
      ['questionRefs'],
      ContractToolError,
      'invalid-review',
    );
    const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-review');
    if (improvementIds.has(id)) throw reviewError(`${path}.id is duplicate: ${id}`, 'invalid-review', { path });
    improvementIds.add(id);
    const improvement = {
      id,
      focus: requireEnum(item.focus, `${path}.focus`, IMPROVEMENT_FOCUS_TYPES, ContractToolError, 'invalid-review'),
      what: requireString(item.what, `${path}.what`, { min: 1, max: 240 }, ContractToolError, 'invalid-review'),
      action: requireString(item.action, `${path}.action`, { min: 1, max: 300 }, ContractToolError, 'invalid-review'),
    };
    if (item.questionRefs !== undefined) {
      improvement.questionRefs = requireUniqueReferences(
        requireArray(item.questionRefs, `${path}.questionRefs`, 0, 20, ContractToolError, 'invalid-review'),
        `${path}.questionRefs`,
        questionIds,
        ContractToolError,
        'invalid-review',
      );
    }
    return improvement;
  });

  const capabilityGapIds = new Set();
  const rawCapabilityGaps = requireArray(input.capabilityGaps, '$.capabilityGaps', 0, 20, ContractToolError, 'invalid-review');
  const capabilityGaps = rawCapabilityGaps.map((item, index) => {
    const path = `$.capabilityGaps[${index}]`;
    requireObject(item, path, ['id', 'capability', 'signalSource', 'description'], ContractToolError, 'invalid-review');
    const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-review');
    if (capabilityGapIds.has(id)) throw reviewError(`${path}.id is duplicate: ${id}`, 'invalid-review', { path });
    capabilityGapIds.add(id);
    return {
      id,
      capability: requireString(item.capability, `${path}.capability`, { min: 1, max: 80 }, ContractToolError, 'invalid-review'),
      signalSource: requireEnum(item.signalSource, `${path}.signalSource`, GAP_SIGNAL_SOURCES, ContractToolError, 'invalid-review'),
      description: requireString(item.description, `${path}.description`, { min: 1, max: 300 }, ContractToolError, 'invalid-review'),
    };
  });

  const storyCandidateIds = new Set();
  const rawStoryCandidates = requireArray(input.storyCandidates, '$.storyCandidates', 0, 20, ContractToolError, 'invalid-review');
  const storyCandidates = rawStoryCandidates.map((item, index) => {
    const path = `$.storyCandidates[${index}]`;
    requireObjectWithOptional(item, path, [
      'id',
      'title',
      'situation',
      'task',
      'action',
      'result',
      'tags',
      'entryRefs',
      'sourceType',
    ], ['openQuestions'], ContractToolError, 'invalid-review');
    const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-review');
    if (storyCandidateIds.has(id)) throw reviewError(`${path}.id is duplicate: ${id}`, 'invalid-review', { path });
    storyCandidateIds.add(id);
    const sourceType = requireString(item.sourceType, `${path}.sourceType`, { min: 1, max: 40 }, ContractToolError, 'invalid-review');
    if (sourceType !== 'interview_review') {
      throw reviewError(`${path}.sourceType must be interview_review`, 'invalid-review', { path: `${path}.sourceType` });
    }
    const candidate = {
      id,
      title: requireString(item.title, `${path}.title`, { min: 1, max: 120 }, ContractToolError, 'invalid-review'),
      situation: requireString(item.situation, `${path}.situation`, { min: 1, max: 400 }, ContractToolError, 'invalid-review'),
      task: requireString(item.task, `${path}.task`, { min: 1, max: 300 }, ContractToolError, 'invalid-review'),
      action: requireString(item.action, `${path}.action`, { min: 1, max: 600 }, ContractToolError, 'invalid-review'),
      result: requireString(item.result, `${path}.result`, { min: 1, max: 400 }, ContractToolError, 'invalid-review'),
      tags: requireStringList(item.tags, `${path}.tags`, 0, 8, 1, 40, ContractToolError, 'invalid-review'),
      entryRefs: requireUniqueReferences(
        requireArray(item.entryRefs, `${path}.entryRefs`, 0, 10, ContractToolError, 'invalid-review'),
        `${path}.entryRefs`,
        entryIds,
        ContractToolError,
        'invalid-review',
      ),
      sourceType,
    };
    if (item.openQuestions !== undefined) {
      candidate.openQuestions = requireStringList(item.openQuestions, `${path}.openQuestions`, 0, 10, 1, 240, ContractToolError, 'invalid-review');
    }
    return candidate;
  });

  const canonicalReview = {
    schema: INTERVIEW_REVIEW_SCHEMA,
    schemaVersion: INTERVIEW_REVIEW_SCHEMA_VERSION,
    reviewId: requireSafeId(input.reviewId, '$.reviewId', ContractToolError, 'invalid-review'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-review'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-review'),
    materialsPackageId: input.materialsPackageId,
    materialsContentHash: input.materialsContentHash,
    ...(prepId === null ? {} : { prepId }),
    company: requireString(input.company, '$.company', { min: 1, max: 80 }, ContractToolError, 'invalid-review'),
    role: requireString(input.role, '$.role', { min: 1, max: 60 }, ContractToolError, 'invalid-review'),
    occasion: requireEnum(input.occasion, '$.occasion', OCCASIONS, ContractToolError, 'invalid-review'),
    occurredAt: requireTimestamp(input.occurredAt, '$.occurredAt', ContractToolError, 'invalid-review'),
    confirmation: input.confirmation,
    questions,
    improvements,
    capabilityGaps,
    storyCandidates,
    nextSteps: requireStringList(input.nextSteps, '$.nextSteps', 0, 10, 1, 200, ContractToolError, 'invalid-review'),
    openQuestions: requireStringList(input.openQuestions, '$.openQuestions', 0, 10, 1, 240, ContractToolError, 'invalid-review'),
  };
  const contentHash = semanticHash({ ...canonicalReview, generatedAt: undefined });
  return {
    review: canonicalReview,
    canonicalJson: JSON.stringify(canonicalReview, null, 2),
    contentHash,
    summary: {
      reviewId: canonicalReview.reviewId,
      schemaVersion: INTERVIEW_REVIEW_SCHEMA_VERSION,
      generatedAt: canonicalReview.generatedAt,
      company: canonicalReview.company,
      role: canonicalReview.role,
      occasion: canonicalReview.occasion,
      occurredAt: canonicalReview.occurredAt,
      prepId: canonicalReview.prepId ?? null,
      questionCount: questions.length,
      improvementCount: improvements.length,
      capabilityGapCount: capabilityGaps.length,
      storyCandidateCount: storyCandidates.length,
      materialsPackageId: canonicalReview.materialsPackageId,
      materialsContentHash: canonicalReview.materialsContentHash,
      contentHash,
    },
  };
}

export function renderInterviewReview(materials, review) {
  const storyById = new Map(materials.package.stories.map(story => [story.id, story]));
  const entryById = new Map(materials.package.entries.map(entry => [entry.id, entry]));
  const lines = [
    `# 面试复盘：${review.company} — ${review.role}`,
    '',
    `- 场合：${OCCASION_LABELS.get(review.occasion)}`,
    `- 发生时间：${review.occurredAt}`,
    `- 素材包：${review.materialsPackageId}（${review.materialsContentHash}）`,
  ];
  if (review.prepId) lines.push(`- 关联准备包：${review.prepId}`);
  lines.push(
    '- 边界：这是用户确认后的本地面试复盘记录，不是能力证据，也不是已同步的平台结论。',
    '',
    '## 题目表现',
    '',
  );
  for (const item of review.questions) {
    lines.push(`### ${item.question}`, '', `- 表现：${PERFORMANCE_LABELS.get(item.performance)}`);
    if (item.answerNote) lines.push(`- 记录：${item.answerNote}`);
    if (item.improvementFocus) lines.push(`- 改进重点：${item.improvementFocus}`);
    if (item.storyRefs?.length > 0) {
      lines.push(`- 已用故事：${item.storyRefs.map(id => storyById.get(id).title).join('；')}`);
    }
    lines.push('');
  }

  if (review.improvements.length > 0) {
    lines.push('## 改进动作', '');
    for (const item of review.improvements) {
      const links = item.questionRefs?.length > 0
        ? `（关联：${item.questionRefs.join('、')}）`
        : '';
      lines.push(`- **${IMPROVEMENT_FOCUS_LABELS.get(item.focus)}**：${item.what}。下一步：${item.action}${links}`);
    }
    lines.push('');
  }

  if (review.capabilityGaps.length > 0) {
    lines.push('## 能力差距候选', '');
    for (const item of review.capabilityGaps) {
      lines.push(`- **${item.capability}**（信号：${GAP_SIGNAL_LABELS.get(item.signalSource)}）：${item.description}`);
    }
    lines.push('', '这些只是本地候选，进入能力资产前必须经过单独确认。', '');
  }

  if (review.storyCandidates.length > 0) {
    lines.push('## STAR 故事候选', '');
    for (const story of review.storyCandidates) {
      const entryNames = story.entryRefs.map(id => `${entryById.get(id).organization}｜${entryById.get(id).role}`);
      lines.push(
        `### ${story.title}`,
        '',
        `- Situation：${story.situation}`,
        `- Task：${story.task}`,
        `- Action：${story.action}`,
        `- Result：${story.result}`,
        `- 标签：${story.tags.join('、') || '无'}`,
        `- 素材来源：${entryNames.join('；') || '无'}`,
      );
      if (story.openQuestions?.length > 0) {
        lines.push(...story.openQuestions.map(question => `- 待确认：${question}`));
      }
      lines.push('');
    }
  }

  if (review.nextSteps.length > 0) {
    lines.push('## 下一步', '', ...review.nextSteps.map(step => `- [ ] ${step}`), '');
  }
  if (review.openQuestions.length > 0) {
    lines.push('## 事实缺口', '', ...review.openQuestions.map(question => `- ${question}`), '');
  }
  return `${lines.join('\n')}\n`;
}

function packageDirFor(root) {
  return join(root, REVIEW_PACKAGE_DIR);
}

function packagePathFor(root, reviewId) {
  return join(packageDirFor(root), `${reviewId}.json`);
}

function markdownPathFor(root, reviewId) {
  return join(root, REVIEW_MARKDOWN_DIR, `${reviewId}.md`);
}

function loadInstalledPreparations(root, materials) {
  const directory = join(root, 'data/interview-prep');
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw reviewError(`Cannot inspect installed preparations: ${error.message}`, 'io-error', { path: directory });
  }
  const preparations = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const parsed = readJsonContract(join(directory, entry.name), {
      maxBytes: MAX_PACKAGE_BYTES,
      ErrorClass: ContractToolError,
      errorCode: 'invalid-preparation',
    });
    const installed = canonicalizeInterviewPrep(parsed, materials);
    preparations.set(installed.prep.prepId, installed);
  }
  return preparations;
}

function readReviewFile(filePath, materials, preparations) {
  const parsed = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-review',
  });
  return canonicalizeInterviewReview(parsed, materials, preparations);
}

function readInstalledReview(root, materials, preparations, reviewId) {
  const target = packagePathFor(root, reviewId);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw reviewError(`Cannot inspect installed review: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw reviewError('Installed review path is not a regular file', 'invalid-review', { path: target });
  if (info.size > MAX_PACKAGE_BYTES) throw reviewError('Installed review exceeds size limit', 'invalid-review', { path: target });
  const installed = readReviewFile(target, materials, preparations);
  if (installed.review.reviewId !== reviewId) {
    throw reviewError('Installed review filename does not match reviewId', 'invalid-review', {
      path: target,
      expectedReviewId: reviewId,
      actualReviewId: installed.review.reviewId,
    });
  }
  return installed;
}

function readOptionalMarkdown(target) {
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw reviewError(`Cannot inspect review markdown: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw reviewError('Review markdown path is not a regular file', 'invalid-review', { path: target });
  if (info.size > MAX_MARKDOWN_BYTES) throw reviewError('Review markdown exceeds size limit', 'invalid-review', { path: target });
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    throw reviewError(`Cannot read review markdown: ${error.message}`, 'io-error', { path: target });
  }
}

export function inspectInterviewReview(root = getCareerOpsRoot()) {
  try {
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) return { state: 'blocked', available: false, reason: 'resume-materials-missing' };
    const preparations = loadInstalledPreparations(root, materials);
    let entries;
    try {
      entries = readdirSync(packageDirFor(root), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { state: 'missing', available: false, reviewCount: 0, reviews: [] };
      throw error;
    }
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
    if (files.length > MAX_REVIEWS) {
      throw reviewError(`Too many interview review packages (max ${MAX_REVIEWS})`, 'invalid-review');
    }
    const reviews = files.map(name => {
      const installed = readInstalledReview(root, materials, preparations, name.replace(/\.json$/, ''));
      const markdownPath = markdownPathFor(root, installed.review.reviewId);
      const markdown = readOptionalMarkdown(markdownPath);
      const desired = renderInterviewReview(materials, installed.review);
      return {
        ...installed.summary,
        markdownPath,
        markdownState: markdown === null ? 'missing' : (markdown === desired ? 'current' : 'different'),
      };
    });
    return { state: 'ready', available: true, reviewCount: reviews.length, reviews };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ContractToolError ? error.code : 'io-error',
    };
  }
}

export function importInterviewReview(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw reviewError('--replace requires --apply', 'usage');

  const materials = loadInstalledResumeMaterials(root);
  if (!materials) throw reviewError('Import and confirm resume materials before generating an interview review.', 'materials-missing');
  const preparations = loadInstalledPreparations(root, materials);
  const incoming = readReviewFile(filePath, materials, preparations);
  const packageTarget = packagePathFor(root, incoming.review.reviewId);
  const markdownTarget = markdownPathFor(root, incoming.review.reviewId);
  const existing = readInstalledReview(root, materials, preparations, incoming.review.reviewId);
  const existingMarkdown = readOptionalMarkdown(markdownTarget);
  const desiredMarkdown = renderInterviewReview(materials, incoming.review);
  const packageChange = !existing || existing.contentHash !== incoming.contentHash;
  const markdownChange = existingMarkdown === null || existingMarkdown !== desiredMarkdown;
  const backupPaths = { package: null, markdown: null };

  if (!packageChange && !markdownChange) {
    return {
      action: apply ? 'unchanged' : 'dry-run-unchanged',
      applied: apply,
      packagePath: packageTarget,
      markdownPath: markdownTarget,
      backupPaths,
      incoming: incoming.summary,
    };
  }

  const overwritesUserContent = (existing !== null && packageChange) || (existingMarkdown !== null && markdownChange);
  if (overwritesUserContent && !replace) {
    throw reviewError(
      'A different review package or markdown file already exists; add --replace to replace it.',
      'different-review',
      { installedReviewId: existing?.summary.reviewId ?? null, incomingReviewId: incoming.summary.reviewId },
    );
  }

  if (!apply) {
    return {
      action: overwritesUserContent ? 'dry-run-replace' : 'dry-run',
      applied: false,
      packagePath: packageTarget,
      markdownPath: markdownTarget,
      backupPaths,
      desiredMarkdown,
      incoming: incoming.summary,
    };
  }

  if (existing !== null && packageChange) {
    backupPaths.package = backupFile(
      packageTarget,
      join(root, REVIEW_BACKUP_DIR, incoming.review.reviewId),
      'interview-review-package',
      existing.contentHash,
      MAX_BACKUPS_PER_REVIEW,
    );
  }
  if (existingMarkdown !== null && markdownChange) {
    backupPaths.markdown = backupFile(
      markdownTarget,
      join(root, REVIEW_BACKUP_DIR, incoming.review.reviewId),
      'interview-review-markdown',
      semanticHash(existingMarkdown),
      MAX_BACKUPS_PER_REVIEW,
    );
  }
  if (packageChange) writeContractFile(packageTarget, `${incoming.canonicalJson}\n`);
  if (markdownChange) writeContractFile(markdownTarget, desiredMarkdown);

  return {
    action: existing === null ? 'imported' : 'replaced',
    applied: true,
    packagePath: packageTarget,
    markdownPath: markdownTarget,
    backupPaths,
    incoming: incoming.summary,
  };
}

function fail(message, json = false) {
  if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const replace = args.includes('--replace');
  const positional = args.filter(arg => !['--json', '--apply', '--replace'].includes(arg));
  if (positional.length !== 2 || !['check', 'import'].includes(positional[0])) {
    fail(`Invalid arguments.\n${USAGE}`, json);
  }
  if (positional[0] === 'check' && (apply || replace)) fail('check does not support --apply or --replace.', json);
  return { command: positional[0], reviewFile: positional[1], json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    const root = getCareerOpsRoot();
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) throw reviewError('Import and confirm resume materials before generating an interview review.', 'materials-missing');
    const preparations = loadInstalledPreparations(root, materials);
    if (args.command === 'check') {
      const result = readReviewFile(args.reviewFile, materials, preparations);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '面试复盘包校验通过。',
        `Review ID: ${result.summary.reviewId}`,
        `公司岗位：${result.summary.company} — ${result.summary.role}`,
        `场合：${OCCASION_LABELS.get(result.summary.occasion)}`,
        `题目：${result.summary.questionCount} / 改进：${result.summary.improvementCount}`,
        `能力差距候选：${result.summary.capabilityGapCount} / STAR 候选：${result.summary.storyCandidateCount}`,
        `素材哈希：${result.summary.materialsContentHash}`,
      ].join('\n'));
      return;
    }

    const result = importInterviewReview(args.reviewFile, { root, apply: args.apply, replace: args.replace });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `面试复盘导入结果：${result.action}`,
      `溯源包：${result.packagePath}`,
      `复盘记录：${result.markdownPath}`,
      `公司岗位：${result.incoming.company} — ${result.incoming.role}`,
      `题目：${result.incoming.questionCount} / STAR 候选：${result.incoming.storyCandidateCount}`,
      result.backupPaths.package ? `溯源备份：${result.backupPaths.package}` : null,
      result.backupPaths.markdown ? `记录备份：${result.backupPaths.markdown}` : null,
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = code === 'different-review' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
