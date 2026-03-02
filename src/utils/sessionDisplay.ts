import type { TFunction } from "i18next";

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

  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return path;

  return ".../" + parts.slice(-2).join("/");
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
