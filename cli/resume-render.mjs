#!/usr/bin/env node

import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

export const RESUME_RENDER_SCHEMA = 'get-yourself.resume-render';
export const RESUME_RENDER_SCHEMA_VERSION = 1;
export const RESUME_RENDER_PACKAGE_DIR = 'data/resume-render';
export const RESUME_RENDER_HTML_DIR = 'output/resume';
export const RESUME_RENDER_BACKUP_DIR = 'data/resume-render-backups';
export const RESUME_TEMPLATE_IDS = [
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
const TEMPLATE_ID_SET = new Set(RESUME_TEMPLATE_IDS);
const MAX_PACKAGE_BYTES = 256 * 1024;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_RENDERS = 100;
const MAX_BACKUPS_PER_RENDER = 10;
const CONFIRMATIONS = new Set(['user_confirmed']);
const MONTH_PATTERN = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/;
const TEMPLATE_MARKER = '<!--GY:RESUME_CONTENT-->';
const TEMPLATE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), 'templates/resume');

const USAGE = `Usage:
  node resume-render.mjs check <render.json> [--json]
  node resume-render.mjs import <render.json> [--apply] [--replace] [--json]`;

function renderError(message, code = 'invalid-render', details = {}) {
  return new ContractToolError(message, code, details);
}

function requireMonth(value, path) {
  const text = requireString(value, path, { min: 7, max: 7 }, ContractToolError, 'invalid-render');
  if (!MONTH_PATTERN.test(text)) {
    throw renderError(`${path} must use YYYY-MM`, 'invalid-render', { path });
  }
  return text;
}

function requireDateRange(value, path) {
  const text = requireString(value, path, { min: 7, max: 17 }, ContractToolError, 'invalid-render');
  const parts = text.split(' - ');
  if (parts.length !== 2 || !MONTH_PATTERN.test(parts[0]) || !MONTH_PATTERN.test(parts[1])) {
    throw renderError(`${path} must use YYYY-MM - YYYY-MM`, 'invalid-render', { path });
  }
  return text;
}

function requireSafeUrl(value, path) {
  const text = requireString(value, path, { min: 4, max: 500 }, ContractToolError, 'invalid-render');
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw renderError(`${path} must be an absolute http(s) or mailto URL`, 'invalid-render', { path });
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    throw renderError(`${path} must use http, https, or mailto`, 'invalid-render', { path });
  }
  return text;
}

function validateMaterialsBinding(input, materials) {
  const hasPackageId = input.materialsPackageId !== undefined;
  const hasContentHash = input.materialsContentHash !== undefined;
  if (hasPackageId !== hasContentHash) {
    throw renderError(
      'materialsPackageId and materialsContentHash must be provided together',
      'invalid-render',
      { path: '$.materialsPackageId' },
    );
  }
  if (!hasPackageId) return null;
  if (!materials) {
    throw renderError('A materials-bound render requires installed resume materials', 'materials-missing');
  }
  if (input.materialsPackageId !== materials.package.packageId) {
    throw renderError('materialsPackageId does not match the installed package', 'materials-mismatch');
  }
  if (input.materialsContentHash !== materials.contentHash) {
    throw renderError(
      'materialsContentHash does not match the installed package; regenerate the render after confirming current materials.',
      'materials-mismatch',
    );
  }
  return {
    materialsPackageId: input.materialsPackageId,
    materialsContentHash: input.materialsContentHash,
  };
}

