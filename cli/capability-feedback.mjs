#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { canonicalizeEvidencePackage, PACKAGE_PATH as EVIDENCE_PACKAGE_PATH } from './evidence-package.mjs';
import { loadInstalledResumeMaterials } from './resume-materials.mjs';
import {
  inspectInterviewReview,
  loadInstalledInterviewReview,
  loadInstalledPreparationPackages,
} from './interview-review.mjs';
import {
  backupFile,
  ContractToolError,
  readJsonContract,
  requireArray,
  requireEnum,
  requireObjectWithOptional,
  requireSafeId,
  requireString,
  requireTimestamp as requireTimestampValue,
  requireUniqueReferences,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';

export const CAPABILITY_FEEDBACK_SCHEMA = 'get-yourself.capability-feedback';
export const CAPABILITY_FEEDBACK_SCHEMA_VERSION = 1;
export const FEEDBACK_PACKAGE_DIR = 'data/capability-feedback';
export const FEEDBACK_REPORT_DIR = 'reports/capability-feedback';
export const FEEDBACK_BACKUP_DIR = 'data/capability-feedback-backups';
const MAX_PACKAGE_BYTES = 128 * 1024;
const MAX_REPORT_BYTES = 256 * 1024;
const MAX_FEEDBACKS = 100;
const MAX_BACKUPS_PER_FEEDBACK = 10;
const CONFIRMATIONS = new Set(['user_confirmed']);

const USAGE = `Usage:
  node capability-feedback.mjs check <feedback.json> [--json]
  node capability-feedback.mjs import <feedback.json> [--apply] [--replace] [--json]`;

function feedbackError(message, code = 'invalid-feedback', details = {}) {
  return new ContractToolError(message, code, details);
}

function readOptionalContractFile(target, maxBytes, missingState) {
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return missingState;
    throw feedbackError(`Cannot inspect contract file: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw feedbackError('Contract path is not a regular file', 'invalid-feedback', { path: target });
  if (info.size > maxBytes) throw feedbackError('Contract file exceeds size limit', 'contract-too-large', { path: target });
  return readJsonContract(target, {
    maxBytes,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-feedback',
  });
}

function readInstalledEvidence(root) {
  return readOptionalContractFile(join(root, EVIDENCE_PACKAGE_PATH), 256 * 1024, null);
}

function canonicalizeEvidence(parsed) {
  try {
    return canonicalizeEvidencePackage(parsed);
  } catch (error) {
    throw feedbackError(error.message, error.code ?? 'invalid-evidence-package', error.details ?? {});
  }
}

export function loadCapabilityFeedbackDependencies(root, reviewId) {
  const parsedEvidence = readInstalledEvidence(root);
  const evidence = parsedEvidence === null ? null : canonicalizeEvidence(parsedEvidence);
  const materials = loadInstalledResumeMaterials(root);
  let preparations = null;
  let review = null;
  if (reviewId !== undefined && materials !== null) {
    const safeReviewId = requireSafeId(reviewId, '$.reviewId', ContractToolError, 'invalid-feedback');
    preparations = loadInstalledPreparationPackages(root, materials);
    review = loadInstalledInterviewReview(root, materials, safeReviewId, preparations);
  }
  return { evidence, materials, preparations, review };
}

function requireInstalledDependency(value, field, code) {
  if (value === null || value === undefined) {
    throw feedbackError(`${field} is required`, code, { path: `$.${field}` });
  }
  return value;
}

function validateDependencyBinding(input, field, idField, hashField, installed, label) {
  if (input[idField] !== installed.package.packageId) {
    throw feedbackError(`${idField} does not match the installed ${label}`, `${field}-mismatch`, {
      path: `$.${idField}`,
    });
  }
  if (input[hashField] !== installed.contentHash) {
    throw feedbackError(`${hashField} does not match the installed ${label}`, `${field}-mismatch`, {
      path: `$.${hashField}`,
    });
  }
}

export function canonicalizeCapabilityFeedback(input, dependencies = {}, options = {}) {
  const installedPackage = options.installed === true;
  const evidence = requireInstalledDependency(dependencies.evidence, 'evidencePackage', 'evidence-package-missing');
  const materials = requireInstalledDependency(dependencies.materials, 'materialsPackage', 'resume-materials-missing');
  const review = requireInstalledDependency(dependencies.review, 'review', 'interview-review-missing');

  requireObjectWithOptional(input, '$', [
    'schema',
    'schemaVersion',
    'feedbackId',
    'generatedAt',
    'traceId',
    'evidencePackageId',
    'evidenceContentHash',
    'materialsPackageId',
    'materialsContentHash',
    'reviewId',
    'reviewContentHash',
    'confirmation',
    'gapFeedback',
    'storyFeedback',
  ], [], ContractToolError, 'invalid-feedback');
  if (input.schema !== CAPABILITY_FEEDBACK_SCHEMA) {
    throw feedbackError(`$.schema must be ${CAPABILITY_FEEDBACK_SCHEMA}`, 'invalid-feedback', { path: '$.schema' });
  }
  if (input.schemaVersion !== CAPABILITY_FEEDBACK_SCHEMA_VERSION) {
    throw feedbackError(`$.schemaVersion must be ${CAPABILITY_FEEDBACK_SCHEMA_VERSION}`, 'unsupported-version', {
      path: '$.schemaVersion',
    });
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-feedback');
  const reviewId = requireSafeId(input.reviewId, '$.reviewId', ContractToolError, 'invalid-feedback');

  validateDependencyBinding(input, 'evidencePackage', 'evidencePackageId', 'evidenceContentHash', evidence, 'evidence package');
  validateDependencyBinding(input, 'materialsPackage', 'materialsPackageId', 'materialsContentHash', materials, 'materials package');
  if (reviewId !== review.review.reviewId) {
    throw feedbackError('reviewId does not match the installed review', 'review-mismatch', { path: '$.reviewId' });
  }
  if (input.reviewContentHash !== review.contentHash) {
    throw feedbackError('reviewContentHash does not match the installed review', 'review-mismatch', {
      path: '$.reviewContentHash',
    });
  }

  const abilityIds = new Set(evidence.package.abilities.map(ability => ability.id));
  const gapById = new Map(review.review.capabilityGaps.map(gap => [gap.id, gap]));
  const storyById = new Map(review.review.storyCandidates.map(story => [story.id, story]));
  const feedbackRecordIds = new Set();
  const usedReviewGapIds = new Set();
  const usedReviewStoryIds = new Set();
  const evidenceCandidateIds = new Set();

  const rawGapFeedback = requireArray(input.gapFeedback, '$.gapFeedback', 0, 20, ContractToolError, 'invalid-feedback');
  const gapFeedback = rawGapFeedback.map((item, index) => {
    const path = `$.gapFeedback[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['id', 'reviewGapId', 'abilityId', 'followUp'],
      installedPackage ? ['capability', 'description'] : [],
      ContractToolError,
      'invalid-feedback',
    );
    const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-feedback');
    if (feedbackRecordIds.has(id)) throw feedbackError(`${path}.id is duplicate: ${id}`, 'invalid-feedback', { path });
    feedbackRecordIds.add(id);
    const reviewGapId = requireSafeId(item.reviewGapId, `${path}.reviewGapId`, ContractToolError, 'invalid-feedback');
    if (usedReviewGapIds.has(reviewGapId)) {
      throw feedbackError(`${path}.reviewGapId is duplicate: ${reviewGapId}`, 'invalid-feedback', { path });
    }
    usedReviewGapIds.add(reviewGapId);
    const reviewGap = gapById.get(reviewGapId);
    if (!reviewGap) {
      throw feedbackError(`${path}.reviewGapId references unknown id ${reviewGapId}`, 'invalid-feedback', { path });
    }
    if (installedPackage) {
      if (item.capability !== reviewGap.capability || item.description !== reviewGap.description) {
        throw feedbackError(`${path}.capability and description must match the installed review`, 'invalid-feedback', { path });
      }
    }
    const abilityId = requireSafeId(item.abilityId, `${path}.abilityId`, ContractToolError, 'invalid-feedback');
    if (!abilityIds.has(abilityId)) {
      throw feedbackError(`${path}.abilityId references unknown id ${abilityId}`, 'invalid-feedback', { path });
    }
    return {
      id,
      reviewGapId,
      abilityId,
      capability: reviewGap.capability,
      description: reviewGap.description,
      followUp: requireString(item.followUp, `${path}.followUp`, { min: 1, max: 300 }, ContractToolError, 'invalid-feedback'),
    };
  });

  const rawStoryFeedback = requireArray(input.storyFeedback, '$.storyFeedback', 0, 20, ContractToolError, 'invalid-feedback');
  const storyFeedback = rawStoryFeedback.map((item, index) => {
    const path = `$.storyFeedback[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['id', 'reviewStoryId', 'evidenceId', 'abilityIds', 'evidenceSummary'],
      installedPackage ? ['evidenceCandidate'] : [],
      ContractToolError,
      'invalid-feedback',
    );
    const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-feedback');
    if (feedbackRecordIds.has(id)) throw feedbackError(`${path}.id is duplicate: ${id}`, 'invalid-feedback', { path });
    feedbackRecordIds.add(id);
    const reviewStoryId = requireSafeId(item.reviewStoryId, `${path}.reviewStoryId`, ContractToolError, 'invalid-feedback');
    if (usedReviewStoryIds.has(reviewStoryId)) {
      throw feedbackError(`${path}.reviewStoryId is duplicate: ${reviewStoryId}`, 'invalid-feedback', { path });
    }
    usedReviewStoryIds.add(reviewStoryId);
    const story = storyById.get(reviewStoryId);
    if (!story) {
      throw feedbackError(`${path}.reviewStoryId references unknown id ${reviewStoryId}`, 'invalid-feedback', { path });
    }
    const evidenceId = requireSafeId(item.evidenceId, `${path}.evidenceId`, ContractToolError, 'invalid-feedback');
    if (evidenceCandidateIds.has(evidenceId)) {
      throw feedbackError(`${path}.evidenceId is duplicate: ${evidenceId}`, 'invalid-feedback', { path });
    }
    evidenceCandidateIds.add(evidenceId);
    const selectedAbilityIds = requireUniqueReferences(
      requireArray(item.abilityIds, `${path}.abilityIds`, 1, 10, ContractToolError, 'invalid-feedback'),
      `${path}.abilityIds`,
      abilityIds,
      ContractToolError,
      'invalid-feedback',
    );
    const evidenceSummary = requireString(
      item.evidenceSummary,
      `${path}.evidenceSummary`,
      { min: 1, max: 240 },
      ContractToolError,
      'invalid-feedback',
    );
    const evidenceCandidate = {
      id: evidenceId,
      title: story.title,
      summary: evidenceSummary,
      occurredAt: review.review.occurredAt,
      sourceType: 'interview_review',
      sourceId: story.id,
      verification: 'user_confirmed',
      abilityIds: selectedAbilityIds,
      traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-feedback'),
    };
    if (installedPackage) {
      requireObjectWithOptional(
        item.evidenceCandidate,
        `${path}.evidenceCandidate`,
        [
          'id',
          'title',
          'summary',
          'occurredAt',
          'sourceType',
          'sourceId',
          'verification',
          'abilityIds',
          'traceId',
        ],
        [],
        ContractToolError,
        'invalid-feedback',
      );
      if (!isDeepStrictEqual(item.evidenceCandidate, evidenceCandidate)) {
        throw feedbackError(`${path}.evidenceCandidate must match the installed review and user-confirmed mapping`, 'invalid-feedback', { path });
      }
    }
    return {
      id,
      reviewStoryId,
      evidenceId,
      abilityIds: selectedAbilityIds,
      evidenceSummary,
      evidenceCandidate,
    };
  });

  if (gapFeedback.length === 0 && storyFeedback.length === 0) {
    throw feedbackError('At least one gap or story mapping is required', 'invalid-feedback', { path: '$.gapFeedback' });
  }

  const canonicalFeedback = {
    schema: CAPABILITY_FEEDBACK_SCHEMA,
    schemaVersion: CAPABILITY_FEEDBACK_SCHEMA_VERSION,
    feedbackId: requireSafeId(input.feedbackId, '$.feedbackId', ContractToolError, 'invalid-feedback'),
    generatedAt: requireTimestampValue(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-feedback'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-feedback'),
    evidencePackageId: input.evidencePackageId,
    evidenceContentHash: input.evidenceContentHash,
    materialsPackageId: input.materialsPackageId,
    materialsContentHash: input.materialsContentHash,
    reviewId,
    reviewContentHash: input.reviewContentHash,
    confirmation: input.confirmation,
    gapFeedback,
    storyFeedback,
  };
  const contentHash = semanticHash({ ...canonicalFeedback, generatedAt: undefined });
  return {
    feedback: canonicalFeedback,
    canonicalJson: JSON.stringify(canonicalFeedback, null, 2),
    contentHash,
    summary: {
      feedbackId: canonicalFeedback.feedbackId,
      schemaVersion: CAPABILITY_FEEDBACK_SCHEMA_VERSION,
      generatedAt: canonicalFeedback.generatedAt,
      reviewId: canonicalFeedback.reviewId,
      reviewContentHash: canonicalFeedback.reviewContentHash,
      evidencePackageId: canonicalFeedback.evidencePackageId,
      evidenceContentHash: canonicalFeedback.evidenceContentHash,
      materialsPackageId: canonicalFeedback.materialsPackageId,
      materialsContentHash: canonicalFeedback.materialsContentHash,
      gapFeedbackCount: gapFeedback.length,
      storyFeedbackCount: storyFeedback.length,
      evidenceCandidateCount: storyFeedback.length,
      contentHash,
    },
  };
}

export function renderCapabilityFeedback(feedback) {
  const lines = [
    '# 能力资产反哺台账',
    '',
    `- 复盘：${feedback.reviewId}（${feedback.reviewContentHash}）`,
    `- 能力证据包：${feedback.evidencePackageId}（${feedback.evidenceContentHash}）`,
    `- 简历素材包：${feedback.materialsPackageId}（${feedback.materialsContentHash}）`,
    '- 边界：本地确认台账；不修改当前能力证据包，不生成或修改分数，不上传平台。',
    '',
  ];
  if (feedback.gapFeedback.length > 0) {
    lines.push('## 能力差距与跟进', '');
    for (const item of feedback.gapFeedback) {
      lines.push(
        `- **${item.capability}** -> \`${item.abilityId}\`：${item.description}`,
        `  - 跟进：${item.followUp}`,
      );
    }
    lines.push('');
  }
  if (feedback.storyFeedback.length > 0) {
    lines.push('## 本地能力证据候选', '');
    for (const item of feedback.storyFeedback) {
      const candidate = item.evidenceCandidate;
      lines.push(
        `### ${candidate.title}`,
        '',
        `- 候选 ID：${candidate.id}`,
        `- 复盘故事：${item.reviewStoryId}`,
        `- 摘要：${candidate.summary}`,
        `- 发生时间：${candidate.occurredAt}`,
        `- 来源：interview_review / ${candidate.sourceId}`,
        `- 验证：user_confirmed`,
        `- 能力映射：${candidate.abilityIds.map(id => `\`${id}\``).join('、')}`,
        '',
      );
    }
  }
  lines.push('## 未变更', '', '- 当前能力证据包、能力分数、简历素材、故事库、简历定稿、投递进度和平台数据均未变更。', '');
  return `${lines.join('\n')}\n`;
}

function packageDirFor(root) {
  return join(root, FEEDBACK_PACKAGE_DIR);
}

function packagePathFor(root, feedbackId) {
  return join(packageDirFor(root), `${feedbackId}.json`);
}

function reportPathFor(root, feedbackId) {
  return join(root, FEEDBACK_REPORT_DIR, `${feedbackId}.md`);
}

function readFeedbackFile(filePath, dependencies) {
  const parsed = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-feedback',
  });
  return canonicalizeCapabilityFeedback(parsed, dependencies);
}

function readInstalledFeedbackWithContext(root, feedbackId) {
  const target = packagePathFor(root, feedbackId);
  const parsed = readOptionalContractFile(target, MAX_PACKAGE_BYTES, null);
  if (parsed === null) return null;
  const dependencies = loadCapabilityFeedbackDependencies(root, parsed.reviewId);
  if (!dependencies.review) {
    throw feedbackError('The referenced interview review is missing', 'interview-review-missing', {
      reviewId: parsed.reviewId,
    });
  }
  const installed = canonicalizeCapabilityFeedback(parsed, dependencies, { installed: true });
  if (installed.feedback.feedbackId !== feedbackId) {
    throw feedbackError('Installed feedback filename does not match feedbackId', 'invalid-feedback', {
      path: target,
      expectedFeedbackId: feedbackId,
      actualFeedbackId: installed.feedback.feedbackId,
    });
  }
  return installed;
}

function readOptionalReport(target) {
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw feedbackError(`Cannot inspect feedback report: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw feedbackError('Feedback report path is not a regular file', 'invalid-feedback', { path: target });
  if (info.size > MAX_REPORT_BYTES) throw feedbackError('Feedback report exceeds size limit', 'invalid-feedback', { path: target });
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    throw feedbackError(`Cannot read feedback report: ${error.message}`, 'io-error', { path: target });
  }
}

