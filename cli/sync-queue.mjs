#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { flagValue, hasFlag, validateFlags } from './lib/cli-flags.mjs';
import {
  backupFile,
  ContractToolError,
  readJsonContract,
  requireArray,
  requireEnum,
  requireObjectWithOptional,
  requireSafeId,
  requireString,
  writeContractFile,
} from './lib/contract-kit.mjs';
import {
  classifyDeletedSubmission,
  classifyOpportunityProgressSubmission,
  classifyQueueAction,
  classifyTraceDecisionSubmission,
  OPPORTUNITY_PROGRESS_UNIT_TYPE,
  TRACE_DECISION_UNIT_TYPE,
  validateSyncUnit,
} from './sync-unit.mjs';

export const SYNC_QUEUE_SCHEMA = 'get-yourself.sync-queue';
export const SYNC_QUEUE_SCHEMA_VERSION = 1;
export const SYNC_QUEUE_PATH = 'data/sync-queue.json';
export const SYNC_QUEUE_BACKUP_DIR = 'data/sync-queue-backups';

export const SYNC_QUEUE_MODE = Object.freeze({
  offline: true,
  persistsQueue: true,
  network: false,
  automaticUpload: false,
  automaticRetry: false,
  writesBusinessObjects: false,
});

export const SYNC_QUEUE_STATUSES = Object.freeze([
  'pending',
  'auth-blocked',
  'rebind-blocked',
  'network-failed',
  'conflicted',
  'tombstoned',
]);

const STATUS_SET = new Set(SYNC_QUEUE_STATUSES);
const MAX_QUEUE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 100;
const MAX_TOMBSTONES = 500;
const MAX_AUDIT_EVENTS = 1000;
const MAX_BACKUPS = 20;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ENTRY_EVENTS = new Set([
  'enqueue',
  'retry',
  'auth-failed',
  'device-rebound',
  'network-failed',
  'server-conflict',
  'web-deleted',
  'reconfirm',
]);
const AUDIT_EVENTS = new Set([
  ...ENTRY_EVENTS,
  'cancel',
]);
const MARK_EVENTS = new Set([
  'auth-failed',
  'device-rebound',
  'network-failed',
  'server-conflict',
  'web-deleted',
]);

const USAGE = `Usage:
  node sync-queue.mjs list [--status <status>] [--json]
  node sync-queue.mjs enqueue <unit.json> [--apply] [--json]
  node sync-queue.mjs retry <idempotency-key> [--apply] [--json]
  node sync-queue.mjs cancel <idempotency-key> [--apply] [--json]
  node sync-queue.mjs mark <idempotency-key> <event> [--cloud-content-hash <hash>] [--active-device <id>] [--apply] [--json]
  node sync-queue.mjs reconfirm <idempotency-key> <unit.json> --active-device <id> [--apply] [--json]

Events: auth-failed, device-rebound, network-failed, server-conflict, web-deleted
Statuses: ${SYNC_QUEUE_STATUSES.join(', ')}

The queue is local-only. It never uploads, retries in the background, or changes a business object.`;

function queueError(message, code = 'invalid-sync-queue', details = {}) {
  return new ContractToolError(message, code, details);
}

function requireQueueTimestamp(value, path) {
  const text = requireString(value, path, { min: 24, max: 24 }, ContractToolError, 'invalid-sync-queue');
  if (!ISO_MILLISECOND_PATTERN.test(text) || Number.isNaN(Date.parse(text))) {
    throw queueError(`${path} must be an ISO-8601 UTC timestamp with millisecond precision`);
  }
  return text;
}

function requireContentHash(value, path) {
  const text = requireString(value, path, { min: 71, max: 71 }, ContractToolError, 'invalid-sync-queue');
  if (!CONTENT_HASH_PATTERN.test(text)) {
    throw queueError(`${path} must use sha256:<64 lowercase hex>`);
  }
  return text;
}

function requireOptionalContentHash(value, path) {
  if (value === undefined) return undefined;
  return requireContentHash(value, path);
}

function requireAttempts(value, path) {
  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    throw queueError(`${path} must be an integer from 0 to 1000`);
  }
  return value;
}

function unitView(unit) {
  if (unit.unitType === OPPORTUNITY_PROGRESS_UNIT_TYPE) {
    return {
      target: `${unit.summary.company} / ${unit.summary.role}`,
      location: unit.summary.location,
      recruitmentBatch: unit.summary.recruitmentBatch,
      trackerStatus: unit.summary.trackerStatus,
      stateUpdatedAt: unit.summary.stateUpdatedAt,
    };
  }
  return {
    target: unit.summary.targetObjectIdentity,
    skillKey: unit.summary.skillKey,
    toolKey: unit.summary.toolKey,
    action: unit.summary.action,
    result: unit.summary.result,
    stateUpdatedAt: unit.summary.stateUpdatedAt,
  };
}

