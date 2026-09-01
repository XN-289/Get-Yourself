#!/usr/bin/env node

import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { writeFileAtomic } from './tracker-utils.mjs';
import { canonicalizeEvidencePackage } from './evidence-package.mjs';

export const MATERIALS_SCHEMA = 'get-yourself.resume-materials';
export const MATERIALS_SCHEMA_VERSION = 1;
export const MATERIALS_PATH = 'data/resume-materials.json';
export const STORY_BANK_PATH = 'interview-prep/story-bank.md';
export const BACKUP_DIR = 'data/resume-materials-backups';
const EVIDENCE_PACKAGE_PATH = 'data/evidence-package.json';
const MAX_PACKAGE_BYTES = 256 * 1024;
const MAX_STORY_BANK_BYTES = 1024 * 1024;
const MAX_BACKUPS = 10;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SECTIONS = new Set(['internship', 'project', 'competition', 'campus_work', 'skill']);
const ENTRY_SOURCE_TYPES = new Set([
  'user_statement',
  'resume',
  'evidence_package',
  'interview_review',
  'jd_analysis',
  'manual',
]);
const STORY_SOURCE_TYPES = new Set(['user_statement', 'resume', 'evidence_package', 'interview_review', 'manual']);
const EVIDENCE_STATUSES = new Set(['verified', 'user_confirmed', 'missing', 'external']);
const CONFIRMATIONS = new Set(['user_confirmed']);
const SOURCE_LABELS = new Map([
  ['user_statement', '用户陈述'],
  ['resume', '既有简历'],
  ['evidence_package', '能力证据包'],
  ['interview_review', '面试复盘'],
  ['jd_analysis', 'JD 分析'],
  ['manual', '手工输入'],
]);

const USAGE = `Usage:
  node resume-materials.mjs check <materials.json> [--json]
  node resume-materials.mjs import <materials.json> [--apply] [--replace] [--json]`;

export class ResumeMaterialsError extends Error {
  constructor(message, code = 'invalid-materials', details = {}) {
    super(message);
    this.name = 'ResumeMaterialsError';
    this.code = code;
    this.details = details;
  }
}

function fail(message, code = 'usage', json = false) {
  if (json) console.log(JSON.stringify({ ok: false, error: message, code }, null, 2));
  else console.error(`Error: ${message}`);
  process.exit(1);
}

function requireObject(value, path, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResumeMaterialsError(`${path} must be an object`, 'invalid-materials', { path });
  }
  const keys = new Set(Object.keys(value));
  const unknown = [...keys].filter(key => !fields.includes(key));
  if (unknown.length > 0) {
    throw new ResumeMaterialsError(`${path} has unknown field(s): ${unknown.join(', ')}`, 'invalid-materials', { path, unknown });
  }
  for (const field of fields) {
    if (!keys.has(field)) {
      throw new ResumeMaterialsError(`${path}.${field} is required`, 'invalid-materials', { path: `${path}.${field}` });
    }
  }
}

function requireString(value, path, { min = 1, max = 240 } = {}) {
  if (typeof value !== 'string') throw new ResumeMaterialsError(`${path} must be a string`, 'invalid-materials', { path });
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new ResumeMaterialsError(`${path} length must be ${min} to ${max} after trim`, 'invalid-materials', { path });
  }
  if (CONTROL_CHARACTER_PATTERN.test(text)) {
    throw new ResumeMaterialsError(`${path} contains control characters`, 'invalid-materials', { path });
  }
  return text;
}

function requireSafeId(value, path) {
  const text = requireString(value, path, { min: 1, max: 64 });
  if (!SAFE_ID_PATTERN.test(text)) {
    throw new ResumeMaterialsError(`${path} contains unsupported characters`, 'invalid-materials', { path });
  }
  return text;
}

