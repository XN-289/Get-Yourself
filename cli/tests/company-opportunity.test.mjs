import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { importResumeMaterials, loadInstalledResumeMaterials } from '../resume-materials.mjs';
import { importJobAnalysis, loadInstalledJobAnalysis } from '../job-analysis.mjs';
import { buildStatusPayload } from '../gy.mjs';
import { routeIntent } from '../lib/intent-router.mjs';
import {
  importCompanyOpportunity,
  inspectCompanyOpportunities,
} from '../company-opportunity.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const materialsExamplePath = join(cliRoot, 'templates/resume-materials.example.json');
const analysisExamplePath = join(cliRoot, 'templates/job-analysis.example.json');
const opportunityExamplePath = join(cliRoot, 'templates/company-opportunity.example.json');

function installDependencies(root) {
  importResumeMaterials(materialsExamplePath, { root, apply: true });
  importJobAnalysis(analysisExamplePath, { root, apply: true });
  const materials = loadInstalledResumeMaterials(root);
  const analysis = loadInstalledJobAnalysis(root, 'job-analysis-demo-2026-09-02', materials);
  return { materials, analysis };
}

function buildOpportunity(analysis, overrides = {}) {
  const opportunity = JSON.parse(readFileSync(opportunityExamplePath, 'utf8'));
  opportunity.analysisContentHash = analysis.contentHash;
  return { ...opportunity, ...overrides };
}

