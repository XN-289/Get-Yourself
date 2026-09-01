#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
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
  requireStringList,
  requireTimestamp,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';

export const JOB_ANALYSIS_SCHEMA = 'get-yourself.job-analysis';
export const JOB_ANALYSIS_SCHEMA_VERSION = 1;
export const JOB_ANALYSIS_PACKAGE_DIR = 'data/job-analysis';
export const JOB_ANALYSIS_MARKDOWN_DIR = 'reports/job-analysis';
export const JOB_ANALYSIS_BACKUP_DIR = 'data/job-analysis-backups';

const MAX_PACKAGE_BYTES = 512 * 1024;
const MAX_MARKDOWN_BYTES = 1024 * 1024;
const MAX_ANALYSES = 100;
const MAX_BACKUPS_PER_ANALYSIS = 10;
const CONFIRMATIONS = new Set(['user_confirmed']);
const JD_SOURCE_TYPES = new Set(['text', 'url']);
const MATCH_LEVELS = new Set([0, 0.5, 1]);
const SCORE_LEVELS = new Set([0, 0.5, 1]);
const INFORMATION_STATES = new Set(['sufficient', 'insufficient']);
const GAP_SEVERITIES = new Set(['recoverable_30_days', 'hard_to_close', 'low_priority']);
const RED_FLAG_SEVERITIES = new Set(['warning', 'red_line']);
const MATCH_BANDS = new Set([
  'direct_match',
  'strong_match',
  'medium_match',
  'weak_match',
  'no_match',
]);

const USAGE = `Usage:
  node job-analysis.mjs check <analysis.json> [--json]
  node job-analysis.mjs import <analysis.json> [--apply] [--replace] [--json]`;

function analysisError(message, code = 'invalid-analysis', details = {}) {
  return new ContractToolError(message, code, details);
}

function requireScore(value, path, allowed) {
  if (!allowed.has(value)) {
    throw analysisError(`${path} must be one of: ${[...allowed].join(', ')}`, 'invalid-analysis', { path });
  }
  return value;
}

function requireHttpUrl(value, path) {
  const text = requireString(value, path, { min: 8, max: 500 }, ContractToolError, 'invalid-analysis');
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw analysisError(`${path} must be an absolute http(s) URL`, 'invalid-analysis', { path });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw analysisError(`${path} must use http or https`, 'invalid-analysis', { path });
  }
  return text;
}

function requireEvidenceRefs(value, path, knownEvidenceIds, matchLevel) {
  const refs = requireArray(value, path, 0, 5, ContractToolError, 'invalid-analysis')
    .map((item, index) => {
      const id = requireSafeId(item, `${path}[${index}]`, ContractToolError, 'invalid-analysis');
      if (!knownEvidenceIds.has(id)) {
        throw analysisError(`${path}[${index}] references unknown evidence reference ${id}`, 'invalid-analysis', {
          path,
          evidenceRef: id,
        });
      }
      return id;
    });
  if (new Set(refs).size !== refs.length) {
    throw analysisError(`${path} contains duplicate references`, 'invalid-analysis', { path });
  }
  if (matchLevel > 0 && refs.length === 0) {
    throw analysisError(`${path} must cite materials evidence when matchLevel is greater than zero`, 'invalid-analysis', { path });
  }
  return refs;
}

function requireRequirementRefs(value, path, knownRequirementIds, allowEmpty) {
  const refs = requireArray(value, path, allowEmpty ? 0 : 1, 10, ContractToolError, 'invalid-analysis')
    .map((item, index) => {
      const id = requireSafeId(item, `${path}[${index}]`, ContractToolError, 'invalid-analysis');
      if (!knownRequirementIds.has(id)) {
        throw analysisError(`${path}[${index}] references unknown requirement reference ${id}`, 'invalid-analysis', {
          path,
          requirementRef: id,
        });
      }
      return id;
    });
  if (new Set(refs).size !== refs.length) {
    throw analysisError(`${path} contains duplicate references`, 'invalid-analysis', { path });
  }
  return refs;
}

