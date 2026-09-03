import { createHash } from 'node:crypto';
import {
  CONTROL_CHARACTER_PATTERN,
  ContractToolError,
  requireArray,
  requireEnum,
  requireObjectWithOptional,
  requireSafeId,
  requireString,
} from './lib/contract-kit.mjs';

export const OPPORTUNITY_PROGRESS_UNIT_TYPE = 'opportunity.progress.v1';
export const TRACE_DECISION_UNIT_TYPE = 'trace.decision.v1';
export const SYNC_UNIT_SCHEMA_VERSION = 1;

export const SYNC_UNIT_MODE = Object.freeze({
  offline: true,
  writesUserLayer: false,
  persistsQueue: false,
  network: false,
  automaticUpload: false,
});

const MAX_NODES = 50;
const MAX_ARTIFACTS = 100;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
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
const TRACE_RESULTS = new Set(['prepared', 'dispatched', 'failed']);
const QUEUE_EVENTS = new Set([
  'enqueue',
  'retry',
  'auth-failed',
  'device-rebound',
  'cancel',
  'server-conflict',
  'web-deleted',
]);
const PROHIBITED_FIELDS = new Set([
  'accountCredentials',
  'artifactBytes',
  'bearerSession',
  'contact',
  'conversationText',
  'conversation',
  'credential',
  'credentials',
  'hrContact',
  'jd',
  'jdText',
  'localPath',
  'path',
  'password',
  'privateNote',
  'note',
  'prompt',
  'rawDocument',
  'report',
  'reportText',
  'resume',
  'resumeContent',
  'resumeText',
  'starStory',
  'terminalLog',
  'token',
  'url',
]);

function syncUnitError(message, code = 'invalid-sync-unit', details = {}) {
  return new ContractToolError(message, code, details);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
  const body = Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',');
  return `{${body}}`;
}

export function canonicalJson(value) {
  return stableStringify(value);
}

export function canonicalHash(value) {
  return `sha256:${createHash('sha256').update(stableStringify(value), 'utf8').digest('hex')}`;
}

export function normalizeNaturalIdentityText(value) {
  const text = requireString(value, '$.naturalIdentityText', { min: 1, max: 160 });
  return text
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

function requireHash(value, path, errorCode = 'invalid-sync-unit') {
  const text = requireString(value, path, { min: 71, max: 71 }, ContractToolError, errorCode);
  if (!CONTENT_HASH_PATTERN.test(text)) {
    throw syncUnitError(`${path} must use sha256:<64 lowercase hex>`, errorCode, { path });
  }
  return text;
}

function requireMillisecondTimestamp(value, path) {
  const text = requireString(value, path, { min: 24, max: 24 });
  if (!ISO_MILLISECOND_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw syncUnitError(`${path} must be an ISO-8601 UTC timestamp with millisecond precision`);
  }
  return text;
}

function requireBoolean(value, path) {
  if (typeof value !== 'boolean') throw syncUnitError(`${path} must be a boolean`);
  return value;
}

function requireVisibleString(value, path, { min = 1, max = 240 } = {}) {
  if (typeof value !== 'string') throw syncUnitError(`${path} must be a string`);
  const visibleLength = value.trim().length;
  if (visibleLength < min || visibleLength > max) {
    throw syncUnitError(`${path} length must be ${min} to ${max}`);
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw syncUnitError(`${path} contains control characters`);
  }
  return value;
}

function assertNoProhibitedFields(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoProhibitedFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (PROHIBITED_FIELDS.has(key)) {
      throw syncUnitError(`${path}.${key} is prohibited in a sync unit`, 'prohibited-field', {
        path: `${path}.${key}`,
        field: key,
      });
    }
    assertNoProhibitedFields(child, `${path}.${key}`);
  }
}

function requireUserConfirmation(value, path = '$.userConfirmation') {
  requireObjectWithOptional(value, path, ['confirmedAt', 'confirmedContentHash'], []);
  return {
    confirmedAt: requireMillisecondTimestamp(value.confirmedAt, `${path}.confirmedAt`),
    confirmedContentHash: requireHash(value.confirmedContentHash, `${path}.confirmedContentHash`),
  };
}