function entryView(entry) {
  return {
    ...entry,
    display: unitView(entry.unit),
  };
}

function queueClassifierView(entry) {
  return {
    idempotencyKey: entry.idempotencyKey,
    status: entry.status,
    sourceDeviceId: entry.sourceDeviceId,
  };
}

function requireUnit(value, path) {
  try {
    return validateSyncUnit(value);
  } catch (error) {
    if (error instanceof ContractToolError) {
      throw queueError(`${path}.unit is invalid: ${error.message}`, error.code, error.details);
    }
    throw error;
  }
}

function canonicalizeEntry(input) {
  requireObjectWithOptional(
    input,
    '$.entry',
    [
      'idempotencyKey',
      'unitType',
      'objectIdentityHash',
      'contentHash',
      'sourceDeviceId',
      'stateUpdatedAt',
      'status',
      'attempts',
      'unit',
      'createdAt',
      'updatedAt',
      'lastEvent',
      'lastEventAt',
    ],
    ['basisContentHash', 'reconfirmedAt', 'lastCloudContentHash'],
  );
  const unit = requireUnit(input.unit, '$.entry');
  if (input.unitType !== unit.unitType) {
    throw queueError('$.entry.unitType must match $.entry.unit.unitType');
  }
  if (input.idempotencyKey !== unit.idempotencyKey) {
    throw queueError('$.entry.idempotencyKey must match the stored unit');
  }
  if (input.objectIdentityHash !== unit.objectIdentityHash) {
    throw queueError('$.entry.objectIdentityHash must match the stored unit');
  }
  if (input.contentHash !== unit.contentHash) {
    throw queueError('$.entry.contentHash must match the stored unit');
  }
  if (input.sourceDeviceId !== unit.sourceDeviceId) {
    throw queueError('$.entry.sourceDeviceId must match the stored unit');
  }
  if (input.stateUpdatedAt !== unit.stateUpdatedAt) {
    throw queueError('$.entry.stateUpdatedAt must match the stored unit');
  }
  if (input.basisContentHash !== undefined && input.basisContentHash !== unit.basisContentHash) {
    throw queueError('$.entry.basisContentHash must match the stored unit');
  }
  const status = requireString(input.status, '$.entry.status', { min: 1, max: 40 }, ContractToolError, 'invalid-sync-queue');
  if (!STATUS_SET.has(status)) {
    throw queueError(`$.entry.status must be one of: ${SYNC_QUEUE_STATUSES.join(', ')}`);
  }
  const lastEvent = requireString(input.lastEvent, '$.entry.lastEvent', { min: 1, max: 40 }, ContractToolError, 'invalid-sync-queue');
  if (!ENTRY_EVENTS.has(lastEvent)) {
    throw queueError(`$.entry.lastEvent is outside the closed queue event catalog`);
  }
  const createdAt = requireQueueTimestamp(input.createdAt, '$.entry.createdAt');
  const updatedAt = requireQueueTimestamp(input.updatedAt, '$.entry.updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw queueError('$.entry.updatedAt cannot precede $.entry.createdAt');
  }
  const lastEventAt = requireQueueTimestamp(input.lastEventAt, '$.entry.lastEventAt');
  if (Date.parse(lastEventAt) < Date.parse(createdAt)) {
    throw queueError('$.entry.lastEventAt cannot precede $.entry.createdAt');
  }
  return {
    idempotencyKey: input.idempotencyKey,
    unitType: input.unitType,
    objectIdentityHash: input.objectIdentityHash,
    contentHash: input.contentHash,
    ...(input.basisContentHash === undefined ? {} : { basisContentHash: input.basisContentHash }),
    sourceDeviceId: input.sourceDeviceId,
    stateUpdatedAt: input.stateUpdatedAt,
    status,
    attempts: requireAttempts(input.attempts, '$.entry.attempts'),
    unit,
    createdAt,
    updatedAt,
    lastEvent,
    lastEventAt,
    ...(input.reconfirmedAt === undefined ? {} : {
      reconfirmedAt: requireQueueTimestamp(input.reconfirmedAt, '$.entry.reconfirmedAt'),
    }),
    ...(input.lastCloudContentHash === undefined ? {} : {
      lastCloudContentHash: requireContentHash(input.lastCloudContentHash, '$.entry.lastCloudContentHash'),
    }),
  };
}