function requireUniqueIds(items, path) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      throw analysisError(`${path} contains duplicate id ${item.id}`, 'invalid-analysis', { path, id: item.id });
    }
    seen.add(item.id);
  }
  return seen;
}

function average(items) {
  if (items.length === 0) return 0;
  return items.reduce((total, value) => total + value, 0) / items.length;
}

function roundScore(value) {
  return Math.round(value * 10000) / 10000;
}

function matchBand(score) {
  if (score >= 0.85) return 'direct_match';
  if (score >= 0.7) return 'strong_match';
  if (score >= 0.55) return 'medium_match';
  if (score >= 0.4) return 'weak_match';
  return 'no_match';
}

function matchQuality(score) {
  if (score >= 0.85) return 1;
  if (score >= 0.7) return 0.8;
  if (score >= 0.55) return 0.5;
  if (score >= 0.4) return 0.3;
  return 0;
}

function recommendationLabel(stars) {
  return {
    5: '优先投递',
    4: '值得投递',
    3: '可谨慎考虑',
    2: '不建议优先投递',
    1: '不建议投递',
  }[stars];
}

function calculateAssessment(analysis) {
  const mustAverage = average(analysis.mustHave.map(item => item.matchLevel));
  const niceAverage = average(analysis.niceToHave.map(item => item.matchLevel));
  const hiddenAverage = average(analysis.hiddenSignals.map(item => item.matchLevel));
  const rawMatch = 0.6 * mustAverage + 0.2 * niceAverage + 0.2 * hiddenAverage;
  const unmetMustHaveCount = analysis.mustHave.filter(item => item.matchLevel === 0).length;
  const unmetThresholdCount = analysis.mustHave.filter(item => item.isThreshold && item.matchLevel === 0).length;

  let matchCap = 1;
  let cappedBy = null;
  if (unmetThresholdCount > 0) {
    matchCap = 0.35;
    cappedBy = 'unmet_threshold_requirement';
  } else if (unmetMustHaveCount >= 2) {
    matchCap = 0.55;
    cappedBy = 'two_unmet_must_have';
  } else if (unmetMustHaveCount === 1) {
    matchCap = 0.75;
    cappedBy = 'one_unmet_must_have';
  }
  const matchScore = roundScore(Math.min(rawMatch, matchCap));
  const evaluation = analysis.evaluation;
  const weighted = 0.3 * matchQuality(matchScore)
    + 0.25 * evaluation.careerTrajectory
    + 0.2 * (1 - evaluation.downsideRisk)
    + 0.15 * evaluation.compensationFit
    + 0.1 * evaluation.opportunityCost;
  const rawStars = weighted >= 0.85 ? 5 : weighted >= 0.7 ? 4 : weighted >= 0.55 ? 3 : weighted >= 0.4 ? 2 : 1;
  const hasRedLine = analysis.redFlags.some(flag => flag.severity === 'red_line' || flag.dealBreaker);
  const recommendationStars = hasRedLine ? Math.min(rawStars, 2) : rawStars;

  return {
    matchScore,
    matchRange: [roundScore(Math.max(0, matchScore - 0.05)), roundScore(Math.min(1, matchScore + 0.05))],
    matchBand: matchBand(matchScore),
    matchCap,
    cappedBy,
    unmetMustHaveCount,
    unmetThresholdCount,
    recommendationStars,
    recommendationLabel: recommendationLabel(recommendationStars),
    recommendationCapped: hasRedLine,
  };
}

function canonicalizeJd(input) {
  requireObjectWithOptional(
    input,
    '$.jd',
    ['sourceType'],
    ['text', 'url'],
    ContractToolError,
    'invalid-analysis',
  );
  const sourceType = requireEnum(input.sourceType, '$.jd.sourceType', JD_SOURCE_TYPES, ContractToolError, 'invalid-analysis');
  if (sourceType === 'text') {
    if (input.url !== undefined) {
      throw analysisError('$.jd.url must be omitted when sourceType is text', 'invalid-analysis', { path: '$.jd.url' });
    }
    return {
      sourceType,
      text: requireString(input.text, '$.jd.text', { min: 20, max: 30000 }, ContractToolError, 'invalid-analysis'),
    };
  }

  const jd = {
    sourceType,
    url: requireHttpUrl(input.url, '$.jd.url'),
  };
  if (input.text !== undefined) {
    jd.text = requireString(input.text, '$.jd.text', { min: 20, max: 30000 }, ContractToolError, 'invalid-analysis');
  }
  return jd;
}

