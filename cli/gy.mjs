#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { inspectOnboarding } from './doctor.mjs';
import { inspectEvidencePackage } from './evidence-package.mjs';
import { inspectResumeMaterials } from './resume-materials.mjs';
import { inspectResumeFinal } from './resume-final.mjs';
import { inspectResumeRender } from './resume-render.mjs';
import { inspectResumeLibrary } from './resume-library.mjs';
import { inspectJobAnalysis } from './job-analysis.mjs';
import { inspectScamChecks } from './scam-check.mjs';
import { inspectCompanyOpportunities } from './company-opportunity.mjs';
import { inspectInterviewPrep } from './interview-prep.mjs';
import { inspectInterviewReview } from './interview-review.mjs';
import { inspectCapabilityFeedback } from './capability-feedback.mjs';
import { inspectSkillRuntime } from './skill-runtime.mjs';
import { auditResumeFactChain } from './resume-fact-chain.mjs';
import { connectDevice, disconnectDevice, inspectDeviceBinding } from './device-binding.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { formatRoute, routeIntent } from './lib/intent-router.mjs';

const USAGE = `Usage:
  node gy.mjs "帮我整理这段实习经历"
  node gy.mjs --json "这家公司值得投吗"
  node gy.mjs connect <绑定码> [--server URL] [--device-name NAME] [--replace] [--json]
  node gy.mjs disconnect [--json]
  node gy.mjs --status [--json]
  node gy.mjs --help`;

