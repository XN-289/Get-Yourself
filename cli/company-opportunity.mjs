#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
export const COMPANY_OPPORTUNITY_NODE_SCHEMA = 'get-yourself.company-opportunity-node-mutation';
export const COMPANY_OPPORTUNITY_NODE_SCHEMA_VERSION = 1;
export const COMPANY_OPPORTUNITY_ARTIFACT_SCHEMA = 'get-yourself.company-opportunity-artifact-mount';
export const COMPANY_OPPORTUNITY_ARTIFACT_SCHEMA_VERSION = 1;
export const COMPANY_OPPORTUNITY_PACKAGE_DIR = 'data/company-opportunities';
export const COMPANY_OPPORTUNITY_BACKUP_DIR = 'data/company-opportunities-backups';
export const COMPANY_OPPORTUNITY_MUTATION_DIR = 'data/company-opportunity-mutations';
export const COMPANY_OPPORTUNITY_ARTIFACT_MOUNT_DIR = 'data/company-opportunity-artifact-mounts';
export const INITIAL_TRACKER_STATUS = 'Evaluated';

const MAX_PACKAGE_BYTES = 128 * 1024;
const MAX_TRACKER_BYTES = 2 * 1024 * 1024;
const MAX_OPPORTUNITIES = 200;
const MAX_NODES = 50;
const MAX_BACKUPS_PER_OPPORTUNITY = 10;
const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
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
const ARTIFACT_KINDS = new Set([
  'job_analysis',
  'resume_render',
  'interview_prep',
  'interview_review',
  'capability_feedback',
]);
const ARTIFACT_KIND_PREFIXES = new Map([
  ['job_analysis', ['data/job-analysis/', 'reports/job-analysis/']],
  ['resume_render', ['data/resume-render/', 'output/resume/']],
  ['interview_prep', ['data/interview-prep/', 'interview-prep/']],
  ['interview_review', ['data/interview-review/', 'interview-prep/sessions/']],
  ['capability_feedback', ['data/capability-feedback/', 'reports/capability-feedback/']],
]);
const ARTIFACT_NODE_TYPES = new Map([
  ['job_analysis', new Set(['jd_analysis', 'custom'])],
  ['resume_render', new Set(['resume_adaptation', 'submission', 'custom'])],
  ['interview_prep', new Set(['interview', 'custom'])],
  ['interview_review', new Set(['interview', 'review_sedimentation', 'custom'])],
  ['capability_feedback', new Set(['review_sedimentation', 'custom'])],
]);
const GENERATED_NOTE_KEYS = /^(?:opportunityId|batch|analysisId|analysisContentHash|location)=/;
const OPPORTUNITY_MARKER_RE = /(?:^|[;；])\s*opportunityId=([A-Za-z0-9._-]+)/;

const USAGE = `Usage:
  node company-opportunity.mjs check <opportunity.json> [--json]
  node company-opportunity.mjs import <opportunity.json> [--apply] [--replace] [--json]
  node company-opportunity.mjs check-nodes <node-mutation.json> [--json]
  node company-opportunity.mjs mutate-nodes <node-mutation.json> [--apply] [--json]
  node company-opportunity.mjs check-artifact <artifact-mount.json> [--json]
  node company-opportunity.mjs mount-artifact <artifact-mount.json> [--apply] [--json]`;

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

function requireContentHash(value, path, errorCode = 'invalid-node-mutation') {
  const text = requireString(value, path, { min: 71, max: 71 }, ContractToolError, errorCode);
  if (!CONTENT_HASH_PATTERN.test(text)) {
    throw new ContractToolError(`${path} must be a sha256 content hash`, errorCode, { path });
  }
  return text;
}

function artifactError(message, code = 'invalid-artifact-mount', details = {}) {
  return new ContractToolError(message, code, details);
}

function canonicalizeArtifact(value, path, { requireMountId = false } = {}) {
  requireObjectWithOptional(
    value,
    path,
    ['kind', 'title', 'path', 'contentHash', ...(requireMountId ? ['mountId'] : [])],
    [],
    ContractToolError,
    'invalid-artifact-mount',
  );
  const artifact = {
    kind: requireEnum(value.kind, `${path}.kind`, ARTIFACT_KINDS, ContractToolError, 'invalid-artifact-mount'),
    title: requireString(value.title, `${path}.title`, { min: 2, max: 80 }, ContractToolError, 'invalid-artifact-mount'),
    path: requireString(value.path, `${path}.path`, { min: 5, max: 240 }, ContractToolError, 'invalid-artifact-mount'),
    contentHash: requireContentHash(value.contentHash, `${path}.contentHash`, 'invalid-artifact-mount'),
  };
  if (requireMountId) {
    artifact.mountId = requireSafeId(value.mountId, `${path}.mountId`, ContractToolError, 'invalid-artifact-mount');
  }
  return artifact;
}