function canonicalizeRequirements(input, path, knownEvidenceIds) {
  return input.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    requireObjectWithOptional(
      item,
      itemPath,
      ['id', 'requirement', 'matchLevel', 'evidenceRefs'],
      ['isThreshold'],
      ContractToolError,
      'invalid-analysis',
    );
    const matchLevel = requireScore(item.matchLevel, `${itemPath}.matchLevel`, MATCH_LEVELS);
    return {
      id: requireSafeId(item.id, `${itemPath}.id`, ContractToolError, 'invalid-analysis'),
      requirement: requireString(item.requirement, `${itemPath}.requirement`, { min: 2, max: 240 }, ContractToolError, 'invalid-analysis'),
      matchLevel,
      evidenceRefs: requireEvidenceRefs(item.evidenceRefs, `${itemPath}.evidenceRefs`, knownEvidenceIds, matchLevel),
      isThreshold: item.isThreshold === undefined ? false : item.isThreshold === true,
    };
  });
}

function canonicalizeGaps(input, knownRequirementIds) {
  return input.map((item, index) => {
    const path = `$.capabilityGaps[${index}]`;
    requireObject(item, path, ['id', 'requirementRefs', 'severity', 'description', 'action'], ContractToolError, 'invalid-analysis');
    return {
      id: requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-analysis'),
      requirementRefs: requireRequirementRefs(item.requirementRefs, `${path}.requirementRefs`, knownRequirementIds, false),
      severity: requireEnum(item.severity, `${path}.severity`, GAP_SEVERITIES, ContractToolError, 'invalid-analysis'),
      description: requireString(item.description, `${path}.description`, { min: 2, max: 500 }, ContractToolError, 'invalid-analysis'),
      action: requireString(item.action, `${path}.action`, { min: 2, max: 500 }, ContractToolError, 'invalid-analysis'),
    };
  });
}

function canonicalizeRisks(input) {
  return input.map((item, index) => {
    const path = `$.recruiterRisks[${index}]`;
    requireObject(item, path, ['id', 'concern', 'response'], ContractToolError, 'invalid-analysis');
    return {
      id: requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-analysis'),
      concern: requireString(item.concern, `${path}.concern`, { min: 2, max: 300 }, ContractToolError, 'invalid-analysis'),
      response: requireString(item.response, `${path}.response`, { min: 2, max: 500 }, ContractToolError, 'invalid-analysis'),
    };
  });
}

