#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { getCareerOpsRoot, resolveTrackerPathForWrite } from './path-resolver.mjs';
import { loadInstalledJobAnalysis } from './job-analysis.mjs';
import { loadInstalledResumeMaterials } from './resume-materials.mjs';
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
  requireTimestamp,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';
import {
  cell,
  normalizeCompany,
  openTrackerTransaction,
} from './tracker-utils.mjs';
import {
  isHeaderRow,
  isSeparatorRow,
  normalizeTextKey,
  parseTrackerRow,
  resolveColumns,
} from './tracker-parse.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

export const COMPANY_OPPORTUNITY_SCHEMA = 'get-yourself.company-opportunity';
export const COMPANY_OPPORTUNITY_SCHEMA_VERSION = 1;
export const COMPANY_OPPORTUNITY_PACKAGE_DIR = 'data/company-opportunities';
export const COMPANY_OPPORTUNITY_BACKUP_DIR = 'data/company-opportunities-backups';
export const INITIAL_TRACKER_STATUS = 'Evaluated';

const MAX_PACKAGE_BYTES = 128 * 1024;
const MAX_TRACKER_BYTES = 2 * 1024 * 1024;
const MAX_OPPORTUNITIES = 200;
const MAX_NODES = 50;
const MAX_BACKUPS_PER_OPPORTUNITY = 10;
const CONFIRMATIONS = new Set(['user_confirmed']);
const NODE_TYPES = new Set([
  'jd_analysis',
  'resume_adaptation',
  'submission',
  'interview',
  'offer',
  'review_sedimentation',
  'custom',
]);
const NODE_STATUSES = new Set(['todo', 'active', 'waiting', 'passed', 'failed', 'offer']);
const GENERATED_NOTE_KEYS = /^(?:opportunityId|batch|analysisId|analysisContentHash|location)=/;
const OPPORTUNITY_MARKER_RE = /(?:^|[;；])\s*opportunityId=([A-Za-z0-9._-]+)/;

const USAGE = `Usage:
  node company-opportunity.mjs check <opportunity.json> [--json]
  node company-opportunity.mjs import <opportunity.json> [--apply] [--replace] [--json]`;

const DEFAULT_TRACKER = [
  '# 求职进度表',
  '',
  '| # | 日期 | 公司 | 地点 | 岗位 | 评分 | 状态 | 简历 | 报告 | 备注 |',
  '|---|------|------|------|------|------|------|------|------|------|',
  '',
].join('\n');

function opportunityError(message, code = 'invalid-opportunity', details = {}) {
  return new ContractToolError(message, code, details);
}

function requireInitialTrackerStatus(value) {
  const text = requireString(value, '$.initialTrackerStatus', {}, ContractToolError, 'invalid-opportunity');
  if (text !== INITIAL_TRACKER_STATUS) {
    throw opportunityError(`$.initialTrackerStatus must be ${INITIAL_TRACKER_STATUS} in v1`);
  }
  return text;
}

function naturalKeyFor({ company, role, location, recruitmentBatch }) {
  return [
    normalizeCompany(company),
    normalizeTextKey(role),
    normalizeTextKey(location),
    normalizeTextKey(recruitmentBatch),
  ].join('\n');
}

function sameCompanyRole(row, opportunity) {
  const companyMatch = normalizeCompany(row.company) === normalizeCompany(opportunity.company);
  const roleMatch = normalizeTextKey(row.role) === normalizeTextKey(opportunity.role);
  return companyMatch && roleMatch;
}

function generatedNoteValue(notes, key) {
  const match = String(notes ?? '').match(new RegExp(`(?:^|[;；])\\s*${key}=([^;；]+)`));
  return match ? match[1].trim() : '';
}

function sameOpportunityIdentity(row, opportunity) {
  if (!sameCompanyRole(row, opportunity)) return false;
  const location = row.location || generatedNoteValue(row.notes, 'location') || opportunity.location;
  const batch = generatedNoteValue(row.notes, 'batch') || opportunity.recruitmentBatch;
  return normalizeTextKey(location) === normalizeTextKey(opportunity.location)
    && normalizeTextKey(batch) === normalizeTextKey(opportunity.recruitmentBatch);
}

