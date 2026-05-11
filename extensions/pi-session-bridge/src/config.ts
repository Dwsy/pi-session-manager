/**
 * Configuration — single source of truth for all constants.
 *
 * Resolution order: env var > PSM config file > default.
 */
import * as path from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

function readPsmPort(): number {
  try {
    const configPath = path.join(homedir(), ".pi", "pi-session-manager", "config.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return config.server?.http_port || 52131;
    }
  } catch { /* ignore */ }
  return 52131;
}

const PSM_PORT = readPsmPort();

export const WS_URL = process.env.PSM_URL || `ws://127.0.0.1:${PSM_PORT}/ws`;
export const AUTH_TOKEN = process.env.PSM_TOKEN || "";

const wsProtocol = WS_URL.startsWith("wss") ? "https" : "http";
const wsHost = WS_URL.replace(/^wss?:\/\//, "").replace(/\/.*$/, "");
export const HTTP_BASE = `${wsProtocol}://${wsHost}`;

// WebSocket keepalive / reconnect
export const HB_INTERVAL = 15_000;
export const HB_TIMEOUT = 30_000;
export const RECONNECT_BASE = 3_000;
export const RECONNECT_MAX = 30_000;

// Notification cooldown (ms)
export const NOTIFY_COOLDOWN = 5_000;
