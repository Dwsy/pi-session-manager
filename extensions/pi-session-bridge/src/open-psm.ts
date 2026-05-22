import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HTTP_BASE } from "./config.js";

const execFileAsync = promisify(execFile);

export type PsmMode = "cli" | "desktop" | "unknown";

export function buildWebSessionUrl(sessionId: string): string {
  return `${HTTP_BASE}/#/sessions/${encodeURIComponent(sessionId)}`;
}

export function buildDesktopSessionUrl(sessionId: string): string {
  return `pi-session://sessions/${encodeURIComponent(sessionId)}`;
}

export function shouldForceWeb(args: string): boolean {
  return args.trim().split(/\s+/).some((part) => part.toLowerCase() === "web");
}

export async function detectPsmMode(): Promise<PsmMode> {
  try {
    const response = await fetch(`${HTTP_BASE}/health`);
    if (!response.ok) return "unknown";
    const body = await response.json() as { mode?: string };
    return body.mode === "cli" ? "cli" : "unknown";
  } catch {
    return "unknown";
  }
}

export async function openSystemUrl(url: string): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("open", [url]);
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/C", "start", "", url]);
    return;
  }
  await execFileAsync("xdg-open", [url]);
}

export async function openPsmSession(sessionId: string, args: string): Promise<{ url: string; mode: PsmMode | "web" }> {
  if (shouldForceWeb(args)) {
    const url = buildWebSessionUrl(sessionId);
    await openSystemUrl(url);
    return { url, mode: "web" };
  }

  const mode = await detectPsmMode();
  const url = mode === "cli" ? buildWebSessionUrl(sessionId) : buildDesktopSessionUrl(sessionId);
  await openSystemUrl(url);
  return { url, mode };
}
