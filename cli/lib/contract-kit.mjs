import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { writeFileAtomic } from '../tracker-utils.mjs';

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
export const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export class ContractToolError extends Error {
  constructor(message, code = 'invalid-contract', details = {}) {
    super(message);
    this.name = 'ContractToolError';
    this.code = code;
    this.details = details;
  }
}

export function requireObject(value, path, fields, ErrorClass = ContractToolError, errorCode = 'invalid-contract') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ErrorClass(`${path} must be an object`, errorCode, { path });
  }
  const keys = new Set(Object.keys(value));
  const unknown = [...keys].filter(key => !fields.includes(key));
  if (unknown.length > 0) {
    throw new ErrorClass(`${path} has unknown field(s): ${unknown.join(', ')}`, errorCode, { path, unknown });
  }
  for (const field of fields) {
    if (!keys.has(field)) {
      throw new ErrorClass(`${path}.${field} is required`, errorCode, { path: `${path}.${field}` });
    }
  }
}

export function requireObjectWithOptional(
  value,
  path,
  requiredFields,
  optionalFields = [],
  ErrorClass = ContractToolError,
  errorCode = 'invalid-contract',
) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ErrorClass(`${path} must be an object`, errorCode, { path });
  }
  const allowed = [...requiredFields, ...optionalFields];
  const keys = new Set(Object.keys(value));
  const unknown = [...keys].filter(key => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ErrorClass(`${path} has unknown field(s): ${unknown.join(', ')}`, errorCode, { path, unknown });
  }
  for (const field of requiredFields) {
    if (!keys.has(field)) {
      throw new ErrorClass(`${path}.${field} is required`, errorCode, { path: `${path}.${field}` });
    }
  }
}

export function requireString(value, path, { min = 1, max = 240 } = {}, ErrorClass = ContractToolError, errorCode = 'invalid-contract') {
  if (typeof value !== 'string') throw new ErrorClass(`${path} must be a string`, errorCode, { path });
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new ErrorClass(`${path} length must be ${min} to ${max} after trim`, errorCode, { path });
  }
  if (CONTROL_CHARACTER_PATTERN.test(text)) {
    throw new ErrorClass(`${path} contains control characters`, errorCode, { path });
  }
  return text;
}

export function requireSafeId(value, path, ErrorClass = ContractToolError, errorCode = 'invalid-contract') {
  const text = requireString(value, path, { min: 1, max: 64 }, ErrorClass, errorCode);
  if (!SAFE_ID_PATTERN.test(text)) {
    throw new ErrorClass(`${path} contains unsupported characters`, errorCode, { path });
  }
  return text;
}

export function requireTimestamp(value, path, ErrorClass = ContractToolError, errorCode = 'invalid-contract') {
  const text = requireString(value, path, { min: 20, max: 40 }, ErrorClass, errorCode);
  if (!ISO_DATE_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw new ErrorClass(`${path} must be an ISO-8601 UTC timestamp`, errorCode, { path });
  }
  return text;
}

export function requireEnum(value, path, allowed, ErrorClass = ContractToolError, errorCode = 'invalid-contract') {
  const text = requireString(value, path, { min: 1, max: 40 }, ErrorClass, errorCode);
  if (!allowed.has(text)) {
    throw new ErrorClass(`${path} must be one of: ${[...allowed].join(', ')}`, errorCode, { path });
  }
  return text;
}

export function requireArray(value, path, min, max, ErrorClass = ContractToolError, errorCode = 'invalid-contract') {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ErrorClass(`${path} must contain ${min} to ${max} items`, errorCode, { path });
  }
  return value;
}

export function requireStringList(value, path, minItems, maxItems, min, max, ErrorClass = ContractToolError, errorCode = 'invalid-contract') {
  return requireArray(value, path, minItems, maxItems, ErrorClass, errorCode)
    .map((item, index) => requireString(item, `${path}[${index}]`, { min, max }, ErrorClass, errorCode));
}

export function requireUniqueReferences(values, path, knownIds, ErrorClass = ContractToolError, errorCode = 'invalid-contract') {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const id = requireSafeId(value, `${path}[${index}]`, ErrorClass, errorCode);
    if (seen.has(id)) throw new ErrorClass(`${path} contains duplicate reference ${id}`, errorCode, { path });
    if (!knownIds.has(id)) throw new ErrorClass(`${path} references unknown id ${id}`, errorCode, { path });
    seen.add(id);
  }
  return [...seen];
}

export function semanticHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

export function readJsonContract(filePath, {
  maxBytes,
  ErrorClass = ContractToolError,
  errorCode = 'invalid-contract',
}) {
  const resolvedPath = resolve(filePath);
  let info;
  try {
    info = lstatSync(resolvedPath);
  } catch (error) {
    throw new ErrorClass(`Cannot read contract file: ${error.message}`, 'io-error', { path: filePath });
  }
  if (!info.isFile()) throw new ErrorClass('Contract path must be a regular file', 'io-error', { path: filePath });
  if (info.size > maxBytes) {
    throw new ErrorClass(`Contract file exceeds ${maxBytes} bytes`, 'contract-too-large', { path: filePath });
  }
  let raw;
  try {
    raw = readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    throw new ErrorClass(`Cannot read contract file: ${error.message}`, 'io-error', { path: filePath });
  }
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new ErrorClass(`Contract file exceeds ${maxBytes} bytes`, 'contract-too-large', { path: filePath });
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ErrorClass(`Contract file is not valid JSON: ${error.message}`, 'invalid-json', { path: filePath });
  }
}

export function backupFile(source, backupDir, kind, contentHash, maxBackups, ErrorClass = ContractToolError) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shortHash = contentHash.replace(/^sha256:/, '').slice(0, 12);
  const extension = kind.endsWith('markdown') ? '.md' : '.json';
  const target = join(backupDir, `${kind}-${stamp}-${shortHash}${extension}`);
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(source, target);

  const pattern = new RegExp(`^${kind}-\\d{4}-\\d{2}-\\d{2}T.*-[0-9a-f]{12}${extension.replace('.', '\\.')}$`);
  const backups = readdirSync(backupDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => entry.name)
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - maxBackups))) {
    unlinkSync(join(backupDir, name));
  }
  return target;
}

export function writeContractFile(target, content) {
  const path = requireString(target, '$.target', { min: 1, max: 1024 });
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, content);
}
