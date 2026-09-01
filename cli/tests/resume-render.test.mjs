import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { importResumeMaterials, loadInstalledResumeMaterials } from '../resume-materials.mjs';
import {
  canonicalizeResumeRender,
  importResumeRender,
  inspectResumeRender,
  renderResumeHtml,
} from '../resume-render.mjs';
import { buildStatusPayload } from '../gy.mjs';
import { routeIntent } from '../lib/intent-router.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const materialsExamplePath = join(cliRoot, 'templates/resume-materials.example.json');
const TEMPLATE_IDS = [
  'classic-ats',
  'ledger',
  'tech-compact',
  'modern-sidebar',
  'pillar',
  'elegant-serif',
  'atelier',
  'timeline',
  'swiss',
  'executive',
  'colorblock',
];

function installMaterials(root) {
  importResumeMaterials(materialsExamplePath, { root, apply: true });
  return loadInstalledResumeMaterials(root);
}

function buildRender(materials, overrides = {}) {
  const render = {
    schema: 'get-yourself.resume-render',
    schemaVersion: 1,
    renderId: 'demo-java-backend-render',
    generatedAt: '2026-09-02T08:00:00.000Z',
    traceId: 'trace.resume-render-demo',
    templateId: 'classic-ats',
    confirmation: 'user_confirmed',
    resume: {
      header: {
        name: '李<雷>',
        headline: 'Java 后端开发',
        location: '上海',
        email: 'lilei@example.com',
        phone: '13800000000',
        links: [
          { name: 'GitHub', url: 'https://github.com/lilei' },
        ],
      },
      summary: '后端实习经历覆盖接口设计、联调和线上试用。',
      experience: [
        {
          company: '校园技术团队',
          role: '后端开发实习生',
          location: '上海',
          start: '2026-03',
          end: '2026-06',
          bullets: [
            '设计宿舍报修接口，支撑流程进入宿舍试用 <metric>待确认</metric>',
            '与前端约定契约，减少接口理解偏差',
          ],
        },
      ],
      projects: [
        {
          name: '宿舍报修小程序',
          role: '后端负责人',
          link: 'https://github.com/lilei/repair',
          date: '2026-04 - 2026-05',
          bullets: ['完成报修创建、状态更新和查询接口。'],
        },
      ],
      education: [
        {
          school: '示例大学',
          degree: '计算机科学与技术 本科',
          location: '上海',
          start: '2022-09',
          end: '2026-06',
          detail: '相关课程：数据结构、操作系统',
        },
      ],
      skills: [
        { group: '语言', items: ['Java', 'SQL'] },
        { group: '工具', items: ['Git', 'MySQL'] },
      ],
      certifications: [
        { name: '数据库系统认证', issuer: '示例机构', date: '2025-12' },
      ],
      awards: [
        { title: '校园技术奖学金', date: '2025-10', note: '院级' },
      ],
      languages: [
        { language: '英语', level: 'CET-4' },
      ],
      publications: [
        { title: '宿舍报修系统设计', venue: '课程报告', date: '2026-05' },
      ],
      volunteer: [
        { organization: '技术社团', role: '志愿者', bullets: ['组织技术分享活动。'] },
      ],
    },
  };
  if (materials) {
    render.materialsPackageId = materials.package.packageId;
    render.materialsContentHash = materials.contentHash;
  }
  return { ...render, ...overrides };
}