function requireTimestamp(value, path) {
  const text = requireString(value, path, { min: 20, max: 40 });
  if (!ISO_DATE_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new ResumeMaterialsError(`${path} must be an ISO-8601 UTC timestamp`, 'invalid-materials', { path });
  }
  return text;
}

function requireEnum(value, path, allowed) {
  const text = requireString(value, path, { min: 1, max: 40 });
  if (!allowed.has(text)) {
    throw new ResumeMaterialsError(`${path} must be one of: ${[...allowed].join(', ')}`, 'invalid-materials', { path });
  }
  return text;
}

function requireArray(value, path, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ResumeMaterialsError(`${path} must contain ${min} to ${max} items`, 'invalid-materials', { path });
  }
  return value;
}

function requireStringList(value, path, minItems, maxItems, min, max) {
  return requireArray(value, path, minItems, maxItems).map((item, index) => (
    requireString(item, `${path}[${index}]`, { min, max })
  ));
}

function requireUniqueReferences(values, path, knownIds) {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const id = requireSafeId(value, `${path}[${index}]`);
    if (seen.has(id)) throw new ResumeMaterialsError(`${path} contains duplicate reference ${id}`, 'invalid-materials', { path });
    if (!knownIds.has(id)) throw new ResumeMaterialsError(`${path} references unknown id ${id}`, 'invalid-materials', { path });
    seen.add(id);
  }
  return [...seen];
}

function materialReferencesEvidence(input) {
  return Array.isArray(input?.entries)
    && input.entries.some(entry => Array.isArray(entry?.evidenceRefs) && entry.evidenceRefs.length > 0);
}