function requireTracePointer(value, path = '$.tracePointer') {
  requireObjectWithOptional(value, path, ['traceId', 'summaryIdentityHash'], []);
  return {
    traceId: requireSafeId(value.traceId, `${path}.traceId`),
    summaryIdentityHash: requireHash(value.summaryIdentityHash, `${path}.summaryIdentityHash`),
  };
}

function canonicalizeOpportunitySummary(value) {
  requireObjectWithOptional(
    value,
    '$.opportunity',
    [
      'schemaVersion',
      'company',
      'role',
      'location',
      'recruitmentBatch',
      'analysisId',
      'analysisContentHash',
      'trackerStatus',
      'stateUpdatedAt',
      'userConfirmed',
      'processNodes',
      'artifacts',
    ],
    [],
  );
  assertNoProhibitedFields(value, '$.opportunity');
  if (value.schemaVersion !== SYNC_UNIT_SCHEMA_VERSION) {
    throw syncUnitError('$.opportunity.schemaVersion must be 1', 'unsupported-version');
  }

  const seenNodeIds = new Set();
  const processNodes = requireArray(value.processNodes, '$.opportunity.processNodes', 1, MAX_NODES)
    .map((node, index) => {
      const path = `$.opportunity.processNodes[${index}]`;
      assertNoProhibitedFields(node, path);
      requireObjectWithOptional(node, path, ['id', 'type', 'title', 'status'], ['nextAction']);
      const id = requireSafeId(node.id, `${path}.id`);
      if (seenNodeIds.has(id)) throw syncUnitError(`${path}.id is duplicate: ${id}`);
      seenNodeIds.add(id);
      return {
        id,
        type: requireEnum(node.type, `${path}.type`, NODE_TYPES),
        title: requireVisibleString(node.title, `${path}.title`, { min: 2, max: 80 }),
        status: requireEnum(node.status, `${path}.status`, NODE_STATUSES),
        ...(node.nextAction === undefined
          ? {}
          : {
              nextAction: requireVisibleString(
                node.nextAction,
                `${path}.nextAction`,
                { min: 1, max: 120 },
              ),
            }),
      };
    });

  const seenMountIds = new Set();
  const artifacts = requireArray(value.artifacts, '$.opportunity.artifacts', 0, MAX_ARTIFACTS)
    .map((artifact, index) => {
      const path = `$.opportunity.artifacts[${index}]`;
      assertNoProhibitedFields(artifact, path);
      requireObjectWithOptional(
        artifact,
        path,
        ['mountId', 'kind', 'title', 'contentHash'],
        [],
      );
      const mountId = requireSafeId(artifact.mountId, `${path}.mountId`);
      if (seenMountIds.has(mountId)) throw syncUnitError(`${path}.mountId is duplicate: ${mountId}`);
      seenMountIds.add(mountId);
      return {
        mountId,
        kind: requireEnum(artifact.kind, `${path}.kind`, ARTIFACT_KINDS),
        title: requireVisibleString(artifact.title, `${path}.title`, { min: 2, max: 120 }),
        contentHash: requireHash(artifact.contentHash, `${path}.contentHash`),
      };
    });

  return {
    schemaVersion: value.schemaVersion,
    company: requireVisibleString(value.company, '$.opportunity.company', { min: 1, max: 160 }),
    role: requireVisibleString(value.role, '$.opportunity.role', { min: 1, max: 160 }),
    location: requireVisibleString(value.location, '$.opportunity.location', { min: 1, max: 160 }),
    recruitmentBatch: requireVisibleString(
      value.recruitmentBatch,
      '$.opportunity.recruitmentBatch',
      { min: 1, max: 80 },
    ),
    analysisId: requireSafeId(value.analysisId, '$.opportunity.analysisId'),
    analysisContentHash: requireHash(
      value.analysisContentHash,
      '$.opportunity.analysisContentHash',
    ),
    trackerStatus: requireString(
      value.trackerStatus,
      '$.opportunity.trackerStatus',
      { min: 1, max: 40 },
    ),
    stateUpdatedAt: requireMillisecondTimestamp(
      value.stateUpdatedAt,
      '$.opportunity.stateUpdatedAt',
    ),
    userConfirmed: requireBoolean(value.userConfirmed, '$.opportunity.userConfirmed'),
    processNodes,
    artifacts,
  };
}

