#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
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
  requireUniqueReferences,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';

export const SCAM_CHECK_SCHEMA = 'get-yourself.scam-check';
export const SCAM_CHECK_SCHEMA_VERSION = 1;
export const SCAM_CHECK_PACKAGE_DIR = 'data/scam-check';
export const SCAM_CHECK_MARKDOWN_DIR = 'reports/scam-check';
export const SCAM_CHECK_BACKUP_DIR = 'data/scam-check-backups';

const MAX_PACKAGE_BYTES = 512 * 1024;
const MAX_MARKDOWN_BYTES = 1024 * 1024;
const MAX_CHECKS = 200;
const MAX_BACKUPS_PER_CHECK = 10;
const CONFIRMATIONS = new Set(['user_confirmed']);
const SOURCE_TYPES = new Set(['jd', 'hr_chat', 'company_page', 'job_board', 'third_party', 'user_note']);
const SEVERITIES = new Set(['red', 'yellow']);
const SOURCE_STATUSES = new Set(['active', 'closed', 'unknown']);
const CORROBORATING_SOURCES = new Set(['company_page', 'job_board', 'third_party']);

const SIGNAL_RULES = {
  pre_job_fee: { severity: 'red', label: '入职前收费' },
  training_loan: { severity: 'red', label: '培训贷或包就业贷款' },
  guaranteed_employment: { severity: 'red', label: '保 offer / 包就业承诺' },
  paid_internal_referral: { severity: 'red', label: '收费内推' },
  pyramid_recruiting: { severity: 'red', label: '发展下线或传销特征' },
  no_interview_instant_hire: { severity: 'red', label: '无面试直接录用' },
  vague_high_salary: { severity: 'red', label: '岗位模糊但强调高薪' },
  remote_software_risk: { severity: 'red', label: '要求下载不明远程软件' },
  agency_dispatch: { severity: 'yellow', label: '中介代招或派遣' },
  outsourcing_mislabel: { severity: 'yellow', label: '外包或岗位名不符' },
  company_registration_unverified: { severity: 'yellow', label: '公司主体未核实' },
  official_channel_mismatch: { severity: 'yellow', label: '官方渠道不一致' },
  stale_posting: { severity: 'yellow', label: '岗位可能过期' },
  repeated_repost: { severity: 'yellow', label: '岗位重复发布' },
  immediate_signing_pressure: { severity: 'yellow', label: '立即签约施压' },
  address_mismatch: { severity: 'yellow', label: '面试或办公地址不一致' },
  sensitive_info_too_early: { severity: 'yellow', label: '过早索要敏感信息' },
  role_description_mismatch: { severity: 'yellow', label: '职责描述与岗位不一致' },
};

const VERIFICATION_ACTIONS = {
  agency_dispatch: '要求对方书面说明用工主体、派遣公司和岗位合同主体。',
  outsourcing_mislabel: '向 HR 确认实际用人单位、工作地点和岗位全称。',
  company_registration_unverified: '在国家企业信用信息公示系统或可信工商信息平台核实公司主体。',
  official_channel_mismatch: '通过公司官网或官方招聘公众号反查该岗位与联系人。',
  stale_posting: '确认岗位发布时间和当前是否仍在招聘。',
  repeated_repost: '对比同一岗位历史发布内容，确认是否长期重复招聘。',
  immediate_signing_pressure: '拒绝当天立即签约，要求拿到书面 offer 后再决策。',
  address_mismatch: '用公司官方地址核对面试地点；异常居民楼或酒店地点不要前往。',
  sensitive_info_too_early: '身份证号、银行卡和证件照片只在确认必要后提供。',
  role_description_mismatch: '要求对方提供具体职责、团队和考核方式。',
};

const USAGE = `Usage:
  node scam-check.mjs check <scam-check.json> [--json]
  node scam-check.mjs import <scam-check.json> [--apply] [--replace] [--json]`;

function scamCheckError(message, code = 'invalid-scam-check', details = {}) {
  return new ContractToolError(message, code, details);
}

