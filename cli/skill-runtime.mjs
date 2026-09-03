#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { importResumeMaterials } from './resume-materials.mjs';
import { importJobAnalysis } from './job-analysis.mjs';
import { importScamCheck } from './scam-check.mjs';
import { applyResumeFinalPlan } from './resume-final.mjs';
import { importResumeRender } from './resume-render.mjs';
import { importInterviewPrep } from './interview-prep.mjs';
import { importInterviewReview } from './interview-review.mjs';
import { importCapabilityFeedback } from './capability-feedback.mjs';
import {
  importCompanyOpportunity,
  mountCompanyOpportunityArtifact,
  mutateCompanyOpportunityNodes,
} from './company-opportunity.mjs';
import {
  backupFile,
  ContractToolError,
  readJsonContract,
  requireArray,
  requireEnum,
  requireObjectWithOptional,
  requireSafeId,
  requireString,
  requireTimestamp,
  semanticHash,
  writeContractFile,
} from './lib/contract-kit.mjs';

export const SKILL_PLAN_SCHEMA = 'get-yourself.skill-run-plan';
export const SKILL_PLAN_SCHEMA_VERSION = 2;
export const SKILL_RUN_SCHEMA = 'get-yourself.skill-run-record';
export const SKILL_RUN_SCHEMA_VERSION = 2;
export const SKILL_RUN_DIR = 'data/skill-runs';
export const SKILL_RUN_BACKUP_DIR = 'data/skill-run-backups';

const MAX_PLAN_BYTES = 64 * 1024;
const MAX_RUNS = 500;
const MAX_INPUTS = 10;
const MAX_TOOL_CALLS = 3;
const MAX_TARGET_OBJECTS = 10;
const MAX_BACKUPS_PER_RUN = 20;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CONFIRMATIONS = new Set(['user_confirmed']);
const MATERIALS_DISPATCH_TARGETS = [
  'data/resume-materials.json',
  'interview-prep/story-bank.md',
];
const RESUME_FINAL_DISPATCH_TARGETS = [
  'data/resume-final-plan.json',
  'cv.md',
];
const SAFE_TARGET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_CONTRACT_FILE_BYTES = 256 * 1024;
const MAX_FINGERPRINT_FILE_BYTES = 3 * 1024 * 1024;

const USAGE = `Usage:
  node skill-runtime.mjs list [--json]
  node skill-runtime.mjs check <plan.json> [--json]
  node skill-runtime.mjs run <plan.json> [--apply] [--replace] [--json]`;

const DISPATCH_BRIDGES = new Map([
  ['resume-materials.import', {
    skillKey: 'experience-structuring',
    conflictCode: 'different-materials',
    importer: importResumeMaterials,
    targetsFor: () => [...MATERIALS_DISPATCH_TARGETS],
  }],
  ['job-analysis.import', {
    skillKey: 'jd-analysis',
    conflictCode: 'different-analysis',
    importer: importJobAnalysis,
    targetRule: {
      idField: 'analysisId',
      packagePrefix: 'data/job-analysis/',
      documentPrefix: 'reports/job-analysis/',
      documentExtension: '.md',
    },
  }],
  ['scam-check.import', {
    skillKey: 'scam-check',
    conflictCode: 'different-scam-check',
    importer: importScamCheck,
    targetRule: {
      idField: 'checkId',
      packagePrefix: 'data/scam-check/',
      documentPrefix: 'reports/scam-check/',
      documentExtension: '.md',
    },
  }],
  ['resume-final.import', {
    skillKey: 'resume-generation',
    conflictCode: 'different-final-plan',
    importer: applyResumeFinalPlan,
    backupKeys: ['plan', 'cv'],
    resultIdField: 'planId',
    targetsFor: () => [...RESUME_FINAL_DISPATCH_TARGETS],
  }],
  ['resume-render.import', {
    skillKey: 'resume-generation',
    conflictCode: 'different-render',
    importer: importResumeRender,
    backupKeys: ['package', 'html'],
    targetRule: {
      idField: 'renderId',
      packagePrefix: 'data/resume-render/',
      documentPrefix: 'output/resume/',
      documentExtension: '.html',
    },
  }],
  ['interview-prep.import', {
    skillKey: 'interview-preparation',
    conflictCode: 'different-preparation',
    importer: importInterviewPrep,
    targetRule: {
      idField: 'prepId',
      packagePrefix: 'data/interview-prep/',
      documentPrefix: 'interview-prep/',
      documentExtension: '.md',
    },
  }],
  ['interview-review.import', {
    skillKey: 'interview-review',
    conflictCode: 'different-review',
    importer: importInterviewReview,
    targetRule: {
      idField: 'reviewId',
      packagePrefix: 'data/interview-review/',
      documentPrefix: 'interview-prep/sessions/',
      documentExtension: '.md',
    },
  }],
  ['capability-feedback.import', {
    skillKey: 'interview-review',
    conflictCode: 'different-feedback',
    importer: importCapabilityFeedback,
    targetRule: {
      idField: 'feedbackId',
      packagePrefix: 'data/capability-feedback/',
      documentPrefix: 'reports/capability-feedback/',
      documentExtension: '.md',
    },
  }],
  ['company-opportunity.import', {
    skillKey: 'opportunity-management',
    conflictCode: 'different-opportunity',
    importer: importCompanyOpportunity,
    backupKeys: ['package', 'tracker'],
    resultIdField: 'opportunityId',
    targetsForContract: contract => companyImportTargetsForContract(contract),
    targetsForPlan: call => companyImportTargetsForPlan(call),
  }],
  ['company-opportunity-node.mutate', {
    skillKey: 'opportunity-management',
    importer: mutateCompanyOpportunityNodes,
    targetsForContract: contract => companyNodeTargetsForContract(contract),
    targetsForPlan: call => companyRecordTargetsForPlan(
      call,
      'data/company-opportunity-mutations',
      'mutationId',
    ),
  }],
  ['company-opportunity-artifact.mount', {
    skillKey: 'opportunity-management',
    importer: mountCompanyOpportunityArtifact,
    targetsForContract: contract => companyArtifactTargetsForContract(contract),
    targetsForPlan: call => companyRecordTargetsForPlan(
      call,
      'data/company-opportunity-artifact-mounts',
      'mountId',
    ),
  }],
]);

const TOOLS = new Map([
  ['resume-materials.import', {
    command: 'node resume-materials.mjs import <contract.json>',
    inputKinds: new Set(['experience_text', 'evidence_package']),
    targets: ['data/resume-materials.json', 'interview-prep/story-bank.md', 'data/resume-materials-backups/'],
    dispatchable: true,
  }],
  ['job-analysis.import', {
    command: 'node job-analysis.mjs import <contract.json>',
    inputKinds: new Set(['pasted_jd']),
    targets: ['data/job-analysis/', 'reports/job-analysis/', 'data/job-analysis-backups/'],
    dispatchable: true,
  }],
  ['scam-check.import', {
    command: 'node scam-check.mjs import <contract.json>',
    inputKinds: new Set(['pasted_jd', 'company_evidence', 'hr_message']),
    targets: ['data/scam-check/', 'reports/scam-check/', 'data/scam-check-backups/'],
    dispatchable: true,
  }],
  ['resume-final.import', {
    command: 'node resume-final.mjs apply <contract.json>',
    inputKinds: new Set(['resume_materials', 'pasted_jd']),
    targets: ['data/resume-final-plan.json', 'cv.md', 'data/resume-final-backups/'],
    dispatchable: true,
  }],
  ['resume-render.import', {
    command: 'node resume-render.mjs import <contract.json>',
    inputKinds: new Set(['resume_materials']),
    targets: ['data/resume-render/', 'output/resume/', 'data/resume-render-backups/'],
    dispatchable: true,
  }],
  ['interview-prep.import', {
    command: 'node interview-prep.mjs import <contract.json>',
    inputKinds: new Set(['pasted_jd', 'resume_materials']),
    targets: ['data/interview-prep/', 'interview-prep/', 'data/interview-prep-backups/'],
    dispatchable: true,
  }],
  ['interview-review.import', {
    command: 'node interview-review.mjs import <contract.json>',
    inputKinds: new Set(['interview_notes', 'interview_prep']),
    targets: ['data/interview-review/', 'interview-prep/sessions/', 'data/interview-review-backups/'],
    dispatchable: true,
  }],
  ['capability-feedback.import', {
    command: 'node capability-feedback.mjs import <contract.json>',
    inputKinds: new Set(['interview_notes', 'interview_prep']),
    targets: ['data/capability-feedback/', 'reports/capability-feedback/', 'data/capability-feedback-backups/'],
    dispatchable: true,
  }],
  ['company-opportunity.import', {
    command: 'node company-opportunity.mjs import <contract.json>',
    inputKinds: new Set(['job_analysis']),
    targets: [
      'data/company-opportunities/',
      'data/applications.md',
      'data/company-opportunities-backups/',
    ],
    dispatchable: true,
  }],
  ['company-opportunity-node.mutate', {
    command: 'node company-opportunity.mjs mutate-nodes <contract.json>',
    inputKinds: new Set(['process_nodes']),
    targets: [
      'data/company-opportunities/',
      'data/company-opportunity-mutations/',
      'data/company-opportunities-backups/',
    ],
    dispatchable: true,
  }],
  ['company-opportunity-artifact.mount', {
    command: 'node company-opportunity.mjs mount-artifact <contract.json>',
    inputKinds: new Set(['local_artifact']),
    targets: [
      'data/company-opportunities/',
      'data/company-opportunity-artifact-mounts/',
      'data/company-opportunities-backups/',
    ],
    dispatchable: true,
  }],
]);