function opportunityIdentityHash(summary) {
  return canonicalHash({
    schemaVersion: summary.schemaVersion,
    company: normalizeNaturalIdentityText(summary.company),
    role: normalizeNaturalIdentityText(summary.role),
    location: normalizeNaturalIdentityText(summary.location),
    recruitmentBatch: normalizeNaturalIdentityText(summary.recruitmentBatch),
  });
}

function idempotencyKeyFor(unitType, objectIdentityHash, contentHash) {
  return canonicalHash({ unitType, objectIdentityHash, contentHash });
}

export function buildOpportunityProgressUnit(input) {
  requireObjectWithOptional(
    input,
    '$',
    [
      'sourceDeviceId',
      'summaryGeneratedAt',
      'userConfirmation',
      'opportunity',
    ],
    ['basisContentHash', 'tracePointer'],
  );
  assertNoProhibitedFields(input);
  const summary = canonicalizeOpportunitySummary(input.opportunity);
  const contentHash = canonicalHash(summary);
  const objectIdentityHash = opportunityIdentityHash(summary);
  requireObjectWithOptional(
    input.userConfirmation,
    '$.userConfirmation',
    ['confirmedAt'],
    ['confirmedContentHash'],
  );
  if (input.userConfirmation.confirmedContentHash !== undefined
    && input.userConfirmation.confirmedContentHash !== contentHash) {
    throw syncUnitError('$.userConfirmation.confirmedContentHash must match the generated summary');
  }
  const userConfirmation = {
    confirmedAt: requireMillisecondTimestamp(
      input.userConfirmation.confirmedAt,
      '$.userConfirmation.confirmedAt',
    ),
    confirmedContentHash: contentHash,
  };
  const unit = {
    unitType: OPPORTUNITY_PROGRESS_UNIT_TYPE,
    objectIdentityHash,
    contentHash,
    idempotencyKey: idempotencyKeyFor(
      OPPORTUNITY_PROGRESS_UNIT_TYPE,
      objectIdentityHash,
      contentHash,
    ),
    ...(input.basisContentHash === undefined
      ? {}
      : { basisContentHash: requireHash(input.basisContentHash, '$.basisContentHash') }),
    sourceDeviceId: requireSafeId(input.sourceDeviceId, '$.sourceDeviceId'),
    stateUpdatedAt: summary.stateUpdatedAt,
    summaryGeneratedAt: requireMillisecondTimestamp(
      input.summaryGeneratedAt,
      '$.summaryGeneratedAt',
    ),
    userConfirmation,
    ...(input.tracePointer === undefined
      ? {}
      : { tracePointer: requireTracePointer(input.tracePointer) }),
    summary,
  };
  return validateSyncUnit(unit);
}