function requireHttpUrl(value, path) {
  const text = requireString(value, path, { min: 8, max: 500 }, ContractToolError, 'invalid-scam-check');
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw scamCheckError(`${path} must be an absolute http(s) URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw scamCheckError(`${path} must use http or https`);
  }
  return text;
}

function canonicalizeEvidence(input) {
  return input.map((item, index) => {
    const path = `$.evidence[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['id', 'sourceType', 'content'],
      ['url'],
      ContractToolError,
      'invalid-scam-check',
    );
    const evidence = {
      id: requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-scam-check'),
      sourceType: requireEnum(item.sourceType, `${path}.sourceType`, SOURCE_TYPES, ContractToolError, 'invalid-scam-check'),
      content: requireString(item.content, `${path}.content`, { min: 5, max: 20000 }, ContractToolError, 'invalid-scam-check'),
    };
    if (item.url !== undefined) evidence.url = requireHttpUrl(item.url, `${path}.url`);
    return evidence;
  });
}

function canonicalizeSignals(input, knownEvidenceIds) {
  const seenTypes = new Set();
  return input.map((item, index) => {
    const path = `$.signals[${index}]`;
    requireObject(item, path, ['id', 'type', 'severity', 'evidenceRefs', 'note'], ContractToolError, 'invalid-scam-check');
    const type = requireEnum(item.type, `${path}.type`, new Set(Object.keys(SIGNAL_RULES)), ContractToolError, 'invalid-scam-check');
    const expectedSeverity = SIGNAL_RULES[type].severity;
    if (item.severity !== expectedSeverity) {
      throw scamCheckError(
        `${path}.severity must be ${expectedSeverity} for signal type ${type}`,
        'invalid-scam-check',
        { path, signalType: type, expectedSeverity },
      );
    }
    if (seenTypes.has(type)) {
      throw scamCheckError(`${path} contains duplicate signal type ${type}`, 'invalid-scam-check', { path, signalType: type });
    }
    seenTypes.add(type);
    return {
      id: requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-scam-check'),
      type,
      severity: item.severity,
      evidenceRefs: requireUniqueReferences(
        item.evidenceRefs,
        `${path}.evidenceRefs`,
        knownEvidenceIds,
        ContractToolError,
        'invalid-scam-check',
      ),
      note: requireString(item.note, `${path}.note`, { min: 2, max: 500 }, ContractToolError, 'invalid-scam-check'),
    };
  });
}

function canonicalizePostingObservation(input, knownEvidenceIds) {
  requireObjectWithOptional(
    input,
    '$.postingObservation',
    ['sourceStatus', 'evidenceRefs'],
    ['firstSeenAt', 'lastSeenAt', 'repostCount'],
    ContractToolError,
    'invalid-scam-check',
  );
  if (
    input.firstSeenAt !== undefined
    && input.lastSeenAt !== undefined
    && Date.parse(input.lastSeenAt) < Date.parse(input.firstSeenAt)
  ) {
    throw scamCheckError('$.postingObservation.lastSeenAt cannot precede firstSeenAt');
  }
  if (input.repostCount !== undefined && (!Number.isInteger(input.repostCount) || input.repostCount < 0 || input.repostCount > 1000)) {
    throw scamCheckError('$.postingObservation.repostCount must be an integer from 0 to 1000');
  }
  return {
    sourceStatus: requireEnum(input.sourceStatus, '$.postingObservation.sourceStatus', SOURCE_STATUSES, ContractToolError, 'invalid-scam-check'),
    evidenceRefs: requireUniqueReferences(
      input.evidenceRefs,
      '$.postingObservation.evidenceRefs',
      knownEvidenceIds,
      ContractToolError,
      'invalid-scam-check',
    ),
    ...(input.firstSeenAt === undefined ? {} : {
      firstSeenAt: requireTimestamp(input.firstSeenAt, '$.postingObservation.firstSeenAt', ContractToolError, 'invalid-scam-check'),
    }),
    ...(input.lastSeenAt === undefined ? {} : {
      lastSeenAt: requireTimestamp(input.lastSeenAt, '$.postingObservation.lastSeenAt', ContractToolError, 'invalid-scam-check'),
    }),
    ...(input.repostCount === undefined ? {} : { repostCount: input.repostCount }),
  };
}

