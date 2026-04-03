#!/usr/bin/env npx tsx
/**
 * i18n 翻译调用扫描脚本
 * 
 * 功能：
 * 1. 扫描 src/ 目录下所有 TypeScript/TSX 文件中的 t() 调用
 * 2. 提取所有翻译 key
 * 3. 与翻译文件对比，找出：
 *    - 使用了但不存在于翻译文件的 key（缺失）
 *    - 存在于翻译文件但未被使用的 key（废弃/未使用）
 * 
 * 使用方法：
 *   npx tsx scripts/scan-i18n-usage.ts
 *   npx tsx scripts/scan-i18n-usage.ts --json    # 输出 JSON 报告
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ 配置 ============
const SRC_DIR = path.resolve(__dirname, '../src');
const I18N_DIR = path.resolve(__dirname, '../src/i18n/locales');
const MAIN_LANG = 'en-US';
const FILE_EXTENSIONS = ['.ts', '.tsx'];

// 忽略的文件/目录
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /__tests__/,
  /__mocks__/,
  /\.d\.ts$/,
];

// ============ 类型定义 ============
interface KeyUsage {
  key: string;
  defaultValue?: string;
  locations: KeyLocation[];
}

interface KeyLocation {
  file: string;
  line: number;
  column: number;
  context: string; // 代码上下文
}

interface TranslationKey {
  key: string;
  namespace: string; // 如: common, app, session 等
  fullPath: string; // 如: common.search, app.title 等
}

interface ScanReport {
  // 使用情况统计
  usedKeys: Map<string, KeyUsage>; // key -> 使用信息
  totalCalls: number;
  uniqueKeys: number;
  filesScanned: number;
  
  // 缺失和未使用的 key
  missingKeys: string[]; // 使用了但翻译文件中没有
  unusedKeys: string[];  // 翻译文件中有但未被使用
  
  // 翻译文件中的所有 key
  allTranslationKeys: TranslationKey[];
}

// ============ 工具函数 ============

/**
 * 检查是否是有效的翻译 key
 * 过滤掉代码操作和误报
 */
function isValidTranslationKey(key: string): boolean {
  // 过滤单字符（如 split('.') 中的 .）
  if (key.length <= 1) return false;
  
  // 过滤路径（如 import("./components/Dashboard")）
  if (key.startsWith('./') || key.startsWith('../')) return false;
  
  // 过滤纯数字
  if (/^\d+$/.test(key)) return false;
  
  // 过滤特殊符号组成的
  if (/^[^a-zA-Z]+$/.test(key)) return false;
  
  return true;
}

/**
 * 检查文件是否应该被忽略
 */
function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * 递归获取目录下所有匹配的文件
 */
function getAllFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !shouldIgnore(fullPath)) {
      files.push(...getAllFiles(fullPath, extensions));
    } else if (stat.isFile() && extensions.some(ext => fullPath.endsWith(ext))) {
      if (!shouldIgnore(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * 从代码中提取 t() 调用的 key
 * 
 * 支持的调用模式：
 * - t('key')
 * - t("key")
 * - t('key', 'default')
 * - t('key', { param: value })
 * - i18n.t('key')
 * - context?.t('key')
 */
function extractTranslationKeys(content: string, filePath: string): KeyUsage[] {
  const usages: Map<string, KeyUsage> = new Map();
  
  // 匹配各种 t() 调用模式
  const patterns = [
    // t('key') 或 t('key', 'default') 或 t('key', {...})
    // 使用负向后瞻确保 t 不是单词的一部分（避免匹配 split 等）
    /(?<![a-zA-Z0-9_])t\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"])?\s*\)/g,
    // i18n.t('key') 或 context?.t('key')
    /(?:i18n|context)\??\.t\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  
  const lines = content.split('\n');
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const key = match[1];
      const defaultValue = match[2];
      
      // 过滤无效的翻译 key
      if (!isValidTranslationKey(key)) continue;
      
      // 计算行号和列号
      const upToMatch = content.substring(0, match.index);
      const lineIndex = upToMatch.split('\n').length - 1;
      const line = lines[lineIndex];
      const column = match.index - upToMatch.lastIndexOf('\n') - 1;
      
      // 获取代码上下文（前后 30 字符）
      const contextStart = Math.max(0, column - 30);
      const contextEnd = Math.min(line.length, column + match[0].length + 30);
      const context = line.substring(contextStart, contextEnd).trim();
      
      const location: KeyLocation = {
        file: path.relative(SRC_DIR, filePath),
        line: lineIndex + 1,
        column: column + 1,
        context,
      };
      
      if (usages.has(key)) {
        usages.get(key)!.locations.push(location);
      } else {
        usages.set(key, {
          key,
          defaultValue,
          locations: [location],
        });
      }
    }
  }
  
  return Array.from(usages.values());
}

/**
 * 递归提取翻译文件中的所有 key
 */
function extractTranslationFileKeys(obj: any, prefix = '', namespace = ''): TranslationKey[] {
  const keys: TranslationKey[] = [];
  
  for (const key in obj) {
    if (key === 'default' || key === '__esModule') continue;
    
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 第一层是 namespace
      const ns = prefix ? namespace : key;
      keys.push(...extractTranslationFileKeys(value, fullKey, ns));
    } else {
      keys.push({
        key: fullKey,
        namespace: namespace || prefix.split('.')[0],
        fullPath: fullKey,
      });
    }
  }
  
  return keys;
}

/**
 * 加载翻译文件（使用动态 import 支持 ES 模块）
 */
async function loadTranslations(langDir: string): Promise<TranslationKey[]> {
  const allKeys: TranslationKey[] = [];
  
  // 首先加载 index.ts 获取内联定义的 key（如 connection）
  const indexPath = path.join(langDir, 'index.ts');
  try {
    const fileUrl = 'file://' + indexPath;
    const indexModule = await import(fileUrl);
    
    // 处理 index.ts 的导出（enUS 对象）
    if (indexModule.enUS) {
      const enUS = indexModule.enUS;
      for (const key in enUS) {
        if (key === 'default' || key === '__esModule') continue;
        
        const value = enUS[key];
        // 只处理内联定义的对象（不是从其他文件导入的模块）
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // 检查是否是内联定义（有直接的字符串值）
          const isInline = Object.values(value).some(v => typeof v === 'string');
          if (isInline) {
            const keys = extractTranslationFileKeys({ [key]: value }, '', key);
            allKeys.push(...keys);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ 无法加载 index.ts: ${indexPath}`, err);
  }
  
  // 然后加载其他单独的 .ts 文件
  const files = fs.readdirSync(langDir)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts');
  
  for (const file of files) {
    const filePath = path.join(langDir, file);
    try {
      // 使用动态 import 加载 ES 模块
      const fileUrl = 'file://' + filePath;
      const module = await import(fileUrl);
      
      // 获取模块的命名导出（如 common, app 等）
      const translations = module;
      
      // 获取 namespace（文件名）
      const namespace = file.replace('.ts', '');
      
      const keys = extractTranslationFileKeys(translations, '', namespace);
      allKeys.push(...keys);
    } catch (err) {
      console.warn(`⚠️ 无法加载翻译文件: ${filePath}`, err);
    }
  }
  
  return allKeys;
}

// ============ 主扫描逻辑 ============

async function scan(): Promise<ScanReport> {
  console.log('🔍 正在扫描源代码...');
  
  // 1. 获取所有源文件
  const sourceFiles = getAllFiles(SRC_DIR, FILE_EXTENSIONS);
  console.log(`   📁 找到 ${sourceFiles.length} 个源文件`);
  
  // 2. 扫描每个文件中的 t() 调用
  const usedKeys: Map<string, KeyUsage> = new Map();
  let totalCalls = 0;
  
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const usages = extractTranslationKeys(content, file);
    
    for (const usage of usages) {
      totalCalls += usage.locations.length;
      
      if (usedKeys.has(usage.key)) {
        usedKeys.get(usage.key)!.locations.push(...usage.locations);
      } else {
        usedKeys.set(usage.key, usage);
      }
    }
  }
  
  console.log(`   📝 发现 ${totalCalls} 处翻译调用，${usedKeys.size} 个唯一 key`);
  
  // 3. 加载翻译文件
  console.log('\n📚 正在加载翻译文件...');
  const mainLangDir = path.join(I18N_DIR, MAIN_LANG);
  const translationKeys = await loadTranslations(mainLangDir);
  console.log(`   📖 主语言 (${MAIN_LANG}) 包含 ${translationKeys.length} 个 key`);
  
  // 4. 对比分析
  const usedKeySet = new Set(usedKeys.keys());
  const translationKeySet = new Set(translationKeys.map(k => k.fullPath));
  
  // 缺失的 key：使用了但翻译文件中没有
  const missingKeys = Array.from(usedKeySet)
    .filter(k => !translationKeySet.has(k))
    .sort();
  
  // 未使用的 key：翻译文件中有但未被使用
  const unusedKeys = Array.from(translationKeySet)
    .filter(k => !usedKeySet.has(k))
    .sort();
  
  return {
    usedKeys,
    totalCalls,
    uniqueKeys: usedKeys.size,
    filesScanned: sourceFiles.length,
    missingKeys,
    unusedKeys,
    allTranslationKeys: translationKeys,
  };
}

// ============ 报告输出 ============

function printReport(report: ScanReport) {
  console.log('\n' + '═'.repeat(70));
  console.log('🌍 i18n 翻译调用扫描报告\n');
  
  // 概览
  console.log('📊 概览');
  console.log('─'.repeat(70));
  console.log(`   扫描文件数:     ${report.filesScanned}`);
  console.log(`   翻译调用次数:   ${report.totalCalls}`);
  console.log(`   唯一 key 数量:  ${report.uniqueKeys}`);
  console.log(`   翻译文件 keys:  ${report.allTranslationKeys.length}`);
  console.log(`   覆盖率:         ${((report.uniqueKeys / report.allTranslationKeys.length) * 100).toFixed(1)}%`);
  
  // 缺失的 key
  console.log('\n' + '═'.repeat(70));
  console.log(`❌ 缺失的 Key (${report.missingKeys.length})`);
  console.log('─'.repeat(70));
  console.log('   这些 key 在代码中被使用，但翻译文件中不存在：\n');
  
  if (report.missingKeys.length === 0) {
    console.log('   ✅ 没有缺失的 key！');
  } else {
    for (const key of report.missingKeys) {
      const usage = report.usedKeys.get(key)!;
      console.log(`   🔸 ${key}`);
      if (usage.defaultValue) {
        console.log(`      默认值: "${usage.defaultValue}"`);
      }
      console.log(`      使用位置:`);
      for (const loc of usage.locations.slice(0, 3)) {
        console.log(`        → ${loc.file}:${loc.line}:${loc.column}`);
      }
      if (usage.locations.length > 3) {
        console.log(`        ... 还有 ${usage.locations.length - 3} 处`);
      }
      console.log('');
    }
  }
  
  // 未使用的 key
  console.log('\n' + '═'.repeat(70));
  console.log(`⚠️ 未使用的 Key (${report.unusedKeys.length})`);
  console.log('─'.repeat(70));
  console.log('   这些 key 存在于翻译文件中，但代码中未被引用：\n');
  
  if (report.unusedKeys.length === 0) {
    console.log('   ✅ 所有 key 都被使用了！');
  } else {
    // 按 namespace 分组
    const byNamespace = new Map<string, string[]>();
    for (const key of report.unusedKeys) {
      const ns = key.split('.')[0];
      if (!byNamespace.has(ns)) {
        byNamespace.set(ns, []);
      }
      byNamespace.get(ns)!.push(key);
    }
    
    for (const [ns, keys] of byNamespace) {
      console.log(`   📁 ${ns} (${keys.length})`);
      for (const key of keys.slice(0, 10)) {
        console.log(`      • ${key}`);
      }
      if (keys.length > 10) {
        console.log(`      ... 还有 ${keys.length - 10} 个`);
      }
      console.log('');
    }
  }
  
  // 建议
  console.log('\n' + '═'.repeat(70));
  console.log('💡 建议\n');
  
  if (report.missingKeys.length > 0) {
    console.log(`   1. 添加 ${report.missingKeys.length} 个缺失的 key 到翻译文件`);
  }
  if (report.unusedKeys.length > 0) {
    console.log(`   2. 考虑清理 ${report.unusedKeys.length} 个未使用的 key`);
  }
  if (report.missingKeys.length === 0 && report.unusedKeys.length === 0) {
    console.log('   🎉 翻译文件与代码完全匹配！');
  }
  
  console.log('\n');
}

function exportJson(report: ScanReport) {
  const outputPath = path.resolve(__dirname, '../i18n-usage-report.json');
  
  const data = {
    summary: {
      filesScanned: report.filesScanned,
      totalCalls: report.totalCalls,
      uniqueKeys: report.uniqueKeys,
      translationKeys: report.allTranslationKeys.length,
      missingCount: report.missingKeys.length,
      unusedCount: report.unusedKeys.length,
    },
    missingKeys: report.missingKeys.map(key => ({
      key,
      defaultValue: report.usedKeys.get(key)?.defaultValue,
      locations: report.usedKeys.get(key)?.locations,
    })),
    unusedKeys: report.unusedKeys,
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`📄 JSON 报告已保存: ${outputPath}\n`);
}

// ============ 主函数 ============

async function main() {
  const report = await scan();
  printReport(report);
  
  if (process.argv.includes('--json')) {
    exportJson(report);
  }
}

main().catch(console.error);
