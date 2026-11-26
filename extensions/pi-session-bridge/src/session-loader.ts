/**
 * Project-level session discovery for pi-session-bridge TUI.
 *
 * Online: queries PSM's HTTP `scan_sessions` API (fast SQLite index).
 * Offline fallback: scans `~/.pi/agent/sessions/` JSONL headers directly so
 * `/kanban` works seamlessly even when the PSM desktop/HTTP server is closed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import * as psm from "./psm-client.js";
import type { SessionInfo } from "./types.js";

export interface ProjectSummary {
  cwd: string;
  name: string;
  shortPath: string;
  sessionCount: number;
  latestModified: number;
}

export function normalizeProjectPath(cwd: string | undefined): string {
  if (!cwd) return "";
  const trimmed = cwd.trim();
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "");
}

export function shortenHomePath(cwd: string): string {
  if (!cwd) return "~";
  const home = homedir();
  if (home && cwd === home) return "~";
  if (home && cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

export function projectDisplayName(cwd: string): string {
  const norm = normalizeProjectPath(cwd);
  if (!norm) return "Unknown";
  return basename(norm) || norm;
}

export function formatRelativeAge(isoOrMs: string | number, nowMs = Date.now()): string {
  const ts = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return "now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d`;
  return `${Math.floor(diffSec / (86400 * 30))}mo`;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  for (const part of content) {
    if (part && typeof part === "object") {
      const rec = part as Record<string, unknown>;
      if (rec.type === "text" && typeof rec.text === "string" && rec.text.trim()) {
        return rec.text.trim();
      }
    }
  }
  return "";
}

/** Lightweight local JSONL header/message scan used when PSM HTTP server is offline. */
export function scanLocalPiSessions(maxFiles = 300): SessionInfo[] {
  const root = join(homedir(), ".pi", "agent", "sessions");
  if (!existsSync(root)) return [];

  const candidates: Array<{ filePath: string; mtimeMs: number }> = [];
  try {
    for (const dirEntry of readdirSync(root, { withFileTypes: true })) {
      if (!dirEntry.isDirectory()) continue;
      const dirPath = join(root, dirEntry.name);
      try {
        for (const fileEntry of readdirSync(dirPath, { withFileTypes: true })) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith(".jsonl")) continue;
          const filePath = join(dirPath, fileEntry.name);
          try {
            const st = statSync(filePath);
            candidates.push({ filePath, mtimeMs: st.mtimeMs });
          } catch {
            // ignore unreadable file
          }
        }
      } catch {
        // ignore unreadable dir
      }
    }
  } catch {
    return [];
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const limited = candidates.slice(0, maxFiles);
  const results: SessionInfo[] = [];

  for (const { filePath, mtimeMs } of limited) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const lines = raw.split("\n");
      let id = "";
      let cwd = "";
      let created = "";
      let name: string | undefined;
      let firstMessage = "";
      let lastMessage = "";
      let lastMessageRole = "";
      let messageCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = typeof parsed.type === "string" ? parsed.type : "";
        if (type === "session") {
          if (typeof parsed.id === "string") id = parsed.id;
          if (typeof parsed.cwd === "string") cwd = parsed.cwd;
          if (typeof parsed.timestamp === "string") created = parsed.timestamp;
        } else if (type === "session_info" && typeof parsed.name === "string" && parsed.name.trim()) {
          name = parsed.name.trim();
        } else if (type === "message" && parsed.message && typeof parsed.message === "object") {
          const msg = parsed.message as Record<string, unknown>;
          const role = typeof msg.role === "string" ? msg.role : "";
          if (role === "user" || role === "assistant") {
            messageCount++;
            const text = extractTextFromContent(msg.content);
            if (text) {
              if (!firstMessage && role === "user") firstMessage = text.slice(0, 160);
              lastMessage = text.slice(0, 160);
              lastMessageRole = role;
            }
          }
        }
      }

      if (!id) continue;
      const modified = new Date(mtimeMs).toISOString();
      results.push({
        path: filePath,
        id,
        cwd,
        name,
        created: created || modified,
        modified,
        message_count: messageCount,
        first_message: firstMessage,
        last_message: lastMessage,
        last_message_role: lastMessageRole,
      });
    } catch {
      // ignore corrupted session file
    }
  }

  return results;
}

/**
 * Load all sessions for the Kanban board (online via PSM HTTP API, falling back
 * to local `~/.pi/agent/sessions/` scan) and ensure the active session is present.
 */
export async function loadBoardSessions(activeSession?: {
  id: string;
  cwd?: string;
  path?: string;
  name?: string;
}): Promise<{ sessions: SessionInfo[]; source: "psm" | "local" }> {
  let sessions: SessionInfo[] = [];
  let source: "psm" | "local" = "psm";

  try {
    const scanned = await psm.scanSessions();
    if (Array.isArray(scanned)) {
      sessions = scanned;
    }
  } catch {
    source = "local";
    sessions = scanLocalPiSessions();
  }

  if (activeSession?.id && !sessions.some((s) => s.id === activeSession.id)) {
    const nowIso = new Date().toISOString();
    sessions = [
      {
        id: activeSession.id,
        path: activeSession.path ?? "",
        cwd: activeSession.cwd ?? process.cwd(),
        name: activeSession.name,
        created: nowIso,
        modified: nowIso,
        message_count: 0,
        first_message: "(current session)",
        last_message: "",
        last_message_role: "",
      },
      ...sessions,
    ];
  }

  return { sessions, source };
}

/** Aggregate discovered projects sorted by latest activity descending. */
export function buildProjectSummaries(sessions: readonly SessionInfo[], currentCwd?: string): ProjectSummary[] {
  const byCwd = new Map<string, ProjectSummary>();
  const normCurrent = normalizeProjectPath(currentCwd);

  for (const session of sessions) {
    const cwd = normalizeProjectPath(session.cwd);
    if (!cwd) continue;
    const mod = Date.parse(session.modified) || 0;
    const existing = byCwd.get(cwd);
    if (existing) {
      existing.sessionCount += 1;
      if (mod > existing.latestModified) existing.latestModified = mod;
    } else {
      byCwd.set(cwd, {
        cwd,
        name: projectDisplayName(cwd),
        shortPath: shortenHomePath(cwd),
        sessionCount: 1,
        latestModified: mod,
      });
    }
  }

  if (normCurrent && !byCwd.has(normCurrent)) {
    byCwd.set(normCurrent, {
      cwd: normCurrent,
      name: projectDisplayName(normCurrent),
      shortPath: shortenHomePath(normCurrent),
      sessionCount: 0,
      latestModified: Date.now(),
    });
  }

  return [...byCwd.values()].sort((a, b) => {
    if (a.cwd === normCurrent && b.cwd !== normCurrent) return -1;
    if (b.cwd === normCurrent && a.cwd !== normCurrent) return 1;
    return b.latestModified - a.latestModified;
  });
}
