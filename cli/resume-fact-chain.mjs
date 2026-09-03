#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import {
  MATERIALS_PATH,
  STORY_BANK_PATH,
  inspectResumeMaterials,
  loadInstalledResumeMaterials,
  renderStoryBank,
} from './resume-materials.mjs';
import {
  CV_PATH,
  FINAL_PLAN_PATH,
  canonicalizeResumeFinalPlan,
  renderFinalResume,
} from './resume-final.mjs';
import {
  RESUME_RENDER_HTML_DIR,
  RESUME_RENDER_PACKAGE_DIR,
  canonicalizeResumeRender,
  renderResumeHtml,
} from './resume-render.mjs';
import {
  RESUME_LIBRARY_PATH,
  loadInstalledResumeLibrary,
} from './resume-library.mjs';

export const RESUME_FACT_CHAIN_AUDIT_SCHEMA = 'get-yourself.resume-fact-chain-audit';
export const RESUME_FACT_CHAIN_AUDIT_SCHEMA_VERSION = 1;

const MAX_PLAN_BYTES = 128 * 1024;
const MAX_CV_BYTES = 512 * 1024;
const MAX_RENDER_PACKAGE_BYTES = 256 * 1024;
const MAX_RENDER_HTML_BYTES = 1024 * 1024;
const MAX_LIBRARY_BYTES = 2 * 1024 * 1024;
const MAX_RENDER_PACKAGES = 100;

const USAGE = `Usage:
  node resume-fact-chain.mjs audit [--json]`;

const OBJECT_LABELS = new Map([
  ['materials', '简历素材'],
  ['storyBank', 'STAR 故事库'],
  ['finalPlan', '定稿计划'],
  ['finalDocument', 'cv.md 定稿'],
  ['renderPackages', '渲染包'],
  ['resumeLibrary', '简历版本库'],
  ['currentApplicationVersions', '当前投递版'],
]);

function textHash(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function readTextObject(root, relativePath, maxBytes) {
  const target = join(root, relativePath);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'missing', text: null, contentHash: null };
    return { kind: 'invalid', text: null, contentHash: null, reason: 'io-error' };
  }
  if (!info.isFile()) return { kind: 'invalid', text: null, contentHash: null, reason: 'not-regular-file' };
  if (info.size > maxBytes) return { kind: 'invalid', text: null, contentHash: null, reason: 'too-large' };
  try {
    const text = readFileSync(target, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      return { kind: 'invalid', text: null, contentHash: null, reason: 'too-large' };
    }
    return { kind: 'file', text, contentHash: textHash(text) };
  } catch {
    return { kind: 'invalid', text: null, contentHash: null, reason: 'io-error' };
  }
}

function readRawJsonObject(root, relativePath, maxBytes) {
  const file = readTextObject(root, relativePath, maxBytes);
  if (file.kind !== 'file') return { ...file, raw: null };
  try {
    return { ...file, raw: JSON.parse(file.text) };
  } catch {
    return { kind: 'invalid', text: null, contentHash: file.contentHash, raw: null, reason: 'invalid-json' };
  }
}

function readJsonForCanonicalization(root, relativePath, maxBytes) {
  return readRawJsonObject(root, relativePath, maxBytes);
}

function safeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
    ? value
    : null;
}

function drift(driftId, severity, message, involvedObjects, suggestedAction) {
  return {
    driftId,
    severity,
    message,
    involvedObjects,
    suggestedAction,
    automaticRepair: false,
  };
}

function collectState(objects) {
  if (objects.some(object => object.state === 'invalid')) return 'invalid';
  if (objects.some(object => object.state === 'blocked' || object.state === 'missing')) return 'blocked';
  // Binding gaps describe a contract limitation, not content drift. Ambiguity
  // outranks the limitation because it changes which candidate the user must inspect.
  if (objects.some(object => object.drifts.some(item => item.severity !== 'binding-gap'))) return 'drifted';
  if (objects.some(object => object.ambiguous)) return 'ambiguous';
  if (objects.some(object => object.bindingGap)) return 'binding-gap';
  return 'ready';
}

