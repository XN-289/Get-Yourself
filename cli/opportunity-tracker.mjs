#!/usr/bin/env node

import { ContractToolError, requireArray, requireEnum, requireObjectWithOptional, requireSafeId, requireString, requireTimestamp, semanticHash } from './lib/contract-kit.mjs';

export const OPPORTUNITY_TRACKER_SCHEMA = 'get-yourself.opportunity-tracker';
export const OPPORTUNITY_TRACKER_SCHEMA_VERSION = 1;

const CONFIRMATIONS = new Set(['user_confirmed']);
const STAGE_STATUSES = new Set(['todo', 'active', 'waiting', 'passed', 'failed', 'offer']);
const ARTIFACT_TYPES = new Set(['job-analysis', 'interview-prep', 'interview-review', 'capability-feedback']);

function trackerError(message, code = 'invalid-tracker', details = {}) {
  return new ContractToolError(message, code, details);
}

function requireArtifactRef(item, path, artifacts) {
  requireObjectWithOptional(item, path, ['type', 'id', 'contentHash'], [], ContractToolError, 'invalid-tracker');
  const type = requireEnum(item.type, `${path}.type`, ARTIFACT_TYPES, ContractToolError, 'invalid-tracker');
  const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-tracker');
  const contentHash = requireString(item.contentHash, `${path}.contentHash`, { min: 71, max: 71 }, ContractToolError, 'invalid-tracker');
  const installed = artifacts.get(`${type}:${id}`);
  if (!installed || installed.contentHash !== contentHash) {
    throw trackerError(`${path} references a missing or stale artifact`, 'artifact-mismatch', {
      path,
      type,
      artifactId: id,
    });
  }
  return { type, id, contentHash };
}

function requireStage(item, path, artifacts) {
  requireObjectWithOptional(
    item,
    path,
    ['id', 'name', 'status'],
    ['scheduledAt', 'note', 'artifactRefs'],
    ContractToolError,
    'invalid-tracker',
  );
  const stage = {
    id: requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-tracker'),
    name: requireString(item.name, `${path}.name`, { min: 1, max: 80 }, ContractToolError, 'invalid-tracker'),
    status: requireEnum(item.status, `${path}.status`, STAGE_STATUSES, ContractToolError, 'invalid-tracker'),
  };
  if (item.scheduledAt !== undefined) {
    stage.scheduledAt = requireTimestamp(item.scheduledAt, `${path}.scheduledAt`, ContractToolError, 'invalid-tracker');
  }
  if (item.note !== undefined) {
    stage.note = requireString(item.note, `${path}.note`, { min: 1, max: 500 }, ContractToolError, 'invalid-tracker');
  }
  if (item.artifactRefs !== undefined) {
    const refs = requireArray(item.artifactRefs, `${path}.artifactRefs`, 0, 10, ContractToolError, 'invalid-tracker');
    stage.artifactRefs = refs.map((ref, index) => requireArtifactRef(ref, `${path}.artifactRefs[${index}]`, artifacts));
  }
  return stage;
}

function requireOpportunity(item, path, analyses, artifacts) {
  requireObjectWithOptional(
    item,
    path,
    ['id', 'analysisId', 'analysisContentHash', 'company', 'role', 'nextAction', 'stages'],
    ['location', 'recruitmentBatch', 'source'],
    ContractToolError,
    'invalid-tracker',
  );
  const analysisId = requireSafeId(item.analysisId, `${path}.analysisId`, ContractToolError, 'invalid-tracker');
  const analysisContentHash = requireString(
    item.analysisContentHash,
    `${path}.analysisContentHash`,
    { min: 71, max: 71 },
    ContractToolError,
    'invalid-tracker',
  );
  const analysis = analyses.get(analysisId);
  if (!analysis || analysis.contentHash !== analysisContentHash) {
    throw trackerError(`${path} references a missing or stale job analysis`, 'analysis-mismatch', {
      path,
      analysisId,
    });
  }
  const company = requireString(item.company, `${path}.company`, { min: 1, max: 100 }, ContractToolError, 'invalid-tracker');
  const role = requireString(item.role, `${path}.role`, { min: 1, max: 100 }, ContractToolError, 'invalid-tracker');
  if (company !== analysis.analysis.company || role !== analysis.analysis.role) {
    throw trackerError(`${path}.company and role must match the installed analysis`, 'analysis-mismatch', { path });
  }
  const opportunity = {
    id: requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-tracker'),
    analysisId,
    analysisContentHash,
    company,
    role,
    nextAction: requireString(item.nextAction, `${path}.nextAction`, { min: 1, max: 240 }, ContractToolError, 'invalid-tracker'),
  };
  if (item.location !== undefined) {
    opportunity.location = requireString(item.location, `${path}.location`, { min: 1, max: 80 }, ContractToolError, 'invalid-tracker');
  }
  if (item.recruitmentBatch !== undefined) {
    opportunity.recruitmentBatch = requireString(item.recruitmentBatch, `${path}.recruitmentBatch`, { min: 1, max: 80 }, ContractToolError, 'invalid-tracker');
  }
  if (item.source !== undefined) {
    opportunity.source = requireString(item.source, `${path}.source`, { min: 1, max: 120 }, ContractToolError, 'invalid-tracker');
  }
  opportunity.stages = requireArray(item.stages, `${path}.stages`, 1, 30, ContractToolError, 'invalid-tracker')
    .map((stage, index) => requireStage(stage, `${path}.stages[${index}]`, artifacts));
  return opportunity;
}

export function canonicalizeOpportunityTracker(input, dependencies = {}) {
  requireObjectWithOptional(
    input,
    '$',
    ['schema', 'schemaVersion', 'trackerId', 'generatedAt', 'traceId', 'confirmation', 'opportunities'],
    [],
    ContractToolError,
    'invalid-tracker',
  );
  if (input.schema !== OPPORTUNITY_TRACKER_SCHEMA) {
    throw trackerError(`$.schema must be ${OPPORTUNITY_TRACKER_SCHEMA}`, 'invalid-tracker', { path: '$.schema' });
  }
  if (input.schemaVersion !== OPPORTUNITY_TRACKER_SCHEMA_VERSION) {
    throw trackerError(`$.schemaVersion must be ${OPPORTUNITY_TRACKER_SCHEMA_VERSION}`, 'unsupported-version', {
      path: '$.schemaVersion',
    });
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-tracker');
  const opportunities = requireArray(input.opportunities, '$.opportunities', 1, 50, ContractToolError, 'invalid-tracker')
    .map((item, index) => requireOpportunity(
      item,
      `$.opportunities[${index}]`,
      dependencies.analyses ?? new Map(),
      dependencies.artifacts ?? new Map(),
    ));
  const tracker = {
    schema: OPPORTUNITY_TRACKER_SCHEMA,
    schemaVersion: OPPORTUNITY_TRACKER_SCHEMA_VERSION,
    trackerId: requireSafeId(input.trackerId, '$.trackerId', ContractToolError, 'invalid-tracker'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-tracker'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-tracker'),
    confirmation: input.confirmation,
    opportunities,
  };
  const contentHash = semanticHash({ ...tracker, generatedAt: undefined });
  return {
    tracker,
    canonicalJson: JSON.stringify(tracker, null, 2),
    contentHash,
    summary: {
      trackerId: tracker.trackerId,
      schemaVersion: tracker.schemaVersion,
      generatedAt: tracker.generatedAt,
      opportunityCount: opportunities.length,
      stageCount: opportunities.reduce((total, opportunity) => total + opportunity.stages.length, 0),
      contentHash,
    },
  };
}