function canonicalizeRedFlags(input) {
  return input.map((item, index) => {
    const path = `$.redFlags[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['id', 'signal', 'evidence', 'severity'],
      ['dealBreaker'],
      ContractToolError,
      'invalid-analysis',
    );
    return {
      id: requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-analysis'),
      signal: requireString(item.signal, `${path}.signal`, { min: 2, max: 160 }, ContractToolError, 'invalid-analysis'),
      evidence: requireString(item.evidence, `${path}.evidence`, { min: 2, max: 500 }, ContractToolError, 'invalid-analysis'),
      severity: requireEnum(item.severity, `${path}.severity`, RED_FLAG_SEVERITIES, ContractToolError, 'invalid-analysis'),
      dealBreaker: item.dealBreaker === undefined ? false : item.dealBreaker === true,
    };
  });
}

function canonicalizeTopics(input, knownRequirementIds) {
  return input.map((item, index) => {
    const path = `$.interviewTopics[${index}]`;
    requireObject(item, path, ['id', 'topic', 'question', 'requirementRefs'], ContractToolError, 'invalid-analysis');
    return {
      id: requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-analysis'),
      topic: requireString(item.topic, `${path}.topic`, { min: 2, max: 80 }, ContractToolError, 'invalid-analysis'),
      question: requireString(item.question, `${path}.question`, { min: 2, max: 300 }, ContractToolError, 'invalid-analysis'),
      requirementRefs: requireRequirementRefs(item.requirementRefs, `${path}.requirementRefs`, knownRequirementIds, false),
    };
  });
}

function canonicalizeEvaluation(input) {
  requireObject(input, '$.evaluation', [
    'careerTrajectory',
    'downsideRisk',
    'compensationFit',
    'opportunityCost',
    'companyInformation',
    'payInformation',
    'policyInformation',
  ], ContractToolError, 'invalid-analysis');
  return {
    careerTrajectory: requireScore(input.careerTrajectory, '$.evaluation.careerTrajectory', SCORE_LEVELS),
    downsideRisk: requireScore(input.downsideRisk, '$.evaluation.downsideRisk', SCORE_LEVELS),
    compensationFit: requireScore(input.compensationFit, '$.evaluation.compensationFit', SCORE_LEVELS),
    opportunityCost: requireScore(input.opportunityCost, '$.evaluation.opportunityCost', SCORE_LEVELS),
    companyInformation: requireEnum(input.companyInformation, '$.evaluation.companyInformation', INFORMATION_STATES, ContractToolError, 'invalid-analysis'),
    payInformation: requireEnum(input.payInformation, '$.evaluation.payInformation', INFORMATION_STATES, ContractToolError, 'invalid-analysis'),
    policyInformation: requireEnum(input.policyInformation, '$.evaluation.policyInformation', INFORMATION_STATES, ContractToolError, 'invalid-analysis'),
  };
}

export function canonicalizeJobAnalysis(input, materials = null) {
  requireObjectWithOptional(input, '$', [
    'schema',
    'schemaVersion',
    'analysisId',
    'generatedAt',
    'traceId',
    'materialsPackageId',
    'materialsContentHash',
    'company',
    'role',
    'confirmation',
    'jd',
    'mustHave',
    'niceToHave',
    'hiddenSignals',
    'capabilityGaps',
    'recruiterRisks',
    'redFlags',
    'interviewTopics',
    'evaluation',
    'nextActions',
  ], ['assessment'], ContractToolError, 'invalid-analysis');
  if (input.schema !== JOB_ANALYSIS_SCHEMA) {
    throw analysisError(`$.schema must be ${JOB_ANALYSIS_SCHEMA}`, 'invalid-analysis', { path: '$.schema' });
  }
  if (input.schemaVersion !== JOB_ANALYSIS_SCHEMA_VERSION) {
    throw analysisError(`$.schemaVersion must be ${JOB_ANALYSIS_SCHEMA_VERSION}`, 'unsupported-version', { path: '$.schemaVersion' });
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-analysis');
  if (!materials) {
    throw analysisError('Job analysis requires installed resume materials', 'materials-missing');
  }
  if (input.materialsPackageId !== materials.package.packageId) {
    throw analysisError('materialsPackageId does not match the installed package', 'materials-mismatch');
  }
  if (input.materialsContentHash !== materials.contentHash) {
    throw analysisError(
      'materialsContentHash does not match the installed package; regenerate the analysis after confirming current materials.',
      'materials-mismatch',
    );
  }

  const evidenceIds = new Set([
    ...materials.package.entries.map(entry => entry.id),
    ...materials.package.stories.map(story => story.id),
  ]);
  const mustHave = canonicalizeRequirements(
    requireArray(input.mustHave, '$.mustHave', 1, 30, ContractToolError, 'invalid-analysis'),
    '$.mustHave',
    evidenceIds,
  );
  const niceToHave = canonicalizeRequirements(
    requireArray(input.niceToHave, '$.niceToHave', 1, 30, ContractToolError, 'invalid-analysis'),
    '$.niceToHave',
    evidenceIds,
  );
  const hiddenSignals = canonicalizeRequirements(
    requireArray(input.hiddenSignals, '$.hiddenSignals', 1, 20, ContractToolError, 'invalid-analysis'),
    '$.hiddenSignals',
    evidenceIds,
  );
  const requirementIds = new Set([...mustHave, ...niceToHave, ...hiddenSignals].map(item => item.id));
  requireUniqueIds([...mustHave, ...niceToHave, ...hiddenSignals], '$.mustHave + $.niceToHave + $.hiddenSignals');

  const analysis = {
    schema: JOB_ANALYSIS_SCHEMA,
    schemaVersion: JOB_ANALYSIS_SCHEMA_VERSION,
    analysisId: requireSafeId(input.analysisId, '$.analysisId', ContractToolError, 'invalid-analysis'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-analysis'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-analysis'),
    materialsPackageId: input.materialsPackageId,
    materialsContentHash: input.materialsContentHash,
    company: requireString(input.company, '$.company', { min: 2, max: 100 }, ContractToolError, 'invalid-analysis'),
    role: requireString(input.role, '$.role', { min: 2, max: 100 }, ContractToolError, 'invalid-analysis'),
    confirmation: input.confirmation,
    jd: canonicalizeJd(input.jd),
    mustHave,
    niceToHave,
    hiddenSignals,
    capabilityGaps: canonicalizeGaps(
      requireArray(input.capabilityGaps, '$.capabilityGaps', 0, 30, ContractToolError, 'invalid-analysis'),
      requirementIds,
    ),
    recruiterRisks: canonicalizeRisks(
      requireArray(input.recruiterRisks, '$.recruiterRisks', 0, 30, ContractToolError, 'invalid-analysis'),
    ),
    redFlags: canonicalizeRedFlags(
      requireArray(input.redFlags, '$.redFlags', 0, 20, ContractToolError, 'invalid-analysis'),
    ),
    interviewTopics: canonicalizeTopics(
      requireArray(input.interviewTopics, '$.interviewTopics', 1, 30, ContractToolError, 'invalid-analysis'),
      requirementIds,
    ),
    evaluation: canonicalizeEvaluation(input.evaluation),
    nextActions: requireStringList(input.nextActions, '$.nextActions', 1, 20, 2, 300, ContractToolError, 'invalid-analysis'),
  };
  requireUniqueIds([
    ...analysis.capabilityGaps,
    ...analysis.recruiterRisks,
    ...analysis.redFlags,
    ...analysis.interviewTopics,
  ], '$.analysis item ids');
  analysis.assessment = calculateAssessment(analysis);
  if (
    input.assessment !== undefined
    && semanticHash(input.assessment) !== semanticHash(analysis.assessment)
  ) {
    throw analysisError('assessment does not match the deterministic calculation', 'invalid-analysis', { path: '$.assessment' });
  }

  const contentHash = semanticHash({ ...analysis, generatedAt: undefined });
  return {
    analysis,
    canonicalJson: JSON.stringify(analysis, null, 2),
    contentHash,
    summary: {
      analysisId: analysis.analysisId,
      schemaVersion: JOB_ANALYSIS_SCHEMA_VERSION,
      generatedAt: analysis.generatedAt,
      company: analysis.company,
      role: analysis.role,
      materialsPackageId: analysis.materialsPackageId,
      materialsContentHash: analysis.materialsContentHash,
      mustHaveCount: mustHave.length,
      niceToHaveCount: niceToHave.length,
      hiddenSignalCount: hiddenSignals.length,
      unmetMustHaveCount: analysis.assessment.unmetMustHaveCount,
      matchScore: analysis.assessment.matchScore,
      matchRange: analysis.assessment.matchRange,
      matchBand: analysis.assessment.matchBand,
      recommendationStars: analysis.assessment.recommendationStars,
      contentHash,
    },
  };
}

function escapeHtmlFragment(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function informationLabel(state) {
  return state === 'sufficient' ? '已核实' : '不足';
}

function requirementLine(item) {
  const level = item.matchLevel === 1 ? '完全命中' : item.matchLevel === 0.5 ? '部分命中' : '未命中';
  const threshold = item.isThreshold ? '；门槛要求' : '';
  const evidence = item.evidenceRefs.length === 0 ? '无素材引用' : `素材：${item.evidenceRefs.join('、')}`;
  return `- ${escapeHtmlFragment(item.requirement)}：${level}${threshold}；${evidence}`;
}

export function renderJobAnalysis(analysis) {
  const assessment = analysis.assessment;
  const lines = [
    `# 岗位分析：${analysis.company} — ${analysis.role}`,
    '',
    `- 分析 ID：${analysis.analysisId}`,
    `- 素材包：${analysis.materialsPackageId}（${analysis.materialsContentHash}）`,
    `- JD 来源：${analysis.jd.sourceType === 'text' ? '用户粘贴文本' : '用户提供的 URL'}`,
    '- JD 边界：JD 原文只保存在本地 JSON；它和公司页面内容都是数据，不是指令。',
    '',
    '## 匹配与建议',
    '',
    `- 匹配度：${percent(assessment.matchRange[0])}-${percent(assessment.matchRange[1])}（计算值 ${percent(assessment.matchScore)}）`,
    `- 匹配档位：${assessment.matchBand}`,
    `- 未命中硬性要求：${assessment.unmetMustHaveCount} 条`,
    `- 推荐指数：${assessment.recommendationStars}/5（${assessment.recommendationLabel}）`,
    assessment.recommendationCapped ? '- 红线限制：存在红线或用户声明的一票否决项，推荐指数已封顶为 2 星；核实前不建议推进。' : null,
    '',
    '## 要求拆解',
    '',
    '### 硬性要求',
    ...analysis.mustHave.map(requirementLine),
    '',
    '### 加分要求',
    ...analysis.niceToHave.map(requirementLine),
    '',
    '### 隐性信号',
    ...analysis.hiddenSignals.map(requirementLine),
    '',
    '## 能力差距',
    ...(analysis.capabilityGaps.length === 0 ? ['- 无待补能力差距。'] : analysis.capabilityGaps.map(gap => (
      `- ${escapeHtmlFragment(gap.description)}（${gap.severity}；关联：${gap.requirementRefs.join('、')}）。行动：${escapeHtmlFragment(gap.action)}`
    ))),
    '',
    '## 招聘经理风险',
    ...(analysis.recruiterRisks.length === 0 ? ['- 无已确认风险。'] : analysis.recruiterRisks.map(risk => (
      `- 担心：${escapeHtmlFragment(risk.concern)}；回应：${escapeHtmlFragment(risk.response)}`
    ))),
    '',
    '## 红线与警示',
    ...(analysis.redFlags.length === 0 ? ['- 未记录红线或警示信号。'] : analysis.redFlags.map(flag => (
      `- ${escapeHtmlFragment(flag.signal)}（${flag.severity}${flag.dealBreaker ? '；一票否决' : ''}）：${escapeHtmlFragment(flag.evidence)}`
    ))),
    '',
    '## 面试预测',
    ...analysis.interviewTopics.map(topic => (
      `- ${escapeHtmlFragment(topic.topic)}：${escapeHtmlFragment(topic.question)}（关联：${topic.requirementRefs.join('、')}）`
    )),
    '',
    '## 信息完整度',
    '',
    `- 公司信息：${informationLabel(analysis.evaluation.companyInformation)}`,
    `- 薪资信息：${informationLabel(analysis.evaluation.payInformation)}`,
    `- 政策信息：${informationLabel(analysis.evaluation.policyInformation)}`,
    '',
    '## 下一步',
    ...analysis.nextActions.map((action, index) => `${index + 1}. ${escapeHtmlFragment(action)}`),
    '',
    '本分析只写入本地 JSON 与 Markdown，不会写入投递进度表、简历素材、能力资产或外部系统。',
    '',
  ];
  return lines.filter(line => line !== null).join('\n');
}

function packageDirFor(root) {
  return join(root, JOB_ANALYSIS_PACKAGE_DIR);
}

function packagePathFor(root, analysisId) {
  return join(packageDirFor(root), `${analysisId}.json`);
}

function markdownPathFor(root, analysisId) {
  return join(root, JOB_ANALYSIS_MARKDOWN_DIR, `${analysisId}.md`);
}

function readAnalysisFile(filePath, materials) {
  const parsed = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-analysis',
  });
  return canonicalizeJobAnalysis(parsed, materials);
}