function canonicalizeTraceSummary(value) {
  requireObjectWithOptional(
    value,
    '$.trace',
    [
      'traceId',
      'skillKey',
      'toolKey',
      'action',
      'result',
      'targetModule',
      'targetObjectIdentity',
      'userConfirmedAt',
      'resultReason',
    ],
    [
      'targetBeforeContentHash',
      'targetAfterContentHash',
      'contractIdentity',
      'contractContentHash',
      'completedAt',
    ],
  );
  assertNoProhibitedFields(value, '$.trace');
  const summary = {
    traceId: requireSafeId(value.traceId, '$.trace.traceId'),
    skillKey: requireSafeId(value.skillKey, '$.trace.skillKey'),
    toolKey: requireString(value.toolKey, '$.trace.toolKey', { min: 3, max: 100 }),
    action: requireString(value.action, '$.trace.action', { min: 3, max: 100 }),
    result: requireEnum(value.result, '$.trace.result', TRACE_RESULTS),
    targetModule: requireString(value.targetModule, '$.trace.targetModule', { min: 3, max: 60 }),
    targetObjectIdentity: requireString(
      value.targetObjectIdentity,
      '$.trace.targetObjectIdentity',
      { min: 1, max: 160 },
    ),
    ...(value.targetBeforeContentHash === undefined
      ? {}
      : {
          targetBeforeContentHash: requireHash(
            value.targetBeforeContentHash,
            '$.trace.targetBeforeContentHash',
          ),
        }),
    ...(value.targetAfterContentHash === undefined
      ? {}
      : {
          targetAfterContentHash: requireHash(
            value.targetAfterContentHash,
            '$.trace.targetAfterContentHash',
          ),
        }),
    ...(value.contractIdentity === undefined
      ? {}
      : { contractIdentity: requireSafeId(value.contractIdentity, '$.trace.contractIdentity') }),
    ...(value.contractContentHash === undefined
      ? {}
      : {
          contractContentHash: requireHash(
            value.contractContentHash,
            '$.trace.contractContentHash',
          ),
        }),
    userConfirmedAt: requireMillisecondTimestamp(
      value.userConfirmedAt,
      '$.trace.userConfirmedAt',
    ),
    ...(value.completedAt === undefined
      ? {}
      : { completedAt: requireMillisecondTimestamp(value.completedAt, '$.trace.completedAt') }),
    resultReason: requireVisibleString(
      value.resultReason,
      '$.trace.resultReason',
      { min: 2, max: 200 },
    ),
  };
  if (summary.completedAt !== undefined
    && Date.parse(summary.completedAt) < Date.parse(summary.userConfirmedAt)) {
    throw syncUnitError('$.trace.completedAt cannot precede userConfirmedAt');
  }
  return summary;
}

export function buildTraceDecisionUnit(input) {
  requireObjectWithOptional(
    input,
    '$',
    ['sourceDeviceId', 'summaryGeneratedAt', 'userConfirmation', 'trace'],
    [],
  );
  assertNoProhibitedFields(input);
  const summary = canonicalizeTraceSummary(input.trace);
  const contentHash = canonicalHash(summary);
  const objectIdentityHash = canonicalHash({
    sourceDeviceId: requireSafeId(input.sourceDeviceId, '$.sourceDeviceId'),
    traceId: summary.traceId,
  });
  requireObjectWithOptional(
    input.userConfirmation,
    '$.userConfirmation',
    ['confirmedAt'],
    ['confirmedContentHash'],
  );
  if (input.userConfirmation.confirmedContentHash !== undefined
    && input.userConfirmation.confirmedContentHash !== contentHash) {
    throw syncUnitError('$.userConfirmation.confirmedContentHash must match the generated summary');
  }
  const userConfirmation = {
    confirmedAt: requireMillisecondTimestamp(
      input.userConfirmation.confirmedAt,
      '$.userConfirmation.confirmedAt',
    ),
    confirmedContentHash: contentHash,
  };
  const unit = {
    unitType: TRACE_DECISION_UNIT_TYPE,
    objectIdentityHash,
    contentHash,
    idempotencyKey: idempotencyKeyFor(TRACE_DECISION_UNIT_TYPE, objectIdentityHash, contentHash),
    sourceDeviceId: requireSafeId(input.sourceDeviceId, '$.sourceDeviceId'),
    stateUpdatedAt: summary.completedAt ?? summary.userConfirmedAt,
    summaryGeneratedAt: requireMillisecondTimestamp(
      input.summaryGeneratedAt,
      '$.summaryGeneratedAt',
    ),
    userConfirmation,
    summary,
  };
  return validateSyncUnit(unit);
}