function calculateAssessment(check) {
  const redSignals = check.signals.filter(signal => signal.severity === 'red');
  const yellowSignals = check.signals.filter(signal => signal.severity === 'yellow');
  const evidenceSourceTypes = [...new Set(check.evidence.map(item => item.sourceType))];
  const hasJdEvidence = evidenceSourceTypes.includes('jd');
  const hasCorroboratingEvidence = evidenceSourceTypes.some(type => CORROBORATING_SOURCES.has(type));

  let conclusion;
  let basis;
  let recommendation;
  let nextActions;
  if (redSignals.length > 0) {
    conclusion = 'high_risk';
    basis = 'red_signal';
    recommendation = 'stop';
    nextActions = [
      '停止推进该岗位，不缴费、不签约、不提供身份证或银行卡信息。',
      '保留聊天记录、招聘页面和转账要求等证据。',
      '如已付费或泄露敏感信息，联系学校就业指导中心并考虑报警。',
    ];
  } else if (yellowSignals.length > 0) {
    conclusion = 'needs_verification';
    basis = 'yellow_signal';
    recommendation = 'verify_before_continuing';
    nextActions = yellowSignals.map(signal => VERIFICATION_ACTIONS[signal.type] ?? `先核实信号：${SIGNAL_RULES[signal.type].label}。`);
  } else if (!hasJdEvidence || !hasCorroboratingEvidence) {
    conclusion = 'needs_verification';
    basis = 'insufficient_evidence';
    recommendation = 'verify_before_continuing';
    nextActions = [
      '补齐岗位描述和公司官方渠道或第三方来源证据。',
      '在国家企业信用信息公示系统或可信工商信息平台核实公司主体。',
      '通过公司官网公开联系方式确认招聘信息和联系人归属。',
    ];
  } else {
    conclusion = 'normal';
    basis = 'no_signals_with_corroborating_evidence';
    recommendation = 'continue_evaluation';
    nextActions = ['当前证据未发现风险信号，可继续岗位匹配评估；出现收费、换主体或新沟通记录时重新核查。'];
  }

  return {
    conclusion,
    basis,
    recommendation,
    redSignalCount: redSignals.length,
    yellowSignalCount: yellowSignals.length,
    evidenceCount: check.evidence.length,
    evidenceSourceTypes,
    nextActions,
  };
}

function requireUniqueIds(items, path) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw scamCheckError(`${path} contains duplicate id ${item.id}`, 'invalid-scam-check', { path, id: item.id });
    }
    seen.add(item.id);
  }
  return seen;
}