function readInstalledAnalysis(root, materials, analysisId) {
  const target = packagePathFor(root, analysisId);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw analysisError(`Cannot inspect installed analysis: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw analysisError('Installed analysis path is not a regular file', 'invalid-analysis', { path: target });
  if (info.size > MAX_PACKAGE_BYTES) throw analysisError('Installed analysis exceeds size limit', 'invalid-analysis', { path: target });
  const installed = readAnalysisFile(target, materials);
  if (installed.analysis.analysisId !== analysisId) {
    throw analysisError('Installed analysis filename does not match analysisId', 'invalid-analysis', {
      path: target,
      expectedAnalysisId: analysisId,
      actualAnalysisId: installed.analysis.analysisId,
    });
  }
  return installed;
}

function readOptionalMarkdown(target) {
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw analysisError(`Cannot inspect analysis markdown: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw analysisError('Analysis markdown path is not a regular file', 'invalid-analysis', { path: target });
  if (info.size > MAX_MARKDOWN_BYTES) throw analysisError('Analysis markdown exceeds size limit', 'invalid-analysis', { path: target });
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    throw analysisError(`Cannot read analysis markdown: ${error.message}`, 'io-error', { path: target });
  }
}

export function inspectJobAnalysis(root = getCareerOpsRoot()) {
  try {
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) return { state: 'blocked', available: false, reason: 'resume-materials-missing' };
    let entries;
    try {
      entries = readdirSync(packageDirFor(root), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { state: 'missing', available: false, analysisCount: 0, analyses: [] };
      throw error;
    }
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
    if (files.length > MAX_ANALYSES) {
      throw analysisError(`Too many job analysis packages (max ${MAX_ANALYSES})`, 'invalid-analysis');
    }
    const analyses = files.map(name => {
      const installed = readInstalledAnalysis(root, materials, name.replace(/\.json$/, ''));
      const markdownPath = markdownPathFor(root, installed.analysis.analysisId);
      const markdown = readOptionalMarkdown(markdownPath);
      const desired = renderJobAnalysis(installed.analysis);
      return {
        ...installed.summary,
        markdownPath,
        markdownState: markdown === null ? 'missing' : (markdown === desired ? 'current' : 'different'),
      };
    });
    return { state: 'ready', available: true, analysisCount: analyses.length, analyses };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ContractToolError ? error.code : 'io-error',
    };
  }
}