const SKILLS = new Map([
  ['experience-structuring', {
    skillKey: 'experience-structuring',
    name: '经历结构化',
    purpose: '把用户确认的经历整理为简历素材与 STAR 候选。',
    targetModules: ['capability-assets', 'resume-management'],
    writesLocal: true,
    inputKinds: new Set(['experience_text', 'evidence_package']),
    tools: new Set(['resume-materials.import']),
    targets: ['data/resume-materials.json', 'interview-prep/story-bank.md', 'data/resume-materials-backups/'],
    noWriteTargets: ['cv.md', 'data/resume-final-plan.json', 'data/resume-render/', 'output/resume/', 'data/resume-library.json', 'data/company-opportunities/', 'data/applications.md'],
    downgrade: '先输出候选经历、证据缺口和补充问题；用户确认后再生成素材导入计划。',
  }],
  ['jd-analysis', {
    skillKey: 'jd-analysis',
    name: 'JD 分析',
    purpose: '解析用户粘贴的 JD，生成匹配、差距与证据不足报告。',
    targetModules: ['interview-management'],
    writesLocal: true,
    inputKinds: new Set(['pasted_jd']),
    tools: new Set(['job-analysis.import']),
    targets: ['data/job-analysis/', 'reports/job-analysis/', 'data/job-analysis-backups/'],
    noWriteTargets: ['data/company-opportunities/', 'data/applications.md', 'data/resume-materials.json', 'cv.md'],
    downgrade: '请用户粘贴 JD；公司、岗位、地点或要求缺失时输出证据不足，不推断。',
  }],
  ['scam-check', {
    skillKey: 'scam-check',
    name: '防骗核查',
    purpose: '基于用户提供的证据生成引用式风险报告。',
    targetModules: ['interview-management'],
    writesLocal: true,
    inputKinds: new Set(['pasted_jd', 'company_evidence', 'hr_message']),
    tools: new Set(['scam-check.import']),
    targets: ['data/scam-check/', 'reports/scam-check/', 'data/scam-check-backups/'],
    noWriteTargets: ['data/company-opportunities/', 'data/applications.md', 'data/job-analysis/'],
    downgrade: '列出不校外联即可完成的核实动作；证据不足不给绿灯。',
  }],
  ['resume-generation', {
    skillKey: 'resume-generation',
    name: '简历生成与适配',
    purpose: '基于已确认素材生成定稿计划、渲染计划或新草稿。',
    targetModules: ['resume-management'],
    writesLocal: true,
    inputKinds: new Set(['resume_materials', 'pasted_jd']),
    tools: new Set(['resume-final.import', 'resume-render.import']),
    targets: [
      'data/resume-final-plan.json',
      'cv.md',
      'data/resume-final-backups/',
      'data/resume-render/',
      'output/resume/',
      'data/resume-render-backups/',
    ],
    noWriteTargets: ['data/resume-library.json', 'data/company-opportunities/', 'data/applications.md', 'data/evidence-package.json'],
    downgrade: '输出章节选择、条目来源和期望 diff；证据不足的条目不进入定稿。',
  }],
  ['interview-preparation', {
    skillKey: 'interview-preparation',
    name: '面试准备',
    purpose: '生成面试准备清单和可追溯 STAR 引用。',
    targetModules: ['interview-management'],
    writesLocal: true,
    inputKinds: new Set(['pasted_jd', 'resume_materials']),
    tools: new Set(['interview-prep.import']),
    targets: ['data/interview-prep/', 'interview-prep/', 'data/interview-prep-backups/'],
    noWriteTargets: ['data/company-opportunities/', 'data/applications.md', 'cv.md'],
    downgrade: '只输出候选问题、素材引用和需要用户补充的事实。',
  }],
  ['interview-review', {
    skillKey: 'interview-review',
    name: '面试复盘',
    purpose: '结构化面试复盘，生成能力差距与反哺候选。',
    targetModules: ['capability-assets', 'interview-management'],
    writesLocal: true,
    inputKinds: new Set(['interview_notes', 'interview_prep']),
    tools: new Set(['interview-review.import', 'capability-feedback.import']),
    targets: [
      'data/interview-review/',
      'interview-prep/sessions/',
      'data/interview-review-backups/',
      'data/capability-feedback/',
      'reports/capability-feedback/',
      'data/capability-feedback-backups/',
    ],
    noWriteTargets: ['data/evidence-package.json', 'data/resume-materials.json', 'interview-prep/story-bank.md', 'cv.md', 'data/company-opportunities/', 'data/applications.md'],
    downgrade: '复盘结论和 STAR 候选先停留在本地台账，不写回能力证据或素材包。',
  }],
  ['opportunity-management', {
    skillKey: 'opportunity-management',
    name: '公司机会管理',
    purpose: '显式导入公司机会，并维护用户确认的流程节点与真实产物挂载。',
    targetModules: ['interview-management'],
    writesLocal: true,
    inputKinds: new Set(['job_analysis', 'process_nodes', 'local_artifact']),
    tools: new Set([
      'company-opportunity.import',
      'company-opportunity-node.mutate',
      'company-opportunity-artifact.mount',
    ]),
    targets: [
      'data/company-opportunities/',
      'data/applications.md',
      'data/company-opportunity-mutations/',
      'data/company-opportunity-artifact-mounts/',
      'data/company-opportunities-backups/',
    ],
    noWriteTargets: ['data/job-analysis/', 'reports/job-analysis/', 'data/resume-materials.json', 'cv.md'],
    downgrade: '先输出目标机会、完整节点列表或待挂载产物，用户确认后再生成对应导入 / mutation / mount 计划。',
  }],
]);

function runtimeError(message, code = 'invalid-skill-plan', details = {}) {
  return new ContractToolError(message, code, details);
}

function requireContentHash(value, path, code = 'invalid-skill-plan') {
  const text = requireString(value, path, { min: 71, max: 71 }, ContractToolError, code);
  if (!CONTENT_HASH_PATTERN.test(text)) {
    throw runtimeError(`${path} must be a sha256 content hash`, code, { path });
  }
  return text;
}

function normalizeRelativePath(value, path, code = 'invalid-skill-plan') {
  const text = requireString(value, path, { min: 3, max: 240 }, ContractToolError, code);
  if (text.includes('\\') || text.startsWith('/') || /^[A-Za-z]:/.test(text)) {
    throw runtimeError(`${path} must be a /-separated path relative to the local data root`, code, { path });
  }
  const segments = text.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw runtimeError(`${path} must be normalized and must not contain . or .. segments`, code, { path });
  }
  return text;
}

function targetIsAllowed(target, allowedTargets) {
  return allowedTargets.some(allowed => (
    allowed.endsWith('/') ? target.startsWith(allowed) : target === allowed
  ));
}

