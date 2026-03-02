import type { SessionInfo, SessionTag } from "../types";
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
  includeId: boolean,
): string[] {
  const fields = [
    session.name || "",
    session.first_message || "",
    session.last_message || "",
    session.cwd || "",
  ];

  if (includeId) {
    fields.push(session.id || "");
  }

  return fields.map((field) => field.toLowerCase());
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
    const q = parsedQuery.remainder.trim().toLowerCase();
    if (!q) {
      return sessions;
    }

    return sessions.filter((session) => {
      const searchableFields = buildSearchableFields(session, includeId);
      return searchableFields.some((field) => field.includes(q));
    });
  }

  const remainderTerms = parsedQuery.remainderTokens.map((term) =>
    term.toLowerCase(),
  );

  return sessions.filter((session) => {
    const searchableFields = buildSearchableFields(session, includeId);

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
    result = filterSessionsBySearchQuery(result, searchQuery);
  }

  return result;
}
