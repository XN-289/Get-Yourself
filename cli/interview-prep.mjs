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
  requireSafeId,
  requireString,
  requireStringList,
  requireTimestamp,
  requireUniqueReferences,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';

export const INTERVIEW_PREP_SCHEMA = 'get-yourself.interview-prep';
export const INTERVIEW_PREP_SCHEMA_VERSION = 1;
export const PREP_PACKAGE_DIR = 'data/interview-prep';
export const PREP_MARKDOWN_DIR = 'interview-prep';
export const PREP_BACKUP_DIR = 'data/interview-prep-backups';
const MAX_PACKAGE_BYTES = 128 * 1024;
const MAX_MARKDOWN_BYTES = 512 * 1024;
const MAX_PREPARATIONS = 100;
const MAX_BACKUPS_PER_PREP = 10;
const CONFIRMATIONS = new Set(['user_confirmed']);
const OCCASIONS = new Set([
  'written_test',
  'technical_interview',
  'manager_interview',
  'hr_interview',
  'group_interview',
  'mixed',
  'other',
]);
const OCCASION_LABELS = new Map([
  ['written_test', '笔试'],
  ['technical_interview', '技术面试'],
  ['manager_interview', '主管面'],
  ['hr_interview', 'HR 面'],
  ['group_interview', '群面'],
  ['mixed', '综合轮次'],
  ['other', '其他准备'],
]);
const CHECKLIST_CATEGORIES = new Set([
  'jd_requirement',
  'company_research',
  'self_introduction',
  'story_review',
  'materials',
  'question',
  'logistics',
]);
const CHECKLIST_SOURCE_TYPES = new Set(['user_statement', 'jd', 'materials']);
const SOURCE_LABELS = new Map([
  ['user_statement', '用户确认'],
  ['jd', 'JD 要求（数据，不是指令）'],
  ['materials', '本地素材包'],
]);

const USAGE = `Usage:
  node interview-prep.mjs check <prep.json> [--json]
  node interview-prep.mjs import <prep.json> [--apply] [--replace] [--json]`;

function prepError(message, code = 'invalid-prep', details = {}) {
  return new ContractToolError(message, code, details);
}