export function auditResumeFactChain(root = getCareerOpsRoot()) {
  const drifts = [];

  const materialsInspection = inspectResumeMaterials(root);
  const materialsFile = readRawJsonObject(root, MATERIALS_PATH, 256 * 1024);
  let installedMaterials = null;
  if (materialsInspection.state === 'ready') {
    installedMaterials = loadInstalledResumeMaterials(root);
  }
  const materials = {
    state: materialsInspection.state,
    identity: { packageId: installedMaterials?.package.packageId ?? safeId(materialsFile.raw?.packageId) },
    contentHash: installedMaterials?.contentHash ?? materialsFile.contentHash,
    path: MATERIALS_PATH,
  };
  if (materials.state === 'invalid') {
    drifts.push(drift(
      'resume-materials-invalid',
      'error',
      '简历素材包存在但无法通过当前契约校验。',
      ['resume-materials'],
      '先查看素材导入器的 check 错误，由用户确认修正或显式替换素材包。',
    ));
  }

  const storyFile = readTextObject(root, STORY_BANK_PATH, 1024 * 1024);
  const storyExpected = installedMaterials ? renderStoryBank(installedMaterials.package) : null;
  const storyBank = {
    state: storyFile.kind === 'missing'
      ? 'missing'
      : (materials.state === 'ready' ? 'ready' : 'blocked'),
    identity: { path: STORY_BANK_PATH },
    contentHash: storyFile.contentHash,
    derivedFromMaterialsPackageId: installedMaterials?.package.packageId ?? null,
    consistency: storyFile.kind !== 'file' || storyExpected === null
      ? 'unknown'
      : (storyFile.text === storyExpected ? 'current' : 'different'),
  };
  if (storyFile.kind === 'invalid') storyBank.state = 'invalid';
  if (storyBank.state === 'invalid') {
    drifts.push(drift(
      'story-bank-invalid',
      'error',
      'STAR 故事库文件缺失、过大或无法读取。',
      ['interview-prep/story-bank.md'],
      '由用户确认素材包后，再通过既有显式导入流程恢复故事库。',
    ));
  } else if (storyBank.consistency === 'different') {
    drifts.push(drift(
      'story-bank-different',
      'warn',
      'STAR 故事库与当前素材包派生结果不一致。',
      ['data/resume-materials.json', 'interview-prep/story-bank.md'],
      '让用户比较两者差异后选择保留手工故事库或按当前素材显式恢复。',
    ));
  }

  const planFile = readJsonForCanonicalization(root, FINAL_PLAN_PATH, MAX_PLAN_BYTES);
  let installedPlan = null;
  let planErrorMarker = null;
  if (materials.state !== 'ready') {
    planErrorMarker = 'materials-unavailable';
  } else if (planFile.kind === 'file') {
    try {
      installedPlan = canonicalizeResumeFinalPlan(planFile.raw, installedMaterials);
    } catch {
      planErrorMarker = 'invalid-or-stale-plan';
    }
  }
  const planRawForIdentity = planFile.raw;
  const finalPlan = {
    state: planFile.kind === 'missing'
      ? 'missing'
      : (planErrorMarker === null ? 'ready' : (planErrorMarker === 'materials-unavailable' ? 'blocked' : 'invalid')),
    identity: { planId: installedPlan?.plan.planId ?? safeId(planRawForIdentity?.planId) },
    contentHash: installedPlan?.contentHash ?? null,
    path: FINAL_PLAN_PATH,
    materialsPackageId: installedPlan?.plan.materialsPackageId
      ?? (typeof planRawForIdentity?.materialsPackageId === 'string' ? planRawForIdentity.materialsPackageId : null),
    materialsContentHash: installedPlan?.plan.materialsContentHash
      ?? (typeof planRawForIdentity?.materialsContentHash === 'string' ? planRawForIdentity.materialsContentHash : null),
  };
  if (finalPlan.state === 'invalid') {
    drifts.push(drift(
      'final-plan-invalid-or-stale',
      'error',
      '定稿计划无效，或绑定的素材身份 / 内容哈希与当前素材包不一致。',
      ['data/resume-final-plan.json', 'data/resume-materials.json'],
      '先让用户确认当前素材包；若继续定稿，必须重新生成并确认计划。',
    ));
  }

  const cvFile = readTextObject(root, CV_PATH, MAX_CV_BYTES);
  let expectedCv = null;
  if (cvFile.kind === 'file' && installedPlan !== null) {
    expectedCv = renderFinalResume(cvFile.text, installedMaterials, installedPlan.plan);
  }
  const finalDocument = {
    state: cvFile.kind === 'missing' ? 'missing' : (cvFile.kind === 'file' ? 'ready' : 'invalid'),
    identity: { path: CV_PATH },
    contentHash: cvFile.contentHash,
    boundPlanId: installedPlan?.plan.planId ?? null,
    expectedContentHash: expectedCv === null ? null : textHash(expectedCv),
    consistency: expectedCv === null || cvFile.kind !== 'file'
      ? 'unknown'
      : (expectedCv === cvFile.text ? 'current' : 'different'),
  };
  if (finalDocument.state === 'invalid') {
    drifts.push(drift(
      'final-document-invalid',
      'error',
      'cv.md 缺失、过大或无法读取。',
      ['cv.md'],
      '由用户选择重新执行已确认的定稿计划，或先补齐简历事实。',
    ));
  } else if (finalDocument.consistency === 'different') {
    drifts.push(drift(
      'final-document-different',
      'warn',
      'cv.md 与当前定稿计划的托管章节结果不一致。',
      ['data/resume-final-plan.json', 'cv.md'],
      '保留用户文本，向用户展示差异后选择重新定稿、接管手工内容或派生新计划。',
    ));
  }

  const renderDrifts = [];
  const renderPackages = [];
  let packageEntries = [];
  try {
    packageEntries = readdirSync(join(root, RESUME_RENDER_PACKAGE_DIR), { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
  } catch {
    packageEntries = [];
  }
  if (packageEntries.length > MAX_RENDER_PACKAGES) {
    renderPackages.push({
      state: 'invalid',
      identity: { renderId: null },
      contentHash: null,
      path: RESUME_RENDER_PACKAGE_DIR,
      reason: 'too-many-packages',
    });
    renderDrifts.push(drift(
      'render-directory-invalid',
      'error',
      '渲染包目录超过当前工具允许的数量。',
      [RESUME_RENDER_PACKAGE_DIR],
      '先由用户整理渲染包目录，再重新执行只读审计。',
    ));
  } else {
    for (const fileName of packageEntries) {
      const relativePath = `${RESUME_RENDER_PACKAGE_DIR}/${fileName}`;
      const file = readRawJsonObject(root, relativePath, MAX_RENDER_PACKAGE_BYTES);
      let canonical = null;
      let packageInvalid = file.kind !== 'file';
      if (!packageInvalid) {
        try {
          const rawMaterials = file.raw.materialsPackageId !== undefined
            ? {
              package: { packageId: file.raw.materialsPackageId },
              contentHash: file.raw.materialsContentHash,
            }
            : null;
          canonical = canonicalizeResumeRender(file.raw, rawMaterials, null, false);
        } catch {
          packageInvalid = true;
        }
      }
      const renderId = canonical?.render.renderId ?? safeId(file.raw?.renderId);
      if (canonical !== null && `${renderId}.json` !== fileName) packageInvalid = true;
      const materialsBinding = canonical === null
        ? 'unknown'
        : (canonical.render.materialsPackageId === undefined
          ? 'unbound'
          : (installedMaterials === null
            ? 'blocked'
            : (canonical.render.materialsPackageId === installedMaterials.package.packageId
              && canonical.render.materialsContentHash === installedMaterials.contentHash
              ? 'current'
              : 'stale')));
      const finalBinding = canonical === null || canonical.render.finalPlanId === undefined
        ? (canonical === null ? 'unknown' : 'unbound')
        : (installedPlan === null || finalDocument.contentHash === null
          ? 'blocked'
          : (canonical.render.finalPlanId === installedPlan.plan.planId
            && canonical.render.finalPlanContentHash === installedPlan.contentHash
            && canonical.render.finalDocumentContentHash === finalDocument.contentHash
            ? 'current'
            : 'stale'));
      const htmlPath = `${RESUME_RENDER_HTML_DIR}/${renderId ?? fileName.replace(/\.json$/, '')}.html`;
      const htmlFile = readTextObject(root, htmlPath, MAX_RENDER_HTML_BYTES);
      const expectedHtml = canonical === null ? null : renderResumeHtml(canonical.render);
      const htmlState = htmlFile.kind === 'missing'
        ? 'missing'
        : (htmlFile.kind === 'invalid'
          ? 'invalid'
          : (expectedHtml === null ? 'blocked' : (htmlFile.text === expectedHtml ? 'ready' : 'different')));
      const renderState = packageInvalid
        ? 'invalid'
        : (materialsBinding === 'stale' || materialsBinding === 'blocked' || finalBinding === 'blocked'
          ? 'blocked'
          : (finalBinding === 'stale' ? 'drifted' : 'ready'));
      renderPackages.push({
        state: renderState,
        identity: { renderId },
        contentHash: canonical?.contentHash ?? file.contentHash,
        path: relativePath,
        templateId: canonical?.render.templateId ?? null,
        materialsBinding,
        materialsPackageId: canonical?.render.materialsPackageId
          ?? (typeof file.raw?.materialsPackageId === 'string' ? file.raw.materialsPackageId : null),
        materialsContentHash: canonical?.render.materialsContentHash
          ?? (typeof file.raw?.materialsContentHash === 'string' ? file.raw.materialsContentHash : null),
        finalBinding,
        finalPlanId: canonical?.render.finalPlanId
          ?? (typeof file.raw?.finalPlanId === 'string' ? file.raw.finalPlanId : null),
        finalPlanContentHash: canonical?.render.finalPlanContentHash
          ?? (typeof file.raw?.finalPlanContentHash === 'string' ? file.raw.finalPlanContentHash : null),
        finalDocumentContentHash: canonical?.render.finalDocumentContentHash
          ?? (typeof file.raw?.finalDocumentContentHash === 'string' ? file.raw.finalDocumentContentHash : null),
        finalContentHash: canonical?.render.finalDocumentContentHash
          ?? (typeof file.raw?.finalDocumentContentHash === 'string' ? file.raw.finalDocumentContentHash : null),
        html: {
          state: htmlState,
          path: htmlPath,
          contentHash: htmlFile.contentHash,
        },
      });
      const current = renderPackages[renderPackages.length - 1];
      if (current.state === 'invalid') {
        renderDrifts.push(drift(
          'render-package-invalid',
          'error',
          `渲染包 ${renderId ?? fileName} 无效，或文件名与 renderId 不一致。`,
          [relativePath],
          '先运行渲染包 check；修复或替换必须由用户显式确认。',
        ));
      } else if (materialsBinding === 'stale') {
        renderDrifts.push(drift(
          'render-materials-stale',
          'warn',
          `渲染包 ${renderId} 绑定的是旧素材包。`,
          [relativePath, MATERIALS_PATH],
          '把该渲染包标记为过期；用户确认当前素材后重新生成渲染包。',
        ));
      }
      if (htmlState === 'invalid') {
        renderDrifts.push(drift(
          'render-html-invalid',
          'error',
          `渲染包 ${renderId} 对应的 HTML 文件无效、过大或无法读取。`,
          [relativePath, htmlPath],
          '先检查本地 HTML 文件；修复或替换必须由用户显式确认。',
        ));
      } else if (htmlState === 'different') {
        renderDrifts.push(drift(
          'render-html-different',
          'warn',
          `渲染 HTML 与渲染包 ${renderId} 的确定性输出不一致，可能被手工修改。`,
          [relativePath, htmlPath],
          '展示两侧指纹后，由用户选择保留手工 HTML 或显式替换渲染输出。',
        ));
      } else if (htmlState === 'missing') {
        renderDrifts.push(drift(
          'render-html-missing',
          'warn',
          `渲染包 ${renderId} 没有对应 HTML。`,
          [relativePath, htmlPath],
          '由用户确认渲染包后重新生成本地 HTML。',
        ));
      }
      if (finalBinding === 'unbound') {
        renderDrifts.push(drift(
          'render-final-binding-missing',
          'binding-gap',
          `渲染包 ${renderId} 只记录素材溯源，没有记录定稿计划 ID 和 cv.md 内容指纹。`,
          [relativePath, FINAL_PLAN_PATH, CV_PATH],
          '升级渲染契约前不得声称该包对准当前定稿；用户只能把它当作候选渲染输出。',
        ));
      } else if (finalBinding === 'stale') {
        renderDrifts.push(drift(
          'render-final-binding-stale',
          'warn',
          `渲染包 ${renderId} 记录的定稿计划或 cv.md 指纹与当前文件不一致。`,
          [relativePath, FINAL_PLAN_PATH, CV_PATH],
          '把该渲染包标记为过期；用户重新确认当前定稿后再生成或导入新渲染包。',
        ));
      }
    }
  }
  drifts.push(...renderDrifts);
  const renderCollection = {
    state: renderPackages.length === 0
      ? 'missing'
      : (renderPackages.some(item => item.state === 'invalid')
        ? 'invalid'
        : (renderPackages.some(item => item.state === 'blocked')
          ? 'blocked'
          : (renderPackages.some(item => item.state === 'drifted') ? 'drifted' : 'ready'))),
    count: renderPackages.length,
    objects: renderPackages,
    drifts: renderDrifts,
    ambiguous: renderPackages.filter(item => item.state === 'ready').length > 1,
    bindingGap: renderPackages.some(item => item.state !== 'invalid' && item.finalBinding === 'unbound'),
  };

  const libraryFile = readRawJsonObject(root, RESUME_LIBRARY_PATH, MAX_LIBRARY_BYTES);
  let installedLibrary = null;
  let libraryInvalid = false;
  if (libraryFile.kind === 'file') {
    try {
      installedLibrary = loadInstalledResumeLibrary(root);
    } catch {
      libraryInvalid = true;
    }
  }
  const currentApplicationVersions = [];
  const libraryDrifts = [];
  const renderPackagesById = new Map(renderPackages
    .filter(item => item.state !== 'invalid' && item.identity.renderId !== null)
    .map(item => [item.identity.renderId, item]));
  if (installedLibrary !== null) {
    for (const document of installedLibrary.library.documents) {
      const version = document.versions.find(item => item.versionId === document.activeVersionId);
      if (!version) continue;
      const matchState = finalDocument.contentHash === null
        ? 'unknown'
        : (textHash(version.content) === finalDocument.contentHash ? 'current' : 'different');
      const finalBinding = version.finalPlanId === undefined
        ? 'unbound'
        : (installedPlan === null || finalDocument.contentHash === null
          ? 'blocked'
          : (version.finalPlanId === installedPlan.plan.planId
            && version.finalPlanContentHash === installedPlan.contentHash
            && version.finalDocumentContentHash === finalDocument.contentHash
            ? 'current'
            : 'stale'));
      const boundRender = version.renderId === undefined ? null : renderPackagesById.get(version.renderId);
      const renderBinding = version.renderId === undefined
        ? 'unbound'
        : (boundRender === undefined || boundRender.contentHash !== version.renderContentHash ? 'stale' : 'current');
      const versionState = version.status === 'draft'
        || finalBinding === 'blocked'
        || renderBinding === 'blocked'
        ? 'blocked'
        : (finalBinding === 'stale' || renderBinding === 'stale' || matchState === 'different'
          ? 'drifted'
          : 'ready');
      currentApplicationVersions.push({
        state: versionState,
        identity: {
          libraryId: installedLibrary.library.libraryId,
          documentId: document.documentId,
          versionId: version.versionId,
        },
        status: version.status,
        source: version.source,
        templateId: version.templateId,
        contentHash: textHash(version.content),
        finalPlanId: version.finalPlanId ?? null,
        finalPlanContentHash: version.finalPlanContentHash ?? null,
        finalDocumentContentHash: version.finalDocumentContentHash ?? null,
        finalContentHash: version.finalDocumentContentHash ?? null,
        finalBinding,
        renderId: version.renderId ?? null,
        renderContentHash: version.renderContentHash ?? null,
        renderBinding,
        sourceFileContentHash: version.sourceFileContentHash ?? null,
        finalDocumentContentState: matchState,
        reverseWriteAllowed: false,
      });
      if (finalBinding === 'unbound') {
        libraryDrifts.push(drift(
          'library-final-binding-missing',
          'binding-gap',
          `当前投递版 ${document.documentId}/${version.versionId} 没有记录定稿计划或导入文件指纹。`,
          [RESUME_LIBRARY_PATH, FINAL_PLAN_PATH, CV_PATH],
          version.source === 'import'
            ? '把该版本视为外部导入候选；不得反写 cv.md、素材或定稿。若要复用，必须显式创建新草稿。'
            : '补充版本来源指纹前，只能通过内容指纹做候选匹配；不得自动改写事实链。',
        ));
      } else if (finalBinding === 'stale') {
        libraryDrifts.push(drift(
          'library-final-binding-stale',
          'warn',
          `当前投递版 ${document.documentId}/${version.versionId} 记录的定稿指纹已过期。`,
          [RESUME_LIBRARY_PATH, FINAL_PLAN_PATH, CV_PATH],
          '保留该历史投递身份；用户确认当前定稿后重新生成或导入版本。',
        ));
      }
      if (renderBinding === 'stale') {
        libraryDrifts.push(drift(
          'library-render-binding-stale',
          'warn',
          `当前投递版 ${document.documentId}/${version.versionId} 绑定的渲染包不存在或指纹不一致。`,
          [RESUME_LIBRARY_PATH, RESUME_RENDER_PACKAGE_DIR],
          '保留该版本为独立导入线；用户确认渲染包后重新导入或派生草稿。',
        ));
      }
      if (matchState === 'different') {
        libraryDrifts.push(drift(
          'library-current-version-different',
          'warn',
          `当前投递版 ${document.documentId}/${version.versionId} 与 cv.md 内容指纹不一致。`,
          [RESUME_LIBRARY_PATH, CV_PATH],
          version.source === 'import'
            ? '保留外部导入版本为独立简历线；不要反向覆盖 cv.md。用户可显式派生草稿后再定稿。'
            : '展示两侧哈希和时间，由用户选择重新定稿、导入版本或保持分离。',
        ));
      }
    }
  }
  const resumeLibrary = {
    state: libraryFile.kind === 'missing'
      ? 'missing'
      : (libraryInvalid || libraryFile.kind !== 'file' ? 'invalid' : 'ready'),
    identity: { libraryId: installedLibrary?.library.libraryId ?? safeId(libraryFile.raw?.libraryId) },
    contentHash: installedLibrary?.contentHash ?? libraryFile.contentHash,
    path: RESUME_LIBRARY_PATH,
    documentCount: installedLibrary?.library.documents.length ?? 0,
    versionCount: installedLibrary?.library.documents.reduce((total, document) => total + document.versions.length, 0) ?? 0,
  };
  if (resumeLibrary.state === 'invalid') {
    libraryDrifts.push(drift(
      'resume-library-invalid',
      'error',
      '简历版本库存在但无法通过当前契约校验。',
      [RESUME_LIBRARY_PATH],
      '先运行版本库 check；修复或替换必须由用户显式确认。',
    ));
  }
  const currentVersionCollection = {
    state: currentApplicationVersions.length === 0
      ? (resumeLibrary.state === 'ready' ? 'blocked' : resumeLibrary.state)
      : (currentApplicationVersions.some(item => item.state === 'blocked')
        ? 'blocked'
        : (currentApplicationVersions.some(item => item.state === 'drifted') ? 'drifted' : 'ready')),
    count: currentApplicationVersions.length,
    objects: currentApplicationVersions,
    drifts: libraryDrifts,
    ambiguous: currentApplicationVersions.length > 1,
    bindingGap: currentApplicationVersions.some(item => item.finalBinding === 'unbound'),
  };
  drifts.push(...libraryDrifts);

  const objects = {
    materials: { drifts: drifts.filter(item => item.driftId === 'resume-materials-invalid'), ambiguous: false, bindingGap: false, ...materials },
    storyBank: { drifts: drifts.filter(item => item.driftId.startsWith('story-bank-')), ambiguous: false, bindingGap: false, ...storyBank },
    finalPlan: { drifts: drifts.filter(item => item.driftId === 'final-plan-invalid-or-stale'), ambiguous: false, bindingGap: false, ...finalPlan },
    finalDocument: { drifts: drifts.filter(item => item.driftId === 'final-document-invalid' || item.driftId === 'final-document-different'), ambiguous: false, bindingGap: false, ...finalDocument },
    renderPackages,
    resumeLibrary: { drifts: libraryDrifts.filter(item => item.driftId === 'resume-library-invalid'), ambiguous: currentVersionCollection.ambiguous, bindingGap: false, ...resumeLibrary },
    currentApplicationVersions,
  };

  const chainObjects = [
    objects.materials,
    objects.storyBank,
    objects.finalPlan,
    objects.finalDocument,
    renderCollection,
    { ...resumeLibrary, drifts: libraryDrifts.filter(item => item.driftId === 'resume-library-invalid'), ambiguous: currentVersionCollection.ambiguous, bindingGap: false },
    currentVersionCollection,
  ];

  const bindingGapCount = renderDrifts.filter(item => item.severity === 'binding-gap').length
    + libraryDrifts.filter(item => item.severity === 'binding-gap').length;
  if (renderCollection.ambiguous) {
    drifts.push(drift(
      'render-candidate-ambiguous',
      'warn',
      '存在多个可用渲染包，当前契约没有唯一绑定字段。',
      [RESUME_RENDER_PACKAGE_DIR],
      '列出全部候选，由用户指定本轮使用的渲染包；不要自动选择。',
    ));
  }
  if (currentVersionCollection.ambiguous) {
    drifts.push(drift(
      'current-version-candidate-ambiguous',
      'warn',
      '版本库中存在多条当前投递版，无法唯一判断本次事实链终点。',
      [RESUME_LIBRARY_PATH],
      '列出每条简历线的当前投递版，由用户明确选择或分线管理。',
    ));
  }

  const result = {
    schema: RESUME_FACT_CHAIN_AUDIT_SCHEMA,
    schemaVersion: RESUME_FACT_CHAIN_AUDIT_SCHEMA_VERSION,
    state: collectState(chainObjects),
    objects,
    links: {
      materialsToFinalPlan: {
        state: finalPlan.state === 'ready' ? 'proven' : (finalPlan.state === 'missing' ? 'missing' : 'blocked'),
        materialsPackageId: materials.identity.packageId,
        planId: finalPlan.identity.planId,
        materialsContentHash: finalPlan.materialsContentHash,
      },
      finalPlanToFinalDocument: {
        state: finalDocument.consistency === 'current'
          ? 'proven'
          : (finalDocument.consistency === 'different' ? 'drifted' : (finalDocument.state === 'missing' ? 'missing' : 'blocked')),
        planId: finalPlan.identity.planId,
        finalDocumentContentHash: finalDocument.contentHash,
        expectedFinalDocumentContentHash: finalDocument.expectedContentHash,
      },
      finalDocumentToRenderPackages: renderPackages.map(item => ({
        renderId: item.identity.renderId,
        state: item.finalBinding === 'current'
          ? 'proven'
          : (item.finalBinding === 'stale' ? 'drifted' : (item.finalBinding === 'unbound' ? 'unproven' : 'blocked')),
        finalPlanId: item.finalPlanId,
        finalContentHash: item.finalContentHash,
        finalPlanContentHash: item.finalPlanContentHash,
        finalDocumentContentHash: item.finalDocumentContentHash,
        materialsBinding: item.materialsBinding,
        htmlState: item.html.state,
      })),
      finalDocumentToCurrentApplicationVersions: currentApplicationVersions.map(item => ({
        documentId: item.identity.documentId,
        versionId: item.identity.versionId,
        state: item.finalBinding === 'current'
          ? 'proven'
          : (item.finalBinding === 'stale' ? 'drifted' : (item.finalBinding === 'unbound' ? 'unproven' : 'blocked')),
        finalPlanId: item.finalPlanId,
        finalContentHash: item.finalContentHash,
        finalPlanContentHash: item.finalPlanContentHash,
        finalDocumentContentHash: item.finalDocumentContentHash,
        renderId: item.renderId,
        renderContentHash: item.renderContentHash,
        finalDocumentContentState: item.finalDocumentContentState,
        source: item.source,
      })),
    },
    drifts,
    candidates: {
      renderPackageCount: renderPackages.filter(item => item.state === 'ready').length,
      renderPackageIds: renderPackages.filter(item => item.state === 'ready').map(item => item.identity.renderId),
      currentApplicationVersionCount: currentApplicationVersions.length,
      currentApplicationVersionIds: currentApplicationVersions.map(item => item.identity.versionId),
    },
    limitations: [
      '渲染包与简历版本库的定稿绑定字段是可选兼容字段；旧文件会继续报告 binding-gap，不会被自动升级。',
      '版本库中的导入文件哈希只证明用户导入过该文件内容，不代表它可以反写 cv.md 或当前定稿。',
      `共发现 ${bindingGapCount} 个显式绑定缺口；这不是自动修复项，需要契约升级后由用户重新确认。`,
    ],
    execution: {
      mode: 'read-only-audit',
      writeCount: 0,
      automaticRepair: false,
      backupDirectoryUsed: null,
    },
  };
  return result;
}

function printAudit(audit, json) {
  if (json) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }
  console.log(`简历事实链：${audit.state}`);
  for (const [key, label] of OBJECT_LABELS) {
    const object = audit.objects[key];
    const state = Array.isArray(object)
      ? (object.length === 0 ? 'missing' : object.map(item => item.state).join('/'))
      : object.state;
    console.log(`${label}：${state}`);
  }
  if (audit.drifts.length === 0) {
    console.log('漂移项：无');
  } else {
    console.log('漂移项：');
    for (const item of audit.drifts) {
      console.log(`- [${item.severity}] ${item.message} -> ${item.suggestedAction}`);
    }
  }
  console.log('执行模式：只读审计，不写入、不自动修复、不同步。');
}

function parseArguments(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const positional = args.filter(arg => arg !== '--json');
  if (positional.length !== 1 || positional[0] !== 'audit') return null;
  return { command: 'audit', json };
}

function main() {
  const args = parseArguments(process.argv);
  if (!args) {
    console.error(`Invalid arguments.\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  printAudit(auditResumeFactChain(), args.json);
}

if (isMainModule(import.meta.url)) {
  main();
}