function requireTargets(value, path, allowedTargets, code) {
  const targets = requireArray(value, path, 1, MAX_TARGET_OBJECTS, ContractToolError, code)
    .map((item, index) => normalizeRelativePath(item, `${path}[${index}]`, code));
  if (new Set(targets).size !== targets.length) {
    throw runtimeError(`${path} contains duplicate target objects`, code, { path });
  }
  const unexpected = targets.filter(target => !targetIsAllowed(target, allowedTargets));
  if (unexpected.length > 0) {
    throw runtimeError(`${path} contains objects outside the declared skill scope: ${unexpected.join(', ')}`, 'target-out-of-scope', {
      path,
      targets: unexpected,
    });
  }
  return targets;
}

function pairedDispatchTargetsForId(rule, value) {
  const idPath = `$.${rule.idField}`;
  const id = requireSafeId(value, idPath, ContractToolError, 'dispatch-target-contract-mismatch');
  if (!SAFE_TARGET_ID_PATTERN.test(id)) {
    throw runtimeError(`${idPath} cannot be used as a target identity`, 'dispatch-target-contract-mismatch', {
      [rule.idField]: value,
    });
  }
  return [
    `${rule.packagePrefix}${id}.json`,
    `${rule.documentPrefix}${id}${rule.documentExtension}`,
  ];
}

function pairedDispatchTargetsFromPlan(call, rule) {
  const ids = call.targetObjects.map(target => {
    if (target.startsWith(rule.packagePrefix) && target.endsWith('.json')) {
      return target.slice(rule.packagePrefix.length, -'.json'.length);
    }
    if (target.startsWith(rule.documentPrefix) && target.endsWith(rule.documentExtension)) {
      return target.slice(rule.documentPrefix.length, -rule.documentExtension.length);
    }
    return null;
  });
  if (ids.length !== 2 || ids.some(id => id === null || !SAFE_TARGET_ID_PATTERN.test(id))) {
    throw runtimeError(
      `${call.targetObjects.length} ${call.toolKey} targets are invalid; expected one JSON package and one derived document with the same safe ${rule.idField}`,
      'invalid-dispatch-targets',
      { toolKey: call.toolKey },
    );
  }
  if (ids[0] !== ids[1]) {
    throw runtimeError(`${call.toolKey} targets must use the same ${rule.idField}`, 'invalid-dispatch-targets', {
      toolKey: call.toolKey,
      objectIds: ids,
    });
  }
  return pairedDispatchTargetsForId(rule, ids[0]);
}

function requireCompanyTargetId(value, path) {
  const id = requireSafeId(value, path, ContractToolError, 'dispatch-target-contract-mismatch');
  if (!SAFE_TARGET_ID_PATTERN.test(id)) {
    throw runtimeError(`${path} cannot be used as a target identity`, 'dispatch-target-contract-mismatch', {
      path,
      value,
    });
  }
  return id;
}

function companyTargets(opportunityId, secondaryTarget) {
  return [
    `data/company-opportunities/${opportunityId}.json`,
    secondaryTarget,
  ].sort();
}

function companyImportTargetsForContract(contract) {
  const opportunityId = requireCompanyTargetId(contract?.opportunityId, '$.opportunityId');
  return companyTargets(opportunityId, 'data/applications.md');
}

function companyNodeTargetsForContract(contract) {
  const opportunityId = requireCompanyTargetId(contract?.opportunityId, '$.opportunityId');
  const mutationId = requireCompanyTargetId(contract?.mutationId, '$.mutationId');
  return companyTargets(
    opportunityId,
    `data/company-opportunity-mutations/${opportunityId}/${mutationId}.json`,
  );
}

function companyArtifactTargetsForContract(contract) {
  const opportunityId = requireCompanyTargetId(contract?.opportunityId, '$.opportunityId');
  const mountId = requireCompanyTargetId(contract?.mountId, '$.mountId');
  return companyTargets(
    opportunityId,
    `data/company-opportunity-artifact-mounts/${opportunityId}/${mountId}.json`,
  );
}

function companyImportTargetsForPlan(call) {
  const targets = [...call.targetObjects].sort();
  const packagePattern = /^data\/company-opportunities\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\.json$/;
  const packageMatch = targets.find(target => packagePattern.test(target));
  if (
    targets.length !== 2
    || !targets.includes('data/applications.md')
    || !packageMatch
    || targets.filter(target => packagePattern.test(target)).length !== 1
  ) {
    throw runtimeError(
      `${call.toolKey} targets are invalid; expected one opportunity JSON and data/applications.md using the same safe opportunityId`,
      'invalid-dispatch-targets',
      { toolKey: call.toolKey },
    );
  }
  return companyTargets(packagePattern.exec(packageMatch)[1], 'data/applications.md');
}

function companyRecordTargetsForPlan(call, recordDirectory, recordIdField) {
  const targets = [...call.targetObjects].sort();
  const packagePattern = /^data\/company-opportunities\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\.json$/;
  const recordPattern = new RegExp(`^${recordDirectory}/([A-Za-z0-9][A-Za-z0-9._-]{0,63})/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\\.json$`);
  const packageMatch = targets.find(target => packagePattern.test(target));
  const recordMatch = targets.find(target => recordPattern.test(target));
  if (
    targets.length !== 2
    || !packageMatch
    || !recordMatch
    || targets.filter(target => packagePattern.test(target)).length !== 1
    || targets.filter(target => recordPattern.test(target)).length !== 1
  ) {
    throw runtimeError(
      `${call.toolKey} targets are invalid; expected one opportunity JSON and one ${recordIdField} record using the same safe opportunityId`,
      'invalid-dispatch-targets',
      { toolKey: call.toolKey },
    );
  }
  const opportunityId = packagePattern.exec(packageMatch)[1];
  const [, recordOpportunityId, recordId] = recordPattern.exec(recordMatch);
  if (opportunityId !== recordOpportunityId) {
    throw runtimeError(`${call.toolKey} targets must use the same opportunityId`, 'invalid-dispatch-targets', {
      toolKey: call.toolKey,
      opportunityId,
      recordOpportunityId,
    });
  }
  return companyTargets(opportunityId, `${recordDirectory}/${opportunityId}/${recordId}.json`);
}

function expectedDispatchTargets(call, bridge) {
  if (bridge.targetRule) return pairedDispatchTargetsFromPlan(call, bridge.targetRule).sort();
  if (bridge.targetsForPlan) return bridge.targetsForPlan(call);
  return bridge.targetsFor(call).sort();
}

function requireExactDispatchTargets(call) {
  const bridge = DISPATCH_BRIDGES.get(call.toolKey);
  if (!bridge) {
    throw runtimeError(`${call.toolKey} has no dispatcher in this runtime version`, 'unsupported-dispatch-tool');
  }
  const expectedTargets = expectedDispatchTargets(call, bridge);
  const actualTargets = [...call.targetObjects].sort();
  if (JSON.stringify(actualTargets) !== JSON.stringify(expectedTargets)) {
    throw runtimeError(
      `${call.toolKey} dispatch targets must exactly match ${expectedTargets.join(', ')}`,
      'invalid-dispatch-targets',
      { toolKey: call.toolKey, expectedTargets },
    );
  }
}

function requireInputFingerprints(value, skill) {
  const inputs = requireArray(value, '$.inputFingerprints', 1, MAX_INPUTS, ContractToolError, 'invalid-skill-plan')
    .map((item, index) => {
      const path = `$.inputFingerprints[${index}]`;
      requireObjectWithOptional(item, path, ['inputKind', 'contentHash'], [], ContractToolError, 'invalid-skill-plan');
      const inputKind = requireString(item.inputKind, `${path}.inputKind`, { min: 3, max: 40 }, ContractToolError, 'invalid-skill-plan');
      if (!skill.inputKinds.has(inputKind)) {
        throw runtimeError(`${path}.inputKind is not allowed for ${skill.skillKey}`, 'invalid-input-kind', { path });
      }
      return {
        inputKind,
        contentHash: requireContentHash(item.contentHash, `${path}.contentHash`),
      };
    });
  const keys = inputs.map(input => `${input.inputKind}\n${input.contentHash}`);
  if (new Set(keys).size !== keys.length) {
    throw runtimeError('$.inputFingerprints contains duplicate input fingerprints');
  }
  return inputs;
}