export function inspectCapabilityFeedback(root = getCareerOpsRoot()) {
  try {
    const parsedEvidence = readInstalledEvidence(root);
    if (parsedEvidence === null) {
      return { state: 'blocked', available: false, reason: 'evidence-package-missing' };
    }
    const evidence = canonicalizeEvidence(parsedEvidence);
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) {
      return { state: 'blocked', available: false, reason: 'resume-materials-missing' };
    }
    const reviewStatus = inspectInterviewReview(root);
    if (reviewStatus.state === 'missing' || reviewStatus.state === 'blocked') {
      return { state: 'blocked', available: false, reason: 'interview-review-missing' };
    }
    if (reviewStatus.state !== 'ready') {
      return {
        state: 'invalid',
        available: false,
        error: reviewStatus.error ?? 'Installed interview reviews cannot be inspected safely.',
        code: reviewStatus.code ?? 'invalid-review',
      };
    }

    let entries;
    try {
      entries = readdirSync(packageDirFor(root), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { state: 'missing', available: false, feedbackCount: 0, feedbacks: [] };
      throw error;
    }
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
    if (files.length > MAX_FEEDBACKS) {
      throw feedbackError(`Too many capability feedback packages (max ${MAX_FEEDBACKS})`, 'invalid-feedback');
    }
    const feedbacks = files.map(name => {
      const installed = readInstalledFeedbackWithContext(root, name.replace(/\.json$/, ''));
      const reportPath = reportPathFor(root, installed.feedback.feedbackId);
      const report = readOptionalReport(reportPath);
      const desired = renderCapabilityFeedback(installed.feedback);
      return {
        ...installed.summary,
        reportPath,
        reportState: report === null ? 'missing' : (report === desired ? 'current' : 'different'),
      };
    });
    return {
      state: 'ready',
      available: true,
      evidencePackageId: evidence.summary.packageId,
      feedbackCount: feedbacks.length,
      feedbacks,
    };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ContractToolError ? error.code : 'io-error',
    };
  }
}

