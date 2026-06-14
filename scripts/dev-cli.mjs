#!/usr/bin/env node
/**
 * CLI Dev Mode - No Tauri, Vite dev server + CLI backend with hot reload by default
 *
 * Usage:
 *   pnpm cli:dev              # Hot reload mode (auto recompile on Rust changes)
 *   pnpm cli:dev --fast       # Fast mode (use pre-compiled binary, quick start)
 *   pnpm cli:dev --no-hot     # Same as --fast
 *
 * How it works:
 *   1. Vite dev server runs on port 1420 (same as Tauri)
 *   2. CLI server runs on port 52131 (configurable)
 *   3. Vite proxies /api and /ws to CLI server
 *
 * Hot reload requires cargo-watch:
 *   cargo install cargo-watch
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cross-platform user home: Windows uses USERPROFILE (HOME is usually unset,
// and when set by Git Bash/MSYS may point to a Unix-style path Win32 can't open).
function userHome() {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}
const projectRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isFastMode = args.includes('--fast') || args.includes('--no-hot');
const isHotMode = !isFastMode;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}[dev:cli]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[dev:cli]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[dev:cli]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[dev:cli]${colors.reset} ${msg}`),
  vite: (msg) => console.log(`${colors.cyan}[vite]${colors.reset} ${msg}`),
  server: (msg) => console.log(`${colors.magenta}[server]${colors.reset} ${msg}`),
  rust: (msg) => console.log(`${colors.yellow}[rust]${colors.reset} ${msg}`),
};

function getCliPort() {
  const configPath = resolve(userHome(), '.config', 'pi-session-manager.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config?.server?.http_port || 52131;
  } catch {
    return 52131;
  }
}

function checkCargoWatch() {
  return new Promise((resolve) => {
    const check = spawn('cargo', ['watch', '--version'], {
      stdio: 'pipe',
    });
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
  });
}

function checkCliBinary() {
  const binaryPaths = [
    resolve(projectRoot, 'target/release/pi-session-cli'),
    resolve(projectRoot, 'target/debug/pi-session-cli'),
  ];

  for (const path of binaryPaths) {
    try {
      readFileSync(path);
      return path;
    } catch {}
  }
  return null;
}

function startCliServer(binaryPath) {
  log.info('Starting CLI server (pre-compiled binary)...');

  const server = spawn(binaryPath, [], {
    cwd: projectRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      RUST_LOG: process.env.RUST_LOG || 'info',
    },
  });

  server.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) log.server(line);
    });
  });

  server.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) log.server(`${colors.red}${line}${colors.reset}`);
    });
  });

  server.on('close', (code) => {
    if (code !== 0 && code !== null) {
      log.error(`CLI server exited unexpectedly (code: ${code})`);
      process.exit(1);
    }
  });

  return server;
}

function startCliServerHot() {
  log.info('Starting CLI server (hot reload mode)...');
  log.info(`${colors.dim}Watching: src-tauri/src, src-tauri-cli/src${colors.reset}`);

  const server = spawn('cargo', [
    'watch',
    '--watch', 'src-tauri/src',
    '--watch', 'src-tauri-cli/src',
    '--watch', 'src-tauri/Cargo.toml',
    '--watch', 'src-tauri-cli/Cargo.toml',
    '-x', 'build --release -p pi-session-cli',
    '-s', './target/release/pi-session-cli',
  ], {
    cwd: projectRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      RUST_LOG: process.env.RUST_LOG || 'info',
    },
  });

  let isFirstBuild = true;

  server.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (!line.trim()) return;

      if (line.includes('Compiling') || line.includes('Finished') || line.includes('error') || line.includes('Running')) {
        log.rust(line);
        if (line.includes('Finished') && isFirstBuild) {
          isFirstBuild = false;
          log.success('Initial Rust build complete, starting server...');
        }
      } else if (line.includes('[Running') || line.includes('Watching')) {
        log.rust(`${colors.dim}${line}${colors.reset}`);
      }
    });
  });

  server.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) log.rust(`${colors.red}${line}${colors.reset}`);
    });
  });

  server.on('close', (code) => {
    if (code !== 0 && code !== null) {
      log.error(`cargo-watch exited unexpectedly (code: ${code})`);
      process.exit(1);
    }
  });

  return server;
}

function startVite() {
  log.info('Starting Vite dev server...');

  const vite = spawn('pnpm', ['exec', 'vite', '--mode', 'cli-dev'], {
    cwd: projectRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CLI_DEV_MODE: 'true',
      CLI_SERVER_PORT: String(getCliPort()),
    },
  });

  vite.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) log.vite(line);
    });
  });

  vite.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) log.vite(`${colors.red}${line}${colors.reset}`);
    });
  });

  vite.on('close', (code) => {
    log.info(`Vite exited (code: ${code})`);
    process.exit(code || 0);
  });

  return vite;
}

async function main() {
  console.log();
  log.success('═══════════════════════════════════════');
  log.success('  Pi Session Manager — CLI Dev Mode');
  log.success('═══════════════════════════════════════');

  if (isHotMode) {
    log.success(`  Mode: ${colors.yellow}Hot reload (auto recompile on Rust changes)${colors.reset}`);
  } else {
    log.success(`  Mode: ${colors.green}Fast (use pre-compiled binary)${colors.reset}`);
  }
  log.success('═══════════════════════════════════════');
  console.log();

  const cliPort = getCliPort();
  log.info(`CLI server port: ${cliPort}`);
  log.info(`Vite dev port: 1420`);
  console.log();

  let server;

  if (isHotMode) {
    const hasCargoWatch = await checkCargoWatch();
    if (!hasCargoWatch) {
      log.error('cargo-watch not found! Please install:');
      log.error('  cargo install cargo-watch');
      console.log();
      log.info('Or use fast mode:');
      log.info('  pnpm cli:dev');
      process.exit(1);
    }

    server = startCliServerHot();
    log.info('Waiting for initial build (may take a few minutes)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  } else {
    const binaryPath = checkCliBinary();
    if (!binaryPath) {
      log.error('CLI binary not found! Please build first:');
      log.error('  pnpm build:cli');
      log.error('Or:');
      log.error('  cargo build --release -p pi-session-cli');
      console.log();
      log.info('Or use hot reload mode:');
      log.info('  pnpm cli:dev --hot');
      console.log();
      log.info('Or start frontend only (mock mode):');
      log.info('  pnpm dev');
      process.exit(1);
    }

    const isDebugBuild = binaryPath.includes('/debug/');
    if (isDebugBuild) {
      log.warn('Detected debug build CLI, consider building release for better performance:');
      log.warn('  cargo build --release -p pi-session-cli');
    }
    log.info(`CLI binary: ${binaryPath}`);
    console.log();

    server = startCliServer(binaryPath);
    log.info('Waiting for CLI server to initialize...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const vite = startVite();

  const shutdown = (signal) => {
    log.info(`Received ${signal}, shutting down...`);
    server.kill('SIGTERM');
    vite.kill('SIGTERM');
    setTimeout(() => {
      server.kill('SIGKILL');
      vite.kill('SIGKILL');
      process.exit(0);
    }, 1000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