export function importJobAnalysis(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw analysisError('--replace requires --apply', 'usage');

  const materials = loadInstalledResumeMaterials(root);
  if (!materials) {
    throw analysisError('Import and confirm resume materials before generating a job analysis.', 'materials-missing');
  }
  const incoming = readAnalysisFile(filePath, materials);
  const packageTarget = packagePathFor(root, incoming.analysis.analysisId);
  const markdownTarget = markdownPathFor(root, incoming.analysis.analysisId);
  const existing = readInstalledAnalysis(root, materials, incoming.analysis.analysisId);
  const existingMarkdown = readOptionalMarkdown(markdownTarget);
  const desiredMarkdown = renderJobAnalysis(incoming.analysis);
  const packageChange = !existing || existing.contentHash !== incoming.contentHash;
  const markdownChange = existingMarkdown === null || existingMarkdown !== desiredMarkdown;
  const backupPaths = { package: null, markdown: null };

  if (!packageChange && !markdownChange) {
    return {
      action: apply ? 'unchanged' : 'dry-run-unchanged',
      applied: apply,
      packagePath: packageTarget,
      markdownPath: markdownTarget,
      backupPaths,
      incoming: incoming.summary,
    };
  }

  const overwritesUserContent = (existing !== null && packageChange) || (existingMarkdown !== null && markdownChange);
  if (overwritesUserContent && !replace) {
    throw analysisError(
      'A different analysis package or markdown file already exists; add --replace to replace it.',
      'different-analysis',
      { installedAnalysisId: existing?.summary.analysisId ?? null, incomingAnalysisId: incoming.summary.analysisId },
    );
  }

  if (!apply) {
    return {
      action: overwritesUserContent ? 'dry-run-replace' : 'dry-run',
      applied: false,
      packagePath: packageTarget,
      markdownPath: markdownTarget,
      backupPaths,
      desiredMarkdown,
      incoming: incoming.summary,
    };
  }

  const backupDir = join(root, JOB_ANALYSIS_BACKUP_DIR, incoming.analysis.analysisId);
  if (existing !== null && packageChange) {
    backupPaths.package = backupFile(
      packageTarget,
      backupDir,
      'job-analysis-package',
      existing.contentHash,
      MAX_BACKUPS_PER_ANALYSIS,
    );
  }
  if (existingMarkdown !== null && markdownChange) {
    backupPaths.markdown = backupFile(
      markdownTarget,
      backupDir,
      'job-analysis-markdown',
      semanticHash(existingMarkdown),
      MAX_BACKUPS_PER_ANALYSIS,
    );
  }
  if (packageChange) writeContractFile(packageTarget, `${incoming.canonicalJson}\n`);
  if (markdownChange) writeContractFile(markdownTarget, desiredMarkdown);

  return {
    action: existing === null ? 'imported' : 'replaced',
    applied: true,
    packagePath: packageTarget,
    markdownPath: markdownTarget,
    backupPaths,
    incoming: incoming.summary,
  };
}

