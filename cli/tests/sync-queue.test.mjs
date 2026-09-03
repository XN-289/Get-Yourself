import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  buildOpportunityProgressUnit,
  buildTraceDecisionUnit,
} from '../sync-unit.mjs';
import {
  SYNC_QUEUE_MODE,
  SYNC_QUEUE_PATH,
  cancelSyncQueueEntry,
  enqueueSyncUnit,
  inspectSyncQueue,
  loadSyncQueue,
  markSyncQueueEntry,
  reconfirmSyncQueueEntry,
  retrySyncQueueEntry,
} from '../sync-queue.mjs';

const analysisHash = `sha256:${'1'.repeat(64)}`;
const artifactHash = `sha256:${'2'.repeat(64)}`;
const cloudHash = `sha256:${'3'.repeat(64)}`;
const queueTime = '2026-09-03T10:00:00.000Z';
const nextTime = '2026-09-03T10:01:00.000Z';

function opportunityInput(overrides = {}) {
  return {
    sourceDeviceId: 'device-a',
    summaryGeneratedAt: '2026-09-03T08:00:00.000Z',
    userConfirmation: { confirmedAt: '2026-09-03T08:01:00.000Z' },
    opportunity: {
      schemaVersion: 1,
      company: '示例科技',
      role: 'Java 后端开发实习生',
      location: '上海',
      recruitmentBatch: '2026 秋招',
      analysisId: 'job-analysis-demo',
      analysisContentHash: analysisHash,
      trackerStatus: 'Evaluated',
      stateUpdatedAt: '2026-09-03T07:00:00.000Z',
      userConfirmed: true,
      processNodes: [{
        id: 'jd-analysis',
        type: 'jd_analysis',
        title: 'JD 分析',
        status: 'passed',
      }],
      artifacts: [{
        mountId: 'mount-jd-analysis',
        kind: 'job_analysis',
        title: 'JD 分析报告',
        contentHash: artifactHash,
      }],
    },
    ...overrides,
  };
}

function traceInput(overrides = {}) {
  return {
    sourceDeviceId: 'device-a',
    summaryGeneratedAt: '2026-09-03T08:00:00.000Z',
    userConfirmation: { confirmedAt: '2026-09-03T08:01:00.000Z' },
    trace: {
      traceId: 'trace-demo',
      skillKey: 'resume-materials',
      toolKey: 'resume-materials-import',
      action: 'import-package',
      result: 'dispatched',
      targetModule: 'resume-management',
      targetObjectIdentity: 'materials-demo',
      targetAfterContentHash: analysisHash,
      contractIdentity: 'resume-materials-v1',
      contractContentHash: artifactHash,
      userConfirmedAt: '2026-09-03T07:59:00.000Z',
      completedAt: '2026-09-03T08:00:30.000Z',
      resultReason: '用户确认后导入素材包',
    },
    ...overrides,
  };
}

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), 'gy-sync-queue-'));
}

