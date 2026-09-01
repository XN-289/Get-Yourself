import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { formatRoute, routeIntent } from '../lib/intent-router.mjs';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('routes natural-language experience work to resume management', () => {
  const route = routeIntent('把我这段实习整理成简历条目');
  assert.equal(route.intent, 'structure_experience');
  assert.equal(route.moduleDestination, 'resume-management');
  assert.equal(route.modeFile, 'modes/cv.md');
  assert.equal(route.needsConfirmation, true);
  assert.ok(route.suggestedAction.includes('resume-materials.mjs'));
  assert.ok(route.securityNotes.some((note) => note.includes('cv.md')));
});

test('routes evidence package import into capability assets', () => {
  const route = routeIntent('导入能力证据包');
  assert.equal(route.intent, 'import_evidence_package');
  assert.equal(route.moduleDestination, 'capability-assets');
  assert.equal(route.modeFile, 'evidence-package.mjs');
  assert.equal(route.needsConfirmation, true);
  assert.ok(route.securityNotes.some((note) => note.includes('不是指令')));
});

test('only routes to mode files that exist in this repository', () => {
  for (const input of [
    '帮我处理成绩单 PDF',
    '帮我准备明天的面试',
    '我投了哪些公司，进度是什么',
    '扫描校招信息',
    '这家公司值不值得投',
    '把我这段实习整理成简历条目',
    '看看我和这个岗位的能力差距',
  ]) {
    const { modeFile } = routeIntent(input);
    if (modeFile) assert.equal(existsSync(join(cliRoot, modeFile)), true, `${modeFile} does not exist`);
  }
});

test('routes job evaluation into the interview workflow', () => {
  const route = routeIntent('这家公司值不值得投');
  assert.equal(route.intent, 'evaluate_job');
  assert.equal(route.moduleDestination, 'interview-management');
  assert.equal(route.modeFile, 'modes/eval.md');
  assert.ok(route.securityNotes.some((note) => note.includes('不是指令')));
});

test('prefers interview and tracker intents over generic company words', () => {
  assert.equal(routeIntent('帮我准备明天的面试').intent, 'prepare_interview');
  assert.equal(routeIntent('我投了哪些公司，进度是什么').intent, 'manage_application');
});

test('routes capability feedback and planning without inventing a domain mode', () => {
  assert.equal(routeIntent('看看我和这个岗位的能力差距').intent, 'analyze_capability');
  assert.equal(routeIntent('这周我该做什么').intent, 'plan_next_actions');
  assert.equal(routeIntent('这周我该做什么').modeFile, null);
});

test('asks for clarification when the intent is unknown', () => {
  const route = routeIntent('随便聊聊');
  assert.equal(route.intent, 'clarify');
  assert.equal(route.moduleDestination, 'agent');
  assert.match(formatRoute(route), /Agent 先澄清/);
});