function requireToolCalls(value, skill, inputs, dispatchable = false) {
  const calls = requireArray(value, '$.toolCalls', 1, MAX_TOOL_CALLS, ContractToolError, 'invalid-skill-plan')
    .map((item, index) => {
      const path = `$.toolCalls[${index}]`;
      const requiredFields = dispatchable
        ? ['toolKey', 'targetObjects', 'contractFile', 'contractFileHash']
        : ['toolKey', 'targetObjects'];
      requireObjectWithOptional(item, path, requiredFields, [], ContractToolError, 'invalid-skill-plan');
      const toolKey = requireString(item.toolKey, `${path}.toolKey`, { min: 3, max: 80 }, ContractToolError, 'invalid-skill-plan');
      if (!skill.tools.has(toolKey)) {
        throw runtimeError(`${path}.toolKey is not declared by ${skill.skillKey}`, 'undeclared-tool', { path });
      }
      const tool = TOOLS.get(toolKey);
      if (!inputs.some(input => tool.inputKinds.has(input.inputKind))) {
        throw runtimeError(`${path}.toolKey has no allowed input fingerprint in this plan`, 'invalid-input-kind', { path });
      }
      const call = {
        toolKey,
        targetObjects: requireTargets(
          item.targetObjects,
          `${path}.targetObjects`,
          tool.targets.filter(target => targetIsAllowed(target, skill.targets)),
          'invalid-skill-plan',
        ),
      };
      if (dispatchable) {
        if (!DISPATCH_BRIDGES.has(toolKey)) {
          throw runtimeError(`${path}.toolKey has no dispatcher in this runtime version`, 'unsupported-dispatch-tool', { path });
        }
        requireExactDispatchTargets(call);
        call.contractFile = normalizeRelativePath(item.contractFile, `${path}.contractFile`);
        if (!call.contractFile.endsWith('.json')) {
          throw runtimeError(`${path}.contractFile must point to a JSON contract`, 'invalid-skill-plan', { path });
        }
        call.contractFileHash = requireContentHash(item.contractFileHash, `${path}.contractFileHash`);
      }
      return call;
    });
  if (dispatchable && calls.length !== 1) {
    throw runtimeError('Dispatchable plans must contain exactly one tool call.', 'unsupported-dispatch-tool');
  }
  if (new Set(calls.map(call => call.toolKey)).size !== calls.length) {
    throw runtimeError('$.toolCalls contains duplicate tool keys');
  }
  const allTargets = calls.flatMap(call => call.targetObjects);
  if (new Set(allTargets).size !== allTargets.length) {
    throw runtimeError('$.toolCalls modifies the same target object more than once', 'duplicate-target');
  }
  return calls;
}

export function canonicalizeSkillRunPlan(input) {
  requireObjectWithOptional(input, '$', [
    'schema',
    'schemaVersion',
    'runId',
    'generatedAt',
    'traceId',
    'confirmation',
    'userIntent',
    'skillKey',
    'inputFingerprints',
    'toolCalls',
    'failureRecovery',
  ], [], ContractToolError, 'invalid-skill-plan');
  if (input.schema !== SKILL_PLAN_SCHEMA) {
    throw runtimeError(`$.schema must be ${SKILL_PLAN_SCHEMA}`);
  }
  const schemaVersion = input.schemaVersion;
  if (![1, SKILL_PLAN_SCHEMA_VERSION].includes(schemaVersion)) {
    throw runtimeError(`$.schemaVersion must be ${SKILL_PLAN_SCHEMA_VERSION}`, 'unsupported-version');
  }
  const dispatchable = schemaVersion === SKILL_PLAN_SCHEMA_VERSION;
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-skill-plan');

  const skillKey = requireSafeId(input.skillKey, '$.skillKey', ContractToolError, 'invalid-skill-plan');
  const skill = SKILLS.get(skillKey);
  if (!skill) {
    throw runtimeError(`Skill is not registered: ${skillKey}`, 'unregistered-skill', { skillKey });
  }

  const plan = {
    schema: SKILL_PLAN_SCHEMA,
    schemaVersion,
    runId: requireSafeId(input.runId, '$.runId', ContractToolError, 'invalid-skill-plan'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-skill-plan'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-skill-plan'),
    confirmation: input.confirmation,
    userIntent: requireString(input.userIntent, '$.userIntent', { min: 8, max: 200 }, ContractToolError, 'invalid-skill-plan'),
    skillKey,
    inputFingerprints: requireInputFingerprints(input.inputFingerprints, skill),
    toolCalls: [],
    failureRecovery: requireString(
      input.failureRecovery,
      '$.failureRecovery',
      { min: 10, max: 500 },
      ContractToolError,
      'invalid-skill-plan',
    ),
  };
  plan.toolCalls = requireToolCalls(input.toolCalls, skill, plan.inputFingerprints, dispatchable);

  const targetObjects = [...new Set(plan.toolCalls.flatMap(call => call.targetObjects))].sort();
  const contentHash = semanticHash(plan);
  return {
    plan,
    skill,
    contentHash,
    summary: {
      runId: plan.runId,
      generatedAt: plan.generatedAt,
      traceId: plan.traceId,
      userIntent: plan.userIntent,
      skillKey,
      skillName: skill.name,
      targetModules: [...skill.targetModules],
      inputCount: plan.inputFingerprints.length,
      inputKinds: [...new Set(plan.inputFingerprints.map(input => input.inputKind))],
      toolKeys: plan.toolCalls.map(call => call.toolKey),
      dispatchable,
      targetObjects,
      noWriteTargets: [...skill.noWriteTargets],
      downgrade: skill.downgrade,
      contentHash,
    },
  };
}

function fileByteHash(path, maxBytes, pathLabel, code) {
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    throw runtimeError(`Cannot inspect ${pathLabel}: ${error.message}`, code, { path });
  }
  if (!info.isFile()) {
    throw runtimeError(`${pathLabel} must be a regular file`, code, { path });
  }
  if (info.size > maxBytes) {
    throw runtimeError(`${pathLabel} exceeds ${maxBytes} bytes`, code, { path });
  }
  try {
    return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
  } catch (error) {
    throw runtimeError(`Cannot read ${pathLabel}: ${error.message}`, code, { path });
  }
}

function verifyDispatchContracts(current, root) {
  if (current.plan.schemaVersion !== SKILL_PLAN_SCHEMA_VERSION) return;
  for (const call of current.plan.toolCalls) {
    const bridge = DISPATCH_BRIDGES.get(call.toolKey);
    const path = join(root, call.contractFile);
    const actualHash = fileByteHash(path, MAX_CONTRACT_FILE_BYTES, `contract file ${call.contractFile}`, 'invalid-dispatch-contract');
    if (actualHash !== call.contractFileHash) {
      throw runtimeError(
        `Contract file no longer matches ${current.plan.runId}: ${call.contractFile}`,
        'dispatch-contract-drift',
        { contractFile: call.contractFile, expectedHash: call.contractFileHash, actualHash },
      );
    }
    if (!bridge.targetRule && !bridge.targetsForContract) continue;
    let contract;
    try {
      contract = readJsonContract(path, {
        maxBytes: MAX_CONTRACT_FILE_BYTES,
        ErrorClass: ContractToolError,
        errorCode: 'invalid-dispatch-contract',
      });
    } catch (error) {
      throw runtimeError(`Cannot parse dispatch contract ${call.contractFile}: ${error.message}`, 'invalid-dispatch-contract', {
        contractFile: call.contractFile,
      });
    }
    const expectedTargets = expectedDispatchTargets(call, bridge);
    const contractTargets = bridge.targetsForContract
      ? bridge.targetsForContract(contract)
      : pairedDispatchTargetsForId(bridge.targetRule, contract[bridge.targetRule.idField]);
    if (JSON.stringify(contractTargets) !== JSON.stringify(expectedTargets)) {
      throw runtimeError(
        `Dispatch targets do not match the approved ${call.toolKey} contract: ${call.contractFile}`,
        'dispatch-target-contract-mismatch',
        { contractFile: call.contractFile, planTargets: expectedTargets, contractTargets },
      );
    }
  }
}

function readPlanFile(filePath, root = getCareerOpsRoot()) {
  const current = canonicalizeSkillRunPlan(readJsonContract(filePath, { maxBytes: MAX_PLAN_BYTES }));
  verifyDispatchContracts(current, root);
  return current;
}

