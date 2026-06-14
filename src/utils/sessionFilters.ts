import type { SessionInfo, SessionTag } from "@/types";
import { getSessionSourceSlug } from "./session";
import { getSessionIdMatchKind, normalizeSessionIdQuery } from "./session";
import { parseQuotedQuery } from "./search";
import { pathsEqual } from "./path";

export type TimeRange = 'any' | '1h' | '24h' | '2d' | '7d' | '30d';

export type DateRange = {
  start: Date;
  end: Date;
};

interface SessionSearchOptions {
  includeId?: boolean;
}

interface FilterSessionsOptions {
  sessions: SessionInfo[];
  searchQuery?: string;
  projectFilter?: string | null;
  filterTagIds?: string[];
  sourceFilterSlugs?: string[];
  sessionTags?: SessionTag[];
  getDescendantIds?: (tagId: string) => string[];
  timeRange?: TimeRange;
  modelFilter?: string;
  dateRange?: DateRange;
}

function buildSearchableFields(
  session: SessionInfo,
): string[] {
  const fields = [
    session.name || "",
    session.first_message || "",
    session.last_message || "",
    session.cwd || "",
  ];

  return fields.map((field) => field.toLowerCase());
}

function matchesSessionIdPrefix(
  session: SessionInfo,
  query: string,
  includeId: boolean,
): boolean {
  if (!includeId || !query) {
    return false;
  }

  return getSessionIdMatchKind(session.id, query) !== null;
}

export function filterSessionsBySearchQuery(
  sessions: SessionInfo[],
  rawQuery: string,
  options: SessionSearchOptions = {},
): SessionInfo[] {
  const query = rawQuery.trim();
  if (!query) {
    return sessions;
  }

  const { includeId = false } = options;
  const parsedQuery = parseQuotedQuery(query);

  if (!parsedQuery.hasPhrases) {
    const q = normalizeSessionIdQuery(parsedQuery.remainder.trim());
    if (!q) {
      return sessions;
    }

    return sessions.filter((session) => {
      if (matchesSessionIdPrefix(session, q, includeId)) {
        return true;
      }

      const searchableFields = buildSearchableFields(session);
      return searchableFields.some((field) => field.includes(q));
    });
  }

  const remainderTerms = parsedQuery.remainderTokens.map((term) =>
    term.toLowerCase(),
  );

  return sessions.filter((session) => {
    if (matchesSessionIdPrefix(session, query, includeId)) {
      return true;
    }

    const searchableFields = buildSearchableFields(session);

    const phrasesMatched = parsedQuery.phrases.every((phrase) =>
      searchableFields.some((field) => field.includes(phrase.toLowerCase())),
    );

    if (!phrasesMatched) {
      return false;
    }

    return remainderTerms.every((term) =>
      searchableFields.some((field) => field.includes(term)),
    );
  });
}

export function filterSessionsByTagIds(
  sessions: SessionInfo[],
  sessionTags: SessionTag[],
  filterTagIds: string[],
  getDescendantIds: (tagId: string) => string[],
): SessionInfo[] {
  if (filterTagIds.length === 0) {
    return sessions;
  }

  const allFilterIds = new Set(filterTagIds);
  for (const id of filterTagIds) {
    for (const descId of getDescendantIds(id)) {
      allFilterIds.add(descId);
    }
  }

  const taggedIds = new Set(
    sessionTags
      .filter((sessionTag) => allFilterIds.has(sessionTag.tagId))
      .map((sessionTag) => sessionTag.sessionId),
  );

  return sessions.filter((session) => taggedIds.has(session.id));
}

export function filterSessionsBySourceSlugs(
  sessions: SessionInfo[],
  sourceFilterSlugs: string[],
): SessionInfo[] {
  if (sourceFilterSlugs.length === 0) {
    return sessions;
  }

  const allowed = new Set(sourceFilterSlugs);
  return sessions.filter((session) => {
    const slug = getSessionSourceSlug(session.path);
    return slug ? allowed.has(slug) : false;
  });
}

export function filterSessions({
  sessions,
  searchQuery,
  projectFilter,
  filterTagIds = [],
  sourceFilterSlugs = [],
  sessionTags = [],
  getDescendantIds = () => [],
  timeRange = 'any',
  modelFilter,
  dateRange,
}: FilterSessionsOptions): SessionInfo[] {
  let result = sessions;

  if (projectFilter) {
    result = result.filter((session) => pathsEqual(session.cwd, projectFilter));
  }

  if (filterTagIds.length > 0) {
    result = filterSessionsByTagIds(
      result,
      sessionTags,
      filterTagIds,
      getDescendantIds,
    );
  }

  if (sourceFilterSlugs.length > 0) {
    result = filterSessionsBySourceSlugs(result, sourceFilterSlugs);
  }

  if (modelFilter) {
    result = result.filter((session) => session.model === modelFilter);
  }

  if (dateRange) {
    const startTime = dateRange.start.getTime();
    const endTime = dateRange.end.getTime();
    result = result.filter((session) => {
      const modified = new Date(session.modified).getTime();
      return modified >= startTime && modified <= endTime;
    });
  } else if (timeRange !== 'any') {
    const now = Date.now();
    const timeLimits: Record<TimeRange, number> = {
      'any': 0,
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '2d': 2 * 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    const limit = timeLimits[timeRange];
    if (limit > 0) {
      result = result.filter((session) => {
        const modified = new Date(session.modified).getTime();
        return now - modified <= limit;
      });
    }
  }

  if (searchQuery?.trim()) {
    result = filterSessionsBySearchQuery(result, searchQuery, {
      includeId: true,
    });
  }

  return result;
}
