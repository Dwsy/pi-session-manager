import type {
  FullTextSearchHit,
  FullTextSearchResponse,
  Match,
  SearchResult,
  SessionInfo,
} from "@/types";
import { parseQuotedQuery } from "@/utils/search";
import { getCachedSettings } from "@/utils/settingsApi";
import { getSessionIdMatchKind } from "@/utils/session";
import { extractTextFromMessageContent, loadDatasetCache } from "./core";

function normalizeText(value: string | undefined): string {
  return (value || "").toLowerCase();
}

function parseTerms(query: string): string[] {
  const parsed = parseQuotedQuery(query);
  const terms = parsed.hasPhrases
    ? [...parsed.phrases, ...parsed.remainderTokens]
    : parsed.remainderTokens;
  return Array.from(
    new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean)),
  );
}

function countMatches(content: string, terms: string[]): number {
  const lower = content.toLowerCase();
  return terms.reduce((score, term) => {
    if (!term) return score;
    return score + Math.max(0, lower.split(term).length - 1);
  }, 0);
}

function matchesAll(content: string, terms: string[]): boolean {
  const lower = content.toLowerCase();
  return terms.every((term) => lower.includes(term));
}

function matchesAny(content: string, terms: string[]): boolean {
  const lower = content.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function matchGlob(
  path: string,
  globPattern: string | null | undefined,
): boolean {
  if (!globPattern?.trim()) return true;
  const pattern = globPattern.trim().replace(/\\/g, "/").toLowerCase();
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return normalizedPath.includes(pattern);
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(normalizedPath);
}

export async function searchBrowserDatasetSessions(
  query: string,
  sessions: SessionInfo[],
): Promise<SearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const allowedIds = new Set(sessions.map((session) => session.id));
  const cache = await loadDatasetCache();
  const matched: SearchResult[] = [];

  for (const remoteSession of cache.sessions) {
    const session = remoteSession.info;
    if (!allowedIds.has(session.id)) continue;

    const matches: Match[] = [];
    if (getSessionIdMatchKind(session.id, normalized)) {
      matches.push({
        entry_id: `${session.id}-session-id`,
        role: "session",
        snippet: session.id,
        timestamp: session.modified,
      });
    }
    if (normalizeText(session.name).includes(normalized)) {
      matches.push({
        entry_id: `${session.id}-name`,
        role: "name",
        snippet: session.name || "",
        timestamp: session.modified,
      });
    }
    if (normalizeText(session.first_message).includes(normalized)) {
      matches.push({
        entry_id: `${session.id}-first-message`,
        role: "user",
        snippet: session.first_message,
        timestamp: session.created,
      });
    }
    if (normalizeText(session.last_message).includes(normalized)) {
      matches.push({
        entry_id: `${session.id}-last-message`,
        role: "assistant",
        snippet: session.last_message,
        timestamp: session.modified,
      });
    }
    if (normalizeText(session.cwd).includes(normalized)) {
      matches.push({
        entry_id: `${session.id}-cwd`,
        role: "cwd",
        snippet: session.cwd,
        timestamp: session.modified,
      });
    }

    if (matches.length) {
      matched.push({
        session_id: session.id,
        session_path: session.path,
        session_name: session.name,
        first_message: session.first_message,
        matches,
        score: matches.length * 10,
      });
    }
  }

  return matched.sort((left, right) => right.score - left.score);
}

export async function fullTextSearchBrowserDataset(options: {
  query: string;
  roleFilter?: "all" | "user" | "assistant";
  globPattern?: string | null;
  projectPath?: string | null;
  page?: number;
  pageSize?: number;
  matchMode?: "any" | "all" | "phrase";
  sortOrder?: "score" | "newest" | "oldest";
}): Promise<FullTextSearchResponse> {
  const query = options.query.trim();
  if (!query) {
    return { hits: [], total_hits: 0, has_more: false };
  }

  const cache = await loadDatasetCache();
  const terms = parseTerms(query);
  if (!terms.length) {
    return { hits: [], total_hits: 0, has_more: false };
  }

  const includeThinking = getCachedSettings().search.includeThinkingInSearch;
  const hits: FullTextSearchHit[] = [];

  for (const session of cache.sessions) {
    if (!matchGlob(session.path, options.globPattern)) continue;
    if (options.projectPath && session.info.cwd !== options.projectPath)
      continue;

    for (const entry of session.entries) {
      if (entry.type !== "message" || !entry.message) continue;
      const role = entry.message.role;
      if (role !== "user" && role !== "assistant") continue;
      if (
        options.roleFilter &&
        options.roleFilter !== "all" &&
        role !== options.roleFilter
      ) {
        continue;
      }

      const extracted = extractTextFromMessageContent(entry.message.content);
      const candidates: Array<{
        source_type: "user" | "assistant" | "thinking";
        content: string;
      }> = [];

      if (extracted.text) {
        candidates.push({
          source_type: role === "user" ? "user" : "assistant",
          content: extracted.text,
        });
      }
      if (includeThinking && extracted.thinking) {
        candidates.push({
          source_type: "thinking",
          content: extracted.thinking,
        });
      }

      for (const candidate of candidates) {
        const matched =
          options.matchMode === "all"
            ? matchesAll(candidate.content, terms)
            : matchesAny(candidate.content, terms);
        if (!matched) continue;

        hits.push({
          session_id: session.info.id,
          session_path: session.path,
          session_name: session.info.name,
          entry_id: entry.id,
          role,
          source_type: candidate.source_type,
          content: candidate.content,
          timestamp: entry.timestamp,
          score: countMatches(candidate.content, terms),
          match_reason: "content",
        });
      }
    }
  }

  const sortOrder = options.sortOrder || "score";
  hits.sort((left, right) => {
    if (sortOrder === "newest") {
      return right.timestamp.localeCompare(left.timestamp);
    }
    if (sortOrder === "oldest") {
      return left.timestamp.localeCompare(right.timestamp);
    }
    return (
      right.score - left.score ||
      right.timestamp.localeCompare(left.timestamp) ||
      left.session_path.localeCompare(right.session_path)
    );
  });

  const page = Math.max(0, options.page || 0);
  const pageSize = Math.max(1, options.pageSize || 20);
  const start = page * pageSize;
  const paged = hits.slice(start, start + pageSize);
  return {
    hits: paged,
    total_hits: hits.length,
    has_more: start + pageSize < hits.length,
  };
}
