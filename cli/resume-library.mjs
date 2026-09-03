#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { RESUME_TEMPLATE_IDS } from './resume-render.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import {
  backupFile,
  ContractToolError,
  readJsonContract,
  requireArray,
  requireEnum,
  requireObjectWithOptional,
  requireSafeId,
  requireString,
  requireTimestamp,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';

export const RESUME_LIBRARY_SCHEMA = 'get-yourself.resume-library';
export const RESUME_LIBRARY_SCHEMA_VERSION = 1;
export const RESUME_LIBRARY_PATH = 'data/resume-library.json';
export const RESUME_LIBRARY_BACKUP_DIR = 'data/resume-library-backups';

const MAX_LIBRARY_BYTES = 2 * 1024 * 1024;
const MAX_DOCUMENTS = 100;
const MAX_VERSIONS_PER_DOCUMENT = 100;
const MAX_VERSION_CONTENT_BYTES = 128 * 1024;
const MAX_BACKUPS = 20;
const TEMPLATE_ID_SET = new Set(RESUME_TEMPLATE_IDS);
const CONFIRMATIONS = new Set(['user_confirmed']);
const VERSION_STATUSES = new Set(['draft', 'final', 'exported']);
const VERSION_SOURCES = new Set(['agent', 'import', 'manual']);
const UNSAFE_CONTENT_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FILE_NAME_PATTERN = /^[^\\/:*?"<>|\r\n]{1,110}\.[A-Za-z0-9]{1,12}$/;
const WINDOWS_RESERVED_FILE_NAME_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

const USAGE = `Usage:
  node resume-library.mjs check <library.json> [--json]
  node resume-library.mjs import <library.json> [--apply] [--replace] [--json]`;

function libraryError(message, code = 'invalid-library', details = {}) {
  return new ContractToolError(message, code, details);
}

function requireVersionContent(value, path) {
  if (typeof value !== 'string') {
    throw libraryError(`${path} must be a string`);
  }
  if (value.length < 1 || value.length > MAX_VERSION_CONTENT_BYTES) {
    throw libraryError(`${path} length must be 1 to ${MAX_VERSION_CONTENT_BYTES} characters`);
  }
  if (UNSAFE_CONTENT_CONTROL_PATTERN.test(value)) {
    throw libraryError(`${path} contains unsupported control characters`);
  }
  return value;
}

function requireCanonicalTimestamp(value, path) {
  const timestamp = requireTimestamp(value, path, ContractToolError, 'invalid-library');
  return new Date(timestamp).toISOString();
}

function requireFileName(value, path) {
  const text = requireString(value, path, { min: 5, max: 120 });
  if (!FILE_NAME_PATTERN.test(text)) {
    throw libraryError(`${path} must be a file name without path separators`);
  }
  if (WINDOWS_RESERVED_FILE_NAME_PATTERN.test(text)) {
    throw libraryError(`${path} cannot use a reserved Windows device name`);
  }
  return text;
}

function requireContentHash(value, path) {
  const text = requireString(value, path, { min: 71, max: 71 }, ContractToolError, 'invalid-library');
  if (!CONTENT_HASH_PATTERN.test(text)) {
    throw libraryError(`${path} must use sha256:<64 lowercase hex>`);
  }
  return text;
}

function requireVersionNumber(value, path) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_VERSIONS_PER_DOCUMENT) {
    throw libraryError(`${path} must be an integer from 1 to ${MAX_VERSIONS_PER_DOCUMENT}`);
  }
  return value;
}