function fingerprintTargetObjects(root, targets) {
  return targets.map(target => {
    const path = join(root, target);
    let info;
    try {
      info = lstatSync(path);
    } catch (error) {
      if (error.code === 'ENOENT') return { target, state: 'missing' };
      throw runtimeError(`Cannot inspect target object ${target}: ${error.message}`, 'invalid-target-state', { path });
    }
    if (!info.isFile()) {
      throw runtimeError(`Target object is not a regular file: ${target}`, 'invalid-target-state', { path });
    }
    return {
      target,
      state: 'file',
      contentHash: fileByteHash(path, MAX_FINGERPRINT_FILE_BYTES, `target object ${target}`, 'invalid-target-state'),
    };
  });
}

function observedWriteCount(before, after) {
  return before.filter((left, index) => JSON.stringify(left) !== JSON.stringify(after[index])).length;
}

function relativeRootPath(root, path) {
  return path.replaceAll('\\', '/').replace(`${root.replaceAll('\\', '/')}/`, '');
}

function relativeBackupPath(root, path) {
  return path ? relativeRootPath(root, path) : null;
}

function materialsToolResult(result, root) {
  return {
    toolKey: 'resume-materials.import',
    action: result.action,
    packageId: result.incoming.packageId,
    contentHash: result.incoming.contentHash,
    backupPaths: {
      materials: relativeBackupPath(root, result.backupPaths.materials),
      storyBank: relativeBackupPath(root, result.backupPaths.storyBank),
    },
  };
}

function genericToolResult(call, result, root) {
  const bridge = DISPATCH_BRIDGES.get(call.toolKey);
  const idField = bridge.resultIdField ?? bridge.targetRule.idField;
  const backupKeys = bridge.backupKeys ?? ['package', 'markdown'];
  return {
    toolKey: call.toolKey,
    action: result.action,
    objectId: result.incoming[idField],
    contentHash: result.incoming.contentHash,
    backupPaths: Object.fromEntries(backupKeys.map(key => [
      key,
      relativeBackupPath(root, result.backupPaths[key]),
    ])),
  };
}

function companyRecordToolResult(call, result, root) {
  const objectId = call.toolKey === 'company-opportunity-node.mutate'
    ? result.plan.mutationId
    : result.plan.mountId;
  return {
    toolKey: call.toolKey,
    action: result.action,
    objectId,
    contentHash: result.plan.planContentHash,
    backupPaths: {
      opportunity: relativeBackupPath(root, result.backupPath),
    },
  };
}

function dispatchToolResult(call, result, root) {
  if (call.toolKey === 'resume-materials.import') return materialsToolResult(result, root);
  if (bridgeUsesCompanyRecordResult(call.toolKey)) return companyRecordToolResult(call, result, root);
  return genericToolResult(call, result, root);
}

function bridgeUsesCompanyRecordResult(toolKey) {
  return toolKey === 'company-opportunity-node.mutate'
    || toolKey === 'company-opportunity-artifact.mount';
}

function requireFingerprintSnapshot(value, path, allowNull, expectedTargets) {
  if (allowNull && value === null) return null;
  const fingerprints = requireArray(value, path, expectedTargets.length, expectedTargets.length, ContractToolError, 'invalid-run-record')
    .map((item, index) => {
      const itemPath = `${path}[${index}]`;
      requireObjectWithOptional(item, itemPath, ['target', 'state'], ['contentHash'], ContractToolError, 'invalid-run-record');
      const target = normalizeRelativePath(item.target, `${itemPath}.target`, 'invalid-run-record');
      const state = requireEnum(item.state, `${itemPath}.state`, new Set(['missing', 'file']), ContractToolError, 'invalid-run-record');
      const contentHash = item.contentHash === undefined && state === 'missing'
        ? undefined
        : requireContentHash(item.contentHash, `${itemPath}.contentHash`, 'invalid-run-record');
      if (state === 'missing' && contentHash !== undefined) {
        throw runtimeError(`${itemPath}.state cannot be missing while carrying a content hash`, 'invalid-run-record');
      }
      if (state === 'file' && contentHash === undefined) {
        throw runtimeError(`${itemPath}.contentHash is required for a file target`, 'invalid-run-record');
      }
      return contentHash === undefined ? { target, state } : { target, state, contentHash };
    });
  const expected = [...expectedTargets].sort();
  const actual = fingerprints.map(item => item.target).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw runtimeError(`${path} must cover exactly the declared dispatch targets`, 'invalid-run-record', { path });
  }
  return fingerprints;
}

function requireExecutionError(value) {
  requireObjectWithOptional(
    value,
    '$.execution.error',
    ['message', 'toolErrorCode', 'afterFingerprintsAvailable'],
    ['afterFingerprintError'],
    ContractToolError,
    'invalid-run-record',
  );
  const error = {
    message: requireString(value.message, '$.execution.error.message', { min: 1, max: 500 }, ContractToolError, 'invalid-run-record'),
    toolErrorCode: requireString(value.toolErrorCode, '$.execution.error.toolErrorCode', { min: 1, max: 80 }, ContractToolError, 'invalid-run-record'),
    afterFingerprintsAvailable: value.afterFingerprintsAvailable === true,
  };
  if (value.afterFingerprintError !== undefined && value.afterFingerprintError !== null) {
    error.afterFingerprintError = requireString(
      value.afterFingerprintError,
      '$.execution.error.afterFingerprintError',
      { min: 1, max: 500 },
      ContractToolError,
      'invalid-run-record',
    );
  }
  return error;
}

function requireOptionalRelativePath(value, path) {
  return value === null ? null : normalizeRelativePath(value, path, 'invalid-run-record');
}

function requireToolResult(value, path, call) {
  if (call.toolKey === 'resume-materials.import') {
    requireObjectWithOptional(
      value,
      path,
      ['toolKey', 'action', 'packageId', 'contentHash', 'backupPaths'],
      [],
      ContractToolError,
      'invalid-run-record',
    );
    requireObjectWithOptional(value.backupPaths, `${path}.backupPaths`, ['materials', 'storyBank'], [], ContractToolError, 'invalid-run-record');
    return {
      toolKey: requireEnum(value.toolKey, `${path}.toolKey`, new Set([call.toolKey]), ContractToolError, 'invalid-run-record'),
      action: requireString(value.action, `${path}.action`, { min: 1, max: 40 }, ContractToolError, 'invalid-run-record'),
      packageId: requireString(value.packageId, `${path}.packageId`, { min: 1, max: 64 }, ContractToolError, 'invalid-run-record'),
      contentHash: requireContentHash(value.contentHash, `${path}.contentHash`, 'invalid-run-record'),
      backupPaths: {
        materials: requireOptionalRelativePath(value.backupPaths.materials, `${path}.backupPaths.materials`),
        storyBank: requireOptionalRelativePath(value.backupPaths.storyBank, `${path}.backupPaths.storyBank`),
      },
    };
  }

  if (bridgeUsesCompanyRecordResult(call.toolKey)) {
    requireObjectWithOptional(
      value,
      path,
      ['toolKey', 'action', 'objectId', 'contentHash', 'backupPaths'],
      [],
      ContractToolError,
      'invalid-run-record',
    );
    requireObjectWithOptional(
      value.backupPaths,
      `${path}.backupPaths`,
      ['opportunity'],
      [],
      ContractToolError,
      'invalid-run-record',
    );
    return {
      toolKey: requireEnum(value.toolKey, `${path}.toolKey`, new Set([call.toolKey]), ContractToolError, 'invalid-run-record'),
      action: requireString(value.action, `${path}.action`, { min: 1, max: 40 }, ContractToolError, 'invalid-run-record'),
      objectId: requireSafeId(value.objectId, `${path}.objectId`, ContractToolError, 'invalid-run-record'),
      contentHash: requireContentHash(value.contentHash, `${path}.contentHash`, 'invalid-run-record'),
      backupPaths: {
        opportunity: requireOptionalRelativePath(value.backupPaths.opportunity, `${path}.backupPaths.opportunity`),
      },
    };
  }

  const bridge = DISPATCH_BRIDGES.get(call.toolKey);
  const backupKeys = bridge.backupKeys ?? ['package', 'markdown'];
  requireObjectWithOptional(
    value,
    path,
    ['toolKey', 'action', 'objectId', 'contentHash', 'backupPaths'],
    [],
    ContractToolError,
    'invalid-run-record',
  );
  requireObjectWithOptional(
    value.backupPaths,
    `${path}.backupPaths`,
    backupKeys,
    [],
    ContractToolError,
    'invalid-run-record',
  );
  return {
    toolKey: requireEnum(value.toolKey, `${path}.toolKey`, new Set([call.toolKey]), ContractToolError, 'invalid-run-record'),
    action: requireString(value.action, `${path}.action`, { min: 1, max: 40 }, ContractToolError, 'invalid-run-record'),
    objectId: requireSafeId(value.objectId, `${path}.objectId`, ContractToolError, 'invalid-run-record'),
    contentHash: requireContentHash(value.contentHash, `${path}.contentHash`, 'invalid-run-record'),
    backupPaths: Object.fromEntries(backupKeys.map(key => [
      key,
      requireOptionalRelativePath(value.backupPaths[key], `${path}.backupPaths.${key}`),
    ])),
  };
}