function canonicalizeTombstone(input) {
  requireObjectWithOptional(
    input,
    '$.tombstone',
    [
      'objectIdentityHash',
      'contentHash',
      'idempotencyKey',
      'sourceDeviceId',
      'tombstonedAt',
    ],
    [],
  );
  return {
    objectIdentityHash: requireContentHash(input.objectIdentityHash, '$.tombstone.objectIdentityHash'),
    contentHash: requireContentHash(input.contentHash, '$.tombstone.contentHash'),
    idempotencyKey: requireContentHash(input.idempotencyKey, '$.tombstone.idempotencyKey'),
    sourceDeviceId: requireSafeId(input.sourceDeviceId, '$.tombstone.sourceDeviceId', ContractToolError, 'invalid-sync-queue'),
    tombstonedAt: requireQueueTimestamp(input.tombstonedAt, '$.tombstone.tombstonedAt'),
  };
}

function canonicalizeAuditEvent(input) {
  requireObjectWithOptional(
    input,
    '$.auditEvent',
    ['event', 'action', 'idempotencyKey', 'recordedAt'],
    ['cloudContentHash'],
  );
  const event = requireString(input.event, '$.auditEvent.event', { min: 1, max: 40 }, ContractToolError, 'invalid-sync-queue');
  if (!AUDIT_EVENTS.has(event)) {
    throw queueError('$.auditEvent.event is outside the closed queue event catalog');
  }
  return {
    event,
    action: requireString(input.action, '$.auditEvent.action', { min: 1, max: 60 }, ContractToolError, 'invalid-sync-queue'),
    idempotencyKey: requireContentHash(input.idempotencyKey, '$.auditEvent.idempotencyKey'),
    recordedAt: requireQueueTimestamp(input.recordedAt, '$.auditEvent.recordedAt'),
    ...(input.cloudContentHash === undefined ? {} : {
      cloudContentHash: requireContentHash(input.cloudContentHash, '$.auditEvent.cloudContentHash'),
    }),
  };
}

export function emptySyncQueue(now = new Date().toISOString()) {
  const timestamp = requireQueueTimestamp(now, '$.now');
  return {
    schema: SYNC_QUEUE_SCHEMA,
    schemaVersion: SYNC_QUEUE_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    entries: [],
    tombstones: [],
    audit: [],
  };
}

export function canonicalizeSyncQueue(input) {
  requireObjectWithOptional(
    input,
    '$',
    ['schema', 'schemaVersion', 'createdAt', 'updatedAt', 'entries', 'tombstones', 'audit'],
    [],
  );
  if (input.schema !== SYNC_QUEUE_SCHEMA) {
    throw queueError(`$.schema must be ${SYNC_QUEUE_SCHEMA}`);
  }
  if (input.schemaVersion !== SYNC_QUEUE_SCHEMA_VERSION) {
    throw queueError(`$.schemaVersion must be ${SYNC_QUEUE_SCHEMA_VERSION}`, 'unsupported-version');
  }
  const createdAt = requireQueueTimestamp(input.createdAt, '$.createdAt');
  const updatedAt = requireQueueTimestamp(input.updatedAt, '$.updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw queueError('$.updatedAt cannot precede $.createdAt');
  }

  const entries = requireArray(input.entries, '$.entries', 0, MAX_ENTRIES)
    .map(canonicalizeEntry);
  const idempotencyKeys = new Set();
  const objectIdentities = new Set();
  for (const entry of entries) {
    if (idempotencyKeys.has(entry.idempotencyKey)) {
      throw queueError(`$.entries contains duplicate idempotency key ${entry.idempotencyKey}`);
    }
    idempotencyKeys.add(entry.idempotencyKey);
    if (objectIdentities.has(entry.objectIdentityHash)) {
      throw queueError('$.entries can contain only one current entry per object identity');
    }
    objectIdentities.add(entry.objectIdentityHash);
  }

  const tombstones = requireArray(input.tombstones, '$.tombstones', 0, MAX_TOMBSTONES)
    .map(canonicalizeTombstone);
  const tombstoneKeys = new Set();
  for (const tombstone of tombstones) {
    if (tombstoneKeys.has(tombstone.idempotencyKey)) {
      throw queueError(`$.tombstones contains duplicate idempotency key ${tombstone.idempotencyKey}`);
    }
    tombstoneKeys.add(tombstone.idempotencyKey);
  }

  const audit = requireArray(input.audit, '$.audit', 0, MAX_AUDIT_EVENTS)
    .map(canonicalizeAuditEvent);
  for (const event of audit) {
    if (Date.parse(event.recordedAt) < Date.parse(createdAt)) {
      throw queueError('$.audit recordedAt cannot precede queue createdAt');
    }
  }

  return {
    schema: SYNC_QUEUE_SCHEMA,
    schemaVersion: SYNC_QUEUE_SCHEMA_VERSION,
    createdAt,
    updatedAt,
    entries,
    tombstones,
    audit,
  };
}