function readInstalledEvidencePackage(root) {
  const target = join(root, EVIDENCE_PACKAGE_PATH);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ResumeMaterialsError(
        'Materials reference evidence, but no evidence package is installed.',
        'evidence-package-unavailable',
        { path: target },
      );
    }
    throw new ResumeMaterialsError(`Cannot read installed evidence package: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) {
    throw new ResumeMaterialsError('Installed evidence package path is not a regular file', 'invalid-materials', { path: target });
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(target, 'utf8'));
  } catch (error) {
    throw new ResumeMaterialsError(`Installed evidence package is invalid: ${error.message}`, 'invalid-materials', { path: target });
  }
  const evidencePackage = canonicalizeEvidencePackage(parsed);
  return new Map(evidencePackage.package.evidence.map(item => [item.id, item]));
}

function validateEvidenceReferences(entries, evidenceById) {
  for (const [index, entry] of entries.entries()) {
    const path = `$.entries[${index}].evidenceRefs`;
    const refs = requireUniqueReferences(entry.evidenceRefs, path, new Set(evidenceById.keys()));
    if (entry.sourceType === 'evidence_package' && refs.length === 0) {
      throw new ResumeMaterialsError(`${path} must not be empty when sourceType is evidence_package`, 'invalid-materials', { path });
    }
    if (entry.sourceType !== 'evidence_package' && refs.length > 0) {
      throw new ResumeMaterialsError(`${path} must be empty unless sourceType is evidence_package`, 'invalid-materials', { path });
    }
    if (entry.evidenceStatus === 'verified' && !refs.some(id => evidenceById.get(id)?.verification === 'verified')) {
      throw new ResumeMaterialsError(
        `${path} must contain at least one verified evidence item before evidenceStatus can be verified`,
        'invalid-materials',
        { path },
      );
    }
  }
}

export function canonicalizeResumeMaterials(input, options = {}) {
  requireObject(input, '$', [
    'schema',
    'schemaVersion',
    'packageId',
    'generatedAt',
    'traceId',
    'targetRole',
    'confirmation',
    'entries',
    'stories',
  ]);
  if (input.schema !== MATERIALS_SCHEMA) {
    throw new ResumeMaterialsError(`$.schema must be ${MATERIALS_SCHEMA}`, 'invalid-materials', { path: '$.schema' });
  }
  if (input.schemaVersion !== MATERIALS_SCHEMA_VERSION) {
    throw new ResumeMaterialsError(`$.schemaVersion must be ${MATERIALS_SCHEMA_VERSION}`, 'unsupported-version', { path: '$.schemaVersion' });
  }
  const confirmation = requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS);

  const rawEntries = requireArray(input.entries, '$.entries', 1, 100);
  const entryIds = new Set();
  const entries = rawEntries.map((item, index) => {
    const path = `$.entries[${index}]`;
    requireObject(item, path, [
      'id',
      'section',
      'organization',
      'role',
      'timeframe',
      'bullet',
      'sourceType',
      'sourceId',
      'evidenceStatus',
      'evidenceRefs',
      'openQuestions',
    ]);
    const id = requireSafeId(item.id, `${path}.id`);
    if (entryIds.has(id)) throw new ResumeMaterialsError(`${path}.id is duplicate: ${id}`, 'invalid-materials', { path: `${path}.id` });
    entryIds.add(id);
    return {
      id,
      section: requireEnum(item.section, `${path}.section`, SECTIONS),
      organization: requireString(item.organization, `${path}.organization`, { min: 1, max: 80 }),
      role: requireString(item.role, `${path}.role`, { min: 1, max: 60 }),
      timeframe: requireString(item.timeframe, `${path}.timeframe`, { min: 1, max: 40 }),
      bullet: requireString(item.bullet, `${path}.bullet`, { min: 1, max: 180 }),
      sourceType: requireEnum(item.sourceType, `${path}.sourceType`, ENTRY_SOURCE_TYPES),
      sourceId: requireSafeId(item.sourceId, `${path}.sourceId`),
      evidenceStatus: requireEnum(item.evidenceStatus, `${path}.evidenceStatus`, EVIDENCE_STATUSES),
      evidenceRefs: requireArray(item.evidenceRefs, `${path}.evidenceRefs`, 0, 10),
      openQuestions: requireStringList(item.openQuestions, `${path}.openQuestions`, 0, 5, 1, 120),
    };
  });

  for (const [index, entry] of entries.entries()) {
    const path = `$.entries[${index}]`;
    if ((entry.sourceType === 'jd_analysis') !== (entry.evidenceStatus === 'external')) {
      throw new ResumeMaterialsError(
        'jd_analysis entries must use external evidence status, and external status is reserved for jd_analysis',
        'invalid-materials',
        { path: `${path}.sourceType` },
      );
    }
  }

  const evidenceById = options.evidenceById ?? null;
  const materialNeedsEvidence = entries.some(entry => entry.evidenceRefs.length > 0 || entry.sourceType === 'evidence_package');
  if (materialNeedsEvidence && evidenceById === null) {
    throw new ResumeMaterialsError(
      'Materials reference evidence, but no evidence package is installed.',
      'evidence-package-unavailable',
    );
  }
  if (evidenceById !== null) validateEvidenceReferences(entries, evidenceById);

  const rawStories = requireArray(input.stories, '$.stories', 0, 100);
  const storyIds = new Set();
  const stories = rawStories.map((item, index) => {
    const path = `$.stories[${index}]`;
    requireObject(item, path, [
      'id',
      'title',
      'situation',
      'task',
      'action',
      'result',
      'tags',
      'entryRefs',
      'sourceType',
    ]);
    const id = requireSafeId(item.id, `${path}.id`);
    if (storyIds.has(id)) throw new ResumeMaterialsError(`${path}.id is duplicate: ${id}`, 'invalid-materials', { path: `${path}.id` });
    storyIds.add(id);
    return {
      id,
      title: requireString(item.title, `${path}.title`, { min: 1, max: 80 }),
      situation: requireString(item.situation, `${path}.situation`, { min: 1, max: 500 }),
      task: requireString(item.task, `${path}.task`, { min: 1, max: 500 }),
      action: requireString(item.action, `${path}.action`, { min: 1, max: 500 }),
      result: requireString(item.result, `${path}.result`, { min: 1, max: 500 }),
      tags: requireStringList(item.tags, `${path}.tags`, 0, 10, 1, 30),
      entryRefs: requireArray(item.entryRefs, `${path}.entryRefs`, 1, 10),
      sourceType: requireEnum(item.sourceType, `${path}.sourceType`, STORY_SOURCE_TYPES),
    };
  });
  for (const [index, story] of stories.entries()) {
    story.entryRefs = requireUniqueReferences(story.entryRefs, `$.stories[${index}].entryRefs`, entryIds);
  }

  const canonicalPackage = {
    schema: MATERIALS_SCHEMA,
    schemaVersion: MATERIALS_SCHEMA_VERSION,
    packageId: requireSafeId(input.packageId, '$.packageId'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt'),
    traceId: requireSafeId(input.traceId, '$.traceId'),
    targetRole: requireString(input.targetRole, '$.targetRole', { min: 1, max: 40 }),
    confirmation,
    entries,
    stories,
  };
  const canonicalJson = JSON.stringify(canonicalPackage, null, 2);
  const semanticPackage = { ...canonicalPackage, generatedAt: undefined };
  const contentHash = `sha256:${createHash('sha256').update(JSON.stringify(semanticPackage), 'utf8').digest('hex')}`;
  return {
    package: canonicalPackage,
    canonicalJson,
    contentHash,
    summary: {
      packageId: canonicalPackage.packageId,
      schemaVersion: MATERIALS_SCHEMA_VERSION,
      generatedAt: canonicalPackage.generatedAt,
      targetRole: canonicalPackage.targetRole,
      entryCount: entries.length,
      storyCount: stories.length,
      contentHash,
    },
  };
}

export function renderStoryBank(materialsPackage) {
  const lines = [
    '# STAR 故事库',
    '',
    '> 本文件由用户确认的简历素材包生成；它是面试准备材料，不是简历定稿。',
    '',
  ];
  for (const story of materialsPackage.stories) {
    const source = SOURCE_LABELS.get(story.sourceType) ?? story.sourceType;
    const storyLines = [
      `## ${story.title}`,
      '',
      `- 故事 ID：${story.id}`,
      `- 关联素材：${story.entryRefs.join('、')}`,
      `- 来源：${source}`,
      story.tags.length > 0 ? `- 标签：${story.tags.join('、')}` : null,
      '',
      '### Situation',
      story.situation,
      '',
      '### Task',
      story.task,
      '',
      '### Action',
      story.action,
      '',
      '### Result',
      story.result,
      '',
    ].filter(line => line !== null);
    lines.push(...storyLines);
  }
  return `${lines.join('\n')}\n`;
}