function buildRunRecord(
  current,
  recordedAt,
  previousPlanHash = null,
  execution = null,
  targetFingerprints = null,
) {
  const { plan, skill, contentHash } = current;
  const record = {
    schema: SKILL_RUN_SCHEMA,
    schemaVersion: plan.schemaVersion,
    runId: plan.runId,
    recordedAt: recordedAt,
    planGeneratedAt: plan.generatedAt,
    traceId: plan.traceId,
    userIntent: plan.userIntent,
    skillKey: plan.skillKey,
    planContentHash: contentHash,
    inputFingerprints: plan.inputFingerprints,
    toolCalls: plan.toolCalls,
    targetObjects: current.summary.targetObjects,
    noWriteTargets: [...skill.noWriteTargets],
    execution: execution ?? {
      mode: 'approval-ledger',
      status: 'recorded',
      dispatchedToolCount: 0,
      targetWriteCount: 0,
    },
    recovery: plan.failureRecovery,
  };
  if (plan.schemaVersion === SKILL_PLAN_SCHEMA_VERSION) {
    record.targetFingerprints = targetFingerprints;
  }
  if (previousPlanHash !== null) record.replacesPlanContentHash = previousPlanHash;
  return record;
}

function recordSummary(record) {
  return {
    runId: record.runId,
    recordedAt: record.recordedAt,
    planGeneratedAt: record.planGeneratedAt,
    traceId: record.traceId,
    skillKey: record.skillKey,
    planContentHash: record.planContentHash,
    status: record.execution.status,
    mode: record.execution.mode,
    dispatchedToolCount: record.execution.dispatchedToolCount,
    targetWriteCount: record.execution.targetWriteCount,
    targetObjects: record.targetObjects,
    toolKeys: record.toolCalls.map(call => call.toolKey),
    toolResults: record.execution.toolResults ?? [],
    error: record.execution.error ?? null,
  };
}

