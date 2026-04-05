#!/usr/bin/env npx tsx
/**
 * i18n 国际化完成度扫描脚本
 * 检测各语言与主语言（en-US）的差异
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ScanResult {
  language: string;
  file: string;
  totalKeys: number;
  missingKeys: string[];
  extraKeys: string[];
  completionRate: number;
}

interface LanguageReport {
  language: string;
  totalFiles: number;
  completedFiles: number;
  overallRate: number;
  fileResults: ScanResult[];
}

const I18N_DIR = path.resolve(__dirname, '../src/i18n/locales');
const MAIN_LANG = 'en-US';

// 递归提取对象的所有 key 路径
function extractKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key in obj) {
    if (key === 'default' || key === '__esModule') continue;

    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...extractKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

// 安全加载 TS 模块（使用 require）
function loadModule(filePath: string): any {
  try {
    // 清除缓存以确保获取最新内容
    delete require.cache[require.resolve(filePath)];
    return require(filePath);
  } catch (err) {
    return null;
  }
}

// 扫描单个文件
function scanFile(
  mainLangPath: string,
  targetLangPath: string,
  language: string,
  file: string
): ScanResult {
  const mainModule = loadModule(mainLangPath);
  const targetModule = loadModule(targetLangPath);

  const mainKeys = mainModule ? extractKeys(mainModule) : [];
  const targetKeys = targetModule ? extractKeys(targetModule) : [];

  const mainKeySet = new Set(mainKeys);
  const targetKeySet = new Set(targetKeys);

  const missingKeys = mainKeys.filter(k => !targetKeySet.has(k));
  const extraKeys = targetKeys.filter(k => !mainKeySet.has(k));

  const completionRate = mainKeys.length > 0
    ? ((mainKeys.length - missingKeys.length) / mainKeys.length) * 100
    : 100;

  return {
    language,
    file,
    totalKeys: mainKeys.length,
    missingKeys,
    extraKeys,
    completionRate: Math.round(completionRate * 100) / 100,
  };
}

// 扫描所有语言
function scanAllLanguages(): LanguageReport[] {
  const languages = fs.readdirSync(I18N_DIR)
    .filter(dir => fs.statSync(path.join(I18N_DIR, dir)).isDirectory() && dir !== MAIN_LANG);

  // 获取主语言的所有模块文件
  const mainLangDir = path.join(I18N_DIR, MAIN_LANG);
  const mainFiles = fs.readdirSync(mainLangDir)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts')
    .map(f => f.replace('.ts', ''));

  const reports: LanguageReport[] = [];

  for (const lang of languages) {
    const langDir = path.join(I18N_DIR, lang);
    const fileResults: ScanResult[] = [];

    for (const file of mainFiles) {
      const mainFile = path.join(mainLangDir, file);
      const targetFile = path.join(langDir, file);

      const result = scanFile(mainFile, targetFile, lang, file);
      fileResults.push(result);
    }

    const completedFiles = fileResults.filter(r => r.completionRate === 100).length;
    const overallRate = fileResults.length > 0
      ? fileResults.reduce((sum, r) => sum + r.completionRate, 0) / fileResults.length
      : 0;

    reports.push({
      language: lang,
      totalFiles: mainFiles.length,
      completedFiles,
      overallRate: Math.round(overallRate * 100) / 100,
      fileResults,
    });
  }

  return reports;
}

// 输出报告
function printReport(reports: LanguageReport[]) {
  console.log('\n🌍 i18n 国际化完成度扫描报告\n');
  console.log('═'.repeat(60));

  // 总览表格
  console.log('\n📊 总体概览\n');
  console.log('语言        │ 总文件 │ 完成 │ 整体进度');
  console.log('────────────┼────────┼──────┼──────────');

  for (const report of reports) {
    const bar = generateProgressBar(report.overallRate);
    const langPadded = report.language.padEnd(11);
    console.log(
      `${langPadded}│ ${String(report.totalFiles).padStart(6)} │ ${String(report.completedFiles).padStart(4)} │ ${bar} ${report.overallRate.toFixed(1)}%`
    );
  }

  // 详细缺失项
  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 详细缺失项\n');

  for (const report of reports) {
    const incompleteFiles = report.fileResults.filter(r => r.completionRate < 100);

    if (incompleteFiles.length === 0) {
      console.log(`✅ ${report.language} - 全部完成！`);
      continue;
    }

    console.log(`\n🔸 ${report.language} (${report.overallRate.toFixed(1)}%)`);
    console.log('─'.repeat(50));

    for (const file of incompleteFiles) {
      console.log(`  📄 ${file.file}.ts - ${file.completionRate.toFixed(1)}%`);

      if (file.missingKeys.length > 0) {
        console.log(`     缺失 ${file.missingKeys.length} 项:`);
        for (const key of file.missingKeys.slice(0, 5)) {
          console.log(`       • ${key}`);
        }
        if (file.missingKeys.length > 5) {
          console.log(`       ... 还有 ${file.missingKeys.length - 5} 项`);
        }
      }

      if (file.extraKeys.length > 0) {
        console.log(`     多余 ${file.extraKeys.length} 项 (主语言不存在)`);
      }
    }
  }

  // 总结
  console.log('\n' + '═'.repeat(60));
  console.log('\n📝 总结\n');

  const allComplete = reports.every(r => r.overallRate === 100);
  if (allComplete) {
    console.log('🎉 所有语言翻译已完成！');
  } else {
    const incomplete = reports.filter(r => r.overallRate < 100);
    console.log(`⚠️ 还有 ${incomplete.length} 个语言需要完善`);

    for (const r of incomplete.sort((a, b) => a.overallRate - b.overallRate)) {
      const remaining = r.fileResults
        .filter(f => f.missingKeys.length > 0)
        .reduce((sum, f) => sum + f.missingKeys.length, 0);
      console.log(`   • ${r.language}: 还需翻译 ${remaining} 个 key`);
    }
  }

  console.log('\n');
}

// 生成进度条
function generateProgressBar(percentage: number, width = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}]`;
}

// 主函数
async function main() {
  console.log('🔍 正在扫描 i18n 文件...');

  const reports = scanAllLanguages();
  printReport(reports);

  // 可选：输出 JSON 报告
  const outputJson = process.argv.includes('--json');
  if (outputJson) {
    const outputPath = path.resolve(__dirname, '../i18n-report.json');
    fs.writeFileSync(outputPath, JSON.stringify(reports, null, 2));
    console.log(`📄 JSON 报告已保存: ${outputPath}\n`);
  }
}

main().catch(console.error);