function canonicalizeHeader(input) {
  requireObjectWithOptional(
    input,
    '$.resume.header',
    ['name', 'headline'],
    ['location', 'email', 'phone', 'links'],
    ContractToolError,
    'invalid-render',
  );
  const header = {
    name: requireString(input.name, '$.resume.header.name', { min: 1, max: 80 }, ContractToolError, 'invalid-render'),
    headline: requireString(input.headline, '$.resume.header.headline', { min: 1, max: 120 }, ContractToolError, 'invalid-render'),
  };
  if (input.location !== undefined) {
    header.location = requireString(input.location, '$.resume.header.location', { min: 1, max: 80 }, ContractToolError, 'invalid-render');
  }
  if (input.email !== undefined) {
    header.email = requireString(input.email, '$.resume.header.email', { min: 3, max: 160 }, ContractToolError, 'invalid-render');
  }
  if (input.phone !== undefined) {
    header.phone = requireString(input.phone, '$.resume.header.phone', { min: 3, max: 40 }, ContractToolError, 'invalid-render');
  }
  if (input.links !== undefined) {
    const links = requireArray(input.links, '$.resume.header.links', 0, 10, ContractToolError, 'invalid-render');
    header.links = links.map((item, index) => {
      const path = `$.resume.header.links[${index}]`;
      requireObject(item, path, ['name', 'url'], ContractToolError, 'invalid-render');
      return {
        name: requireString(item.name, `${path}.name`, { min: 1, max: 40 }, ContractToolError, 'invalid-render'),
        url: requireSafeUrl(item.url, `${path}.url`),
      };
    });
  }
  return header;
}

function canonicalizeExperience(input) {
  return input.map((item, index) => {
    const path = `$.resume.experience[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['company', 'role', 'start', 'end', 'bullets'],
      ['location'],
      ContractToolError,
      'invalid-render',
    );
    const experience = {
      company: requireString(item.company, `${path}.company`, { min: 1, max: 100 }, ContractToolError, 'invalid-render'),
      role: requireString(item.role, `${path}.role`, { min: 1, max: 100 }, ContractToolError, 'invalid-render'),
      start: requireMonth(item.start, `${path}.start`),
      end: item.end === 'Present' ? 'Present' : requireMonth(item.end, `${path}.end`),
      bullets: requireStringList(item.bullets, `${path}.bullets`, 1, 8, 1, 300, ContractToolError, 'invalid-render'),
    };
    if (item.location !== undefined) {
      experience.location = requireString(item.location, `${path}.location`, { min: 1, max: 80 }, ContractToolError, 'invalid-render');
    }
    return experience;
  });
}

function canonicalizeProjects(input) {
  return input.map((item, index) => {
    const path = `$.resume.projects[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['name', 'bullets'],
      ['role', 'link', 'date'],
      ContractToolError,
      'invalid-render',
    );
    const project = {
      name: requireString(item.name, `${path}.name`, { min: 1, max: 100 }, ContractToolError, 'invalid-render'),
      bullets: requireStringList(item.bullets, `${path}.bullets`, 1, 6, 1, 300, ContractToolError, 'invalid-render'),
    };
    if (item.role !== undefined) {
      project.role = requireString(item.role, `${path}.role`, { min: 1, max: 100 }, ContractToolError, 'invalid-render');
    }
    if (item.link !== undefined) project.link = requireSafeUrl(item.link, `${path}.link`);
    if (item.date !== undefined) project.date = requireDateRange(item.date, `${path}.date`);
    return project;
  });
}

function canonicalizeEducation(input) {
  return input.map((item, index) => {
    const path = `$.resume.education[${index}]`;
    requireObjectWithOptional(
      item,
      path,
      ['school', 'degree', 'end'],
      ['location', 'start', 'detail'],
      ContractToolError,
      'invalid-render',
    );
    const education = {
      school: requireString(item.school, `${path}.school`, { min: 1, max: 120 }, ContractToolError, 'invalid-render'),
      degree: requireString(item.degree, `${path}.degree`, { min: 1, max: 160 }, ContractToolError, 'invalid-render'),
      end: requireMonth(item.end, `${path}.end`),
    };
    if (item.location !== undefined) {
      education.location = requireString(item.location, `${path}.location`, { min: 1, max: 80 }, ContractToolError, 'invalid-render');
    }
    if (item.start !== undefined) education.start = requireMonth(item.start, `${path}.start`);
    if (item.detail !== undefined) {
      education.detail = requireString(item.detail, `${path}.detail`, { min: 1, max: 300 }, ContractToolError, 'invalid-render');
    }
    return education;
  });
}