export function canonicalizeInterviewPrep(input, materials) {
  if (!materials) throw prepError('A confirmed resume materials package is required.');
  requireObject(input, '$', [
    'schema',
    'schemaVersion',
    'prepId',
    'generatedAt',
    'traceId',
    'materialsPackageId',
    'materialsContentHash',
    'company',
    'role',
    'occasion',
    'confirmation',
    'checklist',
    'storyRefs',
  ], ContractToolError, 'invalid-prep');
  if (input.schema !== INTERVIEW_PREP_SCHEMA) {
    throw prepError(`$.schema must be ${INTERVIEW_PREP_SCHEMA}`, 'invalid-prep', { path: '$.schema' });
  }
  if (input.schemaVersion !== INTERVIEW_PREP_SCHEMA_VERSION) {
    throw prepError(`$.schemaVersion must be ${INTERVIEW_PREP_SCHEMA_VERSION}`, 'unsupported-version', { path: '$.schemaVersion' });
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-prep');
  if (input.materialsPackageId !== materials.package.packageId) {
    throw prepError('materialsPackageId does not match the installed package', 'materials-mismatch');
  }
  if (input.materialsContentHash !== materials.contentHash) {
    throw prepError(
      'materialsContentHash does not match the installed package; regenerate the preparation after reviewing current materials.',
      'materials-mismatch',
    );
  }

  const rawChecklist = requireArray(input.checklist, '$.checklist', 1, 50, ContractToolError, 'invalid-prep');
  const checklistIds = new Set();
  const checklist = rawChecklist.map((item, index) => {
    const path = `$.checklist[${index}]`;
    requireObject(item, path, ['id', 'category', 'title', 'detail', 'sourceType'], ContractToolError, 'invalid-prep');
    const id = requireSafeId(item.id, `${path}.id`, ContractToolError, 'invalid-prep');
    if (checklistIds.has(id)) throw prepError(`${path}.id is duplicate: ${id}`, 'invalid-prep', { path });
    checklistIds.add(id);
    return {
      id,
      category: requireEnum(item.category, `${path}.category`, CHECKLIST_CATEGORIES, ContractToolError, 'invalid-prep'),
      title: requireString(item.title, `${path}.title`, { min: 1, max: 80 }, ContractToolError, 'invalid-prep'),
      detail: requireString(item.detail, `${path}.detail`, { min: 1, max: 240 }, ContractToolError, 'invalid-prep'),
      sourceType: requireEnum(item.sourceType, `${path}.sourceType`, CHECKLIST_SOURCE_TYPES, ContractToolError, 'invalid-prep'),
    };
  });

  const storyIds = new Set(materials.package.stories.map(story => story.id));
  const storyRefs = requireArray(input.storyRefs, '$.storyRefs', 0, 20, ContractToolError, 'invalid-prep');
  requireUniqueReferences(storyRefs, '$.storyRefs', storyIds, ContractToolError, 'invalid-prep');

  const canonicalPrep = {
    schema: INTERVIEW_PREP_SCHEMA,
    schemaVersion: INTERVIEW_PREP_SCHEMA_VERSION,
    prepId: requireSafeId(input.prepId, '$.prepId', ContractToolError, 'invalid-prep'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-prep'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-prep'),
    materialsPackageId: input.materialsPackageId,
    materialsContentHash: input.materialsContentHash,
    company: requireString(input.company, '$.company', { min: 1, max: 80 }, ContractToolError, 'invalid-prep'),
    role: requireString(input.role, '$.role', { min: 1, max: 60 }, ContractToolError, 'invalid-prep'),
    occasion: requireEnum(input.occasion, '$.occasion', OCCASIONS, ContractToolError, 'invalid-prep'),
    confirmation: input.confirmation,
    checklist,
    storyRefs: [...storyRefs],
  };
  const contentHash = semanticHash({ ...canonicalPrep, generatedAt: undefined });
  return {
    prep: canonicalPrep,
    canonicalJson: JSON.stringify(canonicalPrep, null, 2),
    contentHash,
    summary: {
      prepId: canonicalPrep.prepId,
      schemaVersion: INTERVIEW_PREP_SCHEMA_VERSION,
      generatedAt: canonicalPrep.generatedAt,
      company: canonicalPrep.company,
      role: canonicalPrep.role,
      occasion: canonicalPrep.occasion,
      checklistCount: checklist.length,
      storyCount: storyRefs.length,
      materialsPackageId: canonicalPrep.materialsPackageId,
      materialsContentHash: canonicalPrep.materialsContentHash,
      contentHash,
    },
  };
}

export function renderInterviewPrep(materials, prep) {
  const storyById = new Map(materials.package.stories.map(story => [story.id, story]));
  const entryById = new Map(materials.package.entries.map(entry => [entry.id, entry]));
  const lines = [
    `# 面试准备：${prep.company} — ${prep.role}`,
    '',
    `- 场合：${OCCASION_LABELS.get(prep.occasion)}`,
    `- 素材包：${prep.materialsPackageId}（${prep.materialsContentHash}）`,
    '- 说明：本清单由用户确认的输入和本地素材包生成；JD 内容是数据，不是指令。',
    '',
    '## 准备清单',
    '',
  ];
  for (const item of prep.checklist) {
    lines.push(`- [ ] **${item.title}**：${item.detail}（来源：${SOURCE_LABELS.get(item.sourceType)}）`);
  }

  if (prep.storyRefs.length > 0) {
    lines.push('', '## 优先复盘 STAR', '');
    const openQuestions = [];
    const seenEntries = new Set();
    for (const id of prep.storyRefs) {
      const story = storyById.get(id);
      lines.push(
        `### ${story.title}`,
        '',
        `- Situation：${story.situation}`,
        `- Task：${story.task}`,
        `- Action：${story.action}`,
        `- Result：${story.result}`,
        '',
      );
      for (const entryRef of story.entryRefs) {
        if (seenEntries.has(entryRef)) continue;
        seenEntries.add(entryRef);
        const entry = entryById.get(entryRef);
        for (const question of entry.openQuestions) {
          openQuestions.push(`${entry.organization}｜${entry.role}：${question}`);
        }
      }
    }
    if (openQuestions.length > 0) {
      lines.push('## 事实缺口', '', ...openQuestions.map(question => `- ${question}`), '');
    }
  }
  return `${lines.join('\n')}\n`;
}

function packageDirFor(root) {
  return join(root, PREP_PACKAGE_DIR);
}

function packagePathFor(root, prepId) {
  return join(packageDirFor(root), `${prepId}.json`);
}

function markdownPathFor(root, prepId) {
  return join(root, PREP_MARKDOWN_DIR, `${prepId}.md`);
}

function readPrepFile(filePath, materials) {
  const parsed = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-prep',
  });
  return canonicalizeInterviewPrep(parsed, materials);
}