function normalizeArtifactPath(value, path = '$.artifact.path') {
  const text = requireString(value, path, { min: 5, max: 240 }, ContractToolError, 'invalid-artifact-mount');
  if (text.includes('\\')) {
    throw artifactError(`${path} must use /-separated paths relative to the local data root`);
  }
  const segments = text.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw artifactError(`${path} must be a normalized relative path without . or .. segments`);
  }
  return text;
}

function artifactPathFor(root, path) {
  const target = join(root, path);
  const relativePath = relative(resolve(root), resolve(target)).replaceAll('\\', '/');
  if (
    !relativePath
    || relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || !relativePath.startsWith(path)
  ) {
    throw artifactError('artifact path must stay inside the approved local artifact directories', 'invalid-artifact-path', {
      path,
    });
  }
  return target;
}

function assertArtifactKindPath(kind, path) {
  const prefixes = ARTIFACT_KIND_PREFIXES.get(kind) ?? [];
  if (!prefixes.some(prefix => path.startsWith(prefix))) {
    throw artifactError(
      `A ${kind} artifact must be stored under one of: ${prefixes.join(', ')}`,
      'invalid-artifact-path',
      { path },
    );
  }
}

function verifyArtifactFile(root, artifact) {
  const path = normalizeArtifactPath(artifact.path);
  assertArtifactKindPath(artifact.kind, path);
  const target = artifactPathFor(root, path);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw artifactError('Artifact file is missing', 'artifact-missing', { path });
    }
    throw artifactError(`Cannot inspect artifact file: ${error.message}`, 'io-error', { path });
  }
  if (!info.isFile()) {
    throw artifactError('Artifact path is not a regular file', 'invalid-artifact-path', { path });
  }
  if (info.size > MAX_ARTIFACT_BYTES) {
    throw artifactError(`Artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`, 'artifact-too-large', { path });
  }
  let bytes;
  try {
    bytes = readFileSync(target);
  } catch (error) {
    throw artifactError(`Cannot read artifact file: ${error.message}`, 'io-error', { path });
  }
  const actualHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actualHash !== artifact.contentHash) {
    throw artifactError('Artifact changed after the mount plan was drafted', 'artifact-changed', {
      path,
      expectedContentHash: artifact.contentHash,
      actualContentHash: actualHash,
    });
  }
  return { path, absolutePath: target, size: info.size, contentHash: actualHash };
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
  { allowInstalledTrackerState = false, allowInstalledArtifacts = false } = {},
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
  const seenArtifactMountIds = new Set();
  const seenArtifactPaths = new Set();
  opportunity.processNodes = requireArray(input.processNodes, '$.processNodes', 1, MAX_NODES, ContractToolError, 'invalid-opportunity')
    .map((item, index) => {
      const path = `$.processNodes[${index}]`;
      requireObjectWithOptional(
        item,
        path,
        ['id', 'type', 'title', 'status'],
        ['skillKey', 'note', ...(allowInstalledArtifacts ? ['artifacts'] : [])],
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
      if (allowInstalledArtifacts && item.artifacts !== undefined) {
        const artifacts = requireArray(
          item.artifacts,
          `${path}.artifacts`,
          0,
          20,
          ContractToolError,
          'invalid-opportunity',
        );
        node.artifacts = artifacts.map((artifact, artifactIndex) => {
          const canonical = canonicalizeArtifact(artifact, `${path}.artifacts[${artifactIndex}]`, {
            requireMountId: true,
          });
          const normalized = {
            ...canonical,
            path: normalizeArtifactPath(canonical.path, `${path}.artifacts[${artifactIndex}].path`),
          };
          assertArtifactKindPath(normalized.kind, normalized.path);
          const allowedNodeTypes = ARTIFACT_NODE_TYPES.get(normalized.kind);
          if (!allowedNodeTypes.has(node.type)) {
            throw opportunityError(
              `A ${normalized.kind} artifact cannot be mounted on a ${node.type} node`,
              'invalid-opportunity',
            );
          }
          if (seenArtifactMountIds.has(normalized.mountId)) {
            throw opportunityError(`${path}.artifacts[${artifactIndex}].mountId is duplicate: ${normalized.mountId}`);
          }
          if (seenArtifactPaths.has(normalized.path)) {
            throw opportunityError(`${path}.artifacts[${artifactIndex}].path is duplicate`);
          }
          seenArtifactMountIds.add(normalized.mountId);
          seenArtifactPaths.add(normalized.path);
          return normalized;
        });
        if (node.artifacts.length === 0) delete node.artifacts;
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

export function canonicalizeCompanyOpportunityNodeMutation(input, installedOpportunity) {
  if (!installedOpportunity) {
    throw new ContractToolError('An installed company opportunity is required.', 'opportunity-missing');
  }
  const requiredFields = [
    'schema',
    'schemaVersion',
    'mutationId',
    'opportunityId',
    'generatedAt',
    'traceId',
    'confirmation',
    'expectedOpportunityContentHash',
    'changeSummary',
    'processNodes',
  ];
  requireObjectWithOptional(
    input,
    '$',
    requiredFields,
    [],
    ContractToolError,
    'invalid-node-mutation',
  );
  if (input.schema !== COMPANY_OPPORTUNITY_NODE_SCHEMA) {
    throw new ContractToolError(`$.schema must be ${COMPANY_OPPORTUNITY_NODE_SCHEMA}`, 'invalid-node-mutation');
  }
  if (input.schemaVersion !== COMPANY_OPPORTUNITY_NODE_SCHEMA_VERSION) {
    throw new ContractToolError(`$.schemaVersion must be ${COMPANY_OPPORTUNITY_NODE_SCHEMA_VERSION}`, 'unsupported-version');
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-node-mutation');
  const plan = {
    schema: COMPANY_OPPORTUNITY_NODE_SCHEMA,
    schemaVersion: COMPANY_OPPORTUNITY_NODE_SCHEMA_VERSION,
    mutationId: requireSafeId(input.mutationId, '$.mutationId', ContractToolError, 'invalid-node-mutation'),
    opportunityId: requireSafeId(input.opportunityId, '$.opportunityId', ContractToolError, 'invalid-node-mutation'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-node-mutation'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-node-mutation'),
    confirmation: input.confirmation,
    expectedOpportunityContentHash: requireContentHash(input.expectedOpportunityContentHash, '$.expectedOpportunityContentHash'),
    changeSummary: requireString(
      input.changeSummary,
      '$.changeSummary',
      { min: 2, max: 500 },
      ContractToolError,
      'invalid-node-mutation',
    ),
  };
  if (plan.opportunityId !== installedOpportunity.opportunity.opportunityId) {
    throw new ContractToolError(
      'opportunityId does not match the installed company opportunity',
      'opportunity-mismatch',
    );
  }
  requireArray(input.processNodes, '$.processNodes', 1, MAX_NODES, ContractToolError, 'invalid-node-mutation');
  input.processNodes.forEach((item, index) => {
    requireObjectWithOptional(
      item,
      `$.processNodes[${index}]`,
      ['id', 'type', 'title', 'status'],
      ['skillKey', 'note'],
      ContractToolError,
      'invalid-node-mutation',
    );
  });
  const desired = canonicalizeCompanyOpportunity(
    {
      ...installedOpportunity.opportunity,
      processNodes: mergeInstalledArtifacts(input.processNodes, installedOpportunity.opportunity.processNodes),
    },
    installedOpportunity.installedAnalysis,
    { allowInstalledTrackerState: true, allowInstalledArtifacts: true },
  );
  plan.processNodes = desired.opportunity.processNodes;
  const contentHash = semanticHash({ ...plan, generatedAt: undefined });
  return {
    plan,
    desired,
    canonicalJson: JSON.stringify(plan, null, 2),
    contentHash,
    summary: {
      ...plan,
      nodeCount: desired.opportunity.processNodes.length,
      resultingOpportunityContentHash: desired.contentHash,
      planContentHash: contentHash,
    },
  };
}

export function canonicalizeCompanyOpportunityArtifactMount(input, installedOpportunity, root) {
  if (!installedOpportunity) {
    throw new ContractToolError('An installed company opportunity is required.', 'opportunity-missing');
  }
  const requiredFields = [
    'schema',
    'schemaVersion',
    'mountId',
    'opportunityId',
    'nodeId',
    'generatedAt',
    'traceId',
    'confirmation',
    'expectedOpportunityContentHash',
    'artifact',
  ];
  requireObjectWithOptional(
    input,
    '$',
    requiredFields,
    [],
    ContractToolError,
    'invalid-artifact-mount',
  );
  if (input.schema !== COMPANY_OPPORTUNITY_ARTIFACT_SCHEMA) {
    throw new ContractToolError(
      `$.schema must be ${COMPANY_OPPORTUNITY_ARTIFACT_SCHEMA}`,
      'invalid-artifact-mount',
    );
  }
  if (input.schemaVersion !== COMPANY_OPPORTUNITY_ARTIFACT_SCHEMA_VERSION) {
    throw new ContractToolError('$.schemaVersion must be 1', 'unsupported-version');
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-artifact-mount');
  const plan = {
    schema: COMPANY_OPPORTUNITY_ARTIFACT_SCHEMA,
    schemaVersion: COMPANY_OPPORTUNITY_ARTIFACT_SCHEMA_VERSION,
    mountId: requireSafeId(input.mountId, '$.mountId', ContractToolError, 'invalid-artifact-mount'),
    opportunityId: requireSafeId(input.opportunityId, '$.opportunityId', ContractToolError, 'invalid-artifact-mount'),
    nodeId: requireSafeId(input.nodeId, '$.nodeId', ContractToolError, 'invalid-artifact-mount'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-artifact-mount'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-artifact-mount'),
    confirmation: input.confirmation,
    expectedOpportunityContentHash: requireContentHash(
      input.expectedOpportunityContentHash,
      '$.expectedOpportunityContentHash',
      'invalid-artifact-mount',
    ),
    artifact: canonicalizeArtifact(input.artifact, '$.artifact'),
  };
  plan.artifact.path = normalizeArtifactPath(plan.artifact.path);
  if (plan.opportunityId !== installedOpportunity.opportunity.opportunityId) {
    throw new ContractToolError(
      'opportunityId does not match the installed company opportunity',
      'opportunity-mismatch',
    );
  }
  const node = installedOpportunity.opportunity.processNodes.find(item => item.id === plan.nodeId);
  if (!node) {
    throw new ContractToolError('nodeId does not exist in the installed company opportunity', 'node-missing');
  }
  const allowedNodeTypes = ARTIFACT_NODE_TYPES.get(plan.artifact.kind);
  if (!allowedNodeTypes.has(node.type)) {
    throw new ContractToolError(
      `A ${plan.artifact.kind} artifact cannot be mounted on a ${node.type} node`,
      'invalid-artifact-node',
    );
  }
  const verified = verifyArtifactFile(root, plan.artifact);
  const contentHash = semanticHash({ ...plan, generatedAt: undefined });
  return {
    plan,
    installedOpportunity,
    verifiedArtifact: verified,
    canonicalJson: JSON.stringify(plan, null, 2),
    contentHash,
    summary: {
      ...plan,
      artifactBytes: verified.size,
      planContentHash: contentHash,
    },
  };
}

function mergeInstalledArtifacts(processNodes, installedNodes) {
  const artifactsByNodeId = new Map(
    installedNodes
      .filter(node => Array.isArray(node.artifacts))
      .map(node => [node.id, node.artifacts]),
  );
  return processNodes.map(node => (
    artifactsByNodeId.has(node.id)
      ? { ...node, artifacts: artifactsByNodeId.get(node.id) }
      : node
  ));
}

function packagePathFor(root, opportunityId) {
  return join(root, COMPANY_OPPORTUNITY_PACKAGE_DIR, `${opportunityId}.json`);
}

function mutationPathFor(root, opportunityId, mutationId) {
  return join(root, COMPANY_OPPORTUNITY_MUTATION_DIR, opportunityId, `${mutationId}.json`);
}

function artifactMountPathFor(root, opportunityId, mountId) {
  return join(root, COMPANY_OPPORTUNITY_ARTIFACT_MOUNT_DIR, opportunityId, `${mountId}.json`);
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

export function loadCompanyOpportunity(root, opportunityId, materials = loadInstalledResumeMaterials(root)) {
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
  return readOpportunityFile(target, root, materials, {
    allowInstalledTrackerState: true,
    allowInstalledArtifacts: true,
  });
}

function readInstalledOpportunity(root, opportunityId, materials) {
  return loadCompanyOpportunity(root, opportunityId, materials);
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

function readNodeMutationFile(filePath, root, materials) {
  const input = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-node-mutation',
  });
  const opportunityId = input === null || typeof input !== 'object' || Array.isArray(input) || typeof input.opportunityId !== 'string'
    ? ''
    : input.opportunityId;
  if (!opportunityId) {
    throw new ContractToolError('$.opportunityId is required', 'invalid-node-mutation');
  }
  requireSafeId(opportunityId, '$.opportunityId', ContractToolError, 'invalid-node-mutation');
  const installed = loadCompanyOpportunity(root, opportunityId, materials);
  if (!installed) {
    throw new ContractToolError(`Installed company opportunity not found: ${opportunityId}`, 'opportunity-missing');
  }
  return canonicalizeCompanyOpportunityNodeMutation(input, installed);
}

function readInstalledMutationRecord(filePath, mutation) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new ContractToolError(`Cannot read installed mutation record: ${error.message}`, 'io-error', { path: filePath });
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch (error) {
    throw new ContractToolError(`Installed mutation record is not valid JSON: ${error.message}`, 'invalid-mutation-record', { path: filePath });
  }
  if (
    record === null
    || typeof record !== 'object'
    || Array.isArray(record)
    || record.mutationId !== mutation.plan.mutationId
    || record.opportunityId !== mutation.plan.opportunityId
    || record.planContentHash !== mutation.contentHash
  ) {
    throw new ContractToolError(
      'mutationId already belongs to a different node mutation plan',
      'mutation-conflict',
      { path: filePath },
    );
  }
  return record;
}

export async function mutateCompanyOpportunityNodes(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const trackerPath = options.trackerPath ?? resolveTrackerPathForWrite(root);
  const apply = options.apply === true;
  const transaction = await openTrackerTransaction(trackerPath, { tracker: trackerPath });

  try {
    const materials = loadInstalledResumeMaterials(root);
    const current = readNodeMutationFile(filePath, root, materials);
    const packageTarget = packagePathFor(root, current.plan.opportunityId);
    const mutationTarget = mutationPathFor(
      root,
      current.plan.opportunityId,
      current.plan.mutationId,
    );
    let existingRecord = null;
    if (existsSync(mutationTarget)) {
      const info = lstatSync(mutationTarget);
      if (!info.isFile()) {
        throw new ContractToolError('Installed mutation record is not a regular file', 'invalid-mutation-record', {
          path: mutationTarget,
        });
      }
      existingRecord = readInstalledMutationRecord(mutationTarget, current);
    }

    // Re-read under the shared tracker lock so opportunity mutations serialize with imports.
    const installed = loadCompanyOpportunity(root, current.plan.opportunityId, materials);
    if (!installed) {
      throw new ContractToolError(
        `Installed company opportunity not found: ${current.plan.opportunityId}`,
        'opportunity-missing',
      );
    }
    const desired = canonicalizeCompanyOpportunity(
      {
        ...installed.opportunity,
        processNodes: mergeInstalledArtifacts(
          current.desired.opportunity.processNodes,
          installed.opportunity.processNodes,
        ),
      },
      installed.installedAnalysis,
      { allowInstalledTrackerState: true, allowInstalledArtifacts: true },
    );
    const nodesAlreadyCurrent = JSON.stringify(installed.opportunity.processNodes)
      === JSON.stringify(desired.opportunity.processNodes);
    if (
      !nodesAlreadyCurrent
      && existingRecord === null
      && installed.contentHash !== current.plan.expectedOpportunityContentHash
    ) {
      throw new ContractToolError(
        'The company opportunity changed after this node mutation was drafted; regenerate the plan.',
        'stale-opportunity',
        {
          expectedContentHash: current.plan.expectedOpportunityContentHash,
          currentContentHash: installed.contentHash,
        },
      );
    }

    if (existingRecord && !nodesAlreadyCurrent) {
      return {
        action: 'superseded',
        applied: true,
        changed: false,
        packagePath: packageTarget,
        mutationPath: mutationTarget,
        trackerPath,
        trackerAction: 'none',
        backupPath: null,
        plan: current.summary,
      };
    }

    if (!apply) {
      return {
        action: existingRecord
          ? (nodesAlreadyCurrent ? 'dry-run-unchanged' : 'dry-run-superseded')
          : 'dry-run',
        applied: false,
        packagePath: packageTarget,
        mutationPath: mutationTarget,
        trackerPath,
        trackerAction: 'none',
        plan: current.summary,
      };
    }

    let backupPath = null;
    let packageChanged = false;
    let recordAdded = existingRecord === null;
    if (!nodesAlreadyCurrent) {
      backupPath = backupFile(
        packageTarget,
        join(root, COMPANY_OPPORTUNITY_BACKUP_DIR, installed.opportunity.opportunityId),
        'company-opportunity-package',
        installed.contentHash,
        MAX_BACKUPS_PER_OPPORTUNITY,
      );
      writeContractFile(
        packageTarget,
        `${JSON.stringify(desired.opportunity, null, 2)}\n`,
      );
      packageChanged = true;
    }
    if (recordAdded) {
      const record = {
        ...current.plan,
        planContentHash: current.contentHash,
        resultingOpportunityContentHash: desired.contentHash,
      };
      writeContractFile(mutationTarget, `${JSON.stringify(record, null, 2)}\n`);
    }

    return {
      action: existingRecord
        ? (nodesAlreadyCurrent ? 'unchanged' : 'superseded')
        : (packageChanged ? 'mutated' : 'mutation-record-completed'),
      applied: true,
      changed: packageChanged || recordAdded,
      packagePath: packageTarget,
      mutationPath: mutationTarget,
      trackerPath,
      trackerAction: 'none',
      backupPath,
      plan: current.summary,
    };
  } finally {
    transaction.close();
  }
}

function readArtifactMountFile(filePath, root, materials) {
  const input = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-artifact-mount',
  });
  const opportunityId = input === null || typeof input !== 'object' || Array.isArray(input) || typeof input.opportunityId !== 'string'
    ? ''
    : input.opportunityId;
  if (!opportunityId) {
    throw new ContractToolError('$.opportunityId is required', 'invalid-artifact-mount');
  }
  requireSafeId(opportunityId, '$.opportunityId', ContractToolError, 'invalid-artifact-mount');
  const installed = loadCompanyOpportunity(root, opportunityId, materials);
  if (!installed) {
    throw new ContractToolError(`Installed company opportunity not found: ${opportunityId}`, 'opportunity-missing');
  }
  return canonicalizeCompanyOpportunityArtifactMount(input, installed, root);
}

function readInstalledArtifactMountRecord(filePath, mount) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new ContractToolError(`Cannot read installed artifact mount record: ${error.message}`, 'io-error', {
      path: filePath,
    });
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch (error) {
    throw new ContractToolError(
      `Installed artifact mount record is not valid JSON: ${error.message}`,
      'invalid-mount-record',
      { path: filePath },
    );
  }
  if (
    record === null
    || typeof record !== 'object'
    || Array.isArray(record)
    || record.mountId !== mount.plan.mountId
    || record.opportunityId !== mount.plan.opportunityId
    || record.planContentHash !== mount.contentHash
  ) {
    throw new ContractToolError(
      'mountId already belongs to a different artifact mount plan',
      'mount-conflict',
      { path: filePath },
    );
  }
  return record;
}

function sameArtifact(left, right) {
  return left.kind === right.kind
    && left.title === right.title
    && left.path === right.path
    && left.contentHash === right.contentHash
    && left.mountId === right.mountId;
}

export async function mountCompanyOpportunityArtifact(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const trackerPath = options.trackerPath ?? resolveTrackerPathForWrite(root);
  const apply = options.apply === true;
  const transaction = await openTrackerTransaction(trackerPath, { tracker: trackerPath });

  try {
    const materials = loadInstalledResumeMaterials(root);
    const current = readArtifactMountFile(filePath, root, materials);
    const packageTarget = packagePathFor(root, current.plan.opportunityId);
    const mountTarget = artifactMountPathFor(
      root,
      current.plan.opportunityId,
      current.plan.mountId,
    );
    let existingRecord = null;
    if (existsSync(mountTarget)) {
      const info = lstatSync(mountTarget);
      if (!info.isFile()) {
        throw new ContractToolError('Installed artifact mount record is not a regular file', 'invalid-mount-record', {
          path: mountTarget,
        });
      }
      existingRecord = readInstalledArtifactMountRecord(mountTarget, current);
    }

    // Re-read and re-verify under the shared tracker lock so mounts serialize with other opportunity writes.
    const installed = loadCompanyOpportunity(root, current.plan.opportunityId, materials);
    if (!installed) {
      throw new ContractToolError(
        `Installed company opportunity not found: ${current.plan.opportunityId}`,
        'opportunity-missing',
      );
    }
    const verifiedArtifact = verifyArtifactFile(root, current.plan.artifact);
    const currentNode = installed.opportunity.processNodes.find(node => node.id === current.plan.nodeId);
    if (!currentNode) {
      throw new ContractToolError(
        'nodeId no longer exists in the installed company opportunity',
        'node-missing',
      );
    }
    const desiredArtifact = { mountId: current.plan.mountId, ...current.plan.artifact };
    const existingArtifact = currentNode.artifacts?.find(artifact => artifact.mountId === current.plan.mountId);
    if (
      existingArtifact
      && !sameArtifact(existingArtifact, desiredArtifact)
    ) {
      throw new ContractToolError(
        'mountId already belongs to a different mounted artifact',
        'mount-conflict',
      );
    }
    const artifactAlreadyCurrent = Boolean(existingArtifact);
    if (
      !artifactAlreadyCurrent
      && existingRecord === null
      && installed.contentHash !== current.plan.expectedOpportunityContentHash
    ) {
      throw new ContractToolError(
        'The company opportunity changed after this artifact mount was drafted; regenerate the plan.',
        'stale-opportunity',
        {
          expectedContentHash: current.plan.expectedOpportunityContentHash,
          currentContentHash: installed.contentHash,
        },
      );
    }

    if (existingRecord && !artifactAlreadyCurrent) {
      return {
        action: 'superseded',
        applied: true,
        changed: false,
        packagePath: packageTarget,
        mountPath: mountTarget,
        trackerPath,
        trackerAction: 'none',
        backupPath: null,
        plan: current.summary,
      };
    }

    if (!apply) {
      return {
        action: existingRecord
          ? (artifactAlreadyCurrent ? 'dry-run-unchanged' : 'dry-run-superseded')
          : 'dry-run',
        applied: false,
        packagePath: packageTarget,
        mountPath: mountTarget,
        trackerPath,
        trackerAction: 'none',
        plan: current.summary,
      };
    }

    let backupPath = null;
    let packageChanged = false;
    const recordAdded = existingRecord === null;
    let desired = installed;
    if (!artifactAlreadyCurrent) {
      desired = canonicalizeCompanyOpportunity(
        {
          ...installed.opportunity,
          processNodes: installed.opportunity.processNodes.map(node => (
            node.id === current.plan.nodeId
              ? { ...node, artifacts: [...(node.artifacts ?? []), desiredArtifact] }
              : node
          )),
        },
        installed.installedAnalysis,
        { allowInstalledTrackerState: true, allowInstalledArtifacts: true },
      );
      backupPath = backupFile(
        packageTarget,
        join(root, COMPANY_OPPORTUNITY_BACKUP_DIR, installed.opportunity.opportunityId),
        'company-opportunity-package',
        installed.contentHash,
        MAX_BACKUPS_PER_OPPORTUNITY,
      );
      writeContractFile(packageTarget, `${JSON.stringify(desired.opportunity, null, 2)}\n`);
      packageChanged = true;
    }
    if (recordAdded) {
      const record = {
        ...current.plan,
        artifactBytes: verifiedArtifact.size,
        planContentHash: current.contentHash,
        resultingOpportunityContentHash: desired.contentHash,
      };
      writeContractFile(mountTarget, `${JSON.stringify(record, null, 2)}\n`);
    }

    return {
      action: existingRecord
        ? (artifactAlreadyCurrent ? 'unchanged' : 'superseded')
        : (packageChanged ? 'mounted' : 'mount-record-completed'),
      applied: true,
      changed: packageChanged || recordAdded,
      packagePath: packageTarget,
      mountPath: mountTarget,
      trackerPath,
      trackerAction: 'none',
      backupPath,
      plan: current.summary,
    };
  } finally {
    transaction.close();
  }
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

    const effectiveIncoming = existing
      ? canonicalizeCompanyOpportunity(
        {
          ...incoming.opportunity,
          processNodes: mergeInstalledArtifacts(
            incoming.opportunity.processNodes,
            existing.opportunity.processNodes,
          ),
        },
        incoming.installedAnalysis,
        {
          allowInstalledTrackerState: Boolean(existing.opportunity.trackerStatus),
          allowInstalledArtifacts: true,
        },
      )
      : incoming;
    const packageChange = !existing || existing.contentHash !== effectiveIncoming.contentHash;
    const trackerStatus = existingRow?.status
      || existing?.opportunity.trackerStatus
      || incoming.opportunity.initialTrackerStatus;
    const trackerStateChange = Boolean(existing)
      && existing.opportunity.trackerStatus !== trackerStatus;
    const persistedOpportunity = { ...effectiveIncoming.opportunity, trackerStatus };
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
  const commands = ['check', 'import', 'check-nodes', 'mutate-nodes', 'check-artifact', 'mount-artifact'];
  if (positional.length !== 2 || !commands.includes(positional[0])) return null;
  if ((positional[0] === 'check' || positional[0] === 'check-nodes' || positional[0] === 'check-artifact') && (apply || replace)) return null;
  if (positional[0] === 'mutate-nodes' && replace) return null;
  if (positional[0] === 'mount-artifact' && replace) return null;
  return {
    command: positional[0],
    packageFile: positional[1],
    mutationFile: positional[1],
    artifactFile: positional[1],
    json,
    apply,
    replace,
  };
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

    if (args.command === 'check-nodes') {
      const result = readNodeMutationFile(args.mutationFile, root);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '公司机会节点计划校验通过。',
        `Mutation ID: ${result.summary.mutationId}`,
        `Opportunity ID: ${result.summary.opportunityId}`,
        `变更摘要：${result.summary.changeSummary}`,
        `目标流程节点：${result.summary.nodeCount} 个`,
        `绑定当前机会哈希：${result.summary.expectedOpportunityContentHash}`,
        `生成机会哈希：${result.summary.resultingOpportunityContentHash}`,
      ].join('\n'));
      return;
    }

    if (args.command === 'mutate-nodes') {
      const result = await mutateCompanyOpportunityNodes(args.mutationFile, { root, apply: args.apply });
      const payload = { ok: true, ...result };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        `公司机会节点变更结果：${result.action}`,
        `机会对象：${result.packagePath}`,
        `变更记录：${result.mutationPath}`,
        `投递清单：${result.trackerPath}（${result.trackerAction}）`,
        `变更摘要：${result.plan.changeSummary}`,
        `目标流程节点：${result.plan.nodeCount} 个`,
        result.backupPath ? `机会备份：${result.backupPath}` : null,
        '本操作只改本地机会节点，不改投递清单状态，不执行 skill，不挂载产物。',
      ].filter(Boolean).join('\n'));
      return;
    }

    if (args.command === 'check-artifact') {
      const result = readArtifactMountFile(args.artifactFile, root);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '公司机会产物挂载计划校验通过。',
        `Mount ID: ${result.summary.mountId}`,
        `Opportunity ID: ${result.summary.opportunityId}`,
        `目标节点：${result.summary.nodeId}`,
        `产物类型：${result.summary.artifact.kind}`,
        `产物标题：${result.summary.artifact.title}`,
        `本地产物：${result.summary.artifact.path}`,
        `文件哈希：${result.summary.artifact.contentHash}`,
        `绑定当前机会哈希：${result.summary.expectedOpportunityContentHash}`,
      ].join('\n'));
      return;
    }

    if (args.command === 'mount-artifact') {
      const result = await mountCompanyOpportunityArtifact(args.artifactFile, { root, apply: args.apply });
      const payload = { ok: true, ...result };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        `公司机会产物挂载结果：${result.action}`,
        `机会对象：${result.packagePath}`,
        `挂载记录：${result.mountPath}`,
        `投递清单：${result.trackerPath}（${result.trackerAction}）`,
        `目标节点：${result.plan.nodeId}`,
        `产物标题：${result.plan.artifact.title}`,
        `产物路径：${result.plan.artifact.path}`,
        result.backupPath ? `机会备份：${result.backupPath}` : null,
        '本操作只挂载本地产物链接，不改节点状态，不改投递清单，不执行 skill，不上传。',
      ].filter(Boolean).join('\n'));
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