function canonicalizeSkills(input) {
  return input.map((item, index) => {
    const path = `$.resume.skills[${index}]`;
    requireObject(item, path, ['group', 'items'], ContractToolError, 'invalid-render');
    return {
      group: requireString(item.group, `${path}.group`, { min: 1, max: 60 }, ContractToolError, 'invalid-render'),
      items: requireStringList(item.items, `${path}.items`, 0, 30, 1, 60, ContractToolError, 'invalid-render'),
    };
  });
}

function canonicalizeSimpleLists(resume) {
  const certifications = (resume.certifications ?? []).map((item, index) => {
    const path = `$.resume.certifications[${index}]`;
    requireObject(item, path, ['name', 'issuer', 'date'], ContractToolError, 'invalid-render');
    return {
      name: requireString(item.name, `${path}.name`, { min: 1, max: 120 }, ContractToolError, 'invalid-render'),
      issuer: requireString(item.issuer, `${path}.issuer`, { min: 1, max: 120 }, ContractToolError, 'invalid-render'),
      date: requireMonth(item.date, `${path}.date`),
    };
  });
  const awards = (resume.awards ?? []).map((item, index) => {
    const path = `$.resume.awards[${index}]`;
    requireObjectWithOptional(item, path, ['title', 'date'], ['note'], ContractToolError, 'invalid-render');
    const award = {
      title: requireString(item.title, `${path}.title`, { min: 1, max: 120 }, ContractToolError, 'invalid-render'),
      date: requireMonth(item.date, `${path}.date`),
    };
    if (item.note !== undefined) {
      award.note = requireString(item.note, `${path}.note`, { min: 1, max: 160 }, ContractToolError, 'invalid-render');
    }
    return award;
  });
  const languages = (resume.languages ?? []).map((item, index) => {
    const path = `$.resume.languages[${index}]`;
    requireObject(item, path, ['language', 'level'], ContractToolError, 'invalid-render');
    return {
      language: requireString(item.language, `${path}.language`, { min: 1, max: 40 }, ContractToolError, 'invalid-render'),
      level: requireString(item.level, `${path}.level`, { min: 1, max: 60 }, ContractToolError, 'invalid-render'),
    };
  });
  const publications = (resume.publications ?? []).map((item, index) => {
    const path = `$.resume.publications[${index}]`;
    requireObject(item, path, ['title', 'venue', 'date'], ContractToolError, 'invalid-render');
    return {
      title: requireString(item.title, `${path}.title`, { min: 1, max: 180 }, ContractToolError, 'invalid-render'),
      venue: requireString(item.venue, `${path}.venue`, { min: 1, max: 120 }, ContractToolError, 'invalid-render'),
      date: requireMonth(item.date, `${path}.date`),
    };
  });
  const volunteer = (resume.volunteer ?? []).map((item, index) => {
    const path = `$.resume.volunteer[${index}]`;
    requireObject(item, path, ['organization', 'role', 'bullets'], ContractToolError, 'invalid-render');
    return {
      organization: requireString(item.organization, `${path}.organization`, { min: 1, max: 120 }, ContractToolError, 'invalid-render'),
      role: requireString(item.role, `${path}.role`, { min: 1, max: 100 }, ContractToolError, 'invalid-render'),
      bullets: requireStringList(item.bullets, `${path}.bullets`, 1, 6, 1, 300, ContractToolError, 'invalid-render'),
    };
  });
  return { certifications, awards, languages, publications, volunteer };
}