export function canonicalizeSkillRunRecord(input) {
  const schemaVersion = input?.schemaVersion;
  const dispatchable = schemaVersion === SKILL_PLAN_SCHEMA_VERSION;
  requireObjectWithOptional(input, '$', [
    'schema',
    'schemaVersion',
    'runId',
    'recordedAt',
    'planGeneratedAt',
    'traceId',
    'userIntent',
    'skillKey',
    'planContentHash',
    'inputFingerprints',
    'toolCalls',
    'targetObjects',
    'noWriteTargets',
    ...(dispatchable ? ['targetFingerprints'] : []),
    'execution',
    'recovery',
  ], ['replacesPlanContentHash'], ContractToolError, 'invalid-run-record');
  if (input.schema !== SKILL_RUN_SCHEMA) {
    throw runtimeError(`$.schema must be ${SKILL_RUN_SCHEMA}`, 'invalid-run-record');
  }
  if (![1, SKILL_RUN_SCHEMA_VERSION].includes(schemaVersion)) {
    throw runtimeError(`$.schemaVersion must be 1 or ${SKILL_RUN_SCHEMA_VERSION}`, 'invalid-run-record', undefined);
  }
  const skillKey = requireSafeId(input.skillKey, '$.skillKey', ContractToolError, 'invalid-run-record');
  const skill = SKILLS.get(skillKey);
  if (!skill) throw runtimeError(`Skill is not registered: ${skillKey}`, 'unregistered-skill');
  const planLike = {
    schema: SKILL_PLAN_SCHEMA,
    schemaVersion,
    runId: input.runId,
    generatedAt: input.planGeneratedAt,
    traceId: input.traceId,
    confirmation: 'user_confirmed',
    userIntent: input.userIntent,
    skillKey,
    inputFingerprints: requireInputFingerprints(input.inputFingerprints, skill),
    toolCalls: [],
    failureRecovery: input.recovery,
  };
  planLike.toolCalls = requireToolCalls(input.toolCalls, skill, planLike.inputFingerprints, dispatchable);

  requireObjectWithOptional(
    input.execution,
    '$.execution',
    dispatchable
      ? ['mode', 'status', 'dispatchedToolCount', 'targetWriteCount', 'toolResults']
      : ['mode', 'status', 'dispatchedToolCount', 'targetWriteCount'],
    dispatchable ? ['error'] : [],
    ContractToolError,
    'invalid-run-record',
  );
  if (dispatchable) {
    requireObjectWithOptional(
      input.targetFingerprints,
      '$.targetFingerprints',
      ['before', 'after'],
      [],
      ContractToolError,
      'invalid-run-record',
    );
    const expectedTargets = [
      ...new Set(planLike.toolCalls.flatMap(call => call.targetObjects)),
    ].sort();
    requireFingerprintSnapshot(input.targetFingerprints.before, '$.targetFingerprints.before', false, expectedTargets);
    requireFingerprintSnapshot(input.targetFingerprints.after, '$.targetFingerprints.after', true, expectedTargets);
    if (input.execution.error !== undefined) input.execution.error = requireExecutionError(input.execution.error);
  }

  const mode = requireEnum(
    input.execution.mode,
    '$.execution.mode',
    new Set(dispatchable ? ['contract-dispatch'] : ['approval-ledger']),
    ContractToolError,
    'invalid-run-record',
  );
  const status = requireEnum(
    input.execution.status,
    '$.execution.status',
    new Set(dispatchable ? ['prepared', 'dispatched', 'failed'] : ['recorded']),
    ContractToolError,
    'invalid-run-record',
  );
  const dispatchedToolCount = input.execution.dispatchedToolCount;
  const targetWriteCount = input.execution.targetWriteCount;
  if (![dispatchedToolCount, targetWriteCount].every(value => Number.isInteger(value) && value >= 0 && value <= MAX_TARGET_OBJECTS)) {
    throw runtimeError('Execution counts must be integers between 0 and the target limit.', 'invalid-run-record');
  }
  if (!dispatchable && (dispatchedToolCount !== 0 || targetWriteCount !== 0)) {
    throw runtimeError('v1 approval-ledger records cannot claim contract dispatch or target writes', 'invalid-run-record');
  }
  if (dispatchable) {
    const toolResults = requireArray(
      input.execution.toolResults,
      '$.execution.toolResults',
      0,
      1,
      ContractToolError,
      'invalid-run-record',
    ).map((item, index) => {
      const path = `$.execution.toolResults[${index}]`;
      return requireToolResult(item, path, planLike.toolCalls[0]);
    });
    if (status === 'prepared' && (dispatchedToolCount !== 0 || targetWriteCount !== 0 || toolResults.length !== 0)) {
      throw runtimeError('A prepared dispatch record cannot claim execution or target writes.', 'invalid-run-record');
    }
    if (status === 'dispatched' && (dispatchedToolCount !== 1 || toolResults.length !== 1 || input.execution.error !== undefined)) {
      throw runtimeError('A dispatched record must contain one successful tool result and no error.', 'invalid-run-record');
    }
    if (status === 'failed' && input.execution.error === undefined) {
      throw runtimeError('A failed dispatch record must contain an error.', 'invalid-run-record');
    }
  }

  const record = {
    schema: SKILL_RUN_SCHEMA,
    schemaVersion,
    runId: requireSafeId(input.runId, '$.runId', ContractToolError, 'invalid-run-record'),
    recordedAt: requireTimestamp(input.recordedAt, '$.recordedAt', ContractToolError, 'invalid-run-record'),
    planGeneratedAt: requireTimestamp(input.planGeneratedAt, '$.planGeneratedAt', ContractToolError, 'invalid-run-record'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-run-record'),
    userIntent: requireString(input.userIntent, '$.userIntent', { min: 8, max: 200 }, ContractToolError, 'invalid-run-record'),
    skillKey,
    planContentHash: requireContentHash(input.planContentHash, '$.planContentHash', 'invalid-run-record'),
    inputFingerprints: planLike.inputFingerprints,
    toolCalls: planLike.toolCalls,
    targetObjects: requireTargets(input.targetObjects, '$.targetObjects', skill.targets, 'invalid-run-record'),
    noWriteTargets: [...skill.noWriteTargets],
    ...(dispatchable ? { targetFingerprints: input.targetFingerprints } : {}),
    execution: {
      mode,
      status,
      dispatchedToolCount,
      targetWriteCount,
      ...(dispatchable ? { toolResults: input.execution.toolResults } : {}),
      ...(dispatchable && input.execution.error !== undefined ? { error: input.execution.error } : {}),
    },
    recovery: requireString(input.recovery, '$.recovery', { min: 10, max: 500 }, ContractToolError, 'invalid-run-record'),
  };
  if (input.replacesPlanContentHash !== undefined) {
    record.replacesPlanContentHash = requireContentHash(
      input.replacesPlanContentHash,
      '$.replacesPlanContentHash',
      'invalid-run-record',
    );
  }
  const declaredTargetObjects = [
    ...new Set(record.toolCalls.flatMap(call => call.targetObjects)),
  ].sort();
  if (JSON.stringify(record.targetObjects) !== JSON.stringify(declaredTargetObjects)) {
    throw runtimeError(
      '$.targetObjects must exactly match the union of tool-call targets.',
      'invalid-run-record',
    );
  }
  record.targetObjects = declaredTargetObjects;
  const impliedPlan = {
    schema: SKILL_PLAN_SCHEMA,
    schemaVersion,
    runId: record.runId,
    generatedAt: record.planGeneratedAt,
    traceId: record.traceId,
    confirmation: 'user_confirmed',
    userIntent: record.userIntent,
    skillKey: record.skillKey,
    inputFingerprints: record.inputFingerprints,
    toolCalls: record.toolCalls,
    failureRecovery: record.recovery,
  };
  if (semanticHash(impliedPlan) !== record.planContentHash) {
    throw runtimeError('Skill run record fields do not match planContentHash.', 'invalid-run-record');
  }
  return record;
}

function readRecordFile(filePath) {
  return canonicalizeSkillRunRecord(readJsonContract(filePath, { maxBytes: MAX_PLAN_BYTES }));
}

function runRecordPathFor(root, runId) {
  return join(root, SKILL_RUN_DIR, `${runId}.json`);
}

export function listSkillRegistry() {
  return {
    skillCount: SKILLS.size,
    skills: [...SKILLS.values()].map(skill => ({
      skillKey: skill.skillKey,
      name: skill.name,
      purpose: skill.purpose,
      targetModules: [...skill.targetModules],
      writesLocal: skill.writesLocal,
      allowedInputKinds: [...skill.inputKinds],
      allowedTools: [...skill.tools],
      allowedTargets: [...skill.targets],
      noWriteTargets: [...skill.noWriteTargets],
      downgrade: skill.downgrade,
    })),
    tools: [...TOOLS.entries()].map(([toolKey, tool]) => ({
      toolKey,
      command: tool.command,
      inputKinds: [...tool.inputKinds],
      targets: [...tool.targets],
      dispatchable: tool.dispatchable === true,
    })),
  };
}

export async function runSkillPlan(filePath, { root = getCareerOpsRoot(), apply = false, replace = false } = {}) {
  if (replace && !apply) throw runtimeError('--replace requires --apply', 'usage');
  const current = readPlanFile(filePath, root);
  const target = runRecordPathFor(root, current.plan.runId);
  let existing = null;
  if (existsSync(target)) {
    const info = lstatSync(target);
    if (!info.isFile()) {
      throw runtimeError('Skill run record path is not a regular file', 'invalid-run-record', { path: target });
    }
    existing = readRecordFile(target);
  }
  const samePlan = Boolean(existing && existing.planContentHash === current.contentHash);
  const dispatchable = current.plan.schemaVersion === SKILL_PLAN_SCHEMA_VERSION;
  const alreadyDispatched = Boolean(samePlan && existing?.execution.status === 'dispatched');
  const call = dispatchable ? current.plan.toolCalls[0] : null;
  const bridge = call ? DISPATCH_BRIDGES.get(call.toolKey) : null;
  const dispatchTargets = call ? expectedDispatchTargets(call, bridge) : [];

  if (!apply) {
    let dispatch = null;
    if (dispatchable) {
      const before = fingerprintTargetObjects(root, dispatchTargets);
      try {
        const toolResult = await bridge.importer(join(root, call.contractFile), { root, apply: false });
        dispatch = alreadyDispatched ? null : { action: 'dry-run', before, toolResult };
      } catch (error) {
        if (error.code === bridge.conflictCode) {
          dispatch = {
            action: 'dry-run-replace-required',
            before,
            reason: 'The declared target content differs from the approved contract.',
          };
        } else {
          throw runtimeError(`Contract tool dry-run failed: ${error.message}`, 'skill-dispatch-failed', {
            toolKey: call.toolKey,
            toolErrorCode: error.code ?? 'io-error',
          });
        }
      }
    }
    return {
      action: !existing
        ? 'dry-run'
        : (samePlan ? 'dry-run-unchanged' : 'dry-run-replace'),
      applied: false,
      recordPath: target,
      plan: current.summary,
      dispatch,
    };
  }
  if (samePlan && !dispatchable) {
    return {
      action: 'unchanged',
      applied: true,
      changed: false,
      recordPath: target,
      backupPath: null,
      plan: current.summary,
      record: recordSummary(existing),
    };
  }
  if (alreadyDispatched) {
    let toolResult = null;
    try {
      toolResult = await bridge.importer(join(root, call.contractFile), { root, apply: false });
    } catch (error) {
      if (error.code !== bridge.conflictCode) {
        throw runtimeError(`Contract tool dry-run failed: ${error.message}`, 'skill-dispatch-failed', {
          toolKey: call.toolKey,
          toolErrorCode: error.code ?? 'io-error',
        });
      }
      if (!replace) {
        throw runtimeError(
          `The declared ${call.toolKey} targets differ from the approved contract; add --replace after user confirmation.`,
          'skill-target-conflict',
          { toolKey: call.toolKey, toolErrorCode: error.code },
        );
      }
    }
    if (!replace) {
      return {
        action: 'unchanged',
        applied: true,
        changed: false,
        recordPath: target,
        backupPath: null,
        plan: current.summary,
        record: recordSummary(existing),
      };
    }
  }
  if (existing && !replace) {
    throw runtimeError('A different plan already uses this runId; add --replace after user confirmation.', 'skill-run-conflict');
  }

  if (!dispatchable) {
    const record = buildRunRecord(current, new Date().toISOString(), existing?.planContentHash ?? null);
    let backupPath = null;
    if (existing) {
      backupPath = backupFile(
        target,
        join(root, SKILL_RUN_BACKUP_DIR, current.plan.runId),
        'skill-run',
        existing.planContentHash,
        MAX_BACKUPS_PER_RUN,
      );
    }
    writeContractFile(target, `${JSON.stringify(record, null, 2)}\n`);
    return {
      action: existing ? 'replaced' : 'recorded',
      applied: true,
      changed: true,
      recordPath: target,
      backupPath,
      plan: current.summary,
      record: recordSummary(record),
    };
  }

  const before = fingerprintTargetObjects(root, dispatchTargets);
  try {
    await bridge.importer(join(root, call.contractFile), { root, apply: false });
  } catch (error) {
    if (error.code !== bridge.conflictCode) {
      throw runtimeError(`Contract tool dry-run failed: ${error.message}`, 'skill-dispatch-failed', {
        toolKey: call.toolKey,
        toolErrorCode: error.code ?? 'io-error',
      });
    }
    if (!replace) {
      throw runtimeError(
        `The declared ${call.toolKey} targets differ from the approved contract; add --replace after user confirmation.`,
        'skill-target-conflict',
        { toolKey: call.toolKey, toolErrorCode: error.code },
      );
    }
  }

  const resuming = Boolean(samePlan && existing);
  const recordedAt = resuming ? existing.recordedAt : new Date().toISOString();
  const preparedExecution = {
    mode: 'contract-dispatch',
    status: 'prepared',
    dispatchedToolCount: 0,
    targetWriteCount: 0,
    toolResults: [],
  };
  const preparedRecord = buildRunRecord(
    current,
    recordedAt,
    existing?.planContentHash ?? null,
    preparedExecution,
    { before, after: null },
  );
  let backupPath = null;
  if (existing && !resuming) {
    backupPath = backupFile(
      target,
      join(root, SKILL_RUN_BACKUP_DIR, current.plan.runId),
      'skill-run',
      existing.planContentHash,
      MAX_BACKUPS_PER_RUN,
    );
  }
  writeContractFile(target, `${JSON.stringify(preparedRecord, null, 2)}\n`);

  let toolResult;
  let after;
  try {
    toolResult = await bridge.importer(join(root, call.contractFile), {
      root,
      apply: true,
      replace,
    });
    after = fingerprintTargetObjects(root, dispatchTargets);
  } catch (toolError) {
    let afterFingerprints = null;
    let afterFingerprintError = null;
    try {
      afterFingerprints = fingerprintTargetObjects(root, dispatchTargets);
    } catch (error) {
      afterFingerprintError = error.message;
    }
    const execution = {
      mode: 'contract-dispatch',
      status: 'failed',
      dispatchedToolCount: 1,
      targetWriteCount: afterFingerprints ? observedWriteCount(before, afterFingerprints) : 0,
      toolResults: [],
      error: {
        message: toolError.message,
        toolErrorCode: toolError.code ?? 'io-error',
        afterFingerprintsAvailable: afterFingerprints !== null,
        afterFingerprintError,
      },
    };
    const failedRecord = buildRunRecord(
      current,
      recordedAt,
      existing?.planContentHash ?? null,
      execution,
      { before, after: afterFingerprints },
    );
    writeContractFile(target, `${JSON.stringify(failedRecord, null, 2)}\n`);
    throw runtimeError(`Contract tool execution failed: ${toolError.message}`, 'skill-dispatch-failed', {
      runId: current.plan.runId,
      toolKey: call.toolKey,
      toolErrorCode: toolError.code ?? 'io-error',
      recordPath: target,
      afterFingerprintsAvailable: afterFingerprints !== null,
    });
  }

  try {
    const execution = {
      mode: 'contract-dispatch',
      status: 'dispatched',
      dispatchedToolCount: 1,
      targetWriteCount: observedWriteCount(before, after),
      toolResults: [dispatchToolResult(call, toolResult, root)],
    };
    const record = buildRunRecord(
      current,
      recordedAt,
      existing?.planContentHash ?? null,
      execution,
      { before, after },
    );
    writeContractFile(target, `${JSON.stringify(record, null, 2)}\n`);
    return {
      action: existing ? 'replaced-and-dispatched' : 'dispatched',
      applied: true,
      changed: true,
      recordPath: target,
      backupPath,
      plan: current.summary,
      record: recordSummary(record),
      targetFingerprints: { before, after },
    };
  } catch (recordError) {
    throw runtimeError(
      `Contract tool completed, but the final dispatch record could not be written: ${recordError.message}. The prepared record remains on disk.`,
      'skill-run-record-write-failed',
      { runId: current.plan.runId, recordPath: target },
    );
  }
}

export function inspectSkillRuntime(root = getCareerOpsRoot()) {
  try {
    const directory = join(root, SKILL_RUN_DIR);
    if (!existsSync(directory)) {
      return {
        state: 'missing',
        available: false,
        registeredSkillCount: SKILLS.size,
        runCount: 0,
        runs: [],
      };
    }
    const info = lstatSync(directory);
    if (!info.isDirectory()) {
      throw runtimeError('Skill run directory is not a directory', 'invalid-run-record', { path: directory });
    }
    const entries = readdirSync(directory, { withFileTypes: true })
      .filter(entry => !entry.name.startsWith('.'));
    if (entries.length > MAX_RUNS) {
      throw runtimeError(`Skill run count exceeds ${MAX_RUNS}`, 'too-many-runs');
    }
    const records = entries.map(entry => {
      if (!entry.isFile() || !new RegExp(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\\.json$`).test(entry.name)) {
        throw runtimeError(`Unexpected skill run directory entry: ${entry.name}`, 'invalid-run-record');
      }
      const record = readRecordFile(join(directory, entry.name));
      if (entry.name !== `${record.runId}.json`) {
        throw runtimeError('Skill run file name does not match runId', 'invalid-run-record', { path: entry.name });
      }
      return record;
    });
    const runIds = records.map(record => record.runId);
    if (new Set(runIds).size !== runIds.length) {
      throw runtimeError('Duplicate skill run record found', 'invalid-run-record');
    }
    return {
      state: records.length > 0 ? 'ready' : 'missing',
      available: records.length > 0,
      registeredSkillCount: SKILLS.size,
      runCount: records.length,
      runs: records
        .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
        .map(record => recordSummary(record)),
    };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      registeredSkillCount: SKILLS.size,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ContractToolError ? error.code : 'io-error',
    };
  }
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const replace = args.includes('--replace');
  const positional = args.filter(arg => !['--json', '--apply', '--replace'].includes(arg));
  if (positional.length === 1 && positional[0] === 'list' && !apply && !replace) {
    return { command: 'list', json };
  }
  if (positional.length !== 2 || !['check', 'run'].includes(positional[0])) return null;
  if (positional[0] === 'check' && (apply || replace)) return null;
  return { command: positional[0], planFile: positional[1], json, apply, replace };
}

async function main() {
  const args = parseArguments(process.argv);
  if (!args) {
    console.error(`Invalid arguments.\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  try {
    if (args.command === 'list') {
      const registry = listSkillRegistry();
      console.log(args.json ? JSON.stringify(registry, null, 2) : [
        `注册 skill：${registry.skillCount} 个（仓库封闭集合）`,
        ...registry.skills.map(skill => `${skill.name}（${skill.skillKey}） -> ${skill.allowedTools.join(', ')}`),
      ].join('\n'));
      return;
    }
    if (args.command === 'check') {
      const result = readPlanFile(args.planFile);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        'Skill 执行计划校验通过。',
        `Run ID: ${result.summary.runId}`,
        `Skill：${result.summary.skillName}（${result.summary.skillKey}）`,
        `用户意图：${result.summary.userIntent}`,
        `输入指纹：${result.summary.inputCount} 个`,
        `契约工具：${result.summary.toolKeys.join(', ')}`,
        `目标对象：${result.summary.targetObjects.join(', ')}`,
        `计划哈希：${result.summary.contentHash}`,
        result.summary.dispatchable
          ? 'v2 dispatch 计划已绑定契约文件字节哈希；全部 11 个注册契约工具均可显式执行。'
          : 'v1 计划只登记审批，不调用模型、不执行契约工具、不写目标对象。',
      ].join('\n'));
      return;
    }

    const result = await runSkillPlan(args.planFile, {
      root: getCareerOpsRoot(),
      apply: args.apply,
      replace: args.replace,
    });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `Skill Runtime 结果：${result.action}`,
      `执行记录：${result.recordPath}`,
      `Skill：${result.plan.skillName}（${result.plan.skillKey}）`,
      `计划哈希：${result.plan.contentHash}`,
      result.backupPath ? `替换备份：${result.backupPath}` : null,
      result.plan.dispatchable
        ? '已按契约 dispatcher 执行；执行记录包含目标文件前后指纹。'
        : '本命令只写审批记录；目标对象写入仍必须走对应契约工具的 check / dry-run / apply。',
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = [
      'skill-run-conflict',
      'skill-target-conflict',
      'dispatch-contract-drift',
      'dispatch-target-contract-mismatch',
      'invalid-target-state',
      'invalid-dispatch-contract',
      'target-out-of-scope',
      'unregistered-skill',
      'undeclared-tool',
      'unsupported-dispatch-tool',
    ].includes(code) ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  await main();
}