function queuePathFor(root) {
  return join(root, SYNC_QUEUE_PATH);
}

function readQueueFile(path) {
  return canonicalizeSyncQueue(readJsonContract(path, { maxBytes: MAX_QUEUE_BYTES }));
}

export function loadSyncQueue(root = getCareerOpsRoot()) {
  const path = queuePathFor(root);
  if (!existsSync(path)) return null;
  const info = lstatSync(path);
  if (!info.isFile()) {
    throw queueError('Installed sync queue is not a regular file', 'io-error', { path });
  }
  return readQueueFile(path);
}

function queueJson(queue) {
  return `${JSON.stringify(queue, null, 2)}\n`;
}

function writeQueue(root, queue, { hadExisting, backupContentHash }) {
  const target = queuePathFor(root);
  let backupPath = null;
  if (hadExisting) {
    backupPath = backupFile(
      target,
      join(root, SYNC_QUEUE_BACKUP_DIR),
      'sync-queue',
      backupContentHash,
      MAX_BACKUPS,
    );
  }
  writeContractFile(target, queueJson(queue));
  return backupPath;
}

function canonicalHashForQueue(queue) {
  const text = queueJson(queue);
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function nowFor(now) {
  return requireQueueTimestamp(now, '$.now');
}

function withMutation({
  root,
  apply,
  now,
  mutate,
}) {
  const timestamp = nowFor(now);
  const existing = loadSyncQueue(root);
  const queue = existing ?? emptySyncQueue(timestamp);
  const backupContentHash = existing === null ? null : canonicalHashForQueue(existing);
  const result = mutate(structuredClone(queue), timestamp);
  if (!apply) {
    return {
      ...result,
      applied: false,
      changed: false,
      queuePath: queuePathFor(root),
      backupPath: null,
    };
  }
  if (!result.changed) {
    return {
      ...result,
      applied: true,
      queuePath: queuePathFor(root),
      backupPath: null,
    };
  }
  const nextQueue = canonicalizeSyncQueue(result.queue);
  const backupPath = writeQueue(root, nextQueue, {
    hadExisting: existing !== null,
    backupContentHash,
  });
  return {
    ...result,
    queue: nextQueue,
    applied: true,
    changed: true,
    queuePath: queuePathFor(root),
    backupPath,
  };
}

function auditEventFor(event, action, idempotencyKey, timestamp, cloudContentHash) {
  return {
    event,
    action: action.action,
    idempotencyKey,
    recordedAt: timestamp,
    ...(cloudContentHash === undefined ? {} : { cloudContentHash }),
  };
}

function tombstoneBlock(unit, tombstones) {
  for (const tombstone of tombstones) {
    const classification = classifyDeletedSubmission(unit, {
      objectIdentityHash: tombstone.objectIdentityHash,
      contentHash: tombstone.contentHash,
      tombstoned: true,
    });
    if (classification.classification === 'tombstoned') {
      return { action: 'blocked-tombstone', tombstone };
    }
    if (classification.classification === 'identity-conflict') {
      return { action: 'identity-conflict', tombstone };
    }
  }
  return null;
}

export function enqueueSyncUnit(input, {
  root = getCareerOpsRoot(),
  apply = false,
  now = new Date().toISOString(),
} = {}) {
  const unit = requireUnit(input, '$.unit');
  return withMutation({
    root,
    apply,
    now,
    mutate: (queue, timestamp) => {
      const blocked = tombstoneBlock(unit, queue.tombstones);
      if (blocked) {
        throw queueError(
          `The unit cannot enter the queue: ${blocked.action}`,
          blocked.action,
          { idempotencyKey: unit.idempotencyKey },
        );
      }
      const existing = queue.entries.find(entry => entry.idempotencyKey === unit.idempotencyKey);
      const action = classifyQueueAction({
        event: 'enqueue',
        unit,
        existingEntry: existing === undefined ? null : queueClassifierView(existing),
        activeSourceDeviceId: unit.sourceDeviceId,
        tombstone: null,
      });
      if (existing) {
        return {
          action: 'duplicate',
          changed: false,
          queue,
          entry: entryView(existing),
        };
      }
      const sameObject = queue.entries.find(entry => entry.objectIdentityHash === unit.objectIdentityHash);
      if (sameObject) {
        if (unit.unitType === TRACE_DECISION_UNIT_TYPE) {
          throw queueError(
            'The same trace identity already has a different queued content hash',
            'identity-conflict',
            { idempotencyKey: unit.idempotencyKey },
          );
        }
        throw queueError(
          'One object identity can have only one current queue entry; cancel the old entry first',
          'object-entry-exists',
          {
            idempotencyKey: unit.idempotencyKey,
            existingIdempotencyKey: sameObject.idempotencyKey,
          },
        );
      }
      const entry = canonicalizeEntry({
        idempotencyKey: unit.idempotencyKey,
        unitType: unit.unitType,
        objectIdentityHash: unit.objectIdentityHash,
        contentHash: unit.contentHash,
        ...(unit.basisContentHash === undefined ? {} : { basisContentHash: unit.basisContentHash }),
        sourceDeviceId: unit.sourceDeviceId,
        stateUpdatedAt: unit.stateUpdatedAt,
        status: 'pending',
        attempts: 0,
        unit,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastEvent: 'enqueue',
        lastEventAt: timestamp,
      });
      queue.entries.push(entry);
      queue.updatedAt = timestamp;
      queue.audit.push({
        event: 'enqueue',
        action: action.action,
        idempotencyKey: unit.idempotencyKey,
        recordedAt: timestamp,
      });
      return {
        action: apply ? 'enqueued' : 'dry-run-enqueue',
        changed: true,
        queue,
        entry: entryView(entry),
      };
    },
  });
}

function findEntry(queue, idempotencyKey) {
  const key = requireContentHash(idempotencyKey, '$.idempotencyKey');
  const entry = queue.entries.find(item => item.idempotencyKey === key);
  if (!entry) {
    throw queueError('The idempotency key is not in the local queue', 'missing-entry', { idempotencyKey: key });
  }
  return entry;
}

function requireStatusForRetry(entry) {
  if (!['network-failed', 'auth-blocked'].includes(entry.status)) {
    throw queueError(
      `A ${entry.status} entry cannot be retried unchanged`,
      'retry-not-allowed',
      { status: entry.status },
    );
  }
}

export function retrySyncQueueEntry(idempotencyKey, {
  root = getCareerOpsRoot(),
  apply = false,
  now = new Date().toISOString(),
} = {}) {
  return withMutation({
    root,
    apply,
    now,
    mutate: (queue, timestamp) => {
      const entry = findEntry(queue, idempotencyKey);
      requireStatusForRetry(entry);
      const action = classifyQueueAction({
        event: 'retry',
        unit: entry.unit,
        existingEntry: queueClassifierView(entry),
        activeSourceDeviceId: entry.sourceDeviceId,
        tombstone: queue.tombstones.find(item => item.objectIdentityHash === entry.objectIdentityHash) ?? null,
      });
      entry.attempts += 1;
      entry.status = 'pending';
      entry.updatedAt = timestamp;
      entry.lastEvent = 'retry';
      entry.lastEventAt = timestamp;
      queue.updatedAt = timestamp;
      queue.audit.push(auditEventFor('retry', action, entry.idempotencyKey, timestamp));
      return {
        action: apply ? 'retry-scheduled' : 'dry-run-retry',
        changed: true,
        queue,
        entry: entryView(entry),
      };
    },
  });
}

export function cancelSyncQueueEntry(idempotencyKey, {
  root = getCareerOpsRoot(),
  apply = false,
  now = new Date().toISOString(),
} = {}) {
  return withMutation({
    root,
    apply,
    now,
    mutate: (queue, timestamp) => {
      const entry = findEntry(queue, idempotencyKey);
      const action = classifyQueueAction({
        event: 'cancel',
        existingEntry: queueClassifierView(entry),
        activeSourceDeviceId: entry.sourceDeviceId,
        tombstone: null,
      });
      queue.entries = queue.entries.filter(item => item.idempotencyKey !== entry.idempotencyKey);
      queue.updatedAt = timestamp;
      queue.audit.push(auditEventFor('cancel', action, entry.idempotencyKey, timestamp));
      return {
        action: apply ? 'canceled' : 'dry-run-cancel',
        changed: true,
        queue,
        canceledEntry: entryView(entry),
        changesBusinessObject: false,
      };
    },
  });
}

function classificationForMark(entry, event, cloudContentHash) {
  if (event !== 'server-conflict' && event !== 'web-deleted') return null;
  if (cloudContentHash === undefined) {
    throw queueError(`${event} requires --cloud-content-hash`, 'usage', { event });
  }
  if (event === 'server-conflict') {
    if (entry.unit.unitType === OPPORTUNITY_PROGRESS_UNIT_TYPE) {
      return classifyOpportunityProgressSubmission(entry.unit, { contentHash: cloudContentHash });
    }
    return classifyTraceDecisionSubmission(entry.unit, {
      objectIdentityHash: entry.objectIdentityHash,
      contentHash: cloudContentHash,
    });
  }
  return classifyDeletedSubmission(entry.unit, {
    objectIdentityHash: entry.objectIdentityHash,
    contentHash: cloudContentHash,
    tombstoned: true,
  });
}

function requireMarkTransition(entry, event, activeSourceDeviceId) {
  if (event === 'device-rebound') {
    if (activeSourceDeviceId === undefined) {
      throw queueError('device-rebound requires --active-device', 'usage');
    }
    if (activeSourceDeviceId === entry.sourceDeviceId) {
      throw queueError('device-rebound requires a different active device', 'usage');
    }
    if (!['pending', 'network-failed', 'auth-blocked'].includes(entry.status)) {
      throw queueError(`A ${entry.status} entry cannot transition to rebind-blocked`, 'invalid-transition');
    }
    return;
  }
  if (event === 'server-conflict') {
    if (!['pending', 'network-failed'].includes(entry.status)) {
      throw queueError(`A ${entry.status} entry cannot transition to conflicted`, 'invalid-transition');
    }
    return;
  }
  if (event === 'web-deleted') {
    if (!['pending', 'network-failed', 'auth-blocked', 'conflicted'].includes(entry.status)) {
      throw queueError(`A ${entry.status} entry cannot transition to tombstoned`, 'invalid-transition');
    }
    return;
  }
  if (event === 'auth-failed' && !['pending', 'network-failed'].includes(entry.status)) {
    throw queueError(`A ${entry.status} entry cannot transition to auth-blocked`, 'invalid-transition');
  }
  if (event === 'network-failed' && !['pending', 'network-failed'].includes(entry.status)) {
    throw queueError(`A ${entry.status} entry cannot transition to network-failed`, 'invalid-transition');
  }
}

export function markSyncQueueEntry(idempotencyKey, event, {
  root = getCareerOpsRoot(),
  apply = false,
  cloudContentHash,
  activeSourceDeviceId,
  now = new Date().toISOString(),
} = {}) {
  const normalizedEvent = requireEnum(event, '$.event', MARK_EVENTS, ContractToolError, 'invalid-sync-queue');
  const cloudHash = requireOptionalContentHash(cloudContentHash, '$.cloudContentHash');
  if (activeSourceDeviceId !== undefined) {
    requireSafeId(activeSourceDeviceId, '$.activeSourceDeviceId', ContractToolError, 'invalid-sync-queue');
  }
  return withMutation({
    root,
    apply,
    now,
    mutate: (queue, timestamp) => {
      const entry = findEntry(queue, idempotencyKey);
      const classification = classificationForMark(entry, normalizedEvent, cloudHash);
      if (normalizedEvent === 'server-conflict') {
        if (!['conflict', 'identity-conflict'].includes(classification.classification)) {
          throw queueError(
            `The supplied cloud hash classifies as ${classification.classification}, not conflict`,
            'not-a-conflict',
            { classification: classification.classification },
          );
        }
      }
      if (normalizedEvent === 'web-deleted' && classification.classification !== 'tombstoned') {
        throw queueError(
          `The supplied cloud hash classifies as ${classification.classification}, not tombstoned`,
          'not-a-tombstone',
          { classification: classification.classification },
        );
      }
      requireMarkTransition(entry, normalizedEvent, activeSourceDeviceId);
      const action = normalizedEvent === 'network-failed'
        ? {
            action: 'network-failed',
            idempotencyKey: entry.idempotencyKey,
            changesLocalObject: false,
          }
        : classifyQueueAction({
            event: normalizedEvent,
            existingEntry: queueClassifierView(entry),
            activeSourceDeviceId: activeSourceDeviceId ?? entry.sourceDeviceId,
            tombstone: normalizedEvent === 'web-deleted'
              ? {
                  objectIdentityHash: entry.objectIdentityHash,
                  contentHash: cloudHash,
                  tombstoned: true,
                }
              : null,
          });

      if (normalizedEvent === 'auth-failed') entry.status = 'auth-blocked';
      if (normalizedEvent === 'device-rebound') entry.status = 'rebind-blocked';
      if (normalizedEvent === 'network-failed') entry.status = 'network-failed';
      if (normalizedEvent === 'server-conflict') {
        entry.status = 'conflicted';
        entry.lastCloudContentHash = cloudHash;
      }
      if (normalizedEvent === 'web-deleted') {
        entry.status = 'tombstoned';
        queue.tombstones.push(canonicalizeTombstone({
          objectIdentityHash: entry.objectIdentityHash,
          contentHash: cloudHash,
          idempotencyKey: entry.idempotencyKey,
          sourceDeviceId: entry.sourceDeviceId,
          tombstonedAt: timestamp,
        }));
      }
      entry.updatedAt = timestamp;
      entry.lastEvent = normalizedEvent;
      entry.lastEventAt = timestamp;
      queue.updatedAt = timestamp;
      queue.audit.push(auditEventFor(normalizedEvent, action, entry.idempotencyKey, timestamp, cloudHash));
      return {
        action: apply ? action.action : `dry-run-${action.action}`,
        changed: true,
        queue,
        entry: entryView(entry),
        ...(classification === null ? {} : { classification }),
      };
    },
  });
}

export function reconfirmSyncQueueEntry(idempotencyKey, input, {
  root = getCareerOpsRoot(),
  apply = false,
  activeSourceDeviceId,
  now = new Date().toISOString(),
} = {}) {
  if (activeSourceDeviceId === undefined) {
    throw queueError('reconfirm requires --active-device', 'usage');
  }
  const activeDevice = requireSafeId(activeSourceDeviceId, '$.activeSourceDeviceId', ContractToolError, 'invalid-sync-queue');
  const unit = requireUnit(input, '$.unit');
  return withMutation({
    root,
    apply,
    now,
    mutate: (queue, timestamp) => {
      const entry = findEntry(queue, idempotencyKey);
      if (entry.status !== 'rebind-blocked') {
        throw queueError('Only a rebind-blocked entry can be reconfirmed', 'invalid-transition', {
          status: entry.status,
        });
      }
      if (unit.idempotencyKey !== entry.idempotencyKey) {
        throw queueError('Reconfirmation requires the exact queued unit', 'unit-mismatch', {
          expectedIdempotencyKey: entry.idempotencyKey,
          actualIdempotencyKey: unit.idempotencyKey,
        });
      }
      if (activeDevice === entry.sourceDeviceId) {
        throw queueError('Reconfirmation requires a different active device after rebind', 'usage');
      }
      entry.status = 'pending';
      entry.reconfirmedAt = timestamp;
      entry.updatedAt = timestamp;
      entry.lastEvent = 'reconfirm';
      entry.lastEventAt = timestamp;
      queue.updatedAt = timestamp;
      queue.audit.push({
        event: 'reconfirm',
        action: 'reconfirmed',
        idempotencyKey: entry.idempotencyKey,
        recordedAt: timestamp,
      });
      return {
        action: apply ? 'reconfirmed' : 'dry-run-reconfirmed',
        changed: true,
        queue,
        entry: entryView(entry),
      };
    },
  });
}

export function inspectSyncQueue(root = getCareerOpsRoot(), { status } = {}) {
  const filter = status === undefined
    ? undefined
    : requireString(status, '$.status', { min: 1, max: 40 }, ContractToolError, 'invalid-sync-queue');
  if (filter !== undefined && !STATUS_SET.has(filter)) {
    throw queueError(`$.status must be one of: ${SYNC_QUEUE_STATUSES.join(', ')}`);
  }
  try {
    const queue = loadSyncQueue(root);
    if (!queue) {
      return {
        state: 'missing',
        available: false,
        mode: SYNC_QUEUE_MODE,
        counts: { entries: 0, tombstones: 0, audit: 0 },
        entries: [],
        tombstones: [],
        audit: [],
      };
    }
    const entries = queue.entries
      .filter(entry => filter === undefined || entry.status === filter)
      .map(entryView);
    return {
      state: 'ready',
      available: true,
      mode: SYNC_QUEUE_MODE,
      createdAt: queue.createdAt,
      updatedAt: queue.updatedAt,
      counts: {
        entries: queue.entries.length,
        tombstones: queue.tombstones.length,
        audit: queue.audit.length,
      },
      entries,
      tombstones: queue.tombstones,
      audit: queue.audit,
    };
  } catch (error) {
    const code = error instanceof ContractToolError && error.code === 'invalid-contract'
      ? 'invalid-sync-queue'
      : error instanceof ContractToolError ? error.code : 'io-error';
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
      code,
    };
  }
}