export function canonicalizeResumeRender(input, materials = null) {
  requireObjectWithOptional(
    input,
    '$',
    ['schema', 'schemaVersion', 'renderId', 'generatedAt', 'traceId', 'templateId', 'confirmation', 'resume'],
    ['materialsPackageId', 'materialsContentHash'],
    ContractToolError,
    'invalid-render',
  );
  if (input.schema !== RESUME_RENDER_SCHEMA) {
    throw renderError(`$.schema must be ${RESUME_RENDER_SCHEMA}`, 'invalid-render', { path: '$.schema' });
  }
  if (input.schemaVersion !== RESUME_RENDER_SCHEMA_VERSION) {
    throw renderError(`$.schemaVersion must be ${RESUME_RENDER_SCHEMA_VERSION}`, 'unsupported-version', { path: '$.schemaVersion' });
  }
  requireEnum(input.confirmation, '$.confirmation', CONFIRMATIONS, ContractToolError, 'invalid-render');
  const templateId = requireSafeId(input.templateId, '$.templateId', ContractToolError, 'invalid-render');
  if (!TEMPLATE_ID_SET.has(templateId)) {
    throw renderError(`$.templateId must be one of: ${RESUME_TEMPLATE_IDS.join(', ')}`, 'invalid-render', {
      path: '$.templateId',
    });
  }
  const materialsBinding = validateMaterialsBinding(input, materials);

  requireObjectWithOptional(
    input.resume,
    '$.resume',
    ['header', 'experience', 'education', 'skills'],
    ['summary', 'projects', 'certifications', 'awards', 'languages', 'publications', 'volunteer'],
    ContractToolError,
    'invalid-render',
  );
  const experience = canonicalizeExperience(requireArray(
    input.resume.experience,
    '$.resume.experience',
    1,
    20,
    ContractToolError,
    'invalid-render',
  ));
  const education = canonicalizeEducation(requireArray(
    input.resume.education,
    '$.resume.education',
    1,
    20,
    ContractToolError,
    'invalid-render',
  ));
  const skills = canonicalizeSkills(requireArray(
    input.resume.skills,
    '$.resume.skills',
    1,
    20,
    ContractToolError,
    'invalid-render',
  ));
  const projects = input.resume.projects === undefined
    ? []
    : canonicalizeProjects(requireArray(
      input.resume.projects,
      '$.resume.projects',
      0,
      20,
      ContractToolError,
      'invalid-render',
    ));
  const optionalLists = canonicalizeSimpleLists(input.resume);
  const resume = {
    header: canonicalizeHeader(input.resume.header),
    ...(input.resume.summary === undefined ? {} : {
      summary: requireString(input.resume.summary, '$.resume.summary', { min: 1, max: 600 }, ContractToolError, 'invalid-render'),
    }),
    experience,
    projects,
    education,
    skills,
    ...optionalLists,
  };
  const canonicalRender = {
    schema: RESUME_RENDER_SCHEMA,
    schemaVersion: RESUME_RENDER_SCHEMA_VERSION,
    renderId: requireSafeId(input.renderId, '$.renderId', ContractToolError, 'invalid-render'),
    generatedAt: requireTimestamp(input.generatedAt, '$.generatedAt', ContractToolError, 'invalid-render'),
    traceId: requireSafeId(input.traceId, '$.traceId', ContractToolError, 'invalid-render'),
    ...(materialsBinding === null ? {} : materialsBinding),
    templateId,
    confirmation: input.confirmation,
    resume,
  };
  const contentHash = semanticHash({ ...canonicalRender, generatedAt: undefined });
  return {
    render: canonicalRender,
    canonicalJson: JSON.stringify(canonicalRender, null, 2),
    contentHash,
    summary: {
      renderId: canonicalRender.renderId,
      schemaVersion: RESUME_RENDER_SCHEMA_VERSION,
      generatedAt: canonicalRender.generatedAt,
      templateId,
      materialsPackageId: canonicalRender.materialsPackageId ?? null,
      materialsContentHash: canonicalRender.materialsContentHash ?? null,
      experienceCount: resume.experience.length,
      projectCount: resume.projects.length,
      educationCount: resume.education.length,
      skillGroupCount: resume.skills.length,
      contentHash,
    },
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function section(title, content) {
  if (!content || content.length === 0) return '';
  return `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function list(items) {
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderHeader(header) {
  const contacts = [
    header.location,
    header.email,
    header.phone,
    ...(header.links ?? []).map(link => `<a href="${escapeHtml(link.url)}">${escapeHtml(link.name)}</a>`),
  ].filter(Boolean);
  return [
    '<header>',
    `<h1>${escapeHtml(header.name)}</h1>`,
    `<p class="headline">${escapeHtml(header.headline)}</p>`,
    `<p class="contact">${contacts.map(contact => `<span>${contact}</span>`).join('')}</p>`,
    '</header>',
  ].join('');
}

function renderResumeBody(resume) {
  const parts = [
    renderHeader(resume.header),
    section('概要', resume.summary ? `<p class="summary">${escapeHtml(resume.summary)}</p>` : ''),
    section('经历', resume.experience.map(item => [
      '<article class="entry">',
      '<div class="row">',
      `<div><strong>${escapeHtml(item.role)}</strong><span class="org">${escapeHtml(item.company)}</span></div>`,
      `<div class="date">${escapeHtml(item.start)} - ${escapeHtml(item.end)}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</div>`,
      '</div>',
      list(item.bullets),
      '</article>',
    ].join('')).join('')),
    section('项目', resume.projects.map(item => [
      '<article class="entry">',
      '<div class="row">',
      `<div><strong>${escapeHtml(item.name)}</strong>${item.role ? `<span class="org">${escapeHtml(item.role)}</span>` : ''}</div>`,
      `<div class="date">${item.date ? escapeHtml(item.date) : ''}${item.link ? ` · <a href="${escapeHtml(item.link)}">链接</a>` : ''}</div>`,
      '</div>',
      list(item.bullets),
      '</article>',
    ].join('')).join('')),
    section('教育', resume.education.map(item => [
      '<article class="entry">',
      '<div class="row">',
      `<div><strong>${escapeHtml(item.degree)}</strong><span class="org">${escapeHtml(item.school)}</span></div>`,
      `<div class="date">${escapeHtml(item.start ? `${item.start} - ${item.end}` : item.end)}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</div>`,
      '</div>',
      item.detail ? `<p>${escapeHtml(item.detail)}</p>` : '',
      '</article>',
    ].join('')).join('')),
    section('技能', resume.skills.map(item => (
      `<p class="skill-group"><strong>${escapeHtml(item.group)}：</strong>${escapeHtml(item.items.join('、'))}</p>`
    )).join('')),
    section('证书', resume.certifications.map(item => (
      `<p class="line"><strong>${escapeHtml(item.name)}</strong> · ${escapeHtml(item.issuer)} · ${escapeHtml(item.date)}</p>`
    )).join('')),
    section('获奖', resume.awards.map(item => (
      `<p class="line"><strong>${escapeHtml(item.title)}</strong> · ${escapeHtml(item.date)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</p>`
    )).join('')),
    section('语言', resume.languages.map(item => (
      `<p class="line"><strong>${escapeHtml(item.language)}</strong> · ${escapeHtml(item.level)}</p>`
    )).join('')),
    section('发表', resume.publications.map(item => (
      `<p class="line"><strong>${escapeHtml(item.title)}</strong> · ${escapeHtml(item.venue)} · ${escapeHtml(item.date)}</p>`
    )).join('')),
    section('志愿', resume.volunteer.map(item => [
      '<article class="entry">',
      `<div class="row"><div><strong>${escapeHtml(item.role)}</strong><span class="org">${escapeHtml(item.organization)}</span></div></div>`,
      list(item.bullets),
      '</article>',
    ].join('')).join('')),
  ];
  return parts.join('');
}

function readTemplate(templateId) {
  if (!TEMPLATE_ID_SET.has(templateId)) {
    throw renderError(`Unknown resume template: ${templateId}`, 'invalid-render', { templateId });
  }
  const path = join(TEMPLATE_DIRECTORY, `${templateId}.html`);
  const template = readFileSync(path, 'utf8');
  const markers = template.split(TEMPLATE_MARKER).length - 1;
  if (markers !== 1) {
    throw renderError(`Resume template must contain exactly one content marker: ${path}`, 'invalid-template', { path });
  }
  return template;
}

export function renderResumeHtml(render) {
  const template = readTemplate(render.templateId);
  return template.replace(TEMPLATE_MARKER, renderResumeBody(render.resume));
}

function packageDirFor(root) {
  return join(root, RESUME_RENDER_PACKAGE_DIR);
}

function packagePathFor(root, renderId) {
  return join(packageDirFor(root), `${renderId}.json`);
}

function htmlPathFor(root, renderId) {
  return join(root, RESUME_RENDER_HTML_DIR, `${renderId}.html`);
}

function readRenderFile(filePath, materials) {
  const parsed = readJsonContract(filePath, {
    maxBytes: MAX_PACKAGE_BYTES,
    ErrorClass: ContractToolError,
    errorCode: 'invalid-render',
  });
  return canonicalizeResumeRender(parsed, materials);
}

function readInstalledRender(root, materials, renderId) {
  const target = packagePathFor(root, renderId);
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw renderError(`Cannot inspect installed render: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw renderError('Installed render path is not a regular file', 'invalid-render', { path: target });
  if (info.size > MAX_PACKAGE_BYTES) throw renderError('Installed render exceeds size limit', 'invalid-render', { path: target });
  const installed = readRenderFile(target, materials);
  if (installed.render.renderId !== renderId) {
    throw renderError('Installed render filename does not match renderId', 'invalid-render', {
      path: target,
      expectedRenderId: renderId,
      actualRenderId: installed.render.renderId,
    });
  }
  return installed;
}

function readOptionalHtml(target) {
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw renderError(`Cannot inspect resume HTML: ${error.message}`, 'io-error', { path: target });
  }
  if (!info.isFile()) throw renderError('Resume HTML path is not a regular file', 'invalid-render', { path: target });
  if (info.size > MAX_HTML_BYTES) throw renderError('Resume HTML exceeds size limit', 'invalid-render', { path: target });
  try {
    return readFileSync(target, 'utf8');
  } catch (error) {
    throw renderError(`Cannot read resume HTML: ${error.message}`, 'io-error', { path: target });
  }
}

function backupHtmlFile(source, backupDir, contentHash) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shortHash = contentHash.replace(/^sha256:/, '').slice(0, 12);
  mkdirSync(backupDir, { recursive: true });
  const target = join(backupDir, `resume-render-html-${stamp}-${shortHash}.html`);
  copyFileSync(source, target);
  const pattern = /^resume-render-html-\d{4}-\d{2}-\d{2}T.*-[0-9a-f]{12}\.html$/;
  const backups = readdirSync(backupDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => entry.name)
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS_PER_RENDER))) {
    unlinkSync(join(backupDir, name));
  }
  return target;
}