function readJsonPackageFile(filePath, root) {
  const resolvedPath = resolve(filePath);
  let info;
  try {
    info = lstatSync(resolvedPath);
  } catch (error) {
    throw new ResumeMaterialsError(`Cannot read materials file: ${error.message}`, 'io-error', { path: filePath });
  }
  if (!info.isFile()) throw new ResumeMaterialsError('Materials path must be a regular file', 'io-error', { path: filePath });
  if (info.size > MAX_PACKAGE_BYTES) {
    throw new ResumeMaterialsError(`Materials file exceeds ${MAX_PACKAGE_BYTES} bytes`, 'package-too-large', { path: filePath });
  }
  let raw;
  try {
    raw = readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    throw new ResumeMaterialsError(`Cannot read materials file: ${error.message}`, 'io-error', { path: filePath });
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_PACKAGE_BYTES) {
    throw new ResumeMaterialsError(`Materials file exceeds ${MAX_PACKAGE_BYTES} bytes`, 'package-too-large', { path: filePath });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ResumeMaterialsError(`Materials file is not valid JSON: ${error.message}`, 'invalid-json', { path: filePath });
  }
  const evidenceById = materialReferencesEvidence(parsed) ? readInstalledEvidencePackage(root) : null;
  return canonicalizeResumeMaterials(parsed, { evidenceById });
}