export function canonicalizeResumeLibrary(input) {
  requireObjectWithOptional(input, '$', [
    'schema',
    'schemaVersion',
    'libraryId',
    'generatedAt',
    'traceId',
    'confirmation',
    'documents',
  ], [], ContractToolError, 'invalid-library');

  if (input.schema !== RESUME_LIBRARY_SCHEMA) {
    throw libraryError(`$.schema must be ${RESUME_LIBRARY_SCHEMA}`);
  }
  if (input.schemaVersion !== RESUME_LIBRARY_SCHEMA_VERSION) {
    throw libraryError(`$.schemaVersion must be ${RESUME_LIBRARY_SCHEMA_VERSION}`, 'unsupported-version');
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-library');

  const library = {
    schema: RESUME_LIBRARY_SCHEMA,
    schemaVersion: RESUME_LIBRARY_SCHEMA_VERSION,
    libraryId: requireSafeId(input.libraryId, '$.libraryId', ContractToolError, 'invalid-library'),
    generatedAt: requireCanonicalTimestamp(input.generatedAt, '$.generatedAt'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-library'),
    confirmation: input.confirmation,
    documents: [],
  };

  const rawDocuments = requireArray(input.documents, '$.documents', 0, MAX_DOCUMENTS, ContractToolError, 'invalid-library');
  const documentIds = new Set();
  const versionIds = new Set();
  library.documents = rawDocuments.map((rawDocument, documentIndex) => {
    const documentPath = `$.documents[${documentIndex}]`;
    requireObjectWithOptional(
      rawDocument,
      documentPath,
      ['documentId', 'title', 'targetRole', 'activeVersionId', 'versions'],
      [],
      ContractToolError,
      'invalid-library',
    );
    const documentId = requireSafeId(
      rawDocument.documentId,
      `${documentPath}.documentId`,
      ContractToolError,
      'invalid-library',
    );
    if (documentIds.has(documentId)) {
      throw libraryError(`${documentPath}.documentId is duplicate: ${documentId}`);
    }
    documentIds.add(documentId);

    const rawVersions = requireArray(
      rawDocument.versions,
      `${documentPath}.versions`,
      1,
      MAX_VERSIONS_PER_DOCUMENT,
      ContractToolError,
      'invalid-library',
    );
    const documentVersionIds = new Set();
    const versions = rawVersions.map((rawVersion, versionIndex) => {
      const versionPath = `${documentPath}.versions[${versionIndex}]`;
      requireObjectWithOptional(
        rawVersion,
        versionPath,
        [
          'versionId',
          'version',
          'status',
          'templateId',
          'updatedAt',
          'source',
          'changeNote',
          'content',
        ],
        [
          'fileName',
          'finalPlanId',
          'finalPlanContentHash',
          'finalDocumentContentHash',
          'renderId',
          'renderContentHash',
          'sourceFileContentHash',
        ],
        ContractToolError,
        'invalid-library',
      );
      const versionId = requireSafeId(
        rawVersion.versionId,
        `${versionPath}.versionId`,
        ContractToolError,
        'invalid-library',
      );
      if (versionIds.has(versionId)) {
        throw libraryError(`${versionPath}.versionId is duplicate across the library: ${versionId}`);
      }
      versionIds.add(versionId);
      documentVersionIds.add(versionId);
      const templateId = requireSafeId(
        rawVersion.templateId,
        `${versionPath}.templateId`,
        ContractToolError,
        'invalid-library',
      );
      if (!TEMPLATE_ID_SET.has(templateId)) {
        throw libraryError(`${versionPath}.templateId must be one of: ${RESUME_TEMPLATE_IDS.join(', ')}`);
      }
      const version = {
        versionId,
        version: requireVersionNumber(rawVersion.version, `${versionPath}.version`),
        status: requireEnum(rawVersion.status, `${versionPath}.status`, VERSION_STATUSES, ContractToolError, 'invalid-library'),
        templateId,
        updatedAt: requireCanonicalTimestamp(rawVersion.updatedAt, `${versionPath}.updatedAt`),
        source: requireEnum(rawVersion.source, `${versionPath}.source`, VERSION_SOURCES, ContractToolError, 'invalid-library'),
        changeNote: requireString(
          rawVersion.changeNote,
          `${versionPath}.changeNote`,
          { min: 2, max: 500 },
          ContractToolError,
          'invalid-library',
        ),
        content: requireVersionContent(rawVersion.content, `${versionPath}.content`),
      };
      if (rawVersion.fileName !== undefined) {
        version.fileName = requireFileName(rawVersion.fileName, `${versionPath}.fileName`);
      }
      const finalFields = [
        ['finalPlanId', requireSafeId],
        ['finalPlanContentHash', requireContentHash],
        ['finalDocumentContentHash', requireContentHash],
      ];
      const finalPresent = finalFields.filter(([field]) => rawVersion[field] !== undefined);
      if (finalPresent.length > 0 && finalPresent.length !== finalFields.length) {
        throw libraryError(
          `${versionPath}.finalPlanId, finalPlanContentHash, and finalDocumentContentHash must be provided together`,
        );
      }
      if (finalPresent.length === finalFields.length) {
        if (version.status === 'draft') {
          throw libraryError(`${versionPath} draft versions cannot bind immutable final provenance`);
        }
        version.finalPlanId = requireSafeId(
          rawVersion.finalPlanId,
          `${versionPath}.finalPlanId`,
          ContractToolError,
          'invalid-library',
        );
        version.finalPlanContentHash = requireContentHash(
          rawVersion.finalPlanContentHash,
          `${versionPath}.finalPlanContentHash`,
        );
        version.finalDocumentContentHash = requireContentHash(
          rawVersion.finalDocumentContentHash,
          `${versionPath}.finalDocumentContentHash`,
        );
      }

      const renderPresent = ['renderId', 'renderContentHash']
        .filter(field => rawVersion[field] !== undefined);
      if (renderPresent.length === 1) {
        throw libraryError(`${versionPath}.renderId and renderContentHash must be provided together`);
      }
      if (renderPresent.length === 2) {
        if (version.source !== 'import') {
          throw libraryError(`${versionPath}.renderId / renderContentHash require source "import"`);
        }
        version.renderId = requireSafeId(
          rawVersion.renderId,
          `${versionPath}.renderId`,
          ContractToolError,
          'invalid-library',
        );
        version.renderContentHash = requireContentHash(
          rawVersion.renderContentHash,
          `${versionPath}.renderContentHash`,
        );
      }

      if (rawVersion.sourceFileContentHash !== undefined) {
        if (version.source !== 'import') {
          throw libraryError(`${versionPath}.sourceFileContentHash requires source "import"`);
        }
        if (version.fileName === undefined) {
          throw libraryError(`${versionPath}.sourceFileContentHash also requires fileName`);
        }
        version.sourceFileContentHash = requireContentHash(
          rawVersion.sourceFileContentHash,
          `${versionPath}.sourceFileContentHash`,
        );
      }
      return version;
    });

    const expectedVersionNumbers = versions.map((_, index) => index + 1);
    const actualVersionNumbers = versions.map(version => version.version);
    if (actualVersionNumbers.some((version, index) => version !== expectedVersionNumbers[index])) {
      throw libraryError(`${documentPath}.versions must be ordered and numbered 1..${versions.length}`);
    }
    if (versions.filter(version => version.status === 'draft').length > 1) {
      throw libraryError(`${documentPath}.versions can contain at most one draft`);
    }

    const activeVersionId = requireSafeId(
      rawDocument.activeVersionId,
      `${documentPath}.activeVersionId`,
      ContractToolError,
      'invalid-library',
    );
    if (!documentVersionIds.has(activeVersionId)) {
      throw libraryError(`${documentPath}.activeVersionId must reference a version in the same document`);
    }
    if (versions.find(version => version.versionId === activeVersionId).status === 'draft') {
      throw libraryError(`${documentPath}.activeVersionId cannot reference a draft version`);
    }

    return {
      documentId,
      title: requireString(rawDocument.title, `${documentPath}.title`, { min: 2, max: 100 }, ContractToolError, 'invalid-library'),
      targetRole: requireString(rawDocument.targetRole, `${documentPath}.targetRole`, { min: 2, max: 100 }, ContractToolError, 'invalid-library'),
      activeVersionId,
      versions,
    };
  });

  const contentHash = semanticHash({ ...library, generatedAt: undefined, traceId: undefined });
  return {
    library,
    canonicalJson: `${JSON.stringify(library, null, 2)}\n`,
    contentHash,
    summary: {
      libraryId: library.libraryId,
      schemaVersion: library.schemaVersion,
      generatedAt: library.generatedAt,
      traceId: library.traceId,
      documentCount: library.documents.length,
      versionCount: library.documents.reduce((total, document) => total + document.versions.length, 0),
      activeVersionCount: library.documents.length,
      contentHash,
    },
  };
}

function libraryPathFor(root) {
  return join(root, RESUME_LIBRARY_PATH);
}

function readLibraryFile(filePath) {
  const input = readJsonContract(filePath, { maxBytes: MAX_LIBRARY_BYTES });
  return canonicalizeResumeLibrary(input);
}

export function loadInstalledResumeLibrary(root = getCareerOpsRoot()) {
  const path = libraryPathFor(root);
  if (!existsSync(path)) return null;
  const info = lstatSync(path);
  if (!info.isFile()) {
    throw libraryError('Installed resume library is not a regular file', 'invalid-library', { path });
  }
  return readLibraryFile(path);
}

export function importResumeLibrary(filePath, { root = getCareerOpsRoot(), apply = false, replace = false } = {}) {
  if (replace && !apply) throw libraryError('--replace requires --apply', 'usage');
  const incoming = readLibraryFile(filePath);
  const target = libraryPathFor(root);
  const existing = loadInstalledResumeLibrary(root);
  const changed = !existing || existing.contentHash !== incoming.contentHash;

  if (!apply) {
    return {
      action: existing ? (changed ? 'dry-run-replace' : 'dry-run-unchanged') : 'dry-run',
      applied: false,
      libraryPath: target,
      incoming: incoming.summary,
    };
  }
  if (changed && existing && !replace) {
    throw libraryError('A different resume library already exists; add --replace to replace it.', 'different-library');
  }
  if (!changed) {
    return {
      action: 'unchanged',
      applied: true,
      changed: false,
      libraryPath: target,
      backupPath: null,
      incoming: incoming.summary,
    };
  }

  let backupPath = null;
  if (existing) {
    backupPath = backupFile(
      target,
      join(root, RESUME_LIBRARY_BACKUP_DIR),
      'resume-library',
      existing.contentHash,
      MAX_BACKUPS,
    );
  }
  writeContractFile(target, incoming.canonicalJson);
  return {
    action: existing ? 'replaced' : 'imported',
    applied: true,
    changed: true,
    libraryPath: target,
    backupPath,
    incoming: incoming.summary,
  };
}

export function inspectResumeLibrary(root = getCareerOpsRoot()) {
  try {
    const installed = loadInstalledResumeLibrary(root);
    if (!installed) {
      return { state: 'missing', available: false, documentCount: 0, versionCount: 0 };
    }
    return {
      state: 'ready',
      available: true,
      ...installed.summary,
      documents: installed.library.documents.map(document => ({
        documentId: document.documentId,
        title: document.title,
        targetRole: document.targetRole,
        activeVersionId: document.activeVersionId,
        versionCount: document.versions.length,
      })),
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

function parseArguments(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const replace = args.includes('--replace');
  const positional = args.filter(arg => !['--json', '--apply', '--replace'].includes(arg));
  if (positional.length !== 2 || !['check', 'import'].includes(positional[0])) return null;
  if (positional[0] === 'check' && (apply || replace)) return null;
  return { command: positional[0], libraryFile: positional[1], json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  if (!args) {
    console.error(`Invalid arguments.\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  try {
    if (args.command === 'check') {
      const result = readLibraryFile(args.libraryFile);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '简历版本库校验通过。',
        `Library ID: ${result.summary.libraryId}`,
        `简历线：${result.summary.documentCount} 条 / 版本：${result.summary.versionCount} 个`,
        `Trace：${result.summary.traceId}`,
        `内容哈希：${result.summary.contentHash}`,
      ].join('\n'));
      return;
    }

    const result = importResumeLibrary(args.libraryFile, {
      root: getCareerOpsRoot(),
      apply: args.apply,
      replace: args.replace,
    });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `简历版本库导入结果：${result.action}`,
      `本地文件：${result.libraryPath}`,
      `简历线：${result.incoming.documentCount} 条 / 版本：${result.incoming.versionCount} 个`,
      result.backupPath ? `替换备份：${result.backupPath}` : null,
      '本操作只保存简历线与版本目录，不修改 cv.md、简历素材、定稿计划或渲染 HTML。',
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = code === 'different-library' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