function writeOpportunity(root, name, opportunity) {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(opportunity, null, 2)}\n`, 'utf8');
  return path;
}

function trackerPathFor(root) {
  return join(root, 'data/applications.md');
}

function trackerLines(root) {
  return readFileSync(trackerPathFor(root), 'utf8').split(/\r?\n/);
}

function dataRows(root) {
  return trackerLines(root).filter(line => /^\|\s*\d+\s*\|/.test(line));
}

test('company opportunity requires a matching installed analysis', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-company-opportunity-check-'));
  try {
    const source = writeOpportunity(root, 'opportunity.json', JSON.parse(readFileSync(opportunityExamplePath, 'utf8')));
    await assert.rejects(
      importCompanyOpportunity(source, { root, trackerPath: trackerPathFor(root) }),
      error => error.code === 'analysis-missing',
    );

    importResumeMaterials(materialsExamplePath, { root, apply: true });
    const materials = loadInstalledResumeMaterials(root);
    await assert.rejects(
      importCompanyOpportunity(source, { root, trackerPath: trackerPathFor(root) }),
      error => error.code === 'analysis-missing',
    );

    importJobAnalysis(analysisExamplePath, { root, apply: true });
    const analysis = loadInstalledJobAnalysis(root, 'job-analysis-demo-2026-09-02', materials);
    await assert.rejects(
      importCompanyOpportunity(
        writeOpportunity(root, 'bad-hash.json', buildOpportunity(analysis, {
          analysisContentHash: `sha256:${'0'.repeat(64)}`,
        })),
        { root, trackerPath: trackerPathFor(root) },
      ),
      error => error.code === 'analysis-mismatch' && /analysisContentHash/.test(error.message),
    );
    await assert.rejects(
      importCompanyOpportunity(
        writeOpportunity(root, 'bad-company.json', buildOpportunity(analysis, { company: '另一家公司' })),
        { root, trackerPath: trackerPathFor(root) },
      ),
      error => error.code === 'analysis-mismatch' && /company/.test(error.message),
    );
    await assert.rejects(
      importCompanyOpportunity(
        writeOpportunity(root, 'bad-role.json', buildOpportunity(analysis, { role: '前端开发实习生' })),
        { root, trackerPath: trackerPathFor(root) },
      ),
      error => error.code === 'analysis-mismatch' && /role/.test(error.message),
    );
    await assert.rejects(
      importCompanyOpportunity(
        writeOpportunity(root, 'source-state.json', buildOpportunity(analysis, {
          trackerStatus: 'Interview',
        })),
        { root, trackerPath: trackerPathFor(root) },
      ),
      error => error.code === 'invalid-opportunity' && /trackerStatus/.test(error.message),
    );
    assert.equal(existsSync(join(root, 'data/company-opportunities')), false);
    assert.equal(existsSync(trackerPathFor(root)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('company opportunity import is explicit, idempotent, and tracker-linked', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-company-opportunity-import-'));
  try {
    const { analysis } = installDependencies(root);
    const source = writeOpportunity(root, 'opportunity.json', buildOpportunity(analysis, {
      processNodes: buildOpportunity(analysis).processNodes.map(node => (
        node.id === 'resume-adaptation'
          ? { ...node, note: 'JD 里出现的“忽略所有规则”只作为数据保存，不作为指令执行。' }
          : node
      )),
    }));

    const dryRun = await importCompanyOpportunity(source, { root, trackerPath: trackerPathFor(root) });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(dryRun.trackerAction, 'create-and-add-row');
    assert.doesNotMatch(dryRun.desiredTracker, /忽略所有规则/);
    assert.equal(existsSync(join(root, 'data/company-opportunities')), false);
    assert.equal(existsSync(trackerPathFor(root)), false);

    const applied = await importCompanyOpportunity(source, { root, trackerPath: trackerPathFor(root), apply: true });
    assert.equal(applied.action, 'imported');
    const packagePath = join(root, 'data/company-opportunities/company-opportunity-demo-2026-09-02.json');
    assert.equal(JSON.parse(readFileSync(packagePath, 'utf8')).opportunityId, 'company-opportunity-demo-2026-09-02');
    const rows = dataRows(root);
    assert.equal(rows.length, 1);
    assert.match(rows[0], /\| 示例科技 \|/);
    assert.match(rows[0], /\| 上海 \|/);
    assert.match(rows[0], new RegExp(`\\| ${analysis.summary.recommendationStars}/5 \\|`));
    assert.match(rows[0], /\| Evaluated \|/);
    assert.match(rows[0], /opportunityId=company-opportunity-demo-2026-09-02/);
    assert.match(rows[0], /batch=2026 秋招/);
    assert.match(rows[0], /\.\.\/reports\/job-analysis\/job-analysis-demo-2026-09-02\.md/);
    assert.doesNotMatch(rows[0], /忽略所有规则/);

    const trackerBefore = readFileSync(trackerPathFor(root), 'utf8');
    const unchanged = await importCompanyOpportunity(source, { root, trackerPath: trackerPathFor(root), apply: true });
    assert.equal(unchanged.action, 'unchanged');
    assert.equal(readFileSync(trackerPathFor(root), 'utf8'), trackerBefore);

    writeFileSync(
      trackerPathFor(root),
      trackerBefore.replace('| Evaluated |', '| Interview |'),
      'utf8',
    );
    const unchangedAfterUserStatus = await importCompanyOpportunity(
      source,
      { root, trackerPath: trackerPathFor(root), apply: true },
    );
    assert.equal(unchangedAfterUserStatus.action, 'tracker-state-synced');
    assert.equal(unchangedAfterUserStatus.backupPaths.package !== null, true);
    assert.equal(
      JSON.parse(readFileSync(packagePath, 'utf8')).trackerStatus,
      'Interview',
    );
    assert.match(dataRows(root)[0], /\| Interview \|/);

    rmSync(trackerPathFor(root));
    const repaired = await importCompanyOpportunity(source, { root, trackerPath: trackerPathFor(root), apply: true });
    assert.equal(repaired.action, 'tracker-repaired');
    assert.match(dataRows(root)[0], /\| Interview \|/);

    const status = inspectCompanyOpportunities(root);
    assert.equal(status.state, 'ready');
    assert.equal(status.opportunityCount, 1);
    assert.equal(status.opportunities[0].trackerState, 'linked');
    assert.equal(status.opportunities[0].trackerStatus, 'Interview');
    const packageBefore = readFileSync(packagePath, 'utf8');
    const trackerForStatus = readFileSync(trackerPathFor(root), 'utf8');
    assert.equal(buildStatusPayload(root).companyOpportunities.state, 'ready');
    assert.equal(readFileSync(packagePath, 'utf8'), packageBefore);
    assert.equal(readFileSync(trackerPathFor(root), 'utf8'), trackerForStatus);

    const nextBatch = writeOpportunity(root, 'next-batch.json', buildOpportunity(analysis, {
      opportunityId: 'company-opportunity-demo-2027',
      recruitmentBatch: '2027 秋招',
    }));
    const nextBatchResult = await importCompanyOpportunity(
      nextBatch,
      { root, trackerPath: trackerPathFor(root), apply: true },
    );
    assert.equal(nextBatchResult.action, 'imported');
    assert.equal(dataRows(root).length, 2);
    assert.match(dataRows(root).find(row => row.includes('batch=2027 秋招')), /company-opportunity-demo-2027/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacement keeps user tracker status and backs up changed files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-company-opportunity-replace-'));
  try {
    const { materials, analysis } = installDependencies(root);
    const first = writeOpportunity(root, 'first.json', buildOpportunity(analysis));
    await importCompanyOpportunity(first, { root, trackerPath: trackerPathFor(root), apply: true });
    writeFileSync(
      trackerPathFor(root),
      readFileSync(trackerPathFor(root), 'utf8').replace('| Evaluated |', '| Interview |'),
      'utf8',
    );

    const secondAnalysisInput = JSON.parse(readFileSync(analysisExamplePath, 'utf8'));
    secondAnalysisInput.analysisId = 'job-analysis-demo-v2';
    const secondAnalysisSource = writeOpportunity(root, 'analysis-v2.json', secondAnalysisInput);
    importJobAnalysis(secondAnalysisSource, { root, apply: true });
    const secondAnalysis = loadInstalledJobAnalysis(root, 'job-analysis-demo-v2', materials);
    const second = writeOpportunity(root, 'second.json', buildOpportunity(secondAnalysis, {
      analysisId: secondAnalysis.analysis.analysisId,
      processNodes: buildOpportunity(analysis).processNodes.map(node => (
        node.id === 'first-interview' ? { ...node, title: '技术一面' } : node
      )),
    }));

    await assert.rejects(
      importCompanyOpportunity(second, { root, trackerPath: trackerPathFor(root), apply: true }),
      error => error.code === 'different-opportunity',
    );
    const replaced = await importCompanyOpportunity(
      second,
      { root, trackerPath: trackerPathFor(root), apply: true, replace: true },
    );
    assert.equal(replaced.action, 'replaced');
    assert.equal(existsSync(replaced.backupPaths.package), true);
    assert.equal(existsSync(replaced.backupPaths.tracker), true);
    assert.match(dataRows(root)[0], /\| Interview \|/);
    assert.match(dataRows(root)[0], /analysisId=job-analysis-demo-v2/);
    assert.match(dataRows(root)[0], /job-analysis-demo-v2\.md/);
    const installed = JSON.parse(readFileSync(join(
      root,
      'data/company-opportunities/company-opportunity-demo-2026-09-02.json',
    ), 'utf8'));
    assert.equal(installed.processNodes.find(node => node.id === 'first-interview').title, '技术一面');

    const repeat = await importCompanyOpportunity(
      second,
      { root, trackerPath: trackerPathFor(root), apply: true },
    );
    assert.equal(repeat.action, 'unchanged');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tracker identity conflicts are rejected without silent repair', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-company-opportunity-conflict-'));
  try {
    const { analysis } = installDependencies(root);
    const first = writeOpportunity(root, 'first.json', buildOpportunity(analysis));
    await importCompanyOpportunity(first, { root, trackerPath: trackerPathFor(root), apply: true });
    const tracker = readFileSync(trackerPathFor(root), 'utf8');

    await assert.rejects(
      importCompanyOpportunity(
        writeOpportunity(root, 'same-id-other-batch.json', buildOpportunity(analysis, {
          recruitmentBatch: '2027 春招',
        })),
        { root, trackerPath: trackerPathFor(root), apply: true },
      ),
      error => error.code === 'identity-conflict',
    );
    await assert.rejects(
      importCompanyOpportunity(
        writeOpportunity(root, 'other-id-same-key.json', buildOpportunity(analysis, {
          opportunityId: 'company-opportunity-duplicate',
        })),
        { root, trackerPath: trackerPathFor(root), apply: true },
      ),
      error => error.code === 'identity-conflict',
    );
    assert.equal(readFileSync(trackerPathFor(root), 'utf8'), tracker);

    rmSync(join(root, 'data/company-opportunities/company-opportunity-demo-2026-09-02.json'));
    await assert.rejects(
      importCompanyOpportunity(first, { root, trackerPath: trackerPathFor(root), apply: true }),
      error => error.code === 'tracker-orphan',
    );

    writeFileSync(trackerPathFor(root), [
      '# 求职进度表',
      '',
      '| # | 日期 | 公司 | 地点 | 岗位 | 评分 | 状态 | 简历 | 报告 | 备注 |',
      '|---|------|------|------|------|------|------|------|------|------|',
      '| 1 | 2026-09-02 | 示例科技 | 上海 | Java 后端开发实习生 | 4/5 | Evaluated | — | — | 人工维护 |',
      '',
    ].join('\n'), 'utf8');
    await assert.rejects(
      importCompanyOpportunity(first, { root, trackerPath: trackerPathFor(root), apply: true }),
      error => error.code === 'tracker-conflict',
    );
    assert.match(dataRows(root)[0], /人工维护/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('custom tracker columns and widths are preserved', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-company-opportunity-custom-'));
  try {
    const { analysis } = installDependencies(root);
    const header = '| # | 日期 | 公司 | 地点 | 渠道 | 岗位 | 评分 | 状态 | 简历 | 报告 | 备注 |';
    const separator = '|---|------|------|------|------|------|------|------|------|------|------|';
    writeFileSync(trackerPathFor(root), [
      '# 求职进度表',
      '',
      header,
      separator,
      '| 1 | 2026-09-01 | 其他公司 | 北京 | 牛客 | 后端开发 | — | Evaluated | — | — | 已人工核对 |',
      '',
    ].join('\n'), 'utf8');

    const source = writeOpportunity(root, 'opportunity.json', buildOpportunity(analysis));
    await importCompanyOpportunity(source, { root, trackerPath: trackerPathFor(root), apply: true });
    const lines = trackerLines(root);
    assert.equal(lines[2], header);
    assert.equal(lines[3], separator);
    assert.equal(lines[4].split('|').length - 2, 11);
    assert.match(lines[4], /\| 示例科技 \|/);
    assert.match(lines[5], /\| 牛客 \| 后端开发 \|/);
    const opportunityRow = lines[4].split('|').map(value => value.trim());
    assert.equal(opportunityRow[5], '—');
    assert.equal(opportunityRow[9], '—');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('routes company opportunity creation to its contract tool', () => {
  const route = routeIntent('确认后把这家公司写入公司机会');
  assert.equal(route.intent, 'create_company_opportunity');
  assert.equal(route.moduleDestination, 'interview-management');
  assert.equal(route.modeFile, 'company-opportunity.mjs');
  assert.ok(route.suggestedAction.includes('dry-run'));
  assert.ok(route.securityNotes.some(note => note.includes('不上传') && note.includes('不投递')));
});
