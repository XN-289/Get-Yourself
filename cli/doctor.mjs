#!/usr/bin/env node
/**
 * doctor.mjs — get-yourself-cli 就绪检查（onboarding）
 *
 * 检查系统是否设置完成：cv.md / profile.yml / portals.yml / tracker 是否存在。
 * 每次会话第一条消息运行：node doctor.mjs --json
 *
 * 输出：{"onboardingNeeded": bool, "missing": [...], "unpersonalized": [...], "warnings": [...]}
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import { getCareerOpsRoot, resolveTrackerPath } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIRED_FILES = [
  { path: 'cv.md', label: '简历', template: null },
  { path: 'config/profile.yml', label: '个人档案', template: 'config/profile.example.yml' },
  { path: 'modes/_profile.md', label: '个性化', template: 'modes/_profile.template.md' },
  { path: 'portals.yml', label: '校招信息源', template: 'templates/portals.example.yml' },
];

function checkOnboarding(root) {
  const missing = [];
  const unpersonalized = [];
  const warnings = [];
  const autoCopied = [];

  // 用户层必需文件
  for (const f of REQUIRED_FILES) {
    const full = join(root, f.path);
    if (!existsSync(full)) {
      if (f.template && existsSync(join(__dirname, f.template))) {
        // 自动从模板复制（只有 config/profile.example.yml 的拷贝是安全的；
        // _profile.md 需要个性化引导，不自动复制）
        if (f.path === 'config/profile.yml') {
          try {
            mkdirSync(dirname(full), { recursive: true });
            copyFileSync(join(__dirname, f.template), full);
            autoCopied.push(f.path);
            missing.push(f.path); // 仍标记缺失：内容还是模板
          } catch {
            missing.push(f.path);
          }
        } else {
          missing.push(f.path);
        }
      } else {
        missing.push(f.path);
      }
    }
  }

  // 检测模板内容未个性化（_profile.md 还带着 template 内容）
  const profilePath = join(root, 'modes/_profile.md');
  if (existsSync(profilePath)) {
    const content = readFileSync(profilePath, 'utf-8');
    if (content.includes('template') && content.length < 500) {
      unpersonalized.push({
        path: 'modes/_profile.md',
        reason: '仍为模板内容',
        impact: '评估会按模板作者的默认画像打分，而非你的目标'
      });
    }
  }

  // tracker
  try {
    resolveTrackerPath(root);
  } catch {
    warnings.push('tracker 路径解析异常');
  }

  return {
    onboardingNeeded: missing.length > 0 || unpersonalized.length > 0,
    missing,
    unpersonalized,
    warnings,
    autoCopied,
  };
}

function main() {
  const flags = process.argv.slice(2);
  const root = getCareerOpsRoot();
  const result = checkOnboarding(root);

  if (flags.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 人类可读输出
  console.log(`get-yourself-cli 就绪检查 (数据根: ${root})`);
  console.log(`onboardingNeeded: ${result.onboardingNeeded}`);
  if (result.missing.length) {
    console.log('\n缺失:');
    for (const m of result.missing) console.log(`  ✗ ${m}`);
  }
  if (result.unpersonalized.length) {
    console.log('\n未个性化:');
    for (const u of result.unpersonalized) console.log(`  ⚠ ${u.path} — ${u.reason}`);
  }
  if (result.warnings.length) {
    console.log('\n警告:');
    for (const w of result.warnings) console.log(`  ! ${w}`);
  }
  if (!result.missing.length && !result.unpersonalized.length) {
    console.log('\n✅ 全部就绪！可以开始评估岗位。');
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