export function buildStatusPayload(root = getCareerOpsRoot()) {
  const inspection = inspectOnboarding(root);
  return {
    status: inspection.onboardingNeeded ? 'onboarding-needed' : 'ready',
    ...inspection,
    evidencePackage: inspectEvidencePackage(root),
    resumeMaterials: inspectResumeMaterials(root),
    resumeFinal: inspectResumeFinal(root),
    resumeRender: inspectResumeRender(root),
    resumeLibrary: inspectResumeLibrary(root),
    resumeFactChain: auditResumeFactChain(root),
    jobAnalysis: inspectJobAnalysis(root),
    scamCheck: inspectScamChecks(root),
    companyOpportunities: inspectCompanyOpportunities(root),
    interviewPrep: inspectInterviewPrep(root),
    interviewReview: inspectInterviewReview(root),
    capabilityFeedback: inspectCapabilityFeedback(root),
    skillRuntime: inspectSkillRuntime(root),
    deviceBinding: inspectDeviceBinding(root),
    suggestions: [
      '整理经历 / 更新简历',
      '评估岗位 / 判断是否值得投',
      '核查招聘防骗风险',
      '确认后把岗位写入公司机会',
      '准备笔试面试 / 复盘',
      '把复盘反哺到能力资产',
      '查看或更新投递进度',
      '分析能力资产和差距',
      '导入或查看能力证据包',
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

function printStatus({ json = false, root } = {}) {
  const payload = buildStatusPayload(root);
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
  const evidence = payload.evidencePackage;
  if (evidence.state === 'ready') {
    console.log(`能力证据包：已导入 ${evidence.packageId}（${evidence.abilityCount} 能力 / ${evidence.evidenceCount} 证据）`);
  } else if (evidence.state === 'invalid') {
    console.log(`能力证据包：本地文件无效（${evidence.error}）`);
  } else {
    console.log('能力证据包：未导入');
  }
  const materials = payload.resumeMaterials;
  if (materials.state === 'ready') {
    console.log(`简历素材包：已导入 ${materials.packageId}（${materials.entryCount} 条素材 / ${materials.storyCount} 个故事，故事库${materials.storyBankState === 'current' ? '一致' : '待处理'}）`);
  } else if (materials.state === 'invalid') {
    console.log(`简历素材包：本地文件无效（${materials.error}）`);
  } else {
    console.log('简历素材包：未导入');
  }
  const resumeFinal = payload.resumeFinal;
  if (resumeFinal.state === 'ready') {
    const cvState = resumeFinal.cvState === 'current' ? '一致' : '待处理';
    console.log(`简历定稿：${resumeFinal.planId}（${resumeFinal.sectionCount} 个章节 / ${resumeFinal.selectedEntryCount} 条素材，cv.md ${cvState}）`);
  } else if (resumeFinal.state === 'invalid') {
    console.log(`简历定稿：本地计划无效（${resumeFinal.error}）`);
  } else if (resumeFinal.state === 'blocked') {
    console.log('简历定稿：等待素材包导入');
  } else {
    console.log('简历定稿：未生成');
  }
  const resumeRender = payload.resumeRender;
  if (resumeRender.state === 'ready') {
    const currentCount = resumeRender.renders.filter(item => item.htmlState === 'current').length;
    console.log(`简历渲染：${resumeRender.renderCount} 份（${currentCount} 份 HTML 一致）`);
  } else if (resumeRender.state === 'invalid') {
    console.log(`简历渲染：本地文件无效（${resumeRender.error}）`);
  } else {
    console.log('简历渲染：未生成');
  }
  const resumeLibrary = payload.resumeLibrary;
  if (resumeLibrary.state === 'ready') {
    console.log(`简历版本库：${resumeLibrary.documentCount} 条简历线 / ${resumeLibrary.versionCount} 个版本`);
  } else if (resumeLibrary.state === 'invalid') {
    console.log(`简历版本库：本地文件无效（${resumeLibrary.error}）`);
  } else {
    console.log('简历版本库：未导入');
  }
  console.log(`简历事实链：${payload.resumeFactChain.state}（${payload.resumeFactChain.drifts.length} 项提示）`);
  const interviewPrep = payload.interviewPrep;
  const jobAnalysis = payload.jobAnalysis;
  if (jobAnalysis.state === 'ready') {
    const currentCount = jobAnalysis.analyses.filter(item => item.markdownState === 'current').length;
    console.log(`岗位分析：${jobAnalysis.analysisCount} 份（${currentCount} 份报告一致）`);
  } else if (jobAnalysis.state === 'invalid') {
    console.log(`岗位分析：本地文件无效（${jobAnalysis.error}）`);
  } else if (jobAnalysis.state === 'blocked') {
    console.log('岗位分析：等待素材包导入');
  } else {
    console.log('岗位分析：未生成');
  }
  const scamCheck = payload.scamCheck;
  if (scamCheck.state === 'ready') {
    const currentCount = scamCheck.checks.filter(item => item.markdownState === 'current').length;
    console.log(`防骗核查：${scamCheck.checkCount} 份（${currentCount} 份报告一致）`);
  } else if (scamCheck.state === 'invalid') {
    console.log(`防骗核查：本地文件无效（${scamCheck.error}）`);
  } else {
    console.log('防骗核查：未生成');
  }
  if (interviewPrep.state === 'ready') {
    const currentCount = interviewPrep.preparations.filter(item => item.markdownState === 'current').length;
    console.log(`面试准备：${interviewPrep.preparationCount} 份（${currentCount} 份清单一致）`);
  } else if (interviewPrep.state === 'invalid') {
    console.log(`面试准备：本地文件无效（${interviewPrep.error}）`);
  } else if (interviewPrep.state === 'blocked') {
    console.log('面试准备：等待素材包导入');
  } else {
    console.log('面试准备：未生成');
  }
  const companyOpportunities = payload.companyOpportunities;
  if (companyOpportunities.state === 'ready') {
    const linkedCount = companyOpportunities.opportunities.filter(item => item.trackerState === 'linked').length;
    console.log(`公司机会：${companyOpportunities.opportunityCount} 个（${linkedCount} 条投递清单关联）`);
  } else if (companyOpportunities.state === 'invalid') {
    console.log(`公司机会：本地文件无效（${companyOpportunities.error}）`);
  } else if (companyOpportunities.state === 'blocked') {
    console.log('公司机会：等待素材包导入');
  } else {
    console.log('公司机会：未创建');
  }
  const interviewReview = payload.interviewReview;
  if (interviewReview.state === 'ready') {
    const currentCount = interviewReview.reviews.filter(item => item.markdownState === 'current').length;
    console.log(`面试复盘：${interviewReview.reviewCount} 份（${currentCount} 份记录一致）`);
  } else if (interviewReview.state === 'invalid') {
    console.log(`面试复盘：本地文件无效（${interviewReview.error}）`);
  } else if (interviewReview.state === 'blocked') {
    console.log('面试复盘：等待素材包导入');
  } else {
    console.log('面试复盘：未生成');
  }
  const capabilityFeedback = payload.capabilityFeedback;
  if (capabilityFeedback.state === 'ready') {
    const currentCount = capabilityFeedback.feedbacks.filter(item => item.reportState === 'current').length;
    console.log(`能力反哺：${capabilityFeedback.feedbackCount} 份（${currentCount} 份报告一致）`);
  } else if (capabilityFeedback.state === 'invalid') {
    console.log(`能力反哺：本地文件无效（${capabilityFeedback.error}）`);
  } else if (capabilityFeedback.state === 'blocked') {
    console.log('能力反哺：等待前置能力数据');
  } else {
    console.log('能力反哺：未生成');
  }
  const binding = payload.deviceBinding;
  const skillRuntime = payload.skillRuntime;
  if (skillRuntime.state === 'ready') {
    console.log(`Skill Runtime：${skillRuntime.registeredSkillCount} 个注册 skill / ${skillRuntime.runCount} 条审批记录`);
  } else if (skillRuntime.state === 'invalid') {
    console.log(`Skill Runtime：本地审批记录无效（${skillRuntime.error}）`);
  } else {
    console.log(`Skill Runtime：${skillRuntime.registeredSkillCount} 个注册 skill / 0 条审批记录`);
  }
  if (binding.state === 'ready') {
    console.log(`本地工位：已绑定 ${binding.device.deviceName}（#${binding.device.deviceId}）`);
  } else if (binding.state === 'invalid') {
    console.log('本地工位：绑定凭证无效');
  } else {
    console.log('本地工位：未绑定');
  }
  console.log('下一步：直接用一句中文描述求职任务，Agent 会路由到对应模式。');
}

export function parseConnectArguments(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  if (args[0] !== 'connect') return null;

  const options = { command: 'connect', json: false, replace: false, serverUrl: undefined, deviceName: undefined };
  const operands = [];
  let serverFlagSeen = false;
  let deviceNameFlagSeen = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--replace') {
      options.replace = true;
    } else if (arg === '--server') {
      index += 1;
      serverFlagSeen = true;
      options.serverUrl = args[index];
    } else if (arg.startsWith('--server=')) {
      options.serverUrl = arg.slice('--server='.length);
    } else if (arg === '--device-name') {
      index += 1;
      deviceNameFlagSeen = true;
      options.deviceName = args[index];
    } else if (arg.startsWith('--device-name=')) {
      options.deviceName = arg.slice('--device-name='.length);
    } else if (arg.startsWith('--')) {
      return { ...options, error: `unrecognized flag: ${arg}` };
    } else {
      operands.push(arg);
    }
  }

  if (operands.length !== 1) return { ...options, error: 'connect requires exactly one binding code' };
  if (serverFlagSeen && (options.serverUrl === undefined || options.serverUrl === '')) {
    return { ...options, error: '--server requires a value' };
  }
  if (deviceNameFlagSeen && (options.deviceName === undefined || options.deviceName === '')) {
    return { ...options, error: '--device-name requires a value' };
  }
  return { ...options, bindingCode: operands[0] };
}

export function parseDisconnectArguments(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  if (args[0] !== 'disconnect') return null;

  const options = { command: 'disconnect', json: false };
  for (const arg of args.slice(1)) {
    if (arg === '--json') options.json = true;
    else return { ...options, error: `unrecognized argument: ${arg}` };
  }
  return options;
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

async function main() {
  const args = process.argv;
  const connectCommand = parseConnectArguments(args);
  if (connectCommand) {
    if (connectCommand.error) {
      console.error(`Error: ${connectCommand.error}.`);
      console.error(USAGE);
      process.exitCode = 1;
      return;
    }
    try {
      const result = await connectDevice(connectCommand);
      if (connectCommand.json) console.log(JSON.stringify(result, null, 2));
      else console.log(`本地工位已绑定：${result.deviceName}（#${result.deviceId}）`);
    } catch (error) {
      if (connectCommand.json) console.log(JSON.stringify({ error: error.message }, null, 2));
      else console.error(`Error: ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }

  const disconnectCommand = parseDisconnectArguments(args);
  if (disconnectCommand) {
    if (disconnectCommand.error) {
      console.error(`Error: ${disconnectCommand.error}.`);
      console.error(USAGE);
      process.exitCode = 1;
      return;
    }
    try {
      const result = await disconnectDevice();
      if (disconnectCommand.json) console.log(JSON.stringify(result, null, 2));
      else if (result.state === 'missing') console.log('本地工位未绑定，无需解绑。');
      else console.log(`本地工位已解绑：${result.deviceName}（#${result.deviceId}）`);
    } catch (error) {
      if (disconnectCommand.json) console.log(JSON.stringify({ error: error.message }, null, 2));
      else console.error(`Error: ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }

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
  void main();
}
