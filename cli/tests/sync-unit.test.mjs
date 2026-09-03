import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  buildOpportunityProgressUnit,
  buildTraceDecisionUnit,
  canonicalHash,
  canonicalJson,
  classifyDeletedSubmission,
  classifyOpportunityProgressSubmission,
  classifyQueueAction,
  classifyTraceDecisionSubmission,
  validateSyncUnit,
} from '../sync-unit.mjs';

const contentHash = `sha256:${'1'.repeat(64)}`;
const otherContentHash = `sha256:${'2'.repeat(64)}`;

function opportunityInput(overrides = {}) {
  return {
    sourceDeviceId: 'device-a',
    summaryGeneratedAt: '2026-09-03T08:00:00.000Z',
    userConfirmation: { confirmedAt: '2026-09-03T08:01:00.000Z' },
    opportunity: {
      schemaVersion: 1,
      company: '示例 科技',
      role: 'Java 后端开发实习生',
      location: '上海',
      recruitmentBatch: '2026 秋招',
      analysisId: 'job-analysis-demo',
      analysisContentHash: contentHash,
      trackerStatus: 'Evaluated',
      stateUpdatedAt: '2026-09-03T07:00:00.000Z',
      userConfirmed: true,
      processNodes: [{
        id: 'jd-analysis',
        type: 'jd_analysis',
        title: 'JD 分析',
        status: 'passed',
        nextAction: '准备投递',
      }],
      artifacts: [{
        mountId: 'mount-jd-analysis',
        kind: 'job_analysis',
        title: 'JD 分析报告',
        contentHash: otherContentHash,
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
      targetAfterContentHash: contentHash,
      contractIdentity: 'resume-materials-v1',
      contractContentHash: otherContentHash,
      userConfirmedAt: '2026-09-03T07:59:00.000Z',
      completedAt: '2026-09-03T08:00:30.000Z',
      resultReason: '用户确认后导入素材包',
    },
    ...overrides,
  };
}

function queueEntry(unit, status = 'pending') {
  return {
    idempotencyKey: unit.idempotencyKey,
    status,
    sourceDeviceId: unit.sourceDeviceId,
  };
}

function tombstoneFor(unit) {
  return {
    objectIdentityHash: unit.objectIdentityHash,
    contentHash: unit.contentHash,
    tombstoned: true,
  };
}

test('canonical JSON sorts keys recursively and hashes UTF-8 bytes', () => {
  const value = { z: '求职', a: ['2', 1], nested: { y: false, a: null } };
  const canonical = '{"a":["2",1],"nested":{"a":null,"y":false},"z":"求职"}';
  assert.equal(canonicalJson(value), canonical);
  assert.equal(
    canonicalHash(value),
    `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`,
  );
});

test('opportunity natural identity is stable while displayed text stays authoritative', () => {
  const first = buildOpportunityProgressUnit(opportunityInput());
  const second = buildOpportunityProgressUnit(opportunityInput({
    opportunity: {
      ...opportunityInput().opportunity,
      company: '示例  科技',
      role: 'java 后端开发实习生',
      location: '上海 ',
    },
  }));
  assert.notEqual(first.objectIdentityHash, '');
  assert.equal(second.objectIdentityHash, first.objectIdentityHash);
  assert.notEqual(second.contentHash, first.contentHash);
  assert.equal(second.summary.company, '示例  科技');
  assert.equal(second.summary.role, 'java 后端开发实习生');
  assert.equal(second.summary.location, '上海 ');
});

test('sync units preserve user-visible whitespace instead of trimming it', () => {
  const unit = buildOpportunityProgressUnit(opportunityInput({
      opportunity: {
        ...opportunityInput().opportunity,
        company: ' 示例科技',
      },
  }));
  assert.equal(unit.summary.company, ' 示例科技');
  assert.equal(unit.contentHash, canonicalHash(unit.summary));
});

test('generation time is envelope-only and semantic state time is hashed', () => {
  const first = buildOpportunityProgressUnit(opportunityInput());
  const regenerated = buildOpportunityProgressUnit(opportunityInput({
    summaryGeneratedAt: '2026-09-03T09:00:00.000Z',
  }));
  assert.equal(regenerated.contentHash, first.contentHash);
  assert.equal(regenerated.idempotencyKey, first.idempotencyKey);
  assert.notEqual(regenerated.summaryGeneratedAt, first.summaryGeneratedAt);

  const changedState = buildOpportunityProgressUnit(opportunityInput({
    opportunity: {
      ...opportunityInput().opportunity,
      stateUpdatedAt: '2026-09-03T07:30:00.000Z',
    },
  }));
  assert.notEqual(changedState.contentHash, first.contentHash);
  assert.notEqual(changedState.idempotencyKey, first.idempotencyKey);
});

test('prohibited private and full-text fields are rejected before validation', () => {
  const opportunityCases = [
    () => opportunityInput({ opportunity: { ...opportunityInput().opportunity, jdText: 'JD 原文' } }),
    () => opportunityInput({
      opportunity: {
        ...opportunityInput().opportunity,
        processNodes: [{ ...opportunityInput().opportunity.processNodes[0], privateNote: '私人备注' }],
      },
    }),
    () => opportunityInput({
      opportunity: {
        ...opportunityInput().opportunity,
        artifacts: [{ ...opportunityInput().opportunity.artifacts[0], path: 'C:/resume.md' }],
      },
    }),
  ];

  for (const build of opportunityCases) {
    assert.throws(
      () => buildOpportunityProgressUnit(build()),
      error => error.code === 'prohibited-field',
    );
  }

  for (const key of ['resumeText', 'terminalLog']) {
    assert.throws(
      () => buildTraceDecisionUnit(traceInput({
        trace: { ...traceInput().trace, [key]: 'full text' },
      })),
      error => error.code === 'prohibited-field',
    );
  }
});

test('validator recomputes identity, content, idempotency, and state time', () => {
  const unit = buildOpportunityProgressUnit(opportunityInput());
  assert.deepEqual(validateSyncUnit(unit), unit);

  const tampered = structuredClone(unit);
  tampered.summary.trackerStatus = 'Interview';
  assert.throws(() => validateSyncUnit(tampered), error => error.code === 'invalid-sync-unit');

  const wrongKey = structuredClone(unit);
  wrongKey.idempotencyKey = otherContentHash;
  assert.throws(() => validateSyncUnit(wrongKey), error => /idempotencyKey/.test(error.message));
});

test('opportunity snapshots classify first, idempotent, accepted, and stale basis', () => {
  const first = buildOpportunityProgressUnit(opportunityInput());
  assert.equal(classifyOpportunityProgressSubmission(first, null).classification, 'first');
  assert.equal(
    classifyOpportunityProgressSubmission(first, { contentHash: first.contentHash }).classification,
    'idempotent',
  );

  const updated = buildOpportunityProgressUnit(opportunityInput({
    basisContentHash: first.contentHash,
    opportunity: {
      ...opportunityInput().opportunity,
      trackerStatus: 'Interview',
      stateUpdatedAt: '2026-09-03T07:30:00.000Z',
    },
  }));
  const accepted = classifyOpportunityProgressSubmission(updated, {
    contentHash: first.contentHash,
  });
  assert.equal(accepted.classification, 'accepted');
  assert.equal(accepted.previousContentHash, first.contentHash);

  const stale = classifyOpportunityProgressSubmission(updated, {
    contentHash: otherContentHash,
  });
  assert.equal(stale.classification, 'conflict');
  assert.equal(stale.resolution, 'user-choice');
});

test('opportunity units converge across devices and conflict on divergent content', () => {
  const local = buildOpportunityProgressUnit(opportunityInput());
  const otherDevice = buildOpportunityProgressUnit(opportunityInput({
    sourceDeviceId: 'device-b',
  }));
  assert.equal(otherDevice.objectIdentityHash, local.objectIdentityHash);
  assert.equal(otherDevice.contentHash, local.contentHash);
  assert.equal(otherDevice.idempotencyKey, local.idempotencyKey);
  assert.equal(
    classifyOpportunityProgressSubmission(otherDevice, { contentHash: local.contentHash })
      .classification,
    'idempotent',
  );

  const divergent = buildOpportunityProgressUnit(opportunityInput({
    sourceDeviceId: 'device-b',
    opportunity: {
      ...opportunityInput().opportunity,
      trackerStatus: 'Interview',
      stateUpdatedAt: '2026-09-03T07:40:00.000Z',
    },
  }));
  assert.equal(
    classifyOpportunityProgressSubmission(divergent, { contentHash: local.contentHash })
      .classification,
    'conflict',
  );
});

test('trace decisions are append-only, idempotent, and identity-bound', () => {
  const first = buildTraceDecisionUnit(traceInput());
  const repeat = buildTraceDecisionUnit(traceInput({
    summaryGeneratedAt: '2026-09-03T09:00:00.000Z',
  }));
  assert.equal(repeat.objectIdentityHash, first.objectIdentityHash);
  assert.equal(repeat.contentHash, first.contentHash);
  assert.equal(
    classifyTraceDecisionSubmission(repeat, {
      objectIdentityHash: first.objectIdentityHash,
      contentHash: first.contentHash,
    }).classification,
    'idempotent',
  );

  const changed = buildTraceDecisionUnit(traceInput({
    trace: { ...traceInput().trace, resultReason: '用户取消后未执行' },
  }));
  const conflict = classifyTraceDecisionSubmission(changed, {
    objectIdentityHash: first.objectIdentityHash,
    contentHash: first.contentHash,
  });
  assert.equal(conflict.classification, 'identity-conflict');
  assert.equal(conflict.resolution, 'reject');

  const otherDevice = buildTraceDecisionUnit(traceInput({ sourceDeviceId: 'device-b' }));
  assert.notEqual(otherDevice.objectIdentityHash, first.objectIdentityHash);
});

test('queue enqueue is one entry per idempotency key', () => {
  const unit = buildOpportunityProgressUnit(opportunityInput());
  const action = classifyQueueAction({
    event: 'enqueue',
    unit,
    existingEntry: null,
    activeSourceDeviceId: unit.sourceDeviceId,
  });
  assert.equal(action.action, 'enqueue');

  const duplicate = classifyQueueAction({
    event: 'enqueue',
    unit,
    existingEntry: queueEntry(unit),
    activeSourceDeviceId: unit.sourceDeviceId,
  });
  assert.equal(duplicate.action, 'duplicate');
  assert.equal(duplicate.idempotencyKey, unit.idempotencyKey);
});

test('auth failure blocks, rebind requires confirmation, and cancel never writes locally', () => {
  const unit = buildOpportunityProgressUnit(opportunityInput());
  const entry = queueEntry(unit, 'pending');
  assert.equal(classifyQueueAction({
    event: 'auth-failed',
    existingEntry: entry,
    activeSourceDeviceId: unit.sourceDeviceId,
  }).action, 'blocked-auth');

  assert.equal(classifyQueueAction({
    event: 'device-rebound',
    existingEntry: entry,
    activeSourceDeviceId: 'device-b',
  }).action, 'blocked-rebind');

  const canceled = classifyQueueAction({
    event: 'cancel',
    existingEntry: entry,
    activeSourceDeviceId: 'device-b',
  });
  assert.equal(canceled.action, 'canceled');
  assert.equal(canceled.changesLocalObject, false);
});

test('conflicted submissions cannot be retried unchanged', () => {
  const unit = buildOpportunityProgressUnit(opportunityInput());
  const conflicted = classifyQueueAction({
    event: 'server-conflict',
    existingEntry: queueEntry(unit, 'conflicted'),
    activeSourceDeviceId: unit.sourceDeviceId,
  });
  assert.equal(conflicted.action, 'conflicted');
  assert.equal(conflicted.unchangedRetryAllowed, false);
});

test('deletion tombstones block resurrection without deleting local objects', () => {
  const unit = buildOpportunityProgressUnit(opportunityInput());
  const tombstone = tombstoneFor(unit);

  const deleted = classifyDeletedSubmission(unit, tombstone);
  assert.equal(deleted.classification, 'tombstoned');
  assert.equal(deleted.deletesLocalObject, false);

  assert.equal(classifyQueueAction({
    event: 'enqueue',
    unit,
    tombstone,
    activeSourceDeviceId: unit.sourceDeviceId,
  }).action, 'blocked-tombstone');

  const retry = classifyQueueAction({
    event: 'retry',
    unit,
    existingEntry: queueEntry(unit, 'pending'),
    activeSourceDeviceId: unit.sourceDeviceId,
    tombstone,
  });
  assert.equal(retry.action, 'blocked-tombstone');
  assert.equal(retry.changesLocalObject, false);
});

test('retry requires the exact unit and rejects trace identity changes', () => {
  const unit = buildOpportunityProgressUnit(opportunityInput());
  assert.throws(
    () => classifyQueueAction({
      event: 'retry',
      existingEntry: queueEntry(unit, 'network-failed'),
      activeSourceDeviceId: unit.sourceDeviceId,
    }),
    error => /retry requires/.test(error.message),
  );

  const trace = buildTraceDecisionUnit(traceInput());
  const changed = buildTraceDecisionUnit(traceInput({
    trace: { ...traceInput().trace, resultReason: '同 Trace 不同内容' },
  }));
  const result = classifyQueueAction({
    event: 'retry',
    unit: changed,
    existingEntry: queueEntry(changed, 'network-failed'),
    activeSourceDeviceId: changed.sourceDeviceId,
    tombstone: tombstoneFor(trace),
  });
  assert.equal(result.action, 'identity-conflict');
  assert.equal(result.changesLocalObject, false);
});