function materialsPathFor(root) {
  return join(root, MATERIALS_PATH);
}

function storyBankPathFor(root) {
  return join(root, STORY_BANK_PATH);
}

function readInstalledMaterials(root) {
  const target = materialsPathFor(root);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new ResumeMaterialsError(`Cannot read installed materials: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw new ResumeMaterialsError('Installed materials path is not a regular file', 'invalid-materials', { path: target });
  if (info.size > MAX_PACKAGE_BYTES) throw new ResumeMaterialsError('Installed materials exceeds size limit', 'package-too-large', { path: target });
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(target, 'utf8'));
  } catch (error) {
    throw new ResumeMaterialsError(`Installed materials are invalid: ${error.message}`, 'invalid-materials', { path: target });
  }
  const evidenceById = materialReferencesEvidence(parsed) ? readInstalledEvidencePackage(root) : null;
  return canonicalizeResumeMaterials(parsed, { evidenceById });
}

export function loadInstalledResumeMaterials(root = getCareerOpsRoot()) {
  return readInstalledMaterials(root);
}

function storyBankExists(root) {
  try {
    return lstatSync(storyBankPathFor(root)) !== null;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new ResumeMaterialsError(`Cannot inspect story bank: ${error.message}`, 'io-error', { path: storyBankPathFor(root) });
  }
}

function readInstalledStoryBank(root) {
  const target = storyBankPathFor(root);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new ResumeMaterialsError(`Cannot inspect story bank: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw new ResumeMaterialsError('Story bank path is not a regular file', 'invalid-materials', { path: target });
  if (info.size > MAX_STORY_BANK_BYTES) throw new ResumeMaterialsError('Story bank exceeds size limit', 'package-too-large', { path: target });
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    throw new ResumeMaterialsError(`Cannot read story bank: ${error.message}`, 'io-error', { path: target });
  }
}

export function inspectResumeMaterials(root = getCareerOpsRoot()) {
  try {
    const installed = readInstalledMaterials(root);
    if (!installed) return { state: 'missing', available: false };
    const storyBankState = storyBankExists(root)
      ? (readInstalledStoryBank(root) === renderStoryBank(installed.package) ? 'current' : 'different')
      : 'missing';
    return { state: 'ready', available: true, storyBankState, ...installed.summary };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function backupName(kind, contentHash) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shortHash = contentHash.replace(/^sha256:/, '').slice(0, 12);
  return `${kind}-${stamp}-${shortHash}${kind === 'story-bank' ? '.md' : '.json'}`;
}

function pruneBackups(backupDir, kind) {
  const suffix = kind === 'story-bank' ? '\\.md' : '\\.json';
  const pattern = new RegExp(`^${kind}-\\d{4}-\\d{2}-\\d{2}T.*-[0-9a-f]{12}${suffix}$`);
  const backups = readdirSync(backupDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => entry.name)
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    unlinkSync(join(backupDir, name));
  }
}

