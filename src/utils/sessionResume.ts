import { getPlatformDefaults, type TerminalType } from "@/components/settings/types";
import { detectPlatform } from "@/components/settings/types";
import { invoke, isTauri } from "@/transport";
import type {
  SessionConvertResult,
  SessionConvertTarget,
  SessionInfo,
} from "@/types";
import { getCachedSettings } from "@/utils/settingsApi";
import { getSessionSourceSlug } from "@/utils/session";

export interface ResumeCommandOverrides {
  piPath?: string;
  resumeCommand?: string;
}

export interface OpenSessionInTerminalOverrides extends ResumeCommandOverrides {
  terminal?: TerminalType | string;
  customCommand?: string;
}

/**
 * Build a `cd <cwd>` prefix that works in the user's default shell. The emitted
 * resume command is either copied to the clipboard or passed to the backend
 * `open_session_in_terminal` (which runs it under cmd.exe / PowerShell on
 * Windows, sh on Unix). Windows PowerShell 5.1 does NOT support `&&`, so on
 * Windows we emit cmd-compatible `cd /d "X" & pi ...` (`&` runs unconditionally
 * and is understood by both cmd and modern PowerShell).
 */
function toWslLinuxPath(value: string, distro: string): string {
  if (!value) return value;
  const normalized = value.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  for (const host of ["//wsl.localhost/", "//wsl$/"]) {
    const prefix = `${host}${distro}/`;
    if (lower.startsWith(prefix.toLowerCase())) {
      return `/${normalized.slice(prefix.length)}`;
    }
  }
  return normalized.startsWith("/") ? normalized : value;
}

function isWslRuntime(): boolean {
  const settings = getCachedSettings();
  return (
    detectPlatform() === "windows" &&
    settings.session?.runtimeEnvironment === "wsl"
  );
}

function runtimePath(value: string): string {
  const settings = getCachedSettings();
  if (isWslRuntime() && settings.session?.wslDistro) {
    return toWslLinuxPath(value, settings.session.wslDistro);
  }
  return value;
}

export function buildChangeDirAndRun(cwd: string, cmd: string): string {
  if (!cwd) return cmd;
  const settings = getCachedSettings();
  if (detectPlatform() === "windows") {
    if (settings.session?.runtimeEnvironment === "wsl") {
      return `cd "${runtimePath(cwd)}" && ${cmd}`;
    }
    // cmd.exe syntax; PowerShell also accepts `cd` (alias for Set-Location) and
    // `&` as a statement separator. `/d` lets cmd switch drives.
    return `cd /d "${cwd}" & ${cmd}`;
  }
  return `cd "${cwd}" && ${cmd}`;
}

function applyResumeTemplate(
  template: string,
  session: SessionInfo,
  piCommand: string,
): string {
  return template
    .replace(/\{cwd\}/g, runtimePath(session.cwd || ""))
    .replace(/\{path\}/g, runtimePath(session.path))
    .replace(/\{pi\}/g, piCommand);
}

/**
 * Build the resume command for an OMP session. OMP is a Pi fork that resumes
 * via the `omp` binary with `--session <path>`.
 */
export function buildOmpResumeCommand(
  session: SessionInfo,
  overrides: ResumeCommandOverrides = {},
): string {
  const settings = getCachedSettings();
  const template =
    overrides.resumeCommand ?? settings.terminal?.resumeCommand ?? "";
  const ompCommand = "omp";

  if (!template.trim()) {
    const baseCommand = `${ompCommand} --session "${runtimePath(session.path)}"`;
    return buildChangeDirAndRun(runtimePath(session.cwd || ""), baseCommand);
  }

  return applyResumeTemplate(template, session, ompCommand);
}