export function importCapabilityFeedback(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw feedbackError('--replace requires --apply', 'usage');

  const parsed = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-feedback',
  });
  const dependencies = loadCapabilityFeedbackDependencies(root, parsed.reviewId);
  const incoming = canonicalizeCapabilityFeedback(parsed, dependencies);
  const packageTarget = packagePathFor(root, incoming.feedback.feedbackId);
  const reportTarget = reportPathFor(root, incoming.feedback.feedbackId);
  const existing = readInstalledFeedbackWithContext(root, incoming.feedback.feedbackId);
  const existingReport = readOptionalReport(reportTarget);
  const desiredMarkdown = renderCapabilityFeedback(incoming.feedback);
  const packageChange = !existing || existing.contentHash !== incoming.contentHash;
  const markdownChange = existingReport === null || existingReport !== desiredMarkdown;
  const backupPaths = { package: null, markdown: null };

  if (!packageChange && !markdownChange) {
    return {
      action: apply ? 'unchanged' : 'dry-run-unchanged',
      applied: apply,
      packagePath: packageTarget,
      reportPath: reportTarget,
      backupPaths,
      incoming: incoming.summary,
    };
  }

  const overwritesUserContent = (existing !== null && packageChange) || (existingReport !== null && markdownChange);
  if (overwritesUserContent && !replace) {
    throw feedbackError(
      'A different feedback package or report already exists; add --replace to replace it.',
      'different-feedback',
      {
        installedFeedbackId: existing?.summary.feedbackId ?? null,
        incomingFeedbackId: incoming.summary.feedbackId,
      },
    );
  }
  if (!apply) {
    return {
      action: overwritesUserContent ? 'dry-run-replace' : 'dry-run',
      applied: false,
      packagePath: packageTarget,
      reportPath: reportTarget,
      backupPaths,
      desiredMarkdown,
      incoming: incoming.summary,
    };
  }

  if (existing !== null && packageChange) {
    backupPaths.package = backupFile(
      packageTarget,
      join(root, FEEDBACK_BACKUP_DIR, incoming.feedback.feedbackId),
      'capability-feedback-package',
      existing.contentHash,
      MAX_BACKUPS_PER_FEEDBACK,
    );
  }
  if (existingReport !== null && markdownChange) {
    backupPaths.markdown = backupFile(
      reportTarget,
      join(root, FEEDBACK_BACKUP_DIR, incoming.feedback.feedbackId),
      'capability-feedback-markdown',
      semanticHash(existingReport),
      MAX_BACKUPS_PER_FEEDBACK,
    );
  }
  if (packageChange) writeContractFile(packageTarget, `${incoming.canonicalJson}\n`);
  if (markdownChange) writeContractFile(reportTarget, desiredMarkdown);

  return {
    action: existing === null ? 'imported' : 'replaced',
    applied: true,
    packagePath: packageTarget,
    reportPath: reportTarget,
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
  return { command: positional[0], feedbackFile: positional[1], json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    const root = getCareerOpsRoot();
    if (args.command === 'check') {
      const parsed = readJsonContract(args.feedbackFile, {
        maxBytes: MAX_PACKAGE_BYTES,
        ErrorClass: ContractToolError,
        errorCode: 'invalid-feedback',
      });
      const dependencies = loadCapabilityFeedbackDependencies(root, parsed.reviewId);
      const result = canonicalizeCapabilityFeedback(parsed, dependencies);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '能力反哺包校验通过。',
        `Feedback ID: ${result.summary.feedbackId}`,
        `复盘：${result.summary.reviewId}（${result.summary.reviewContentHash}）`,
        `能力差距跟进：${result.summary.gapFeedbackCount}`,
        `本地证据候选：${result.summary.evidenceCandidateCount}`,
        '边界：不修改当前能力证据包，不修改分数，不上传平台。',
      ].join('\n'));
      return;
    }

    const result = importCapabilityFeedback(args.feedbackFile, { root, apply: args.apply, replace: args.replace });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `能力反哺导入结果：${result.action}`,
      `本地台账：${result.packagePath}`,
      `本地报告：${result.reportPath}`,
      `复盘：${result.incoming.reviewId}`,
      `差距跟进：${result.incoming.gapFeedbackCount} / 证据候选：${result.incoming.evidenceCandidateCount}`,
      result.backupPaths.package ? `台账备份：${result.backupPaths.package}` : null,
      result.backupPaths.markdown ? `报告备份：${result.backupPaths.markdown}` : null,
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = code === 'different-feedback' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