function parseArguments(argv) {
  const args = argv.slice(2);
  validateFlags(args, [
    '--json',
    '--apply',
    '--status',
    '--active-device',
    '--cloud-content-hash',
    '--help',
    '-h',
  ], USAGE, {
    valueFlags: ['--status', '--active-device', '--cloud-content-hash'],
    requireOperand: true,
  });
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    return { command: 'help' };
  }
  const json = hasFlag(args, '--json');
  const apply = hasFlag(args, '--apply');
  const status = flagValue(args, '--status');
  const activeDevice = flagValue(args, '--active-device');
  const cloudHash = flagValue(args, '--cloud-content-hash');
  const consumed = new Set();
  args.forEach((arg, index) => {
    if (['--status', '--active-device', '--cloud-content-hash'].includes(arg)) consumed.add(index + 1);
  });
  const operands = args.filter((arg, index) => !arg.startsWith('--') && !consumed.has(index));
  const command = operands[0];
  if (command === 'list') {
    if (operands.length !== 1 || apply || activeDevice !== undefined || cloudHash !== undefined) return null;
    return { command, status, json };
  }
  if (command === 'enqueue') {
    if (operands.length !== 2 || status !== undefined || activeDevice !== undefined || cloudHash !== undefined) return null;
    return { command, unitFile: operands[1], json, apply };
  }
  if (command === 'retry' || command === 'cancel') {
    if (operands.length !== 2 || status !== undefined || activeDevice !== undefined || cloudHash !== undefined) return null;
    return { command, idempotencyKey: operands[1], json, apply };
  }
  if (command === 'mark') {
    if (operands.length !== 3 || status !== undefined) return null;
    return {
      command,
      idempotencyKey: operands[1],
      event: operands[2],
      cloudContentHash: cloudHash,
      activeSourceDeviceId: activeDevice,
      json,
      apply,
    };
  }
  if (command === 'reconfirm') {
    if (operands.length !== 3 || status !== undefined || cloudHash !== undefined || activeDevice === undefined) return null;
    return {
      command,
      idempotencyKey: operands[1],
      unitFile: operands[2],
      activeSourceDeviceId: activeDevice,
      json,
      apply,
    };
  }
  return null;
}

