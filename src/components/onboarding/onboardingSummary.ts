import type { SessionInfo } from "@/types";
import { getPathBasename, getPathComparisonKey } from "@/utils/path";

export interface OnboardingLibrarySummary {
  sessionCount: number;
  projectCount: number;
  /** Creation timestamp of the oldest session, or null when nothing was scanned. */
  firstSessionAt: Date | null;
}

/**
 * Condenses the scanned library into the three numbers the welcome step shows, so a
 * first-time user immediately sees that the app already found their own work.
 */
export function summarizeSessionLibrary(
  sessions: SessionInfo[],
): OnboardingLibrarySummary {
  const projects = new Set<string>();
  let firstSessionAt: Date | null = null;

  for (const session of sessions) {
    const project = session.cwd?.trim();
    if (project) {
      projects.add(project);
    }

    const created = Date.parse(session.created);
    if (Number.isNaN(created)) continue;
    if (!firstSessionAt || created < firstSessionAt.getTime()) {
      firstSessionAt = new Date(created);
    }
  }

  return {
    sessionCount: sessions.length,
    projectCount: projects.size,
    firstSessionAt,
  };
}

export interface OnboardingProjectPreview {
  path: string;
  name: string;
  sessionCount: number;
}

/**
 * Busiest projects, used by the welcome step to preview the user's own data
 * instead of describing the app in the abstract. Ties keep scan order so the
 * preview stays stable between renders.
 */
export function topProjectsByActivity(
  sessions: SessionInfo[],
  limit: number,
): OnboardingProjectPreview[] {
  const byProject = new Map<string, OnboardingProjectPreview>();

  for (const session of sessions) {
    const path = session.cwd?.trim();
    if (!path) continue;

    const key = getPathComparisonKey(path);
    const existing = byProject.get(key);
    if (existing) {
      existing.sessionCount += 1;
      continue;
    }
    byProject.set(key, {
      path,
      name: getPathBasename(path),
      sessionCount: 1,
    });
  }

  return Array.from(byProject.values())
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, Math.max(0, limit));
}
