#!/usr/bin/env node
/**
 * generate-pdf.mjs — get-yourself-cli 简历 PDF 生成（Playwright HTML→PDF）
 *
 * 用法:
 *   node generate-pdf.mjs <input.html> <output.pdf> [--format=a4]
 *
 * 从 cv.md 生成简历 HTML 后调用本脚本转 PDF。
 * 需要: npm install playwright && npx playwright install chromium
 */

import { chromium } from 'playwright';
import { resolve, basename, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { isMainModule } from './lib/is-main-module.mjs';

async function htmlToPdf(inputHtml, outputPdf, format = 'a4') {
  const inputPath = resolve(inputHtml);
  if (!existsSync(inputPath)) {
    throw new Error(`输入文件不存在: ${inputPath}`);
  }
  mkdirSync(dirname(resolve(outputPdf)), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(inputPath).href, { waitUntil: 'networkidle' });

    const options = {
      format: format === 'a4' ? 'A4' : 'Letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    };
    // A4 一页：学生简历必须一页。用 CSS 控制，这里检测页数
    const pageCount = await page.evaluate(async () => {
      // 检测是否超一页
      const body = document.body;
      const html = document.documentElement;
      const height = Math.max(body.scrollHeight, html.scrollHeight);
      return Math.ceil(height / 297); // 297mm A4 高度近似
    });

    await page.pdf({ path: resolve(outputPdf), ...options });
    console.log(`✓ PDF 生成: ${outputPdf} (约 ${pageCount} 页)`);
    if (pageCount > 1) {
      console.log('⚠ 超过 1 页！学生简历应一页。请精简内容。');
    }
  } finally {
    await browser.close();
  }
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  const output = args.find((a, i) => args.indexOf(a) > args.indexOf(input) && !a.startsWith('--'));
  const format = args.find((a) => a.startsWith('--format='))?.split('=')[1] || 'a4';

  if (!input || !output) {
    console.error('用法: node generate-pdf.mjs <input.html> <output.pdf> [--format=a4]');
    process.exit(1);
  }

  htmlToPdf(input, output, format).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