function validateEnvelope(input, expectedType, allowsBasis) {
  const fields = [
    'unitType',
    'objectIdentityHash',
    'contentHash',
    'idempotencyKey',
    'sourceDeviceId',
    'stateUpdatedAt',
    'summaryGeneratedAt',
    'userConfirmation',
    'summary',
  ];
  requireObjectWithOptional(input, '$', fields, allowsBasis ? ['basisContentHash', 'tracePointer'] : []);
  assertNoProhibitedFields(input);
  if (input.unitType !== expectedType) {
    throw syncUnitError(`$.unitType must be ${expectedType}`);
  }
  const objectIdentityHash = requireHash(input.objectIdentityHash, '$.objectIdentityHash');
  const contentHash = requireHash(input.contentHash, '$.contentHash');
  const idempotencyKey = requireHash(input.idempotencyKey, '$.idempotencyKey');
  const expectedKey = idempotencyKeyFor(expectedType, objectIdentityHash, contentHash);
  if (idempotencyKey !== expectedKey) {
    throw syncUnitError('$.idempotencyKey does not match unit identity and content');
  }
  const userConfirmation = requireUserConfirmation(input.userConfirmation);
  if (userConfirmation.confirmedContentHash !== contentHash) {
    throw syncUnitError('$.userConfirmation.confirmedContentHash must match $.contentHash');
  }
  return {
    unitType: input.unitType,
    objectIdentityHash,
    contentHash,
    idempotencyKey,
    ...(allowsBasis && input.basisContentHash !== undefined
      ? { basisContentHash: requireHash(input.basisContentHash, '$.basisContentHash') }
      : {}),
    sourceDeviceId: requireSafeId(input.sourceDeviceId, '$.sourceDeviceId'),
    stateUpdatedAt: requireMillisecondTimestamp(input.stateUpdatedAt, '$.stateUpdatedAt'),
    summaryGeneratedAt: requireMillisecondTimestamp(input.summaryGeneratedAt, '$.summaryGeneratedAt'),
    userConfirmation,
    ...(input.tracePointer === undefined ? {} : { tracePointer: requireTracePointer(input.tracePointer) }),
  };
}

export function validateSyncUnit(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw syncUnitError('$ must be a sync unit object');
  }
  assertNoProhibitedFields(input);
  if (typeof input.unitType !== 'string') {
    throw syncUnitError('$.unitType is required');
  }
  const unitType = input.unitType;
  if (unitType === OPPORTUNITY_PROGRESS_UNIT_TYPE) {
    const envelope = validateEnvelope(input, OPPORTUNITY_PROGRESS_UNIT_TYPE, true);
    const summary = canonicalizeOpportunitySummary(input.summary);
    if (envelope.objectIdentityHash !== opportunityIdentityHash(summary)) {
      throw syncUnitError('$.objectIdentityHash does not match the natural opportunity identity');
    }
    if (envelope.contentHash !== canonicalHash(summary)) {
      throw syncUnitError('$.contentHash does not match the canonical summary payload');
    }
    if (envelope.stateUpdatedAt !== summary.stateUpdatedAt) {
      throw syncUnitError('$.stateUpdatedAt must match $.summary.stateUpdatedAt');
    }
    return { ...envelope, summary };
  }
  if (unitType === TRACE_DECISION_UNIT_TYPE) {
    const envelope = validateEnvelope(input, TRACE_DECISION_UNIT_TYPE, false);
    const summary = canonicalizeTraceSummary(input.summary);
    const expectedIdentity = canonicalHash({
      sourceDeviceId: envelope.sourceDeviceId,
      traceId: summary.traceId,
    });
    if (envelope.objectIdentityHash !== expectedIdentity) {
      throw syncUnitError('$.objectIdentityHash must bind sourceDeviceId and traceId');
    }
    if (envelope.contentHash !== canonicalHash(summary)) {
      throw syncUnitError('$.contentHash does not match the canonical summary payload');
    }
    const expectedStateUpdatedAt = summary.completedAt ?? summary.userConfirmedAt;
    if (envelope.stateUpdatedAt !== expectedStateUpdatedAt) {
      throw syncUnitError('$.stateUpdatedAt must match the trace completion or confirmation time');
    }
    return { ...envelope, summary };
  }
  throw syncUnitError('$.unitType is outside the closed v0.1 catalog');
}