function markerIdFor(row) {
  const match = String(row.notes ?? '').match(OPPORTUNITY_MARKER_RE);
  return match ? match[1] : null;
}

export function canonicalizeCompanyOpportunity(
  input,
  installedAnalysis,
  { allowInstalledTrackerState = false } = {},
) {
  if (!installedAnalysis) throw opportunityError('A matching installed job analysis is required.', 'analysis-missing');
  const requiredFields = [
    'schema',
    'schemaVersion',
    'opportunityId',
    'generatedAt',
    'traceId',
    'confirmation',
    'analysisId',
    'analysisContentHash',
    'company',
    'role',
    'recruitmentBatch',
    'location',
    'initialTrackerStatus',
    'processNodes',
  ];
  requireObjectWithOptional(
    input,
    '$',
    requiredFields,
    allowInstalledTrackerState ? ['trackerStatus'] : [],
    ContractToolError,
    'invalid-opportunity',
  );

  if (input.schema !== COMPANY_OPPORTUNITY_SCHEMA) {
    throw opportunityError(`$.schema must be ${COMPANY_OPPORTUNITY_SCHEMA}`);
  }
  if (input.schemaVersion !== COMPANY_OPPORTUNITY_SCHEMA_VERSION) {
    throw opportunityError(`$.schemaVersion must be ${COMPANY_OPPORTUNITY_SCHEMA_VERSION}`, 'unsupported-version');
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-opportunity');
  if (input.analysisId !== installedAnalysis.analysis.analysisId) {
    throw opportunityError('analysisId does not match the installed job analysis', 'analysis-mismatch');
  }
  if (input.analysisContentHash !== installedAnalysis.contentHash) {
    throw opportunityError(
      'analysisContentHash does not match the installed job analysis; regenerate the opportunity after the confirmed analysis.',
      'analysis-mismatch',
    );
  }

  const opportunity = {
    schema: COMPANY_OPPORTUNITY_SCHEMA,
    schemaVersion: COMPANY_OPPORTUNITY_SCHEMA_VERSION,
    opportunityId: requireSafeId(input.opportunityId, '$.opportunityId', ContractToolError, 'invalid-opportunity'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-opportunity'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-opportunity'),
    confirmation: input.confirmation,
    analysisId: installedAnalysis.analysis.analysisId,
    analysisContentHash: installedAnalysis.contentHash,
    company: requireString(input.company, '$.company', { min: 2, max: 100 }, ContractToolError, 'invalid-opportunity'),
    role: requireString(input.role, '$.role', { min: 2, max: 100 }, ContractToolError, 'invalid-opportunity'),
    recruitmentBatch: requireString(input.recruitmentBatch, '$.recruitmentBatch', { min: 1, max: 80 }, ContractToolError, 'invalid-opportunity'),
    location: requireString(input.location, '$.location', { min: 1, max: 80 }, ContractToolError, 'invalid-opportunity'),
    initialTrackerStatus: requireInitialTrackerStatus(input.initialTrackerStatus),
  };

  if (opportunity.company !== installedAnalysis.analysis.company) {
    throw opportunityError('company must exactly match the installed job analysis', 'analysis-mismatch');
  }
  if (opportunity.role !== installedAnalysis.analysis.role) {
    throw opportunityError('role must exactly match the installed job analysis', 'analysis-mismatch');
  }
  if (allowInstalledTrackerState && input.trackerStatus !== undefined) {
    opportunity.trackerStatus = requireString(
      input.trackerStatus,
      '$.trackerStatus',
      { min: 1, max: 40 },
      ContractToolError,
      'invalid-opportunity',
    );
  }

  const seenNodeIds = new Set();
  opportunity.processNodes = requireArray(input.processNodes, '$.processNodes', 1, MAX_NODES, ContractToolError, 'invalid-opportunity')
    .map((item, index) => {
      const path = `$.processNodes[${index}]`;
      requireObjectWithOptional(
        item,
        path,
        ['id', 'type', 'title', 'status'],
        ['skillKey', 'note'],
        ContractToolError,
        'invalid-opportunity',
      );
      const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-opportunity');
      if (seenNodeIds.has(id)) throw opportunityError(`${path}.id is duplicate: ${id}`);
      seenNodeIds.add(id);
      const node = {
        id,
        type: requireEnum(item.type, `${path}.type`, NODE_TYPES, ContractToolError, 'invalid-opportunity'),
        title: requireString(item.title, `${path}.title`, { min: 2, max: 80 }, ContractToolError, 'invalid-opportunity'),
        status: requireEnum(item.status, `${path}.status`, NODE_STATUSES, ContractToolError, 'invalid-opportunity'),
      };
      if (item.skillKey !== undefined) {
        node.skillKey = requireSafeId(item.skillKey, `${path}.skillKey`, ContractToolError, 'invalid-opportunity');
      }
      if (item.note !== undefined) {
        node.note = requireString(item.note, `${path}.note`, { min: 1, max: 500 }, ContractToolError, 'invalid-opportunity');
      }
      return node;
    });

  const { trackerStatus, ...confirmedOpportunity } = opportunity;
  const contentHash = semanticHash({ ...confirmedOpportunity, generatedAt: undefined });
  return {
    opportunity,
    installedAnalysis,
    canonicalJson: JSON.stringify(opportunity, null, 2),
    contentHash,
    naturalKey: naturalKeyFor(opportunity),
    summary: {
      opportunityId: opportunity.opportunityId,
      schemaVersion: opportunity.schemaVersion,
      generatedAt: opportunity.generatedAt,
      traceId: opportunity.traceId,
      analysisId: opportunity.analysisId,
      analysisContentHash: opportunity.analysisContentHash,
      company: opportunity.company,
      role: opportunity.role,
      recruitmentBatch: opportunity.recruitmentBatch,
      location: opportunity.location,
      initialTrackerStatus: opportunity.initialTrackerStatus,
      ...(opportunity.trackerStatus !== undefined ? { trackerStatus: opportunity.trackerStatus } : {}),
      nodeCount: opportunity.processNodes.length,
      contentHash,
    },
  };
}

function packagePathFor(root, opportunityId) {
  return join(root, COMPANY_OPPORTUNITY_PACKAGE_DIR, `${opportunityId}.json`);
}

function requireAnalysisForInput(root, input, materials) {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || typeof input.analysisId !== 'string') {
    throw opportunityError('$.analysisId is required before the installed analysis can be checked', 'invalid-opportunity');
  }
  requireSafeId(input.analysisId, '$.analysisId', ContractToolError, 'invalid-opportunity');
  const installed = loadInstalledJobAnalysis(root, input.analysisId, materials);
  if (!installed) throw opportunityError(`Installed job analysis not found: ${input.analysisId}`, 'analysis-missing');
  return installed;
}

