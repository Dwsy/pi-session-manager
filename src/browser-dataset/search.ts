import type {
  FullTextSearchHit,
  FullTextSearchResponse,
  FullTextSearchSourceFilter,
  Match,
  SearchResult,
  SessionEntry,
  SessionInfo,
} from "@/types";
import { parseQuotedQuery } from "@/utils/search";
import { getCachedSettings } from "@/utils/settingsApi";
import { getSessionIdMatchKind } from "@/utils/session";
import { extractTextFromMessageContent, loadDatasetCache } from "./core";

const SMART_PHRASE_MATCH_BOOST = 100_000;
const RECENT_DAY_BUCKETS = [7, 30, 180] as const;

interface SearchPlan {
  terms: string[];
  phrase: string | null;
  mode: "smart" | "any" | "all" | "phrase";
  prioritizePhrase: boolean;
}

interface MatchEvaluation {
  matched: boolean;
  phraseMatched: boolean;
}

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

function buildSearchPlan(
  query: string,
  mode: "smart" | "any" | "all" | "phrase" = "smart",
): SearchPlan {
  const parsed = parseQuotedQuery(query);
  const terms = parseTerms(query);
  const normalizedQuery = query.trim().toLowerCase();
  const phrase =
    parsed.hasPhrases && parsed.phrases.length === 1 && !parsed.remainderTokens.length
      ? parsed.phrases[0].trim().toLowerCase()
      : parsed.remainderTokens.length > 1
        ? parsed.remainderTokens.join(" ").toLowerCase()
        : normalizedQuery || null;

  return {
    terms,
    phrase,
    mode,
    prioritizePhrase:
      mode === "smart" && !parsed.hasPhrases && parsed.remainderTokens.length > 1,
  };
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

function evaluateMatch(content: string, plan: SearchPlan): MatchEvaluation {
  const lower = content.toLowerCase();
  const phraseMatched = Boolean(plan.phrase && lower.includes(plan.phrase));

  if (plan.mode === "phrase") {
    return { matched: phraseMatched, phraseMatched };
  }
  if (plan.mode === "all") {
    return { matched: matchesAll(content, plan.terms), phraseMatched };
  }
  if (plan.mode === "any") {
    return { matched: matchesAny(content, plan.terms), phraseMatched };
  }
  if (plan.prioritizePhrase && phraseMatched) {
    return { matched: true, phraseMatched: true };
  }

  return { matched: matchesAny(content, plan.terms), phraseMatched };
}

function parseTimeMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function isTimestampInScope(
  timestamp: string,
  fromMs: number | null,
  toMs: number | null,
): boolean {
  const timestampMs = Date.parse(timestamp);
  if (Number.isNaN(timestampMs)) {
    return false;
  }
  if (fromMs !== null && timestampMs < fromMs) {
    return false;
  }
  if (toMs !== null && timestampMs > toMs) {
    return false;
  }
  return true;
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

interface ResolvedLabel {
  text: string;
  labeledAt: string;
}

function resolveLatestLabels(entries: SessionEntry[]): Map<string, ResolvedLabel> {
  const labels = new Map<string, ResolvedLabel>();

  for (const entry of entries) {
    if (entry.type !== "label" || typeof entry.targetId !== "string" || !entry.targetId) {
      continue;
    }

    const label = typeof entry.label === "string" ? entry.label : "";
    if (label.trim()) {
      labels.set(entry.targetId, {
        text: label,
        labeledAt: entry.timestamp,
      });
      continue;
    }

    labels.delete(entry.targetId);
  }

  return labels;
}

function sourcePrecedence(sourceType: FullTextSearchHit["source_type"]): number {
  switch (sourceType) {
    case "label":
      return 0;
    case "user":
      return 1;
    case "assistant":
      return 2;
    default:
      return 3;
  }
}

function chooseWinningHit(
  existing: FullTextSearchHit | undefined,
  candidate: FullTextSearchHit,
): FullTextSearchHit {
  if (!existing) {
    return candidate;
  }

  const precedenceDiff = sourcePrecedence(candidate.source_type) - sourcePrecedence(existing.source_type);
  if (precedenceDiff < 0) {
    return candidate;
  }
  if (precedenceDiff > 0) {
    return existing;
  }
  if (candidate.score > existing.score) {
    return candidate;
  }
  if (candidate.score < existing.score) {
    return existing;
  }
  if (candidate.timestamp > existing.timestamp) {
    return candidate;
  }

  return existing;
}

function sortFullTextHits(
  hits: FullTextSearchHit[],
  sortOrder: "score" | "newest" | "oldest",
): FullTextSearchHit[] {
  return [...hits].sort((left, right) => {
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
}

function sortRecentPriorityHits(hits: FullTextSearchHit[]): FullTextSearchHit[] {
  const now = Date.now();
  const buckets: FullTextSearchHit[][] = [[], [], [], []];

  for (const hit of hits) {
    const timestampMs = Date.parse(hit.timestamp);
    const ageDays = Number.isNaN(timestampMs)
      ? Number.POSITIVE_INFINITY
      : (now - timestampMs) / 86_400_000;

    if (ageDays <= RECENT_DAY_BUCKETS[0]) {
      buckets[0].push(hit);
    } else if (ageDays <= RECENT_DAY_BUCKETS[1]) {
      buckets[1].push(hit);
    } else if (ageDays <= RECENT_DAY_BUCKETS[2]) {
      buckets[2].push(hit);
    } else {
      buckets[3].push(hit);
    }
  }

  return buckets.flatMap((bucket) => sortFullTextHits(bucket, "newest"));
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
  sourceFilter?: FullTextSearchSourceFilter;
  globPattern?: string | null;
  projectPath?: string | null;
  page?: number;
  pageSize?: number;
  matchMode?: "smart" | "any" | "all" | "phrase";
  sortOrder?: "score" | "newest" | "oldest";
  from?: string | null;
  to?: string | null;
}): Promise<FullTextSearchResponse> {
  const query = options.query.trim();
  const sourceFilter = options.sourceFilter || "all";
  const isLabelsBrowseMode = sourceFilter === "labels_only" && !query;
  const matchMode = options.matchMode || "smart";
  const sortOrder = options.sortOrder || "newest";
  const searchPlan = buildSearchPlan(query, matchMode);
  const fromMs = parseTimeMs(options.from);
  const toMs = parseTimeMs(options.to);

  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    throw new Error("from must be earlier than or equal to to");
  }

  if (!query && !isLabelsBrowseMode) {
    return { hits: [], total_hits: 0, has_more: false };
  }

  if (!searchPlan.terms.length && !isLabelsBrowseMode) {
    return { hits: [], total_hits: 0, has_more: false };
  }

  const includeThinking = getCachedSettings().search.includeThinkingInSearch;
  const includeSessionIdMatches = sourceFilter === "all";
  const includeLabelHits = sourceFilter !== "content_only";
  const includeContentHits = sourceFilter !== "labels_only";
  const cache = await loadDatasetCache();
  const idHits: FullTextSearchHit[] = [];
  const hits: FullTextSearchHit[] = [];

  for (const session of cache.sessions) {
    if (!matchGlob(session.path, options.globPattern)) continue;
    if (options.projectPath && session.info.cwd !== options.projectPath) {
      continue;
    }

    if (includeSessionIdMatches) {
      const sessionIdMatchKind = getSessionIdMatchKind(session.info.id, query);
      if (sessionIdMatchKind && isTimestampInScope(session.info.modified, fromMs, toMs)) {
        const preview =
          session.info.last_message ||
          session.info.first_message ||
          session.info.name ||
          session.info.cwd;
        const role =
          session.info.last_message_role === "user" ? "user" : "assistant";
        if (!options.roleFilter || options.roleFilter === "all" || role === options.roleFilter) {
          idHits.push({
            session_id: session.info.id,
            session_path: session.path,
            session_name: session.info.name,
            entry_id: "",
            role,
            source_type: role,
            content: preview,
            timestamp: session.info.modified,
            score: sessionIdMatchKind === "exact" ? 1_000_000 : 999_000,
            match_reason:
              sessionIdMatchKind === "exact" ? "session_id_exact" : "session_id_prefix",
          });
        }
      }
    }

    const bestHitsByEntryId = new Map<string, FullTextSearchHit>();
    const entriesById = new Map(session.entries.map((entry) => [entry.id, entry]));

    if (includeLabelHits) {
      const labelsByTargetId = resolveLatestLabels(session.entries);

      for (const [targetId, resolvedLabel] of labelsByTargetId) {
        const targetEntry = entriesById.get(targetId);
        if (targetEntry?.type !== "message" || !targetEntry.message) {
          continue;
        }
        if (!isTimestampInScope(resolvedLabel.labeledAt, fromMs, toMs)) {
          continue;
        }

        const role = targetEntry.message.role;
        if (role !== "user" && role !== "assistant") {
          continue;
        }
        if (options.roleFilter && options.roleFilter !== "all" && role !== options.roleFilter) {
          continue;
        }
        if (!isLabelsBrowseMode) {
          const evaluation = evaluateMatch(resolvedLabel.text, searchPlan);
          if (!evaluation.matched) {
            continue;
          }
        }

        const evaluation = isLabelsBrowseMode
          ? { phraseMatched: false }
          : evaluateMatch(resolvedLabel.text, searchPlan);
        const candidate: FullTextSearchHit = {
          session_id: session.info.id,
          session_path: session.path,
          session_name: session.info.name,
          entry_id: targetEntry.id,
          role,
          source_type: "label",
          content: resolvedLabel.text,
          timestamp: resolvedLabel.labeledAt,
          score:
            10_000 +
            (isLabelsBrowseMode ? 0 : countMatches(resolvedLabel.text, searchPlan.terms)) +
            (evaluation.phraseMatched ? SMART_PHRASE_MATCH_BOOST : 0),
          match_reason: "label",
        };
        bestHitsByEntryId.set(
          targetEntry.id,
          chooseWinningHit(bestHitsByEntryId.get(targetEntry.id), candidate),
        );
      }
    }

    if (includeContentHits) {
      for (const entry of session.entries) {
        if (entry.type !== "message" || !entry.message) continue;
        if (!isTimestampInScope(entry.timestamp, fromMs, toMs)) continue;
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
          const evaluation = evaluateMatch(candidate.content, searchPlan);
          if (!evaluation.matched) continue;

          const fullTextHit: FullTextSearchHit = {
            session_id: session.info.id,
            session_path: session.path,
            session_name: session.info.name,
            entry_id: entry.id,
            role,
            source_type: candidate.source_type,
            content: candidate.content,
            timestamp: entry.timestamp,
            score:
              countMatches(candidate.content, searchPlan.terms) +
              (evaluation.phraseMatched ? SMART_PHRASE_MATCH_BOOST : 0),
            match_reason: "content",
          };
          bestHitsByEntryId.set(
            entry.id,
            chooseWinningHit(bestHitsByEntryId.get(entry.id), fullTextHit),
          );
        }
      }
    }

    hits.push(...bestHitsByEntryId.values());
  }

  const orderedMessageHits =
    sortOrder === "newest"
      ? sortRecentPriorityHits(hits)
      : sortFullTextHits(hits, sortOrder);
  const combinedHits = [...sortFullTextHits(idHits, "score"), ...orderedMessageHits];

  const page = Math.max(0, options.page || 0);
  const pageSize = Math.max(1, options.pageSize || 20);
  const start = page * pageSize;
  const paged = combinedHits.slice(start, start + pageSize);
  return {
    hits: paged,
    total_hits: combinedHits.length,
    has_more: start + pageSize < combinedHits.length,
  };
}
