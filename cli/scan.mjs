#!/usr/bin/env node
/**
 * scan.mjs — get-yourself-cli 校招信息源扫描器（零 token）
 *
 * 读 portals.yml → 对每个目标公司调用对应 providers/ 模块 → 新岗位去重 → 追加到 data/pipeline.md
 * 零 LLM 成本（全部是公共 API 抓取）。
 *
 * Run: node scan.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { dirname } from 'path';
import * as yaml from 'js-yaml';
import { makeHttpCtx } from './providers/_http.mjs';
import { loadProviders, resolveProvider } from './providers/_registry.mjs';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 规范化 URL 用于去重（去 tracking 参数、小写 host、去 fragment/尾斜杠）
 */
function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.search = '';
    u.protocol = 'https:';
    return u.toString().replace(/\/$/, '');
  } catch {
    return String(raw).trim();
  }
}

/**
 * 从 scan-history.tsv 读历史 URL（去重用）
 */
function readHistory(root) {
  const file = path.join(root, 'data/scan-history.tsv');
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t')[0])
  );
}

/**
 * 追加扫描历史
 */
function appendHistory(root, urls, runDate) {
  const file = path.join(root, 'data/scan-history.tsv');
  const lines = urls.map((u) => `${u}\t${runDate}`);
  appendFileSync(file, lines.join('\n') + '\n');
}

function loadPortals(root) {
  const file = path.join(root, 'portals.yml');
  if (!existsSync(file)) {
    console.log('✗ portals.yml 不存在。复制 templates/portals.example.yml → portals.yml 并配置目标公司。');
    return null;
  }
  return yaml.load(readFileSync(file, 'utf-8')) || {};
}

async function main() {
  const flags = process.argv.slice(2);
  const dryRun = flags.includes('--dry-run');
  const root = getCareerOpsRoot();

  const portals = loadPortals(root);
  if (!portals) return;

  const companies = portals.tracked_companies || [];
  if (!companies.length) {
    console.log('✗ portals.yml 里没有 tracked_companies。请配置目标公司。');
    return;
  }

  const { registry } = loadProviders(path.join(__dirname, 'providers'));
  const ctx = makeHttpCtx({ userAgent: 'get-yourself-cli-scan' });
  const history = readHistory(root);
  const today = new Date().toISOString().slice(0, 10);

  const allNew = [];
  const seen = new Set();
  const stats = { total: 0, new: 0, dup: 0, errors: 0 };

  console.log(`get-yourself-cli 扫描开始 (${today})，目标公司: ${companies.length} 家`);

  for (const company of companies) {
    const name = company.name || company.careers_url;
    const provider = resolveProvider(registry, company, name);
    if (!provider) {
      console.log(`  ⚠ ${name}: 无匹配 provider，跳过（可手动粘贴岗位到 pipeline）`);
      stats.errors++;
      continue;
    }
    try {
      const results = await provider.fetch(company, ctx);
      stats.total += results.length;
      console.log(`  ✓ ${name}: ${results.length} 条岗位`);
      for (const r of results) {
        const key = normalizeUrl(r.url || `${name}-${r.title}`);
        if (history.has(key) || seen.has(key)) {
          stats.dup++;
          continue;
        }
        seen.add(key);
        allNew.push({ ...r, company: r.company || name });
        stats.new++;
      }
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message?.slice(0, 120)}`);
      stats.errors++;
    }
  }

  console.log(`\n结果: 共 ${stats.total} 条，新增 ${stats.new}，重复 ${stats.dup}，错误 ${stats.errors}`);

  if (dryRun || !allNew.length) {
    if (allNew.length) {
      console.log('\n(dry-run 不写入) 新增岗位:');
      for (const r of allNew.slice(0, 20)) console.log(`  - ${r.company} | ${r.title} | ${r.location || ''} | ${r.url}`);
    }
    return;
  }

  // 追加到 pipeline.md
  const pipelineFile = path.join(root, 'data/pipeline.md');
  if (!existsSync(pipelineFile)) {
    mkdirSync(dirname(pipelineFile), { recursive: true });
    writeFileSync(pipelineFile, '# 待评估岗位\n\n- [ ] 公司 | 岗位 | 城市 | 来源 | 日期\n');
  }
  const lines = allNew.map((r) => `- [ ] ${r.company} | ${r.title} | ${r.location || ''} | ${r.source || '校招官网'} | ${today}`);
  appendFileSync(pipelineFile, lines.join('\n') + '\n');

  // 记录历史（去重）
  appendHistory(root, [...seen], today);

  console.log(`\n已写入 ${allNew.length} 条到 data/pipeline.md`);
  console.log('下一步: 粘贴某个岗位评估，或运行 pipeline 模式处理 inbox。');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
