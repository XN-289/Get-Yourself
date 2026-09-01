#!/usr/bin/env node

import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { writeFileAtomic } from './tracker-utils.mjs';

export const PACKAGE_SCHEMA = 'get-yourself.evidence-package';
export const PACKAGE_SCHEMA_VERSION = 1;
export const PACKAGE_PATH = 'data/evidence-package.json';
export const BACKUP_DIR = 'data/evidence-package-backups';
const MAX_PACKAGE_BYTES = 256 * 1024;
const MAX_BACKUPS = 10;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SOURCE_TYPES = new Set([
  'growth_record',
  'achievement',
  'challenge',
  'reflection',
  'interview_review',
  'jd_analysis',
  'external_resume',
  'manual',
]);
const VERIFICATIONS = new Set(['verified', 'platform_reviewed', 'user_confirmed', 'unverified']);

const USAGE = `Usage:
  node evidence-package.mjs check <package.json> [--json]
  node evidence-package.mjs import <package.json> [--apply] [--replace] [--json]`;

export class EvidencePackageError extends Error {
  constructor(message, code = 'invalid-package', details = {}) {
    super(message);
    this.name = 'EvidencePackageError';
    this.code = code;
    this.details = details;
  }
}

function fail(message, code = 'usage', json = false, exitCode = 1) {
  if (json) console.log(JSON.stringify({ ok: false, error: message, code }, null, 2));
  else console.error(`Error: ${message}`);
  process.exit(exitCode);
}

function requireObject(value, path, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new EvidencePackageError(`${path} must be an object`, 'invalid-package', { path });
  }
  const keys = new Set(Object.keys(value));
  const unknown = [...keys].filter(key => !fields.includes(key));
  if (unknown.length > 0) {
    throw new EvidencePackageError(`${path} has unknown field(s): ${unknown.join(', ')}`, 'invalid-package', { path, unknown });
  }
  for (const field of fields) {
    if (!keys.has(field)) throw new EvidencePackageError(`${path}.${field} is required`, 'invalid-package', { path: `${path}.${field}` });
  }
}

function requireString(value, path, { min = 1, max = 240 } = {}) {
  if (typeof value !== 'string') throw new EvidencePackageError(`${path} must be a string`, 'invalid-package', { path });
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new EvidencePackageError(`${path} length must be ${min} to ${max} after trim`, 'invalid-package', { path });
  }
  if (CONTROL_CHARACTER_PATTERN.test(text)) {
    throw new EvidencePackageError(`${path} contains control characters`, 'invalid-package', { path });
  }
  return text;
}

function requireSafeId(value, path) {
  const text = requireString(value, path, { min: 1, max: 64 });
  if (!SAFE_ID_PATTERN.test(text)) {
    throw new EvidencePackageError(`${path} contains unsupported characters`, 'invalid-package', { path });
  }
  return text;
}

function requireTimestamp(value, path) {
  const text = requireString(value, path, { min: 20, max: 40 });
  if (!ISO_DATE_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new EvidencePackageError(`${path} must be an ISO-8601 UTC timestamp`, 'invalid-package', { path });
  }
  return text;
}

function requireEnum(value, path, allowed) {
  const text = requireString(value, path, { min: 1, max: 40 });
  if (!allowed.has(text)) {
    throw new EvidencePackageError(`${path} must be one of: ${[...allowed].join(', ')}`, 'invalid-package', { path });
  }
  return text;
}

function requireArray(value, path, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new EvidencePackageError(`${path} must contain ${min} to ${max} items`, 'invalid-package', { path });
  }
  return value;
}

function requireUniqueReferences(values, path, knownIds) {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const id = requireSafeId(value, `${path}[${index}]`);
    if (seen.has(id)) throw new EvidencePackageError(`${path} contains duplicate reference ${id}`, 'invalid-package', { path });
    if (!knownIds.has(id)) throw new EvidencePackageError(`${path} references unknown id ${id}`, 'invalid-package', { path });
    seen.add(id);
  }
  return [...seen];
}

function requireInteger(value, path, min, max) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new EvidencePackageError(`${path} must be an integer from ${min} to ${max}`, 'invalid-package', { path });
  }
  return value;
}

function requireScore(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new EvidencePackageError(`${path} must be a finite number from 0 to 100`, 'invalid-package', { path });
  }
  return value;
}

function requireStringList(value, path, minItems, maxItems, min, max) {
  return requireArray(value, path, minItems, maxItems).map((item, index) => (
    requireString(item, `${path}[${index}]`, { min, max })
  ));
}