function resultLines(result) {
  const entry = result.entry ?? result.canceledEntry;
  return [
    `状态：${entry?.status ?? 'removed'}`,
    entry ? `对象：${entry.display.target}` : null,
    entry ? `单元：${entry.unitType}` : null,
    entry ? `幂等键：${entry.idempotencyKey}` : null,
    `队列文件：${result.queuePath}`,
    result.backupPath ? `队列备份：${result.backupPath}` : null,
    '本操作不联网、不自动重试，也不修改本机会、tracker、节点、产物、简历或报告。',
  ].filter(Boolean);
}

function listLines(inspection) {
  if (inspection.state === 'missing') {
    return ['同步队列：未创建', '队列仍为本地文件；当前没有联网、自动重试或自动上传行为。'];
  }
  if (inspection.state === 'invalid') {
    return [`同步队列：无效（${inspection.code}）`, inspection.error];
  }
  return [
    '同步队列：ready',
    `条目：${inspection.counts.entries} / 墓碑：${inspection.counts.tombstones} / 审计：${inspection.counts.audit}`,
    ...inspection.entries.map(entry => [
      `- [${entry.status}] ${entry.display.target}`,
      `  ${entry.unitType} / ${entry.idempotencyKey}`,
    ].join('\n')),
  ];
}