function validateCloudProjection(cloud) {
  if (cloud === null || cloud === undefined) return null;
  requireObjectWithOptional(cloud, '$.cloudProjection', ['contentHash'], []);
  return {
    contentHash: requireHash(cloud.contentHash, '$.cloudProjection.contentHash'),
  };
}

function validateExistingIdentity(existing) {
  requireObjectWithOptional(
    existing,
    '$.existingRecord',
    ['objectIdentityHash', 'contentHash'],
    ['tombstoned'],
  );
  const record = {
    objectIdentityHash: requireHash(existing.objectIdentityHash, '$.existingRecord.objectIdentityHash'),
    contentHash: requireHash(existing.contentHash, '$.existingRecord.contentHash'),
  };
  if (existing.tombstoned !== undefined) {
    record.tombstoned = requireBoolean(existing.tombstoned, '$.existingRecord.tombstoned');
  }
  return record;
}

export function classifyOpportunityProgressSubmission(incoming, cloudProjection = null) {
  const unit = validateSyncUnit(incoming);
  const cloud = validateCloudProjection(cloudProjection);
  if (cloud === null) {
    if (unit.basisContentHash !== undefined) {
      throw syncUnitError(
        '$.basisContentHash is invalid for a first snapshot',
        'invalid-basis',
        { basisContentHash: unit.basisContentHash },
      );
    }
    return { classification: 'first', unitType: unit.unitType, idempotencyKey: unit.idempotencyKey };
  }
  if (cloud.contentHash === unit.contentHash) {
    return { classification: 'idempotent', unitType: unit.unitType, idempotencyKey: unit.idempotencyKey };
  }
  if (unit.basisContentHash === cloud.contentHash) {
    return {
      classification: 'accepted',
      unitType: unit.unitType,
      idempotencyKey: unit.idempotencyKey,
      previousContentHash: cloud.contentHash,
    };
  }
  return {
    classification: 'conflict',
    unitType: unit.unitType,
    idempotencyKey: unit.idempotencyKey,
    currentCloudContentHash: cloud.contentHash,
    incomingBasisContentHash: unit.basisContentHash ?? null,
    resolution: 'user-choice',
  };
}

export function classifyTraceDecisionSubmission(incoming, existingRecord = null) {
  const unit = validateSyncUnit(incoming);
  if (existingRecord === null || existingRecord === undefined) {
    return { classification: 'first', unitType: unit.unitType, idempotencyKey: unit.idempotencyKey };
  }
  const existing = validateExistingIdentity(existingRecord);
  if (existing.objectIdentityHash !== unit.objectIdentityHash) {
    return {
      classification: 'identity-conflict',
      unitType: unit.unitType,
      idempotencyKey: unit.idempotencyKey,
      resolution: 'reject',
    };
  }
  if (existing.contentHash === unit.contentHash) {
    return {
      classification: existing.tombstoned === true ? 'tombstoned' : 'idempotent',
      unitType: unit.unitType,
      idempotencyKey: unit.idempotencyKey,
    };
  }
  return {
    classification: 'identity-conflict',
    unitType: unit.unitType,
    idempotencyKey: unit.idempotencyKey,
    existingContentHash: existing.contentHash,
    resolution: 'reject',
  };
}

export function classifyDeletedSubmission(incoming, tombstone) {
  const unit = validateSyncUnit(incoming);
  const existing = validateExistingIdentity(tombstone);
  if (existing.objectIdentityHash === unit.objectIdentityHash
    && existing.contentHash === unit.contentHash) {
    return {
      classification: 'tombstoned',
      unitType: unit.unitType,
      idempotencyKey: unit.idempotencyKey,
      deletesLocalObject: false,
    };
  }
  if (unit.unitType === TRACE_DECISION_UNIT_TYPE
    && existing.objectIdentityHash === unit.objectIdentityHash) {
    return {
      classification: 'identity-conflict',
      unitType: unit.unitType,
      idempotencyKey: unit.idempotencyKey,
      resolution: 'reject',
    };
  }
  return {
    classification: 'new-submission',
    unitType: unit.unitType,
    idempotencyKey: unit.idempotencyKey,
  };
}