export function canonicalizeScamCheck(input) {
  requireObjectWithOptional(
    input,
    '$',
    [
      'schema',
      'schemaVersion',
      'checkId',
      'generatedAt',
      'traceId',
      'confirmation',
      'company',
      'role',
      'evidence',
      'signals',
    ],
    ['postingObservation', 'assessment'],
    ContractToolError,
    'invalid-scam-check',
  );
  if (input.schema !== SCAM_CHECK_SCHEMA) {
    throw scamCheckError(`$.schema must be ${SCAM_CHECK_SCHEMA}`);
  }
  if (input.schemaVersion !== SCAM_CHECK_SCHEMA_VERSION) {
    throw scamCheckError(`$.schemaVersion must be ${SCAM_CHECK_SCHEMA_VERSION}`, 'unsupported-version');
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-scam-check');

  const evidence = canonicalizeEvidence(
    requireArray(input.evidence, '$.evidence', 1, 30, ContractToolError, 'invalid-scam-check'),
  );
  const evidenceIds = requireUniqueIds(evidence, '$.evidence');
  const signals = canonicalizeSignals(
    requireArray(input.signals, '$.signals', 0, 30, ContractToolError, 'invalid-scam-check'),
    evidenceIds,
  );
  requireUniqueIds(signals, '$.signals');

  const check = {
    schema: SCAM_CHECK_SCHEMA,
    schemaVersion: SCAM_CHECK_SCHEMA_VERSION,
    checkId: requireSafeId(input.checkId, '$.checkId', ContractToolError, 'invalid-scam-check'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-scam-check'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-scam-check'),
    confirmation: input.confirmation,
    company: requireString(input.company, '$.company', { min: 2, max: 100 }, ContractToolError, 'invalid-scam-check'),
    role: requireString(input.role, '$.role', { min: 2, max: 100 }, ContractToolError, 'invalid-scam-check'),
    evidence,
    signals,
    ...(input.postingObservation === undefined ? {} : {
      postingObservation: canonicalizePostingObservation(input.postingObservation, evidenceIds),
    }),
  };
  check.assessment = calculateAssessment(check);
  if (
    input.assessment !== undefined
    && semanticHash(input.assessment) !== semanticHash(check.assessment)
  ) {
    throw scamCheckError('assessment does not match the deterministic calculation');
  }

  const contentHash = semanticHash({ ...check, generatedAt: undefined });
  return {
    check,
    canonicalJson: JSON.stringify(check, null, 2),
    contentHash,
    summary: {
      checkId: check.checkId,
      schemaVersion: SCAM_CHECK_SCHEMA_VERSION,
      generatedAt: check.generatedAt,
      company: check.company,
      role: check.role,
      conclusion: check.assessment.conclusion,
      recommendation: check.assessment.recommendation,
      redSignalCount: check.assessment.redSignalCount,
      yellowSignalCount: check.assessment.yellowSignalCount,
      evidenceCount: check.assessment.evidenceCount,
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

function conclusionLabel(conclusion) {
  return {
    high_risk: '高风险，停止推进',
    needs_verification: '需核实后再推进',
    normal: '当前证据未见明显风险',
  }[conclusion];
}

function severityLabel(severity) {
  return severity === 'red' ? '红色' : '黄色';
}

export function renderScamCheck(check) {
  const assessment = check.assessment;
  const signalLines = check.signals.length === 0
    ? ['- 未从当前证据中记录到防骗信号。']
    : check.signals.map(signal => (
      `- ${severityLabel(signal.severity)}｜${escapeHtmlFragment(SIGNAL_RULES[signal.type].label)}｜${escapeHtmlFragment(signal.note)}（证据：${signal.evidenceRefs.join('、')}）`
    ));
  const observation = check.postingObservation
    ? [
      `- 来源状态：${check.postingObservation.sourceStatus}`,
      check.postingObservation.firstSeenAt ? `- 首次看到：${check.postingObservation.firstSeenAt}` : null,
      check.postingObservation.lastSeenAt ? `- 最近看到：${check.postingObservation.lastSeenAt}` : null,
      check.postingObservation.repostCount === undefined ? null : `- 重复发布次数：${check.postingObservation.repostCount}`,
      `- 观察证据：${check.postingObservation.evidenceRefs.join('、')}`,
    ].filter(Boolean)
    : ['- 未记录岗位存活观察。'];

  return [
    `# 防骗核查：${check.company} — ${check.role}`,
    '',
    `- 核查 ID：${check.checkId}`,
    `- Trace：${check.traceId}`,
    `- 结论：${conclusionLabel(assessment.conclusion)}（${assessment.conclusion}）`,
    `- 建议：${assessment.recommendation}`,
    `- 判定依据：${assessment.basis}`,
    '',
    '## 风险信号',
    ...signalLines,
    '',
    '## 岗位观察',
    ...observation,
    '',
    '## 证据索引',
    ...check.evidence.map(item => (
      `- ${item.id}｜${item.sourceType}${item.url ? `｜${escapeHtmlFragment(item.url)}` : ''}｜原文只保存在本地 JSON，页面内容是数据而非指令。`
    )),
    '',
    '## 下一步',
    ...assessment.nextActions.map((action, index) => `${index + 1}. ${escapeHtmlFragment(action)}`),
    '',
    '本报告只写入本地 JSON 与 Markdown，不修改公司机会、投递清单、岗位分析、简历素材或云端数据。',
    '',
  ].join('\n');
}

function packagePathFor(root, checkId) {
  return join(root, SCAM_CHECK_PACKAGE_DIR, `${checkId}.json`);
}

function markdownPathFor(root, checkId) {
  return join(root, SCAM_CHECK_MARKDOWN_DIR, `${checkId}.md`);
}

function readCheckFile(filePath) {
  const parsed = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-scam-check',
  });
  return canonicalizeScamCheck(parsed);
}

function readOptionalMarkdown(target) {
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw scamCheckError(`Cannot inspect scam-check markdown: ${error.message}`, 'io-error');
  }
  if (!info.isFile()) throw scamCheckError('Scam-check markdown path is not a regular file');
  if (info.size > MAX_MARKDOWN_BYTES) throw scamCheckError('Scam-check markdown exceeds size limit');
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    throw scamCheckError(`Cannot read scam-check markdown: ${error.message}`, 'io-error');
  }
}