export function importResumeMaterials(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw new ResumeMaterialsError('--replace requires --apply', 'usage');

  const incoming = readJsonPackageFile(filePath, root);
  const materialsTarget = materialsPathFor(root);
  const storyTarget = storyBankPathFor(root);
  const existing = readInstalledMaterials(root);
  const existingStoryBank = readInstalledStoryBank(root);
  const desiredStoryBank = renderStoryBank(incoming.package);
  const materialsChange = !existing || existing.contentHash !== incoming.contentHash;
  const storyBankChange = existingStoryBank === null || existingStoryBank !== desiredStoryBank;
  const backupPaths = { materials: null, storyBank: null };
  let action = apply ? 'import' : 'dry-run';

  if (!materialsChange && !storyBankChange) {
    return {
      action: apply ? 'unchanged' : 'dry-run-unchanged',
      applied: apply,
      target: materialsTarget,
      storyBankPath: storyTarget,
      backupPaths,
      incoming: incoming.summary,
    };
  }

  const overwritesUserContent = (existing !== null && materialsChange)
    || (existingStoryBank !== null && storyBankChange);
  if (overwritesUserContent && !replace) {
    const error = new ResumeMaterialsError(
      'Different resume materials or story bank content already exists; add --replace to replace it.',
      'different-materials',
    );
    error.details = {
      installedPackageId: existing?.summary.packageId ?? null,
      incomingPackageId: incoming.summary.packageId,
    };
    throw error;
  }

  if (!apply) {
    return {
      action: overwritesUserContent ? 'dry-run-replace' : 'dry-run',
      applied: false,
      target: materialsTarget,
      storyBankPath: storyTarget,
      backupPaths,
      incoming: incoming.summary,
    };
  }

  const backupDir = join(root, BACKUP_DIR);
  if (overwritesUserContent) mkdirSync(backupDir, { recursive: true });
  if (existing !== null && materialsChange) {
    backupPaths.materials = join(backupDir, backupName('resume-materials', existing.contentHash));
    copyFileSync(materialsTarget, backupPaths.materials);
    pruneBackups(backupDir, 'resume-materials');
  }
  if (existingStoryBank !== null && storyBankChange) {
    backupPaths.storyBank = join(backupDir, backupName('story-bank', incoming.contentHash));
    copyFileSync(storyTarget, backupPaths.storyBank);
    pruneBackups(backupDir, 'story-bank');
  }

  if (materialsChange) {
    mkdirSync(dirname(materialsTarget), { recursive: true });
    writeFileAtomic(materialsTarget, `${incoming.canonicalJson}\n`);
  }
  if (storyBankChange) {
    mkdirSync(dirname(storyTarget), { recursive: true });
    writeFileAtomic(storyTarget, desiredStoryBank);
  }

  if (existing === null) action = 'imported';
  else if (materialsChange || storyBankChange) action = 'replaced';
  return {
    action,
    applied: true,
    target: materialsTarget,
    storyBankPath: storyTarget,
    backupPaths,
    incoming: incoming.summary,
  };
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const replace = args.includes('--replace');
  const positional = args.filter(arg => !['--json', '--apply', '--replace'].includes(arg));
  const command = positional[0];
  const materialsFile = positional[1];
  if (positional.length !== 2 || !['check', 'import'].includes(command)) {
    fail(`Invalid arguments.\n${USAGE}`, 'usage', json);
  }
  if (command === 'check' && (apply || replace)) {
    fail('check does not support --apply or --replace.', 'usage', json);
  }
  return { command, materialsFile, json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    if (args.command === 'check') {
      const result = readJsonPackageFile(args.materialsFile, getCareerOpsRoot());
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '简历素材包校验通过。',
        `Package ID: ${result.summary.packageId}`,
        `目标方向：${result.summary.targetRole}`,
        `素材条目: ${result.summary.entryCount}`,
        `STAR 故事: ${result.summary.storyCount}`,
        `内容哈希: ${result.summary.contentHash}`,
      ].join('\n'));
      return;
    }

    const result = importResumeMaterials(args.materialsFile, {
      root: getCareerOpsRoot(),
      apply: args.apply,
      replace: args.replace,
    });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `简历素材包导入结果：${result.action}`,
      `目标文件：${result.target}`,
      `故事库：${result.storyBankPath}`,
      result.backupPaths.materials ? `素材备份：${result.backupPaths.materials}` : null,
      result.backupPaths.storyBank ? `故事库备份：${result.backupPaths.storyBank}` : null,
      `内容哈希：${result.incoming.contentHash}`,
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ResumeMaterialsError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = error instanceof ResumeMaterialsError && error.code === 'different-materials' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