function validateQueueEntry(entry) {
  requireObjectWithOptional(
    entry,
    '$.queueEntry',
    ['idempotencyKey', 'status', 'sourceDeviceId'],
    [],
  );
  return {
    idempotencyKey: requireHash(entry.idempotencyKey, '$.queueEntry.idempotencyKey'),
    status: requireString(entry.status, '$.queueEntry.status', { min: 3, max: 40 }),
    sourceDeviceId: requireSafeId(entry.sourceDeviceId, '$.queueEntry.sourceDeviceId'),
  };
}

export function classifyQueueAction({
  event,
  unit = null,
  existingEntry = null,
  activeSourceDeviceId,
  tombstone = null,
}) {
  const action = requireEnum(event, '$.event', QUEUE_EVENTS);
  const activeDevice = requireSafeId(activeSourceDeviceId, '$.activeSourceDeviceId');
  const normalizedTombstone = tombstone === null || tombstone === undefined
    ? null
    : validateExistingIdentity(tombstone);

  if (action === 'enqueue') {
    const validatedUnit = validateSyncUnit(unit);
    if (normalizedTombstone?.objectIdentityHash === validatedUnit.objectIdentityHash
      && normalizedTombstone.contentHash === validatedUnit.contentHash) {
      return { action: 'blocked-tombstone', idempotencyKey: validatedUnit.idempotencyKey };
    }
    if (existingEntry === null || existingEntry === undefined) {
      return { action: 'enqueue', idempotencyKey: validatedUnit.idempotencyKey };
    }
    const existing = validateQueueEntry(existingEntry);
    if (existing.idempotencyKey !== validatedUnit.idempotencyKey) {
      throw syncUnitError('$.existingEntry.idempotencyKey does not match the incoming unit');
    }
    return { action: 'duplicate', idempotencyKey: validatedUnit.idempotencyKey };
  }

  const entry = validateQueueEntry(existingEntry);
  if (entry.sourceDeviceId !== activeDevice && action !== 'cancel' && action !== 'device-rebound') {
    return { action: 'blocked-rebind', idempotencyKey: entry.idempotencyKey };
  }
  if (action === 'retry') {
    if (unit === null || unit === undefined) {
      throw syncUnitError('retry requires the unchanged unit');
    }
    const validatedUnit = validateSyncUnit(unit);
    if (validatedUnit.idempotencyKey !== entry.idempotencyKey) {
      throw syncUnitError('$.queueEntry.idempotencyKey does not match the retry unit');
    }
    if (normalizedTombstone !== null
      && normalizedTombstone.objectIdentityHash === validatedUnit.objectIdentityHash) {
      if (normalizedTombstone.contentHash === validatedUnit.contentHash) {
        return {
          action: 'blocked-tombstone',
          idempotencyKey: validatedUnit.idempotencyKey,
          changesLocalObject: false,
        };
      }
      if (validatedUnit.unitType === TRACE_DECISION_UNIT_TYPE) {
        return {
          action: 'identity-conflict',
          idempotencyKey: validatedUnit.idempotencyKey,
          changesLocalObject: false,
        };
      }
    }
    return { action: 'retry-same-key', idempotencyKey: entry.idempotencyKey };
  }
  if (action === 'auth-failed') return { action: 'blocked-auth', idempotencyKey: entry.idempotencyKey };
  if (action === 'device-rebound') {
    return { action: 'blocked-rebind', idempotencyKey: entry.idempotencyKey, reconfirmationRequired: true };
  }
  if (action === 'cancel') {
    return {
      action: 'canceled',
      idempotencyKey: entry.idempotencyKey,
      changesLocalObject: false,
    };
  }
  if (action === 'server-conflict') {
    return {
      action: 'conflicted',
      idempotencyKey: entry.idempotencyKey,
      unchangedRetryAllowed: false,
    };
  }
  return {
    action: 'tombstoned',
    idempotencyKey: entry.idempotencyKey,
    changesLocalObject: false,
  };
}