export function canonicalizeEvidencePackage(input) {
  requireObject(input, '$', [
    'schema',
    'schemaVersion',
    'packageId',
    'generatedAt',
    'student',
    'abilities',
    'evidence',
    'memorySummary',
  ]);
  if (input.schema !== PACKAGE_SCHEMA) {
    throw new EvidencePackageError(`$.schema must be ${PACKAGE_SCHEMA}`, 'invalid-package', { path: '$.schema' });
  }
  if (input.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    throw new EvidencePackageError(`$.schemaVersion must be ${PACKAGE_SCHEMA_VERSION}`, 'unsupported-version', { path: '$.schemaVersion' });
  }
  const packageId = requireSafeId(input.packageId, '$.packageId');
  const generatedAt = requireTimestamp(input.generatedAt, '$.generatedAt');

  requireObject(input.student, '$.student', ['graduationYear', 'targetRoles']);
  const student = {
    graduationYear: requireInteger(input.student.graduationYear, '$.student.graduationYear', 2000, 2100),
    targetRoles: requireStringList(input.student.targetRoles, '$.student.targetRoles', 1, 10, 1, 40),
  };

  const rawAbilities = requireArray(input.abilities, '$.abilities', 1, 50);
  const abilityIds = new Set();
  const abilities = rawAbilities.map((ability, index) => {
    const path = `$.abilities[${index}]`;
    requireObject(ability, path, ['id', 'name', 'score', 'summary', 'evidenceRefs']);
    const id = requireSafeId(ability.id, `${path}.id`);
    if (abilityIds.has(id)) throw new EvidencePackageError(`${path}.id is duplicate: ${id}`, 'invalid-package', { path: `${path}.id` });
    abilityIds.add(id);
    return {
      id,
      name: requireString(ability.name, `${path}.name`, { min: 1, max: 40 }),
      score: requireScore(ability.score, `${path}.score`),
      summary: requireString(ability.summary, `${path}.summary`, { min: 1, max: 160 }),
      evidenceRefs: requireArray(ability.evidenceRefs, `${path}.evidenceRefs`, 1, 20),
    };
  });

  const rawEvidence = requireArray(input.evidence, '$.evidence', 1, 200);
  const evidenceIds = new Set();
  const evidence = rawEvidence.map((item, index) => {
    const path = `$.evidence[${index}]`;
    requireObject(item, path, [
      'id',
      'title',
      'summary',
      'occurredAt',
      'sourceType',
      'sourceId',
      'verification',
      'abilityIds',
      'traceId',
    ]);
    const id = requireSafeId(item.id, `${path}.id`);
    if (evidenceIds.has(id)) throw new EvidencePackageError(`${path}.id is duplicate: ${id}`, 'invalid-package', { path: `${path}.id` });
    evidenceIds.add(id);
    return {
      id,
      title: requireString(item.title, `${path}.title`, { min: 1, max: 80 }),
      summary: requireString(item.summary, `${path}.summary`, { min: 1, max: 240 }),
      occurredAt: requireTimestamp(item.occurredAt, `${path}.occurredAt`),
      sourceType: requireEnum(item.sourceType, `${path}.sourceType`, SOURCE_TYPES),
      sourceId: requireSafeId(item.sourceId, `${path}.sourceId`),
      verification: requireEnum(item.verification, `${path}.verification`, VERIFICATIONS),
      abilityIds: requireArray(item.abilityIds, `${path}.abilityIds`, 1, 10),
      traceId: requireSafeId(item.traceId, `${path}.traceId`),
    };
  });

  for (const [index, ability] of abilities.entries()) {
    ability.evidenceRefs = requireUniqueReferences(ability.evidenceRefs, `$.abilities[${index}].evidenceRefs`, evidenceIds);
  }
  for (const [index, item] of evidence.entries()) {
    item.abilityIds = requireUniqueReferences(item.abilityIds, `$.evidence[${index}].abilityIds`, abilityIds);
  }

  requireObject(input.memorySummary, '$.memorySummary', ['summary', 'strengths', 'gapFocus']);
  const memorySummary = {
    summary: requireString(input.memorySummary.summary, '$.memorySummary.summary', { min: 1, max: 240 }),
    strengths: requireStringList(input.memorySummary.strengths, '$.memorySummary.strengths', 0, 10, 1, 80),
    gapFocus: requireStringList(input.memorySummary.gapFocus, '$.memorySummary.gapFocus', 0, 10, 1, 80),
  };

  const canonicalPackage = {
    schema: PACKAGE_SCHEMA,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    packageId,
    generatedAt,
    student,
    abilities,
    evidence,
    memorySummary,
  };
  const canonicalJson = JSON.stringify(canonicalPackage, null, 2);
  const contentHash = `sha256:${createHash('sha256').update(canonicalJson, 'utf8').digest('hex')}`;
  return {
    package: canonicalPackage,
    canonicalJson,
    contentHash,
    summary: {
      packageId,
      schemaVersion: PACKAGE_SCHEMA_VERSION,
      generatedAt,
      abilityCount: abilities.length,
      evidenceCount: evidence.length,
      contentHash,
    },
  };
}

