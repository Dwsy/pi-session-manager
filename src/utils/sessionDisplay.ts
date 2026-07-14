import type { TFunction } from "i18next";

/** Match Pi skill-invocation first messages like:
 * `<skill name="work-pdca-loop" location=".../SKILL.md">`
 */
const SKILL_INVOCATION_RE =
  /^\s*<skill\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>/i;

/**
 * If text is a skill call payload, return `SKILL:<name>`; otherwise null.
 */
export function formatSkillInvocationTitle(text: string): string | null {
  const match = text.match(SKILL_INVOCATION_RE);
  if (!match?.[1]) return null;
  const skillName = match[1].trim();
  if (!skillName) return null;
  return `SKILL:${skillName}`;
}

/**
 * Session list / card title: explicit name, else first message, with skill-call pretty format.
 */
export function getSessionListDisplayName(
  session: { name?: string | null; first_message?: string | null },
  untitled: string,
): string {
  const raw = (session.name || session.first_message || "").trim();
  if (!raw) return untitled;
  return formatSkillInvocationTitle(raw) ?? raw;
}

export function formatShortTime(date: string, t: TFunction): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("common.time.justNow");
  if (diffMins < 60) return t("common.time.minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("common.time.hoursAgo", { count: diffHours });
  if (diffDays < 30) return t("common.time.daysAgo", { count: diffDays });
  return t("common.time.monthsAgo", { count: Math.floor(diffDays / 30) });
}

export function formatDirectory(path: string): string {
  if (!path) return "";
  return getDirectoryName(path);
}

export function getDirectoryName(cwd: string): string {
  if (!cwd || cwd === "Unknown") {
    return cwd || "Unknown Directory";
  }

  const parts = cwd.split(/[\\/]/);
  const lastPart = parts[parts.length - 1];

  if (lastPart && lastPart.length > 0) {
    return lastPart;
  }

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]} / ${parts[parts.length - 1]}`;
  }

  return cwd;
}
