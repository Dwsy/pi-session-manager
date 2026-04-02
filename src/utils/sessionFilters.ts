import type { SessionInfo, SessionTag } from "../types";
import { getSessionIdMatchKind, normalizeSessionIdQuery } from "./session";
import { parseQuotedQuery } from "./search";

interface SessionSearchOptions {
  includeId?: boolean;
}

interface FilterSessionsOptions {
  sessions: SessionInfo[];
  searchQuery?: string;
  projectFilter?: string | null;
  filterTagIds?: string[];
  sessionTags?: SessionTag[];
  getDescendantIds?: (tagId: string) => string[];
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

export function filterSessions({
  sessions,
  searchQuery,
  projectFilter,
  filterTagIds = [],
  sessionTags = [],
  getDescendantIds = () => [],
}: FilterSessionsOptions): SessionInfo[] {
  let result = sessions;

  if (projectFilter) {
    result = result.filter((session) => session.cwd === projectFilter);
  }

  if (filterTagIds.length > 0) {
    result = filterSessionsByTagIds(
      result,
      sessionTags,
      filterTagIds,
      getDescendantIds,
    );
  }

  if (searchQuery?.trim()) {
    result = filterSessionsBySearchQuery(result, searchQuery, {
      includeId: true,
    });
  }

  return result;
}
