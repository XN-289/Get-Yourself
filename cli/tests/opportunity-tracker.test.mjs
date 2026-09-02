import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { importJobAnalysis, loadInstalledJobAnalysis } from '../job-analysis.mjs';
import { importResumeMaterials, loadInstalledResumeMaterials } from '../resume-materials.mjs';
import {
  canonicalizeOpportunityTracker,
} from '../opportunity-tracker.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const materialsExamplePath = join(cliRoot, 'templates/resume-materials.example.json');
const analysisExamplePath = join(cliRoot, 'templates/job-analysis.example.json');

function installJobAnalysis(root) {
  importResumeMaterials(materialsExamplePath, { root, apply: true });
  const materials = loadInstalledResumeMaterials(root);
  importJobAnalysis(analysisExamplePath, { root, apply: true });
  return { materials, analysis: loadInstalledJobAnalysis(root, materials, 'job-analysis-demo-2026-09-02') };
}

function buildTracker(analysis, overrides = {}) {
  const tracker = {
    schema: 'get-yourself.opportunity-tracker',
    schemaVersion: 1,
    trackerId: 'opportunity-tracker-demo',
    generatedAt: '2026-09-02T12:00:00.000Z',
    traceId: 'trace.opportunity-tracker-demo',
    confirmation: 'user_confirmed',
    opportunities: [
      {
        id: 'demo-tech-backend',
        analysisId: analysis.analysis.analysisId,
        analysisContentHash: analysis.contentHash,
        company: analysis.analysis.company,
        role: analysis.analysis.role,
        location: '上海',
        recruitmentBatch: '2027届秋招',
        source: '官网',
        nextAction: '补充公司主体和薪资信息后决定是否投递。',
        stages: [
          {
            id: 'stage-jd-analysis',
            name: 'JD 分析',
            status: 'passed',
            note: '岗位分析已完成。',
            artifactRefs: [
              { type: 'job-analysis', id: analysis.analysis.analysisId, contentHash: analysis.contentHash },
            ],
          },
          {
            id: 'stage-application',
            name: '投递',
            status: 'active',
            scheduledAt: '2026-09-03T10:00:00.000Z',
          },
        ],
      },
    ],
  };
  return { ...tracker, ...overrides };
}

function dependenciesFor(analysis) {
  return {
    analyses: new Map([[analysis.analysis.analysisId, analysis]]),
    artifacts: new Map([[`job-analysis:${analysis.analysis.analysisId}`, analysis]]),
  };
}

test('canonicalizes opportunities with analysis provenance and ordering-sensitive hashes', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-opportunity-tracker-canonical-'));
  try {
    const { materials, analysis } = installJobAnalysis(root);
    assert.equal(materials.package.packageId, 'resume-materials-demo-2026-09-01');

    const result = canonicalizeOpportunityTracker(buildTracker(analysis), dependenciesFor(analysis));
    assert.equal(result.summary.trackerId, 'opportunity-tracker-demo');
    assert.equal(result.summary.opportunityCount, 1);
    assert.equal(result.summary.stageCount, 2);
    assert.match(result.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(
      canonicalizeOpportunityTracker(
        buildTracker(analysis, { generatedAt: '2026-09-02T13:00:00.000Z' }),
        dependenciesFor(analysis),
      ).contentHash,
      result.contentHash,
    );

    const reordered = buildTracker(analysis);
    reordered.opportunities[0].stages.reverse();
    assert.notEqual(
      canonicalizeOpportunityTracker(reordered, dependenciesFor(analysis)).contentHash,
      result.contentHash,
    );
    assert.equal(existsSync(join(root, 'data/opportunity-tracker')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects duplicate natural identities and duplicate object IDs', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-opportunity-tracker-duplicate-'));
  try {
    const { analysis } = installJobAnalysis(root);
    const duplicateIdentity = buildTracker(analysis);
    const duplicatedOpportunity = structuredClone(duplicateIdentity.opportunities[0]);
    duplicatedOpportunity.id = 'demo-tech-backend-duplicate';
    duplicateIdentity.opportunities.push(duplicatedOpportunity);
    assert.throws(
      () => canonicalizeOpportunityTracker(duplicateIdentity, dependenciesFor(analysis)),
      /duplicate natural identity/i,
    );

    const duplicateStageId = buildTracker(analysis);
    const duplicatedStage = structuredClone(duplicateStageId.opportunities[0].stages[1]);
    duplicatedStage.name = '笔试';
    duplicateStageId.opportunities[0].stages.push(duplicatedStage);
    assert.throws(
      () => canonicalizeOpportunityTracker(duplicateStageId, dependenciesFor(analysis)),
      /id is duplicate: stage-application/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