function main() {
  const args = parseArguments(process.argv);
  if (!args) {
    console.error(`Invalid arguments.\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  if (args.command === 'help') {
    console.log(USAGE);
    return;
  }
  try {
    if (args.command === 'list') {
      const result = inspectSyncQueue(getCareerOpsRoot(), { status: args.status });
      console.log(args.json ? JSON.stringify({ ok: result.state !== 'invalid', ...result }, null, 2) : listLines(result).join('\n'));
      return;
    }

    let result;
    if (args.command === 'enqueue') {
      result = enqueueSyncUnit(readJsonContract(args.unitFile, { maxBytes: MAX_QUEUE_BYTES }), {
        root: getCareerOpsRoot(),
        apply: args.apply,
      });
    } else if (args.command === 'retry') {
      result = retrySyncQueueEntry(args.idempotencyKey, {
        root: getCareerOpsRoot(),
        apply: args.apply,
      });
    } else if (args.command === 'cancel') {
      result = cancelSyncQueueEntry(args.idempotencyKey, {
        root: getCareerOpsRoot(),
        apply: args.apply,
      });
    } else if (args.command === 'mark') {
      result = markSyncQueueEntry(args.idempotencyKey, args.event, {
        root: getCareerOpsRoot(),
        apply: args.apply,
        cloudContentHash: args.cloudContentHash,
        activeSourceDeviceId: args.activeSourceDeviceId,
      });
    } else {
      result = reconfirmSyncQueueEntry(args.idempotencyKey, readJsonContract(args.unitFile, { maxBytes: MAX_QUEUE_BYTES }), {
        root: getCareerOpsRoot(),
        apply: args.apply,
        activeSourceDeviceId: args.activeSourceDeviceId,
      });
    }
    const payload = { ok: true, ...result, queue: undefined };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `同步队列操作结果：${result.action}`,
      ...resultLines(result),
    ].join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = ['missing-entry', 'retry-not-allowed', 'blocked-tombstone', 'identity-conflict', 'not-a-conflict', 'not-a-tombstone'].includes(code) ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