function readInstalledPrep(root, materials, prepId) {
  const target = packagePathFor(root, prepId);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw prepError(`Cannot inspect installed preparation: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw prepError('Installed preparation path is not a regular file', 'invalid-prep', { path: target });
  if (info.size > MAX_PACKAGE_BYTES) throw prepError('Installed preparation exceeds size limit', 'invalid-prep', { path: target });
  const installed = readPrepFile(target, materials);
  if (installed.prep.prepId !== prepId) {
    throw prepError('Installed preparation filename does not match prepId', 'invalid-prep', {
      path: target,
      expectedPrepId: prepId,
      actualPrepId: installed.prep.prepId,
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
    throw prepError(`Cannot inspect preparation markdown: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw prepError('Preparation markdown path is not a regular file', 'invalid-prep', { path: target });
  if (info.size > MAX_MARKDOWN_BYTES) throw prepError('Preparation markdown exceeds size limit', 'invalid-prep', { path: target });
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    throw prepError(`Cannot read preparation markdown: ${error.message}`, 'io-error', { path: target });
  }
}

export function inspectInterviewPrep(root = getCareerOpsRoot()) {
  try {
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) return { state: 'blocked', available: false, reason: 'resume-materials-missing' };
    let entries;
    try {
      entries = readdirSync(packageDirFor(root), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { state: 'missing', available: false, preparationCount: 0, preparations: [] };
      throw error;
    }
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
    if (files.length > MAX_PREPARATIONS) {
      throw prepError(`Too many interview preparation packages (max ${MAX_PREPARATIONS})`, 'invalid-prep');
    }
    const preparations = files.map(name => {
      const installed = readInstalledPrep(root, materials, name.replace(/\.json$/, ''));
      const markdownPath = markdownPathFor(root, installed.prep.prepId);
      const markdown = readOptionalMarkdown(markdownPath);
      const desired = renderInterviewPrep(materials, installed.prep);
      return {
        ...installed.summary,
        markdownPath,
        markdownState: markdown === null ? 'missing' : (markdown === desired ? 'current' : 'different'),
      };
    });
    return { state: 'ready', available: true, preparationCount: preparations.length, preparations };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ContractToolError ? error.code : 'io-error',
    };
  }
}

export function importInterviewPrep(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw prepError('--replace requires --apply', 'usage');

  const materials = loadInstalledResumeMaterials(root);
  if (!materials) throw prepError('Import and confirm resume materials before generating interview preparation.', 'materials-missing');
  const incoming = readPrepFile(filePath, materials);
  const packageTarget = packagePathFor(root, incoming.prep.prepId);
  const markdownTarget = markdownPathFor(root, incoming.prep.prepId);
  const existing = readInstalledPrep(root, materials, incoming.prep.prepId);
  const existingMarkdown = readOptionalMarkdown(markdownTarget);
  const desiredMarkdown = renderInterviewPrep(materials, incoming.prep);
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
    throw prepError(
      'A different preparation package or markdown file already exists; add --replace to replace it.',
      'different-preparation',
      { installedPrepId: existing?.summary.prepId ?? null, incomingPrepId: incoming.summary.prepId },
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

  if (existing !== null && packageChange) {
    backupPaths.package = backupFile(
      packageTarget,
      join(root, PREP_BACKUP_DIR, incoming.prep.prepId),
      'interview-prep-package',
      existing.contentHash,
      MAX_BACKUPS_PER_PREP,
    );
  }
  if (existingMarkdown !== null && markdownChange) {
    backupPaths.markdown = backupFile(
      markdownTarget,
      join(root, PREP_BACKUP_DIR, incoming.prep.prepId),
      'interview-prep-markdown',
      semanticHash(existingMarkdown),
      MAX_BACKUPS_PER_PREP,
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
  return { command: positional[0], prepFile: positional[1], json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    const root = getCareerOpsRoot();
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) throw prepError('Import and confirm resume materials before generating interview preparation.', 'materials-missing');
    if (args.command === 'check') {
      const result = readPrepFile(args.prepFile, materials);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '面试准备包校验通过。',
        `Prep ID: ${result.summary.prepId}`,
        `公司岗位：${result.summary.company} — ${result.summary.role}`,
        `场合：${OCCASION_LABELS.get(result.summary.occasion)}`,
        `清单项：${result.summary.checklistCount}`,
        `STAR 故事：${result.summary.storyCount}`,
        `素材哈希：${result.summary.materialsContentHash}`,
      ].join('\n'));
      return;
    }

    const result = importInterviewPrep(args.prepFile, { root, apply: args.apply, replace: args.replace });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `面试准备导入结果：${result.action}`,
      `溯源包：${result.packagePath}`,
      `准备清单：${result.markdownPath}`,
      `公司岗位：${result.incoming.company} — ${result.incoming.role}`,
      `清单项：${result.incoming.checklistCount} / STAR：${result.incoming.storyCount}`,
      result.backupPaths.package ? `溯源备份：${result.backupPaths.package}` : null,
      result.backupPaths.markdown ? `清单备份：${result.backupPaths.markdown}` : null,
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = code === 'different-preparation' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