function readPackageFile(filePath) {
  const resolvedPath = resolve(filePath);
  let info;
  try {
    info = lstatSync(resolvedPath);
  } catch (error) {
    throw new EvidencePackageError(`Cannot read package file: ${error.message}`, 'io-error', { path: filePath });
  }
  if (!info.isFile()) {
    throw new EvidencePackageError('Package path must be a regular file', 'io-error', { path: filePath });
  }
  if (info.size > MAX_PACKAGE_BYTES) {
    throw new EvidencePackageError(`Package file exceeds ${MAX_PACKAGE_BYTES} bytes`, 'package-too-large', { path: filePath });
  }
  let raw;
  try {
    raw = readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    throw new EvidencePackageError(`Cannot read package file: ${error.message}`, 'io-error', { path: filePath });
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_PACKAGE_BYTES) {
    throw new EvidencePackageError(`Package file exceeds ${MAX_PACKAGE_BYTES} bytes`, 'package-too-large', { path: filePath });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new EvidencePackageError(`Package is not valid JSON: ${error.message}`, 'invalid-json', { path: filePath });
  }
  return canonicalizeEvidencePackage(parsed);
}

function packagePathFor(root) {
  return join(root, PACKAGE_PATH);
}

function readInstalledPackage(root) {
  const target = packagePathFor(root);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new EvidencePackageError(`Cannot read installed package: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw new EvidencePackageError('Installed package path is not a regular file', 'invalid-package', { path: target });
  if (info.size > MAX_PACKAGE_BYTES) throw new EvidencePackageError('Installed package exceeds size limit', 'package-too-large', { path: target });
  let raw;
  try {
    raw = readFileSync(target, 'utf8');
  } catch (error) {
    throw new EvidencePackageError(`Installed package is unreadable: ${error.message}`, 'invalid-package', { path: target });
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_PACKAGE_BYTES) {
    throw new EvidencePackageError('Installed package exceeds size limit', 'package-too-large', { path: target });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new EvidencePackageError(`Installed package is invalid JSON: ${error.message}`, 'invalid-package', { path: target });
  }
  return canonicalizeEvidencePackage(parsed);
}

export function inspectEvidencePackage(root = getCareerOpsRoot()) {
  try {
    const installed = readInstalledPackage(root);
    if (!installed) return { state: 'missing', available: false };
    return { state: 'ready', available: true, ...installed.summary };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function backupName(contentHash) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shortHash = contentHash.replace(/^sha256:/, '').slice(0, 12);
  return `evidence-package-${stamp}-${shortHash}.json`;
}

function pruneBackups(backupDir) {
  const backups = readdirSync(backupDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^evidence-package-\d{4}-\d{2}-\d{2}T.*-[0-9a-f]{12}\.json$/.test(entry.name))
    .map(entry => entry.name)
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    unlinkSync(join(backupDir, name));
  }
}

export function importEvidencePackage(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) {
    throw new EvidencePackageError('--replace requires --apply', 'usage');
  }

  const incoming = readPackageFile(filePath);
  const target = packagePathFor(root);
  const existing = readInstalledPackage(root);
  let action = apply ? 'import' : 'dry-run';
  let backupPath = null;

  if (!existing) {
    if (apply) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileAtomic(target, `${incoming.canonicalJson}\n`);
      action = 'imported';
    }
  } else if (existing.contentHash === incoming.contentHash) {
    action = apply ? 'unchanged' : 'dry-run-unchanged';
  } else if (!replace) {
    const error = new EvidencePackageError('A different evidence package is already installed; add --replace to replace it.', 'different-package');
    error.details = {
      installedPackageId: existing.summary.packageId,
      incomingPackageId: incoming.summary.packageId,
    };
    throw error;
  } else {
    if (!apply) {
      action = 'dry-run-replace';
    } else {
      const backupDir = join(root, BACKUP_DIR);
      mkdirSync(backupDir, { recursive: true });
      backupPath = join(backupDir, backupName(existing.contentHash));
      copyFileSync(target, backupPath);
      pruneBackups(backupDir);
      writeFileAtomic(target, `${incoming.canonicalJson}\n`);
      action = 'replaced';
    }
  }

  return {
    action,
    applied: apply,
    target,
    backupPath,
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
  const packageFile = positional[1];
  if (positional.length !== 2 || !['check', 'import'].includes(command)) {
    fail(`Invalid arguments.\n${USAGE}`, 'usage', json);
  }
  if (command === 'check' && (apply || replace)) {
    fail('check does not support --apply or --replace.', 'usage', json);
  }
  return { command, packageFile, json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    if (args.command === 'check') {
      const result = readPackageFile(args.packageFile);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '能力证据包校验通过。',
        `Package ID: ${result.summary.packageId}`,
        `版本: v${result.summary.schemaVersion}`,
        `能力: ${result.summary.abilityCount}`,
        `证据: ${result.summary.evidenceCount}`,
        `内容哈希: ${result.summary.contentHash}`,
      ].join('\n'));
      return;
    }

    const result = importEvidencePackage(args.packageFile, {
      root: getCareerOpsRoot(),
      apply: args.apply,
      replace: args.replace,
    });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `能力证据包导入结果：${result.action}`,
      `目标文件：${result.target}`,
      result.backupPath ? `备份：${result.backupPath}` : null,
      `内容哈希：${result.incoming.contentHash}`,
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof EvidencePackageError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = error instanceof EvidencePackageError && error.code === 'different-package' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
