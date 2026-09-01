#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { inspectOnboarding } from './doctor.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { formatRoute, routeIntent } from './lib/intent-router.mjs';

const USAGE = `Usage:
  node gy.mjs "帮我整理这段实习经历"
  node gy.mjs --json "这家公司值得投吗"
  node gy.mjs --status [--json]
  node gy.mjs --help`;

export function buildStatusPayload(root = getCareerOpsRoot()) {
  const inspection = inspectOnboarding(root);
  return {
    status: inspection.onboardingNeeded ? 'onboarding-needed' : 'ready',
    ...inspection,
    suggestions: [
      '整理经历 / 更新简历',
      '评估岗位 / 判断是否值得投',
      '准备笔试面试 / 复盘',
      '查看或更新投递进度',
      '分析能力资产和差距',
    ],
  };
}

export function parseArguments(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const json = args.includes('--json');
  const status = args.includes('--status');
  const query = args.filter((arg) => arg !== '--json' && arg !== '--status').join(' ').trim();
  return { json, status, query };
}

function printStatus({ json = false } = {}) {
  const payload = buildStatusPayload();
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Get Yourself Agent 状态：${payload.status}`);
  if (payload.missing.length > 0) console.log(`待补齐：${payload.missing.join('、')}`);
  if (payload.unpersonalized.length > 0) {
    const paths = payload.unpersonalized.map((item) => item.path).join('、');
    console.log(`待个性化：${paths}`);
  }
  console.log('下一步：直接用一句中文描述求职任务，Agent 会路由到对应模式。');
}

async function runInteractive() {
  printStatus();
  console.log('\nGet Yourself Agent');
  console.log('直接输入你想做的事，或输入 q 退出。');
  console.log('例如：把我这段实习整理成简历条目 / 这家公司值得投吗 / 帮我准备明天的面试。');

  const rl = readline.createInterface({ input, output });
  try {
    for (;;) {
      const answer = (await rl.question('\n你想做什么？ ')).trim();
      if (!answer) continue;
      if (answer === 'q' || answer === 'exit' || answer === '退出') break;
      console.log(`\n${formatRoute(routeIntent(answer))}`);
    }
  } finally {
    rl.close();
  }
}

function main() {
  const args = process.argv;
  const unknownFlags = args.slice(2).filter((arg) => arg.startsWith('-') && !['--json', '--status', '--help', '-h'].includes(arg));
  if (unknownFlags.length > 0) {
    console.error(`Error: unrecognized flag(s): ${unknownFlags.join(', ')}.`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }

  const { json, status, query } = parseArguments(args);
  if (status) {
    printStatus({ json });
    return;
  }

  if (!query) {
    if (json) {
      console.error('Error: --json requires a natural-language query or --status.');
      console.error(USAGE);
      process.exitCode = 1;
      return;
    }
    void runInteractive();
    return;
  }

  const route = routeIntent(query);
  if (json) {
    console.log(JSON.stringify({ route, doctor: buildStatusPayload() }, null, 2));
    return;
  }
  console.log(formatRoute(route));
  console.log(`\n状态：${buildStatusPayload().status}`);
}

if (isMainModule(import.meta.url)) {
  main();
}