function fail(message, json = false) {
  if (json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const replace = args.includes('--replace');
  const positional = args.filter(arg => !['--json', '--apply', '--replace'].includes(arg));
  if (positional.length !== 2 || !['check', 'import'].includes(positional[0])) {
    fail(`Invalid arguments.\n${USAGE}`, json);
  }
  if (positional[0] === 'check' && (apply || replace)) fail('check does not support --apply or --replace.', json);
  return { command: positional[0], analysisFile: positional[1], json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    const root = getCareerOpsRoot();
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) {
      throw analysisError('Import and confirm resume materials before generating a job analysis.', 'materials-missing');
    }
    if (args.command === 'check') {
      const result = readAnalysisFile(args.analysisFile, materials);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '岗位分析包校验通过。',
        `Analysis ID: ${result.summary.analysisId}`,
        `公司岗位：${result.summary.company} — ${result.summary.role}`,
        `匹配度：${Math.round(result.summary.matchRange[0] * 100)}-${Math.round(result.summary.matchRange[1] * 100)}%（${result.summary.matchBand}）`,
        `推荐指数：${result.summary.recommendationStars}/5`,
        `硬性要求：${result.summary.mustHaveCount} 条，其中 ${result.summary.unmetMustHaveCount} 条未命中`,
        `素材包：${result.summary.materialsPackageId}（${result.summary.materialsContentHash}）`,
        `内容哈希：${result.summary.contentHash}`,
      ].join('\n'));
      return;
    }

    const result = importJobAnalysis(args.analysisFile, { root, apply: args.apply, replace: args.replace });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `岗位分析导入结果：${result.action}`,
      `溯源包：${result.packagePath}`,
      `报告：${result.markdownPath}`,
      `匹配度：${Math.round(result.incoming.matchRange[0] * 100)}-${Math.round(result.incoming.matchRange[1] * 100)}%`,
      `推荐指数：${result.incoming.recommendationStars}/5`,
      result.backupPaths.package ? `溯源备份：${result.backupPaths.package}` : null,
      result.backupPaths.markdown ? `报告备份：${result.backupPaths.markdown}` : null,
      '输出仅保存在本地，不会写入投递进度表或外部系统。',
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = code === 'different-analysis' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
