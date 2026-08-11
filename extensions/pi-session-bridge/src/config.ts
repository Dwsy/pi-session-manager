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

export const AUTH_TOKEN = process.env.PSM_TOKEN || "";

// Agent-tool deadlines are intentionally shorter than PSM's backend safety
// timeout so a stalled local service cannot block a model turn indefinitely.
export const HTTP_TIMEOUT_FAST = 3_000;
export const HTTP_TIMEOUT_SEARCH = 5_000;
export const HTTP_TIMEOUT_CONTEXT = 10_000;
export const HTTP_TIMEOUT_DEFAULT = 10_000;

function resolveUrls(rawUrl: string): { wsUrl: string; httpBase: string } {
  const url = new URL(rawUrl);
  switch (url.protocol) {
    case "ws:":
    case "wss:": {
      if (url.pathname === "/") url.pathname = "/ws";
      const httpProtocol = url.protocol === "wss:" ? "https:" : "http:";
      return { wsUrl: url.toString(), httpBase: `${httpProtocol}//${url.host}` };
    }
    case "http:":
    case "https:": {
      const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
      return { wsUrl: `${wsProtocol}//${url.host}/ws`, httpBase: `${url.protocol}//${url.host}` };
    }
    default:
      throw new Error(`Unsupported PSM_URL protocol: ${url.protocol}`);
  }
}

const resolvedUrls = resolveUrls(process.env.PSM_URL || `ws://127.0.0.1:${PSM_PORT}/ws`);

export const WS_URL = resolvedUrls.wsUrl;
export const HTTP_BASE = resolvedUrls.httpBase;

// WebSocket keepalive / reconnect
export const HB_INTERVAL = 15_000;
export const HB_TIMEOUT = 30_000;
export const RECONNECT_BASE = 3_000;
export const RECONNECT_MAX = 30_000;

// Notification cooldown (ms)
export const NOTIFY_COOLDOWN = 5_000;