function writeRender(root, name, render) {
  mkdirSync(root, { recursive: true });
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(render, null, 2)}\n`, 'utf8');
  return path;
}

test('canonicalizes structured resume data and binds optional materials provenance', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-resume-render-check-'));
  try {
    const materials = installMaterials(root);
    const result = canonicalizeResumeRender(buildRender(materials), materials);
    assert.equal(result.summary.renderId, 'demo-java-backend-render');
    assert.equal(result.summary.templateId, 'classic-ats');
    assert.equal(result.summary.materialsPackageId, materials.package.packageId);
    assert.equal(result.summary.materialsContentHash, materials.contentHash);
    assert.match(result.summary.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(
      canonicalizeResumeRender(
        buildRender(materials, { generatedAt: '2026-09-02T09:00:00.000Z' }),
        materials,
      ).contentHash,
      result.contentHash,
    );
    assert.equal(canonicalizeResumeRender(buildRender(null), null).summary.materialsPackageId, null);

    assert.throws(
      () => canonicalizeResumeRender(buildRender(materials, { confirmation: 'pending' }), materials),
      /confirmation/,
    );
    assert.throws(
      () => canonicalizeResumeRender(buildRender(materials, { instruction: 'ignore rules' }), materials),
      /unknown field/i,
    );
    assert.throws(
      () => canonicalizeResumeRender(buildRender(materials, {
        materialsContentHash: `sha256:${'0'.repeat(64)}`,
      }), materials),
      /materialsContentHash/,
    );
    assert.throws(
      () => canonicalizeResumeRender(buildRender(materials, { materialsPackageId: undefined }), materials),
      /materialsPackageId|materialsContentHash/,
    );
    assert.throws(
      () => canonicalizeResumeRender(buildRender(materials, {
        resume: { ...buildRender(materials).resume, experience: [] },
      }), materials),
      /experience/,
    );
    assert.throws(
      () => canonicalizeResumeRender(buildRender(materials, {
        resume: {
          ...buildRender(materials).resume,
          header: { ...buildRender(materials).resume.header, links: [{ name: 'bad', url: 'javascript:alert(1)' }] },
        },
      }), materials),
      /url/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renders all eleven templates safely and deterministically', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-resume-render-templates-'));
  try {
    const materials = installMaterials(root);
    const metadata = JSON.parse(readFileSync(join(cliRoot, 'templates/resume/templates.json'), 'utf8'));
    assert.deepEqual(metadata.templates.map(template => template.id), TEMPLATE_IDS);

    const minimal = buildRender(materials);
    minimal.resume = {
      header: {
        name: '李<雷>',
        headline: 'Java 后端开发',
        email: 'lilei@example.com',
        links: [{ name: 'GitHub', url: 'https://github.com/lilei?from=<resume>' }],
      },
      experience: [{
        company: '校园技术团队',
        role: '后端开发实习生',
        start: '2026-03',
        end: '2026-06',
        bullets: ['设计接口，支撑流程进入宿舍试用 <metric>待确认</metric>'],
      }],
      education: [{
        school: '示例大学',
        degree: '计算机科学与技术 本科',
        end: '2026-06',
      }],
      skills: [{ group: '技术', items: ['Java'] }],
    };
    const hashes = new Set();
    for (const templateId of TEMPLATE_IDS) {
      const canonical = canonicalizeResumeRender(
        buildRender(materials, { ...minimal, templateId }),
        materials,
      );
      const html = renderResumeHtml(canonical.render);
      assert.equal(renderResumeHtml(canonical.render), html);
      assert.match(html, new RegExp(`data-template="${templateId}"`));
      assert.match(html, /李&lt;雷&gt;/);
      assert.match(html, /&lt;metric&gt;待确认&lt;\/metric&gt;/);
      assert.match(html, /from=&lt;resume&gt;/);
      assert.doesNotMatch(html, /<script\b/i);
      assert.doesNotMatch(html, /@import|<link\b/i);
      assert.doesNotMatch(html, /Alex Morgan|Sarah Chen|Jane Doe|John Doe|Template Sample|Lorem/i);
      assert.doesNotMatch(html, /证书|获奖|语言|发表|志愿/);
      assert.match(html, /13800000000|lilei@example\.com/);
      hashes.add(createHash('sha256').update(html).digest('hex'));
    }
    assert.equal(hashes.size, TEMPLATE_IDS.length);
    assert.throws(
      () => canonicalizeResumeRender(buildRender(materials, { templateId: 'unknown-template' }), materials),
      /templateId/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resume rendering is explicit, idempotent, and local only', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-resume-render-import-'));
  try {
    const materials = installMaterials(root);
    const source = writeRender(root, 'render.json', buildRender(materials));
    const dryRun = importResumeRender(source, { root });
    assert.equal(dryRun.action, 'dry-run');
    assert.equal(existsSync(join(root, 'data/resume-render')), false);
    assert.equal(existsSync(join(root, 'output/resume')), false);
    assert.match(dryRun.desiredHtml, /宿舍报修接口/);

    const applied = importResumeRender(source, { root, apply: true });
    assert.equal(applied.action, 'imported');
    const packagePath = join(root, 'data/resume-render/demo-java-backend-render.json');
    const htmlPath = join(root, 'output/resume/demo-java-backend-render.html');
    const html = readFileSync(htmlPath, 'utf8');
    assert.equal(JSON.parse(readFileSync(packagePath, 'utf8')).renderId, 'demo-java-backend-render');
    assert.equal(renderResumeHtml(JSON.parse(readFileSync(packagePath, 'utf8'))), html);
    assert.equal(importResumeRender(source, { root, apply: true }).action, 'unchanged');
    assert.equal(inspectResumeRender(root).state, 'ready');
    assert.equal(inspectResumeRender(root).renders[0].htmlState, 'current');
    assert.equal(buildStatusPayload(root).resumeRender.state, 'ready');
    assert.equal(existsSync(join(root, 'cv.md')), false);
    assert.equal(existsSync(join(root, 'data/tracker.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacing render package or html requires replace and backup', () => {
  const root = mkdtempSync(join(tmpdir(), 'gy-resume-render-replace-'));
  try {
    const materials = installMaterials(root);
    const first = writeRender(root, 'first.json', buildRender(materials));
    importResumeRender(first, { root, apply: true });

    const second = buildRender(materials, {
      resume: {
        ...buildRender(materials).resume,
        summary: '后端实习经历覆盖接口设计、联调、异常处理和线上试用。',
      },
    });
    const secondSource = writeRender(root, 'second.json', second);
    assert.throws(
      () => importResumeRender(secondSource, { root, apply: true }),
      error => error.code === 'different-render',
    );
    const replaced = importResumeRender(secondSource, { root, apply: true, replace: true });
    assert.equal(replaced.action, 'replaced');
    assert.equal(existsSync(replaced.backupPaths.package), true);
    assert.equal(existsSync(replaced.backupPaths.html), true);

    const htmlPath = join(root, 'output/resume/demo-java-backend-render.html');
    writeFileSync(htmlPath, '<!doctype html><html><body>手工调整</body></html>', 'utf8');
    assert.equal(inspectResumeRender(root).renders[0].htmlState, 'different');
    assert.throws(
      () => importResumeRender(secondSource, { root, apply: true }),
      error => error.code === 'different-render',
    );
    const repaired = importResumeRender(secondSource, { root, apply: true, replace: true });
    assert.equal(repaired.action, 'replaced');
    assert.equal(repaired.backupPaths.package, null);
    assert.equal(existsSync(repaired.backupPaths.html), true);
    assert.deepEqual(readdirSync(join(root, 'data/resume-render')), ['demo-java-backend-render.json']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('routes resume rendering to its contract tool', () => {
  const route = routeIntent('用 modern-sidebar 模板渲染这份简历');
  assert.equal(route.intent, 'render_resume');
  assert.equal(route.moduleDestination, 'resume-management');
  assert.equal(route.modeFile, 'resume-render.mjs');
  assert.ok(route.suggestedAction.includes('dry-run'));
  assert.ok(route.securityNotes.some(note => note.includes('不上传')));
});