export function inspectResumeRender(root = getCareerOpsRoot()) {
  try {
    const materials = loadInstalledResumeMaterials(root);
    let entries;
    try {
      entries = readdirSync(packageDirFor(root), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { state: 'missing', available: false, renderCount: 0, renders: [] };
      throw error;
    }
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
    if (files.length > MAX_RENDERS) {
      throw renderError(`Too many resume render packages (max ${MAX_RENDERS})`, 'invalid-render');
    }
    const renders = files.map(name => {
      const installed = readInstalledRender(root, materials, name.replace(/\.json$/, ''));
      const htmlPath = htmlPathFor(root, installed.render.renderId);
      const html = readOptionalHtml(htmlPath);
      const desired = renderResumeHtml(installed.render);
      return {
        ...installed.summary,
        htmlPath,
        htmlState: html === null ? 'missing' : (html === desired ? 'current' : 'different'),
      };
    });
    return { state: 'ready', available: true, renderCount: renders.length, renders };
  } catch (error) {
    return {
      state: 'invalid',
      available: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof ContractToolError ? error.code : 'io-error',
    };
  }
}

export function importResumeRender(filePath, options = {}) {
  const root = options.root ?? getCareerOpsRoot();
  const apply = options.apply === true;
  const replace = options.replace === true;
  if (replace && !apply) throw renderError('--replace requires --apply', 'usage');

  const materials = loadInstalledResumeMaterials(root);
  const incoming = readRenderFile(filePath, materials);
  const packageTarget = packagePathFor(root, incoming.render.renderId);
  const htmlTarget = htmlPathFor(root, incoming.render.renderId);
  const existing = readInstalledRender(root, materials, incoming.render.renderId);
  const existingHtml = readOptionalHtml(htmlTarget);
  const desiredHtml = renderResumeHtml(incoming.render);
  const packageChange = !existing || existing.contentHash !== incoming.contentHash;
  const htmlChange = existingHtml === null || existingHtml !== desiredHtml;
  const backupPaths = { package: null, html: null };

  if (!packageChange && !htmlChange) {
    return {
      action: apply ? 'unchanged' : 'dry-run-unchanged',
      applied: apply,
      packagePath: packageTarget,
      htmlPath: htmlTarget,
      backupPaths,
      incoming: incoming.summary,
    };
  }

  const overwritesUserContent = (existing !== null && packageChange) || (existingHtml !== null && htmlChange);
  if (overwritesUserContent && !replace) {
    throw renderError(
      'A different render package or HTML file already exists; add --replace to replace it.',
      'different-render',
      { installedRenderId: existing?.summary.renderId ?? null, incomingRenderId: incoming.summary.renderId },
    );
  }

  if (!apply) {
    return {
      action: overwritesUserContent ? 'dry-run-replace' : 'dry-run',
      applied: false,
      packagePath: packageTarget,
      htmlPath: htmlTarget,
      backupPaths,
      desiredHtml,
      incoming: incoming.summary,
    };
  }

  if (existing !== null && packageChange) {
    backupPaths.package = backupFile(
      packageTarget,
      join(root, RESUME_RENDER_BACKUP_DIR, incoming.render.renderId),
      'resume-render-package',
      existing.contentHash,
      MAX_BACKUPS_PER_RENDER,
    );
  }
  if (existingHtml !== null && htmlChange) {
    backupPaths.html = backupHtmlFile(
      htmlTarget,
      join(root, RESUME_RENDER_BACKUP_DIR, incoming.render.renderId),
      semanticHash(existingHtml),
    );
  }
  if (packageChange) writeContractFile(packageTarget, `${incoming.canonicalJson}\n`);
  if (htmlChange) writeContractFile(htmlTarget, desiredHtml);

  return {
    action: existing === null ? 'imported' : 'replaced',
    applied: true,
    packagePath: packageTarget,
    htmlPath: htmlTarget,
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
  return { command: positional[0], renderFile: positional[1], json, apply, replace };
}

function main() {
  const args = parseArguments(process.argv);
  try {
    const root = getCareerOpsRoot();
    const materials = loadInstalledResumeMaterials(root);
    if (args.command === 'check') {
      const result = readRenderFile(args.renderFile, materials);
      const payload = { ok: true, action: 'checked', ...result.summary };
      console.log(args.json ? JSON.stringify(payload, null, 2) : [
        '简历渲染包校验通过。',
        `Render ID: ${result.summary.renderId}`,
        `模板：${result.summary.templateId}`,
        `经历：${result.summary.experienceCount} / 项目：${result.summary.projectCount} / 教育：${result.summary.educationCount}`,
        result.summary.materialsPackageId ? `素材包：${result.summary.materialsPackageId}（${result.summary.materialsContentHash}）` : '素材溯源：未绑定',
        `内容哈希：${result.summary.contentHash}`,
      ].join('\n'));
      return;
    }

    const result = importResumeRender(args.renderFile, { root, apply: args.apply, replace: args.replace });
    const payload = { ok: true, ...result };
    console.log(args.json ? JSON.stringify(payload, null, 2) : [
      `简历渲染导入结果：${result.action}`,
      `溯源包：${result.packagePath}`,
      `HTML：${result.htmlPath}`,
      `模板：${result.incoming.templateId}`,
      result.backupPaths.package ? `溯源备份：${result.backupPaths.package}` : null,
      result.backupPaths.html ? `HTML备份：${result.backupPaths.html}` : null,
      '输出仅保存在本地，不会自动打开或上传。',
    ].filter(Boolean).join('\n'));
  } catch (error) {
    const code = error instanceof ContractToolError ? error.code : 'io-error';
    const details = error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {};
    if (args.json) console.log(JSON.stringify({ ok: false, error: error.message, code, ...details }, null, 2));
    else console.error(`Error: ${error.message}`);
    process.exitCode = code === 'different-render' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