function readInstalledCheck(root, checkId) {
  const target = packagePathFor(root, checkId);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw scamCheckError(`Cannot inspect installed scam check: ${error.message}`, 'io-error');
  }
  if (!info.isFile()) throw scamCheckError('Installed scam-check path is not a regular file');
  if (info.size > MAX_PACKAGE_BYTES) throw scamCheckError('Installed scam check exceeds size limit');
  const installed = readCheckFile(target);
  if (installed.check.checkId !== checkId) {
    throw scamCheckError('Installed scam-check filename does not match checkId', 'invalid-scam-check', {
      expectedCheckId: checkId,
      actualCheckId: installed.check.checkId,
    });
  }
  return installed;
}

export function inspectScamChecks(root = getCareerOpsRoot()) {
  try {
    let entries;
    try {
      entries = readdirSync(join(root, SCAM_CHECK_PACKAGE_DIR), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { state: 'missing', available: false, checkCount: 0, checks: [] };
      throw error;
    }
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
    if (files.length > MAX_CHECKS) {
      throw scamCheckError(`Too many scam-check packages (max ${MAX_CHECKS})`);
    }
    const checks = files.map(name => {
      const installed = readInstalledCheck(root, name.replace(/\.json$/, ''));
      const markdownPath = markdownPathFor(root, installed.check.checkId);
      const markdown = readOptionalMarkdown(markdownPath);
      const desired = renderScamCheck(installed.check);
      return {
        ...installed.summary,
        markdownPath,
        markdownState: markdown === null ? 'missing' : (markdown === desired ? 'current' : 'different'),
      };
    });
    return { state: 'ready', available: true, checkCount: checks.length, checks };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ContractToolError ? error.code : 'io-error',
    };
  }
}

export function importScamCheck(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw scamCheckError('--replace requires --apply', 'usage');

  const incoming = readCheckFile(filePath);
  const packageTarget = packagePathFor(root, incoming.check.checkId);
  const markdownTarget = markdownPathFor(root, incoming.check.checkId);
  const existing = readInstalledCheck(root, incoming.check.checkId);
  const existingMarkdown = readOptionalMarkdown(markdownTarget);
  const desiredMarkdown = renderScamCheck(incoming.check);
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
    throw scamCheckError(
      'A different scam-check package or markdown file already exists; add --replace to replace it.',
      'different-scam-check',
      { installedCheckId: existing?.summary.checkId ?? null, incomingCheckId: incoming.summary.checkId },
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

  const backupDir = join(root, SCAM_CHECK_BACKUP_DIR, incoming.check.checkId);
  if (existing !== null && packageChange) {
    backupPaths.package = backupFile(
      packageTarget,
      backupDir,
      'scam-check-package',
      existing.contentHash,
      MAX_BACKUPS_PER_CHECK,
    );
  }
  if (existingMarkdown !== null && markdownChange) {
    backupPaths.markdown = backupFile(
      markdownTarget,
      backupDir,
      'scam-check-markdown',
      semanticHash(existingMarkdown),
      MAX_BACKUPS_PER_CHECK,
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
  return { command: positional[0], checkFile: positional[1], json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    if (args.command === 'check') {
      const result = readCheckFile(args.checkFile);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '防骗核查包校验通过。',
        `Check ID: ${result.summary.checkId}`,
        `公司岗位：${result.summary.company} — ${result.summary.role}`,
        `结论：${result.summary.conclusion}（${result.summary.recommendation}）`,
        `信号：红色 ${result.summary.redSignalCount} 条 / 黄色 ${result.summary.yellowSignalCount} 条`,
        `证据：${result.summary.evidenceCount} 条`,
        `内容哈希：${result.summary.contentHash}`,
      ].join('\n'));
      return;
    }

    const result = importScamCheck(args.checkFile, { apply: args.apply, replace: args.replace });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `防骗核查导入结果：${result.action}`,
      `溯源包：${result.packagePath}`,
      `报告：${result.markdownPath}`,
      `结论：${result.incoming.conclusion}（${result.incoming.recommendation}）`,
      result.backupPaths.package ? `溯源备份：${result.backupPaths.package}` : null,
      result.backupPaths.markdown ? `报告备份：${result.backupPaths.markdown}` : null,
      '输出仅保存在本地，不会修改公司机会、投递清单或云端数据。',
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = code === 'different-scam-check' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