function writeBusinessObject(root) {
  const path = join(root, 'data', 'company-opportunities', 'demo.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '{"unchanged":true}\n', 'utf8');
  return { path, content: '{"unchanged":true}\n' };
}

test('queue enqueue is explicit, idempotent, and local-only', () => {
  const root = temporaryRoot();
  try {
    const unit = buildOpportunityProgressUnit(opportunityInput());
    const dryRun = enqueueSyncUnit(unit, { root, now: queueTime });
    assert.equal(dryRun.action, 'dry-run-enqueue');
    assert.equal(existsSync(join(root, SYNC_QUEUE_PATH)), false);

    const applied = enqueueSyncUnit(unit, { root, apply: true, now: queueTime });
    assert.equal(applied.action, 'enqueued');
    assert.equal(applied.backupPath, null);
    const queue = loadSyncQueue(root);
    assert.equal(queue.entries.length, 1);
    assert.equal(queue.entries[0].status, 'pending');
    assert.equal(queue.entries[0].attempts, 0);
    assert.deepEqual(queue.audit, [{
      event: 'enqueue',
      action: 'enqueue',
      idempotencyKey: unit.idempotencyKey,
      recordedAt: queueTime,
    }]);

    const duplicate = enqueueSyncUnit(unit, { root, apply: true, now: nextTime });
    assert.equal(duplicate.action, 'duplicate');
    assert.equal(loadSyncQueue(root).entries.length, 1);

    const previousQueueJson = `${JSON.stringify(applied.queue, null, 2)}\n`;
    const blocked = markSyncQueueEntry(unit.idempotencyKey, 'auth-failed', {
      root,
      apply: true,
      now: '2026-09-03T10:02:00.000Z',
    });
    assert.equal(blocked.entry.status, 'auth-blocked');
    assert.equal(readFileSync(blocked.backupPath, 'utf8'), previousQueueJson);
    assert.deepEqual(SYNC_QUEUE_MODE, {
      offline: true,
      persistsQueue: true,
      network: false,
      automaticUpload: false,
      automaticRetry: false,
      writesBusinessObjects: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('one object identity has one current entry and a changed trace identity is rejected', () => {
  const root = temporaryRoot();
  try {
    const first = buildOpportunityProgressUnit(opportunityInput());
    enqueueSyncUnit(first, { root, apply: true, now: queueTime });
    const updated = buildOpportunityProgressUnit(opportunityInput({
      opportunity: {
        ...opportunityInput().opportunity,
        trackerStatus: 'Interview',
        stateUpdatedAt: '2026-09-03T07:30:00.000Z',
      },
    }));
    assert.throws(
      () => enqueueSyncUnit(updated, { root, apply: true, now: nextTime }),
      error => error.code === 'object-entry-exists',
    );

    const traceRoot = temporaryRoot();
    try {
      const trace = buildTraceDecisionUnit(traceInput());
      enqueueSyncUnit(trace, { traceRoot, apply: true, now: queueTime });
      const changed = buildTraceDecisionUnit(traceInput({
        trace: { ...traceInput().trace, resultReason: '同 Trace 不同内容' },
      }));
      assert.throws(
        () => enqueueSyncUnit(changed, { traceRoot, apply: true, now: nextTime }),
        error => error.code === 'identity-conflict',
      );
    } finally {
      rmSync(traceRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('auth and network failures expose blocked and retryable states with one key', () => {
  const root = temporaryRoot();
  try {
    const unit = buildOpportunityProgressUnit(opportunityInput());
    enqueueSyncUnit(unit, { root, apply: true, now: queueTime });

    const blocked = markSyncQueueEntry(unit.idempotencyKey, 'auth-failed', {
      root,
      apply: true,
      now: nextTime,
    });
    assert.equal(blocked.entry.status, 'auth-blocked');

    const retried = retrySyncQueueEntry(unit.idempotencyKey, {
      root,
      apply: true,
      now: '2026-09-03T10:02:00.000Z',
    });
    assert.equal(retried.entry.status, 'pending');
    assert.equal(retried.entry.attempts, 1);
    assert.equal(loadSyncQueue(root).entries.length, 1);

    markSyncQueueEntry(unit.idempotencyKey, 'network-failed', {
      root,
      apply: true,
      now: '2026-09-03T10:03:00.000Z',
    });
    const secondRetry = retrySyncQueueEntry(unit.idempotencyKey, {
      root,
      apply: true,
      now: '2026-09-03T10:04:00.000Z',
    });
    assert.equal(secondRetry.entry.attempts, 2);
    assert.equal(loadSyncQueue(root).entries.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rebind blocks an old unit until the exact unit is reconfirmed', () => {
  const root = temporaryRoot();
  try {
    const unit = buildOpportunityProgressUnit(opportunityInput());
    enqueueSyncUnit(unit, { root, apply: true, now: queueTime });
    const blocked = markSyncQueueEntry(unit.idempotencyKey, 'device-rebound', {
      root,
      apply: true,
      activeSourceDeviceId: 'device-b',
      now: nextTime,
    });
    assert.equal(blocked.entry.status, 'rebind-blocked');

    assert.throws(
      () => retrySyncQueueEntry(unit.idempotencyKey, { root, apply: true, now: nextTime }),
      error => error.code === 'retry-not-allowed',
    );
    assert.throws(
      () => reconfirmSyncQueueEntry(unit.idempotencyKey, buildTraceDecisionUnit(traceInput()), {
        root,
        apply: true,
        activeSourceDeviceId: 'device-b',
        now: nextTime,
      }),
      error => error.code === 'unit-mismatch',
    );

    const reconfirmed = reconfirmSyncQueueEntry(unit.idempotencyKey, unit, {
      root,
      apply: true,
      activeSourceDeviceId: 'device-b',
      now: '2026-09-03T10:02:00.000Z',
    });
    assert.equal(reconfirmed.entry.status, 'pending');
    assert.equal(reconfirmed.entry.reconfirmedAt, '2026-09-03T10:02:00.000Z');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('conflict carries cloud evidence and cannot be retried unchanged', () => {
  const root = temporaryRoot();
  try {
    const unit = buildOpportunityProgressUnit(opportunityInput());
    enqueueSyncUnit(unit, { root, apply: true, now: queueTime });
    const conflicted = markSyncQueueEntry(unit.idempotencyKey, 'server-conflict', {
      root,
      apply: true,
      cloudContentHash: cloudHash,
      now: nextTime,
    });
    assert.equal(conflicted.entry.status, 'conflicted');
    assert.equal(conflicted.entry.lastCloudContentHash, cloudHash);
    assert.equal(conflicted.classification.classification, 'conflict');

    assert.throws(
      () => retrySyncQueueEntry(unit.idempotencyKey, { root, apply: true, now: nextTime }),
      error => error.code === 'retry-not-allowed',
    );

    assert.throws(
      () => markSyncQueueEntry(unit.idempotencyKey, 'server-conflict', {
        root,
        apply: true,
        cloudContentHash: unit.contentHash,
        now: nextTime,
      }),
      error => error.code === 'not-a-conflict',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cancel removes only the queue entry and keeps an audit trail', () => {
  const root = temporaryRoot();
  try {
    const business = writeBusinessObject(root);
    const unit = buildOpportunityProgressUnit(opportunityInput());
    enqueueSyncUnit(unit, { root, apply: true, now: queueTime });
    const canceled = cancelSyncQueueEntry(unit.idempotencyKey, {
      root,
      apply: true,
      now: nextTime,
    });
    assert.equal(canceled.action, 'canceled');
    assert.equal(canceled.changesBusinessObject, false);

    const queue = loadSyncQueue(root);
    assert.equal(queue.entries.length, 0);
    assert.equal(queue.audit.length, 2);
    assert.equal(queue.audit.at(-1).event, 'cancel');
    assert.equal(readFileSync(business.path, 'utf8'), business.content);
    assert.throws(
      () => retrySyncQueueEntry(unit.idempotencyKey, { root, apply: true, now: nextTime }),
      error => error.code === 'missing-entry',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('web deletion tombstones the exact content and blocks resurrection', () => {
  const root = temporaryRoot();
  try {
    const business = writeBusinessObject(root);
    const unit = buildOpportunityProgressUnit(opportunityInput());
    enqueueSyncUnit(unit, { root, apply: true, now: queueTime });
    const deleted = markSyncQueueEntry(unit.idempotencyKey, 'web-deleted', {
      root,
      apply: true,
      cloudContentHash: unit.contentHash,
      now: nextTime,
    });
    assert.equal(deleted.entry.status, 'tombstoned');

    const queue = loadSyncQueue(root);
    assert.equal(queue.tombstones.length, 1);
    assert.equal(queue.tombstones[0].changesLocalObject, undefined);
    assert.equal(readFileSync(business.path, 'utf8'), business.content);
    assert.throws(
      () => enqueueSyncUnit(unit, { root, apply: true, now: nextTime }),
      error => error.code === 'blocked-tombstone',
    );
    assert.equal(loadSyncQueue(root).entries.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('trace tombstones also reject a different content hash for the same identity', () => {
  const root = temporaryRoot();
  try {
    const trace = buildTraceDecisionUnit(traceInput());
    enqueueSyncUnit(trace, { root, apply: true, now: queueTime });
    markSyncQueueEntry(trace.idempotencyKey, 'web-deleted', {
      root,
      apply: true,
      cloudContentHash: trace.contentHash,
      now: nextTime,
    });
    const changed = buildTraceDecisionUnit(traceInput({
      trace: { ...traceInput().trace, resultReason: '同 Trace 不同内容' },
    }));
    assert.throws(
      () => enqueueSyncUnit(changed, { root, apply: true, now: nextTime }),
      error => error.code === 'identity-conflict',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('list exposes filtered user-visible states and invalid queue state without writes', () => {
  const root = temporaryRoot();
  try {
    const missing = inspectSyncQueue(root);
    assert.equal(missing.state, 'missing');
    assert.deepEqual(missing.counts, { entries: 0, tombstones: 0, audit: 0 });

    const unit = buildOpportunityProgressUnit(opportunityInput());
    enqueueSyncUnit(unit, { root, apply: true, now: queueTime });
    markSyncQueueEntry(unit.idempotencyKey, 'auth-failed', {
      root,
      apply: true,
      now: nextTime,
    });
    const ready = inspectSyncQueue(root);
    assert.equal(ready.state, 'ready');
    assert.equal(ready.entries[0].status, 'auth-blocked');
    const filtered = inspectSyncQueue(root, { status: 'pending' });
    assert.deepEqual(filtered.entries, []);
    assert.throws(
      () => inspectSyncQueue(root, { status: 'unknown' }),
      /status must be one of/,
    );

    writeFileSync(join(root, SYNC_QUEUE_PATH), '{"schema":"broken"}\n', 'utf8');
    const invalid = inspectSyncQueue(root);
    assert.equal(invalid.state, 'invalid');
    assert.equal(invalid.code, 'invalid-sync-queue');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