function readOpportunityFile(filePath, root, materials = null, options = {}) {
  const input = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-opportunity',
  });
  const installedMaterials = materials ?? loadInstalledResumeMaterials(root);
  const installedAnalysis = requireAnalysisForInput(root, input, installedMaterials);
  return canonicalizeCompanyOpportunity(input, installedAnalysis, options);
}

function readInstalledOpportunity(root, opportunityId, materials) {
  const target = packagePathFor(root, opportunityId);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw opportunityError(`Cannot inspect company opportunity: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) {
    throw opportunityError('Installed company opportunity is not a regular file', 'invalid-opportunity', { path: target });
  }
  return readOpportunityFile(target, root, materials, { allowInstalledTrackerState: true });
}

function listInstalledOpportunities(root, materials) {
  const packageDir = join(root, COMPANY_OPPORTUNITY_PACKAGE_DIR);
  let entries;
  try {
    entries = readdirSync(packageDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw opportunityError(`Cannot list company opportunities: ${error.message}`, 'io-error', { path: packageDir });
  }
  const files = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort();
  if (files.length > MAX_OPPORTUNITIES) {
    throw opportunityError(`Too many company opportunity packages (max ${MAX_OPPORTUNITIES})`);
  }
  return files.map(name => {
    const opportunityId = requireSafeId(
      name.replace(/\.json$/, ''),
      'installed opportunity filename',
      ContractToolError,
      'invalid-opportunity',
    );
    const installed = readInstalledOpportunity(root, opportunityId, materials);
    if (installed.opportunity.opportunityId !== opportunityId) {
      throw opportunityError('Installed opportunity filename does not match opportunityId', 'invalid-opportunity');
    }
    return installed;
  });
}

function readTrackerFile(trackerPath) {
  let info;
  try {
    info = lstatSync(trackerPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw opportunityError(`Cannot inspect tracker: ${error.message}`, 'io-error', { path: trackerPath });
  }
  if (!info.isFile()) throw opportunityError('Tracker path is not a regular file', 'invalid-tracker', { path: trackerPath });
  if (info.size > MAX_TRACKER_BYTES) {
    throw opportunityError('Tracker exceeds size limit', 'invalid-tracker', { path: trackerPath });
  }
  try {
    return readFileSync(trackerPath, 'utf8');
  } catch (error) {
    throw opportunityError(`Cannot read tracker: ${error.message}`, 'io-error', { path: trackerPath });
  }
}

function trackerLines(content) {
  return content.split(/\r?\n/);
}

function parseTrackerSnapshot(content, trackerPath) {
  const lines = trackerLines(content);
  const headerLine = lines.find(line => isHeaderRow(line));
  if (!headerLine) {
    throw opportunityError('Tracker has no recognizable header row', 'invalid-tracker', { path: trackerPath });
  }
  if (!lines.some(line => isSeparatorRow(line))) {
    throw opportunityError('Tracker has no table separator row', 'invalid-tracker', { path: trackerPath });
  }
  const columns = resolveColumns(lines);
  if (columns.notes == null) {
    throw opportunityError('Tracker must have a Notes column so opportunity rows remain idempotent', 'invalid-tracker');
  }
  const headerParts = headerLine.split('|').map(value => value.trim());
  const headerWidth = Math.max(
    headerParts.length >= 2 && headerParts.at(-1) === '' ? headerParts.length - 2 : headerParts.length - 1,
    ...Object.values(columns),
  );
  const rows = [];
  for (const [index, line] of lines.entries()) {
    const row = parseTrackerRow(line, columns);
    if (row) rows.push({ ...row, lineIndex: index });
  }
  return { source: content, lines, headerLine, headerWidth, columns, rows };
}

function inspectTrackerRows(snapshot, opportunity) {
  const linkedRows = [];
  const conflicts = [];
  for (const row of snapshot.rows) {
    const markerId = markerIdFor(row);
    if (markerId === opportunity.opportunityId) {
      if (!sameOpportunityIdentity(row, opportunity)) conflicts.push(row);
      else linkedRows.push(row);
    } else if (sameOpportunityIdentity(row, opportunity)) {
      conflicts.push(row);
    }
  }
  return { linkedRows, conflicts };
}

function reportLinkFor(root, trackerPath, analysisId) {
  const target = join(root, 'reports/job-analysis', `${analysisId}.md`);
  const link = relative(dirname(trackerPath), target).replaceAll('\\', '/');
  return `[JD 分析](${link})`;
}

function generatedNotes(existingNotes, metadata) {
  const preserved = String(existingNotes ?? '')
    .split(/\s*[;；]\s*/)
    .filter(value => value && value !== '—' && value !== '-' && !GENERATED_NOTE_KEYS.test(value));
  return [...preserved, ...metadata].join('; ');
}

function buildTrackerRow({
  snapshot,
  opportunity,
  installedAnalysis,
  root,
  trackerPath,
  existingRow = null,
  userTrackerStatus = null,
  rowNumber,
}) {
  const width = Math.max(2, snapshot.headerWidth);
  const cells = new Array(width).fill('—');
  if (existingRow) {
    const previous = String(existingRow.raw).split('|').map(value => value.trim());
    for (let index = 0; index < cells.length; index += 1) {
      if (previous[index + 1] !== undefined) cells[index] = previous[index + 1];
    }
  }
  const put = (key, value) => {
    const index = snapshot.columns[key];
    if (index == null) return false;
    const at = index - 1;
    if (at < 0 || at >= cells.length) return false;
    cells[at] = cell(value);
    return true;
  };

  const report = reportLinkFor(root, trackerPath, opportunity.analysisId);
  const metadata = [
    `opportunityId=${opportunity.opportunityId}`,
    `batch=${opportunity.recruitmentBatch}`,
    `analysisId=${opportunity.analysisId}`,
    `analysisContentHash=${opportunity.analysisContentHash}`,
  ];
  if (!put('location', existingRow?.location || opportunity.location)) {
    metadata.push(`location=${opportunity.location}`);
  }
  if (!put('report', report)) metadata.push(`report=${report}`);

  put('num', existingRow?.num ?? rowNumber);
  put('date', existingRow?.date || opportunity.generatedAt.slice(0, 10));
  put('via', existingRow?.via || '—');
  put('company', opportunity.company);
  put('role', opportunity.role);
  put('score', `${installedAnalysis.analysis.assessment.recommendationStars}/5`);
  put('status', existingRow?.status || userTrackerStatus || opportunity.initialTrackerStatus);
  put('pdf', existingRow?.pdf || '—');
  if (snapshot.columns.url != null && !(existingRow?.url && existingRow.url !== '—')) {
    put('url', installedAnalysis.analysis.jd.sourceType === 'url' ? installedAnalysis.analysis.jd.url : '—');
  }
  put('notes', generatedNotes(existingRow?.notes, metadata));
  return `| ${cells.join(' | ')} |`;
}

function nextRowNumber(snapshot) {
  return snapshot.rows.reduce((maximum, row) => Math.max(maximum, row.num), 0) + 1;
}

function renderTrackerContent(content, updater) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const hadTrailingNewline = /\r?\n$/.test(content);
  const lines = trackerLines(content);
  if (lines.at(-1) === '') lines.pop();
  updater(lines);
  let output = lines.join(eol);
  if (hadTrailingNewline && !output.endsWith(eol)) output += eol;
  return output;
}

function replaceOrInsertRow(snapshot, desiredRow, existingRow) {
  return renderTrackerContent(snapshot.source, lines => {
    if (existingRow) {
      const index = lines.indexOf(existingRow.raw);
      if (index < 0) throw opportunityError('Cannot locate the existing tracker row', 'io-error');
      lines[index] = desiredRow;
      return;
    }
    let separatorIndex = -1;
    for (const [index, line] of lines.entries()) {
      if (isSeparatorRow(line)) {
        separatorIndex = index;
        break;
      }
    }
    if (separatorIndex < 0) throw opportunityError('Tracker has no table separator row', 'invalid-tracker');
    lines.splice(separatorIndex + 1, 0, desiredRow);
  });
}

function assertNoIdentityConflict(existing, incoming) {
  if (existing && existing.naturalKey !== incoming.naturalKey) {
    throw opportunityError(
      'opportunityId already belongs to a different company/role/location/batch identity; use a new opportunityId.',
      'identity-conflict',
      { existingOpportunityId: existing.opportunity.opportunityId },
    );
  }
}

function assertNoNaturalKeyDuplicate(installed, incoming) {
  const duplicate = installed.find(item => item.naturalKey === incoming.naturalKey);
  if (duplicate && duplicate.opportunity.opportunityId !== incoming.opportunity.opportunityId) {
    throw opportunityError(
      'Another company opportunity already uses this company/role/location/batch identity.',
      'identity-conflict',
      { existingOpportunityId: duplicate.opportunity.opportunityId },
    );
  }
}

function readTrackerInTransaction(transaction) {
  if (!existsSync(transaction.path)) return null;
  const info = lstatSync(transaction.path);
  if (!info.isFile()) throw opportunityError('Tracker path is not a regular file', 'invalid-tracker');
  if (info.size > MAX_TRACKER_BYTES) {
    throw opportunityError('Tracker exceeds size limit', 'invalid-tracker', { path: transaction.path });
  }
  return transaction.read();
}

export async function importCompanyOpportunity(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const trackerPath = options.trackerPath ?? resolveTrackerPathForWrite(root);
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw opportunityError('--replace requires --apply', 'usage');

  const materials = loadInstalledResumeMaterials(root);
  const incoming = readOpportunityFile(filePath, root, materials);
  const packageTarget = packagePathFor(root, incoming.opportunity.opportunityId);
  const transaction = await openTrackerTransaction(trackerPath, { tracker: trackerPath });

  try {
    const installed = listInstalledOpportunities(root, materials);
    const existing = installed.find(item => item.opportunity.opportunityId === incoming.opportunity.opportunityId) ?? null;
    assertNoIdentityConflict(existing, incoming);
    assertNoNaturalKeyDuplicate(installed, incoming);

    let trackerContent = readTrackerInTransaction(transaction);
    let createdTracker = false;
    if (trackerContent === null) {
      trackerContent = DEFAULT_TRACKER;
      createdTracker = true;
    }
    const snapshot = parseTrackerSnapshot(trackerContent, trackerPath);
    const source = trackerContent;
    const { linkedRows, conflicts } = inspectTrackerRows(snapshot, incoming.opportunity);
    if (conflicts.length > 0 || linkedRows.length > 1) {
      throw opportunityError(
        'Tracker already has an ambiguous row for this company/role; review it manually before importing.',
        'tracker-conflict',
      );
    }
    const existingRow = linkedRows[0] ?? null;
    if (!existing && existingRow) {
      throw opportunityError('Tracker has this opportunity marker but the authoritative JSON is missing', 'tracker-orphan');
    }

    const packageChange = !existing || existing.contentHash !== incoming.contentHash;
    const trackerStatus = existingRow?.status
      || existing?.opportunity.trackerStatus
      || incoming.opportunity.initialTrackerStatus;
    const trackerStateChange = Boolean(existing)
      && existing.opportunity.trackerStatus !== trackerStatus;
    const persistedOpportunity = { ...incoming.opportunity, trackerStatus };
    let desiredTracker = source;
    let trackerChange = false;
    let rowAction = 'none';
    if (!packageChange && existingRow) {
      // A later tracker status is user-owned; an unchanged opportunity must never reset it.
    } else {
      const desiredRow = buildTrackerRow({
        snapshot,
        opportunity: incoming.opportunity,
        installedAnalysis: incoming.installedAnalysis,
        root,
        trackerPath,
        existingRow,
        userTrackerStatus: trackerStatus,
        rowNumber: nextRowNumber(snapshot),
      });
      desiredTracker = replaceOrInsertRow(snapshot, desiredRow, existingRow);
      trackerChange = desiredTracker !== source;
      rowAction = existingRow ? 'update' : 'add';
    }

    if (!apply) {
      return {
        action: existing
          ? (
            packageChange
              ? 'dry-run-replace'
              : trackerStateChange
                ? 'dry-run-tracker-state-synced'
                : existingRow ? 'dry-run-unchanged' : 'dry-run'
          )
          : 'dry-run',
        applied: false,
        packagePath: packageTarget,
        trackerPath,
        trackerAction: createdTracker ? 'create-and-add-row' : rowAction,
        desiredTracker,
        incoming: incoming.summary,
      };
    }
    if (packageChange && existing && !replace) {
      throw opportunityError('A different company opportunity package already exists; add --replace to replace it.', 'different-opportunity');
    }

    const backupPaths = { package: null, tracker: null };
    const backupDir = join(root, COMPANY_OPPORTUNITY_BACKUP_DIR, incoming.opportunity.opportunityId);
    if ((packageChange || trackerStateChange) && existing) {
      backupPaths.package = backupFile(
        packageTarget,
        backupDir,
        'company-opportunity-package',
        existing.contentHash,
        MAX_BACKUPS_PER_OPPORTUNITY,
      );
    }
    if (trackerChange && !createdTracker) {
      backupPaths.tracker = backupFile(
        transaction.path,
        backupDir,
        'company-opportunity-tracker',
        semanticHash(source),
        MAX_BACKUPS_PER_OPPORTUNITY,
      );
    }

    if (packageChange || trackerStateChange) {
      writeContractFile(packageTarget, `${JSON.stringify(persistedOpportunity, null, 2)}\n`);
    }
    if (trackerChange || createdTracker) transaction.replace(desiredTracker);
    const changed = packageChange || trackerStateChange || trackerChange || createdTracker;
    return {
      action: !existing
        ? 'imported'
        : packageChange
          ? 'replaced'
          : trackerStateChange
            ? 'tracker-state-synced'
            : trackerChange
              ? 'tracker-repaired'
              : 'unchanged',
      applied: true,
      changed,
      packagePath: packageTarget,
      trackerPath,
      trackerAction: createdTracker ? 'create-and-add-row' : rowAction,
      backupPaths,
      incoming: incoming.summary,
    };
  } finally {
    transaction.close();
  }
}

export function inspectCompanyOpportunities(root = getCareerOpsRoot()) {
  try {
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) {
      return { state: 'blocked', available: false, reason: 'resume-materials-missing' };
    }
    const opportunities = listInstalledOpportunities(root, materials);
    if (opportunities.length === 0) {
      return {
        state: 'missing',
        available: false,
        opportunityCount: 0,
        opportunities: [],
        trackerPath: resolveTrackerPathForWrite(root),
      };
    }
    const trackerPath = resolveTrackerPathForWrite(root);
    const trackerContent = readTrackerFile(trackerPath);
    const tracker = trackerContent === null
      ? null
      : parseTrackerSnapshot(trackerContent, trackerPath);
    const summaries = opportunities.map(item => {
      let trackerState = 'missing';
      let trackerRowNumber = null;
      let trackerStatus = null;
      if (tracker) {
        const rows = inspectTrackerRows(tracker, item.opportunity);
        if (rows.linkedRows.length === 1 && rows.conflicts.length === 0) {
          trackerState = 'linked';
          trackerRowNumber = rows.linkedRows[0].num;
          trackerStatus = rows.linkedRows[0].status;
        } else if (rows.linkedRows.length > 1 || rows.conflicts.length > 0) {
          trackerState = 'conflict';
        }
      }
      return {
        ...item.summary,
        trackerState,
        trackerRowNumber,
        installedTrackerStatus: item.opportunity.trackerStatus ?? null,
        trackerStatus,
      };
    });
    return {
      state: 'ready',
      available: true,
      opportunityCount: summaries.length,
      opportunities: summaries,
      trackerPath,
      trackerState: trackerContent === null ? 'missing' : 'ready',
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
  return { command: positional[0], packageFile: positional[1], json, apply, replace };
}

async function main() {
  const args = parseArguments(process.argv);
  if (!args) {
    console.error(`Invalid arguments.\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  try {
    const root = getCareerOpsRoot();
    if (args.command === 'check') {
      const result = readOpportunityFile(args.packageFile, root);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '公司机会包校验通过。',
        `Opportunity ID: ${result.summary.opportunityId}`,
        `公司岗位：${result.summary.company} — ${result.summary.role}`,
        `招聘批次：${result.summary.recruitmentBatch} / ${result.summary.location}`,
        `岗位分析：${result.summary.analysisId}（${result.summary.analysisContentHash}）`,
        `初始流程节点：${result.summary.nodeCount} 个`,
        `内容哈希：${result.summary.contentHash}`,
      ].join('\n'));
      return;
    }

    const result = await importCompanyOpportunity(args.packageFile, {
      root,
      apply: args.apply,
      replace: args.replace,
    });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `公司机会导入结果：${result.action}`,
      `机会对象：${result.packagePath}`,
      `投递清单：${result.trackerPath}（${result.trackerAction}）`,
      `公司岗位：${result.incoming.company} — ${result.incoming.role}`,
      `招聘批次：${result.incoming.recruitmentBatch} / ${result.incoming.location}`,
      result.backupPaths?.package ? `机会备份：${result.backupPaths.package}` : null,
      result.backupPaths?.tracker ? `清单备份：${result.backupPaths.tracker}` : null,
      '本操作只写本地机会对象和投递清单，不上传、不投递、不挂载产物。',
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = ['different-opportunity', 'identity-conflict', 'tracker-conflict', 'tracker-orphan'].includes(code) ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  void main();
}
