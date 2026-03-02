#!/usr/bin/env bun
/**
 * 生产级文件移动工具 - 基于 ts-morph
 * 
 * 功能：
 * - 移动文件并自动更新所有引用
 * - 支持批量操作
 * - 显示影响范围
 * - 支持 dry-run 预览
 * - 自动创建目标目录
 */

import { Project } from "ts-morph";
import fs from "fs";
import path from "path";

interface Options {
  dryRun?: boolean;
  verbose?: boolean;
}

class Refactor {
  private project: Project;

  constructor() {
    this.project = new Project({
      tsConfigFilePath: "tsconfig.json",
    });
  }

  /**
   * 移动单个文件
   */
  move(oldPath: string, newPath: string, options: Options = {}) {
    const { dryRun = false, verbose = false } = options;

    const sourceFile = this.project.getSourceFile(oldPath);

    if (!sourceFile) {
      throw new Error(`文件不存在: ${oldPath}`);
    }

    // 获取受影响的文件
    const referencingFiles = sourceFile
      .getReferencingSourceFiles()
      .map((f) => f.getFilePath());

    console.log(`\n📦 移动: ${oldPath} → ${newPath}`);
    console.log(`📊 影响 ${referencingFiles.length} 个文件\n`);

    if (verbose) {
      referencingFiles.forEach((f) => {
        const relativePath = path.relative(process.cwd(), f);
        console.log(`  - ${relativePath}`);
      });
      console.log();
    }

    if (dryRun) {
      console.log("🔍 [DRY RUN] 未实际执行");
      return;
    }

    // 确保目标目录存在
    const targetDir = path.dirname(newPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`📁 创建目录: ${targetDir}`);
    }

    // 执行移动
    sourceFile.move(newPath);
    this.project.saveSync();

    console.log("✅ 完成！");
  }

  /**
   * 批量移动
   */
  batchMove(rules: Array<{ from: string; to: string }>, options: Options = {}) {
    console.log(`🚀 批量移动 ${rules.length} 个文件\n`);

    for (const rule of rules) {
      try {
        this.move(rule.from, rule.to, { ...options, verbose: false });
      } catch (error) {
        console.error(`❌ 失败: ${rule.from}`);
        console.error(`   ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  /**
   * 重命名目录下所有文件
   */
  renameDirectory(oldDir: string, newDir: string, options: Options = {}) {
    const files = this.project
      .getSourceFiles()
      .filter((f) => f.getFilePath().startsWith(path.resolve(oldDir)));

    const rules = files.map((f) => ({
      from: f.getFilePath(),
      to: f.getFilePath().replace(path.resolve(oldDir), path.resolve(newDir)),
    }));

    console.log(`📁 重命名目录: ${oldDir} → ${newDir}`);
    this.batchMove(rules, options);
  }
}

// CLI 入口
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(`
🎮 文件重构工具

用法:
  bun scripts/refactor.ts <命令> [选项]

命令:
  move <from> <to>              移动单个文件
  batch <config.json>           批量移动（从配置文件）
  rename-dir <from> <to>        重命名目录

选项:
  --dry-run                     预览模式，不实际执行
  --verbose                     显示详细信息

示例:
  # 移动单个文件
  bun scripts/refactor.ts move src/utils/old.ts src/lib/new.ts

  # 预览模式
  bun scripts/refactor.ts move src/utils/old.ts src/lib/new.ts --dry-run

  # 批量移动
  bun scripts/refactor.ts batch refactor.json

  # 重命名目录
  bun scripts/refactor.ts rename-dir src/components/old src/components/new
`);
    process.exit(0);
  }

  const command = args[0];
  const options: Options = {
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--verbose"),
  };

  const refactor = new Refactor();

  try {
    switch (command) {
      case "move": {
        const [, from, to] = args.filter((a) => !a.startsWith("--"));
        if (!from || !to) {
          throw new Error("需要提供 from 和 to 参数");
        }
        refactor.move(from, to, options);
        break;
      }

      case "batch": {
        const [, configPath] = args.filter((a) => !a.startsWith("--"));
        if (!configPath) {
          throw new Error("需要提供配置文件路径");
        }
        const rules = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        refactor.batchMove(rules, options);
        break;
      }

      case "rename-dir": {
        const [, from, to] = args.filter((a) => !a.startsWith("--"));
        if (!from || !to) {
          throw new Error("需要提供 from 和 to 参数");
        }
        refactor.renameDirectory(from, to, options);
        break;
      }

      default:
        throw new Error(`未知命令: ${command}`);
    }
  } catch (error) {
    console.error(`\n❌ 错误: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

main();
