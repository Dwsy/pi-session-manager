import { getPlatformDefaults, type TerminalType } from "@/components/settings/types";
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

function applyResumeTemplate(
  template: string,
  session: SessionInfo,
  piCommand: string,
): string {
  return template
    .replace(/\{cwd\}/g, session.cwd || "")
    .replace(/\{path\}/g, session.path)
    .replace(/\{pi\}/g, piCommand);
}

export function buildPiResumeCommand(
  session: SessionInfo,
  overrides: ResumeCommandOverrides = {},
): string {
  const settings = getCachedSettings();
  const template =
    overrides.resumeCommand ?? settings.terminal?.resumeCommand ?? "";
  const piCommand = overrides.piPath ?? settings.terminal?.piCommandPath ?? "pi";

  if (!template.trim()) {
    const baseCommand = `${piCommand} --session \"${session.path}\"`;
    return session.cwd
      ? `cd \"${session.cwd}\" && ${baseCommand}`
      : baseCommand;
  }

  const hasPlaceholders =
    template.includes("{cwd}") ||
    template.includes("{path}") ||
    template.includes("{pi}");

  if (template.includes("new-session") && !hasPlaceholders) {
    const sessionSuffix = session.id ? session.id.slice(0, 4) : "pi";
    const sessionName = `pi-${sessionSuffix}`;
    const nestedCommand = session.cwd
      ? `cd \"${session.cwd}\" && ${piCommand} --session \"${session.path}\"`
      : `${piCommand} --session \"${session.path}\"`;
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
  const piCommand = overrides.piPath ?? settings.terminal?.piCommandPath ?? "pi";

  if (!template.trim()) {
    const baseCommand = `${piCommand} --fork "${session.path}"`;
    return session.cwd
      ? `cd "${session.cwd}" && ${baseCommand}`
      : baseCommand;
  }

  const hasPlaceholders =
    template.includes("{cwd}") ||
    template.includes("{path}") ||
    template.includes("{pi}");

  if (template.includes("new-session") && !hasPlaceholders) {
    const sessionSuffix = session.id ? session.id.slice(0, 4) : "pi";
    const sessionName = `pi-${sessionSuffix}`;
    const nestedCommand = session.cwd
      ? `cd "${session.cwd}" && ${piCommand} --fork "${session.path}"`
      : `${piCommand} --fork "${session.path}"`;
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

  const result = await invoke<SessionConvertResult>("convert_session_format", {
    path: session.path,
    targetFormat: getFallbackExternalResumeTarget(),
    dryRun: true,
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

  const result = await invoke<SessionConvertResult>("convert_session_format", {
    path: session.path,
    targetFormat: target,
    dryRun: true,
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
  const piPath = overrides.piPath ?? settings.terminal?.piCommandPath ?? "pi";
  const resumeCommand =
    overrides.resumeCommand ?? settings.terminal?.resumeCommand ?? "";

  await invoke("open_session_in_terminal", {
    path: session.path,
    cwd: session.cwd,
    terminal: terminal === "custom" ? customCommand : terminal,
    piPath: piPath || null,
    resumeCommand: resumeCommand || null,
  });
}