export function buildPiResumeCommand(
  session: SessionInfo,
  overrides: ResumeCommandOverrides = {},
): string {
  const settings = getCachedSettings();
  const template =
    overrides.resumeCommand ?? settings.terminal?.resumeCommand ?? "";
  const piCommand =
    overrides.piPath ??
    (isWslRuntime() ? "pi" : settings.terminal?.piCommandPath ?? "pi");

  if (!template.trim()) {
    const baseCommand = `${piCommand} --session \"${runtimePath(session.path)}\"`;
    return buildChangeDirAndRun(runtimePath(session.cwd || ""), baseCommand);
  }

  const hasPlaceholders =
    template.includes("{cwd}") ||
    template.includes("{path}") ||
    template.includes("{pi}");

  if (template.includes("new-session") && !hasPlaceholders) {
    const sessionSuffix = session.id ? session.id.slice(0, 4) : "pi";
    const sessionName = `pi-${sessionSuffix}`;
    const nestedCommand = session.cwd
      ? buildChangeDirAndRun(runtimePath(session.cwd), `${piCommand} --session \"${runtimePath(session.path)}\"`)
      : `${piCommand} --session \"${runtimePath(session.path)}\"`;
    return `${template.replace(/-s\\s+pi\\b/, `-s ${sessionName}`)} '${nestedCommand}'`;
  }

  return applyResumeTemplate(template, session, piCommand);
}
export function buildPiForkCommand(
  session: SessionInfo,
  overrides: ResumeCommandOverrides = {},
): string {
  const settings = getCachedSettings();
  const template =
    overrides.resumeCommand ?? settings.terminal?.resumeCommand ?? "";
  const piCommand =
    overrides.piPath ??
    (isWslRuntime() ? "pi" : settings.terminal?.piCommandPath ?? "pi");

  if (!template.trim()) {
    const baseCommand = `${piCommand} --fork "${runtimePath(session.path)}"`;
    return buildChangeDirAndRun(runtimePath(session.cwd || ""), baseCommand);
  }

  const hasPlaceholders =
    template.includes("{cwd}") ||
    template.includes("{path}") ||
    template.includes("{pi}");

  if (template.includes("new-session") && !hasPlaceholders) {
    const sessionSuffix = session.id ? session.id.slice(0, 4) : "pi";
    const sessionName = `pi-${sessionSuffix}`;
    const nestedCommand = session.cwd
      ? buildChangeDirAndRun(runtimePath(session.cwd), `${piCommand} --fork "${runtimePath(session.path)}"`)
      : `${piCommand} --fork "${runtimePath(session.path)}"`;
    return `${template.replace(/-s\\s+pi\b/, `-s ${sessionName}`)} '${nestedCommand}'`;
  }

  return applyResumeTemplate(template, session, piCommand);
}


export function getConfiguredExternalResumeTarget():
  | SessionConvertTarget
  | null {
  const settings = getCachedSettings();
  const promptEnabled =
    settings.session?.externalResumePromptEnabled !== false;
  if (promptEnabled) {
    return null;
  }
  return settings.session?.defaultExternalResumeTarget || "pi";
}

export function getFallbackExternalResumeTarget(): SessionConvertTarget {
  return getConfiguredExternalResumeTarget() ?? "pi";
}

export async function buildCopyResumeCommand(
  session: SessionInfo,
  overrides: ResumeCommandOverrides = {},
): Promise<string> {
  const sourceSlug = getSessionSourceSlug(session.path);
  if (!sourceSlug || sourceSlug === "pi") {
    return buildPiResumeCommand(session, overrides);
  }
  if (sourceSlug === "omp") {
    return buildOmpResumeCommand(session, overrides);
  }

  const result = await invoke<SessionConvertResult>("convert_session_format", {
    path: session.path,
    targetFormat: getFallbackExternalResumeTarget(),
    dryRun: false,
    force: false,
  });
  return result.resume_command || "";
}

export async function buildCopyResumeCommandForTarget(
  session: SessionInfo,
  target: SessionConvertTarget,
  overrides: ResumeCommandOverrides = {},
): Promise<string> {
  const sourceSlug = getSessionSourceSlug(session.path);
  if ((!sourceSlug || sourceSlug === "pi") && target === "pi") {
    return buildPiResumeCommand(session, overrides);
  }
  if (sourceSlug === "omp" && target === "omp") {
    return buildOmpResumeCommand(session, overrides);
  }

  const result = await invoke<SessionConvertResult>("convert_session_format", {
    path: session.path,
    targetFormat: target,
    dryRun: false,
    force: false,
  });
  return result.resume_command || "";
}

export async function openSessionInTerminalDirect(
  session: SessionInfo,
  overrides: OpenSessionInTerminalOverrides = {},
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const settings = getCachedSettings();
  const terminal =
    settings.terminal?.defaultTerminal ||
    overrides.terminal ||
    getPlatformDefaults().defaultTerminal;
  const customCommand =
    settings.terminal?.customTerminalCommand || overrides.customCommand || "";
  const sourceSlug = getSessionSourceSlug(session.path);
  const piPath =
    overrides.piPath ??
    (isWslRuntime() ? "pi" : settings.terminal?.piCommandPath ?? "pi");
  const resumeCommand =
    overrides.resumeCommand ?? settings.terminal?.resumeCommand ?? "";
  const isOmpSession = sourceSlug === "omp";

  await invoke("open_session_in_terminal", {
    path: session.path,
    cwd: session.cwd,
    terminal: terminal === "custom" ? customCommand : terminal,
    piPath: isOmpSession ? "omp" : piPath || null,
    resumeCommand: isOmpSession
      ? buildOmpResumeCommand(session, { resumeCommand })
      : resumeCommand || null,
  });
}
