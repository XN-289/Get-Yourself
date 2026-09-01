#!/usr/bin/env node

import { lstatSync, readFileSync } from 'node:fs';
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
  requireTimestamp,
  requireUniqueReferences,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';

export const FINAL_PLAN_SCHEMA = 'get-yourself.resume-final-plan';
export const FINAL_PLAN_SCHEMA_VERSION = 1;
export const FINAL_PLAN_PATH = 'data/resume-final-plan.json';
export const CV_PATH = 'cv.md';
export const FINAL_BACKUP_DIR = 'data/resume-final-backups';
const MAX_PLAN_BYTES = 128 * 1024;
const MAX_CV_BYTES = 512 * 1024;
const MAX_BACKUPS = 10;
const CONFIRMATIONS = new Set(['user_confirmed']);
const FINAL_ENTRY_STATUSES = new Set(['verified', 'user_confirmed']);
const SECTION_LABELS = new Map([
  ['internship', '实习经历'],
  ['project', '项目经历'],
  ['competition', '竞赛获奖'],
  ['campus_work', '学生工作'],
  ['skill', '技能证书'],
]);

const USAGE = `Usage:
  node resume-final.mjs check <plan.json> [--json]
  node resume-final.mjs apply <plan.json> [--apply] [--replace] [--json]`;

function planError(message, code = 'invalid-plan', details = {}) {
  return new ContractToolError(message, code, details);
}

export function canonicalizeResumeFinalPlan(input, materials) {
  if (!materials) throw planError('A confirmed resume materials package is required.');
  requireObject(input, '$', [
    'schema',
    'schemaVersion',
    'planId',
    'generatedAt',
    'traceId',
    'materialsPackageId',
    'materialsContentHash',
    'confirmation',
    'sections',
  ], ContractToolError, 'invalid-plan');
  if (input.schema !== FINAL_PLAN_SCHEMA) {
    throw planError(`$.schema must be ${FINAL_PLAN_SCHEMA}`, 'invalid-plan', { path: '$.schema' });
  }
  if (input.schemaVersion !== FINAL_PLAN_SCHEMA_VERSION) {
    throw planError(`$.schemaVersion must be ${FINAL_PLAN_SCHEMA_VERSION}`, 'unsupported-version', { path: '$.schemaVersion' });
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-plan');
  if (input.materialsPackageId !== materials.package.packageId) {
    throw planError('materialsPackageId does not match the installed package', 'materials-mismatch');
  }
  if (input.materialsContentHash !== materials.contentHash) {
    throw planError(
      'materialsContentHash does not match the installed package; regenerate the plan after reviewing current materials.',
      'materials-mismatch',
    );
  }

  const entryById = new Map(materials.package.entries.map(entry => [entry.id, entry]));
  const seenSections = new Set();
  const seenEntries = new Set();
  const rawSections = requireArray(input.sections, '$.sections', 1, 5, ContractToolError, 'invalid-plan');
  const sections = rawSections.map((item, index) => {
    const path = `$.sections[${index}]`;
    requireObject(item, path, ['section', 'entryRefs'], ContractToolError, 'invalid-plan');
    const section = requireEnum(item.section, `${path}.section`, new Set(SECTION_LABELS.keys()), ContractToolError, 'invalid-plan');
    if (seenSections.has(section)) throw planError(`${path}.section is duplicate: ${section}`, 'invalid-plan', { path });
    seenSections.add(section);
    const refs = requireArray(item.entryRefs, `${path}.entryRefs`, 1, 100, ContractToolError, 'invalid-plan');
    requireUniqueReferences(refs, `${path}.entryRefs`, new Set(entryById.keys()), ContractToolError, 'invalid-plan');
    for (const id of refs) {
      if (seenEntries.has(id)) throw planError(`Entry ${id} is selected more than once`, 'invalid-plan', { path });
      seenEntries.add(id);
      const entry = entryById.get(id);
      if (entry.section !== section) {
        throw planError(`Entry ${id} does not belong to section ${section}`, 'invalid-plan', { path });
      }
      if (!FINAL_ENTRY_STATUSES.has(entry.evidenceStatus)) {
        throw planError(
          `Entry ${id} has ${entry.evidenceStatus} evidence and cannot enter the final resume`,
          'unconfirmed-entry',
          { path, entryId: id },
        );
      }
    }
    return { section, entryRefs: [...refs] };
  });

  const canonicalPlan = {
    schema: FINAL_PLAN_SCHEMA,
    schemaVersion: FINAL_PLAN_SCHEMA_VERSION,
    planId: requireSafeId(input.planId, '$.planId', ContractToolError, 'invalid-plan'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-plan'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-plan'),
    materialsPackageId: input.materialsPackageId,
    materialsContentHash: input.materialsContentHash,
    confirmation: input.confirmation,
    sections,
  };
  const contentHash = semanticHash({ ...canonicalPlan, generatedAt: undefined });
  return {
    plan: canonicalPlan,
    canonicalJson: JSON.stringify(canonicalPlan, null, 2),
    contentHash,
    summary: {
      planId: canonicalPlan.planId,
      schemaVersion: FINAL_PLAN_SCHEMA_VERSION,
      generatedAt: canonicalPlan.generatedAt,
      targetRole: materials.package.targetRole,
      materialsPackageId: canonicalPlan.materialsPackageId,
      materialsContentHash: canonicalPlan.materialsContentHash,
      sectionCount: sections.length,
      selectedEntryCount: seenEntries.size,
      contentHash,
    },
  };
}

export function renderResumeSection(materials, section) {
  const entryById = new Map(materials.package.entries.map(entry => [entry.id, entry]));
  const label = SECTION_LABELS.get(section.section);
  const lines = [`## ${label}`, ''];
  for (const id of section.entryRefs) {
    const entry = entryById.get(id);
    lines.push(`### ${entry.organization}｜${entry.role}`, '', `${entry.timeframe}`, '', `- ${entry.bullet}`, '');
  }
  return `${lines.join('\n')}\n`;
}

function renderedSections(materials, plan) {
  return plan.sections.map(section => ({ section, markdown: renderResumeSection(materials, section) }));
}

function headingLabel(markdown) {
  const match = /^##\s+(.+?)\s*$/m.exec(markdown);
  return match ? match[1] : null;
}

function countHeading(lines, label) {
  return lines.filter(line => new RegExp(`^##\\s+${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(line)).length;
}

export function renderFinalResume(currentResume, materials, plan, previousPlan = null) {
  const replacements = new Map(renderedSections(materials, plan).map(item => [headingLabel(item.markdown), item.markdown]));
  const previouslyManagedLabels = previousPlan === null
    ? new Set()
    : new Set(previousPlan.sections.map(section => SECTION_LABELS.get(section.section)));
  if (currentResume === null) {
    const sections = [...replacements.values()]
      .map(markdown => markdown.replace(/\n+$/g, '\n\n'))
      .join('');
    return `# 简历\n\n${sections}`.replace(/\n+$/g, '\n');
  }

  for (const [label, markdown] of replacements) {
    if (countHeading(currentResume.split('\n'), label) > 1) {
      throw planError(`cv.md contains duplicate level-2 heading: ${label}`, 'invalid-cv');
    }
  }

  const lines = currentResume.split('\n');
  const output = [];
  const appended = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = headingLabel(line);
    if (label && previouslyManagedLabels.has(label) && !replacements.has(label)) {
      index += 1;
      while (index < lines.length && !/^##\s+/.test(lines[index])) index += 1;
      index -= 1;
      continue;
    }
    if (label && replacements.has(label)) {
      const replacementLines = replacements.get(label).split('\n');
      while (replacementLines.length > 0 && replacementLines[replacementLines.length - 1] === '') replacementLines.pop();
      output.push(...replacementLines, '');
      appended.add(label);
      index += 1;
      while (index < lines.length && !/^##\s+/.test(lines[index])) index += 1;
      index -= 1;
      continue;
    }
    output.push(line);
  }

  let text = output.join('\n').replace(/\n{3,}$/g, '\n\n');
  for (const [label, markdown] of replacements) {
    if (!appended.has(label)) {
      if (!text.endsWith('\n\n')) text = `${text.replace(/\n*$/g, '')}\n\n`;
      text += markdown;
    }
  }
  return text;
}

function readOptionalTextFile(target, maxBytes, code) {
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw planError(`Cannot inspect ${target}: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw planError(`${target} is not a regular file`, code, { path: target });
  if (info.size > maxBytes) throw planError(`${target} exceeds size limit`, code, { path: target });
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    throw planError(`Cannot read ${target}: ${error.message}`, 'io-error', { path: target });
  }
}

function planPathFor(root) {
  return join(root, FINAL_PLAN_PATH);
}

function cvPathFor(root) {
  return join(root, CV_PATH);
}

function readPlanFile(filePath, materials) {
  const parsed = readJsonContract(filePath, {
    maxBytes: MAX_PLAN_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-plan',
  });
  return canonicalizeResumeFinalPlan(parsed, materials);
}

function readInstalledPlan(root, materials) {
  const target = planPathFor(root);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw planError(`Cannot inspect installed plan: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw planError('Installed plan path is not a regular file', 'invalid-plan', { path: target });
  if (info.size > MAX_PLAN_BYTES) throw planError('Installed plan exceeds size limit', 'invalid-plan', { path: target });
  return readPlanFile(target, materials);
}

function sectionState(currentResume, materials, plan) {
  if (currentResume === null) return 'missing';
  const lines = currentResume.split('\n');
  for (const item of renderedSections(materials, plan)) {
    const label = headingLabel(item.markdown);
    if (countHeading(lines, label) === 0) return 'different';
  }
  const desired = renderFinalResume(currentResume, materials, plan);
  return desired === currentResume ? 'current' : 'different';
}

export function inspectResumeFinal(root = getCareerOpsRoot()) {
  try {
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) {
      return { state: 'blocked', available: false, reason: 'resume-materials-missing' };
    }
    const installed = readInstalledPlan(root, materials);
    if (!installed) return { state: 'missing', available: false };
    const currentResume = readOptionalTextFile(cvPathFor(root), MAX_CV_BYTES, 'invalid-cv');
    return {
      state: 'ready',
      available: true,
      cvState: sectionState(currentResume, materials, installed.plan),
      ...installed.summary,
    };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ContractToolError ? error.code : 'io-error',
    };
  }
}

export function applyResumeFinalPlan(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw planError('--replace requires --apply', 'usage');

  const materials = loadInstalledResumeMaterials(root);
  if (!materials) throw planError('Import and confirm resume materials before finalizing cv.md.', 'materials-missing');
  const incoming = readPlanFile(filePath, materials);
  const planTarget = planPathFor(root);
  const cvTarget = cvPathFor(root);
  const existingPlan = readInstalledPlan(root, materials);
  const existingResume = readOptionalTextFile(cvTarget, MAX_CV_BYTES, 'invalid-cv');
  const desiredResume = renderFinalResume(existingResume, materials, incoming.plan, existingPlan?.plan ?? null);
  const planChange = !existingPlan || existingPlan.contentHash !== incoming.contentHash;
  const resumeChange = existingResume === null || existingResume !== desiredResume;
  const backupPaths = { plan: null, cv: null };

  if (!planChange && !resumeChange) {
    return {
      action: apply ? 'unchanged' : 'dry-run-unchanged',
      applied: apply,
      planPath: planTarget,
      cvPath: cvTarget,
      backupPaths,
      sectionChanges: [],
      incoming: incoming.summary,
    };
  }

  const overwritesUserContent = (existingPlan !== null && planChange) || (existingResume !== null && resumeChange);
  if (overwritesUserContent && !replace) {
    const error = planError(
      'A different final plan or cv.md content already exists; add --replace to replace it.',
      'different-final-plan',
      { installedPlanId: existingPlan?.summary.planId ?? null, incomingPlanId: incoming.summary.planId },
    );
    throw error;
  }

  if (!apply) {
    return {
      action: overwritesUserContent ? 'dry-run-replace' : 'dry-run',
      applied: false,
      planPath: planTarget,
      cvPath: cvTarget,
      backupPaths,
      desiredMarkdown: desiredResume,
      sectionChanges: incoming.plan.sections.map(item => ({
        section: item.section,
        heading: SECTION_LABELS.get(item.section),
        selectedEntryCount: item.entryRefs.length,
      })),
      incoming: incoming.summary,
    };
  }

  if (existingPlan !== null && planChange) {
    backupPaths.plan = backupFile(planTarget, join(root, FINAL_BACKUP_DIR), 'resume-final-plan', existingPlan.contentHash, MAX_BACKUPS);
  }
  if (existingResume !== null && resumeChange) {
    const resumeHash = semanticHash(existingResume);
    backupPaths.cv = backupFile(cvTarget, join(root, FINAL_BACKUP_DIR), 'resume-final-markdown', resumeHash, MAX_BACKUPS);
  }
  if (planChange) writeContractFile(planTarget, `${incoming.canonicalJson}\n`);
  if (resumeChange) writeContractFile(cvTarget, desiredResume);

  return {
    action: existingPlan === null ? 'applied' : 'replaced',
    applied: true,
    planPath: planTarget,
    cvPath: cvTarget,
    backupPaths,
    sectionChanges: incoming.plan.sections.map(item => ({
      section: item.section,
      heading: SECTION_LABELS.get(item.section),
      selectedEntryCount: item.entryRefs.length,
    })),
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
  if (positional.length !== 2 || !['check', 'apply'].includes(positional[0])) {
    fail(`Invalid arguments.\n${USAGE}`, json);
  }
  if (positional[0] === 'check' && (apply || replace)) fail('check does not support --apply or --replace.', json);
  return { command: positional[0], planFile: positional[1], json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    const root = getCareerOpsRoot();
    const materials = loadInstalledResumeMaterials(root);
    if (!materials) throw planError('Import and confirm resume materials before finalizing cv.md.', 'materials-missing');
    if (args.command === 'check') {
      const result = readPlanFile(args.planFile, materials);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '简历定稿审批计划校验通过。',
        `Plan ID: ${result.summary.planId}`,
        `目标方向：${result.summary.targetRole}`,
        `章节：${result.summary.sectionCount}`,
        `选中素材：${result.summary.selectedEntryCount}`,
        `素材哈希：${result.summary.materialsContentHash}`,
      ].join('\n'));
      return;
    }

    const result = applyResumeFinalPlan(args.planFile, { root, apply: args.apply, replace: args.replace });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `简历定稿审批结果：${result.action}`,
      `审批计划：${result.planPath}`,
      `定稿文件：${result.cvPath}`,
      ...result.sectionChanges.map(item => `${item.heading}：${item.selectedEntryCount} 条素材`),
      result.backupPaths.plan ? `计划备份：${result.backupPaths.plan}` : null,
      result.backupPaths.cv ? `定稿备份：${result.backupPaths.cv}` : null,
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = code === 'different-final-plan' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
