/**
 * LLM-callable retrieval tools for Pi Session Manager.
 *
 * The bridge orchestrates bounded PSM reads; it never owns a second search
 * index or downloads the full session catalog on the default retrieval path.
 */
import * as psm from "./psm-client.js";
import { getSessionId, notifyPsmTagChange } from "./connection-manager.js";
import type { SearchHit, SessionInfo, SessionWindowEntry, TagItem } from "./types.js";

const SEARCH_HIT_CONTENT_CHARS = 1_000;
const SEARCH_EXCERPT_CHARS = 240;
const DEFAULT_CONTEXT_CHARS = 16_000;
const MAX_CONTEXT_CHARS = 32_000;
const MAX_RECALL_OUTPUT_CHARS = 12_000;

function truncateText(text: string, maxChars: number, label = "truncated"): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) return normalized;
  const marker = `\n… [${label}]`;
  if (maxChars <= marker.length) return marker.slice(0, maxChars);
  return `${normalized.slice(0, maxChars - marker.length)}${marker}`;
}

function findTag(name: string, tags: TagItem[]): TagItem | null {
  const n = name.toLowerCase().trim();
  return tags.find((tag) => tag.name.toLowerCase() === n)
    || tags.find((tag) => tag.name.toLowerCase().includes(n))
    || null;
}

async function resolveSessionId(sessionId: string): Promise<SessionInfo | null> {
  const exact = await psm.getSessionById(sessionId);
  if (exact) return exact;

  // Compatibility for old 8-character IDs emitted by previous bridge builds.
  // The lookup remains bounded and rejects ambiguous prefixes.
  if (sessionId.length < 4) throw new Error("Session ID prefix is too short; provide the full session ID.");
  const page = await psm.scanSessionsPaginated({
    offset: 0,
    limit: 20,
    search_query: sessionId,
    sort_by: "modified_desc",
  });
  const matches = page.sessions.filter((session) => session.id.startsWith(sessionId));
  if (matches.length > 1) {
    throw new Error(`Ambiguous session ID prefix ${sessionId}; ${matches.length} sessions match. Use a full session ID.`);
  }
  return matches[0] || null;
}

function renderWindowEntry(entry: SessionWindowEntry, marker = "  "): string {
  const tool = entry.toolName ? ` (${entry.toolName}${entry.isError ? ", error" : ""})` : "";
  const truncation = entry.truncated ? " [truncated]" : "";
  return `${marker}${entry.role}${tool}: ${entry.text || "(no text)"}${truncation}`;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export const sessionListTool = {
  name: "session_list",
  label: "Session List",
  description: "List sessions through PSM's paginated catalog. Use for discovery/filtering; this never returns the full catalog by default.",
  parameters: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Optional lightweight session metadata search." },
      projectPath: { type: "string", description: "Optional exact project/cwd filter." },
      tag: { type: "string", description: "Optional tag name filter." },
      source: { type: "string", description: "Optional session source slug." },
      sortBy: {
        type: "string",
        enum: ["modified_desc", "modified_asc", "created_desc", "created_asc", "name_asc", "name_desc"],
        description: "Sort order. Defaults to modified_desc.",
      },
      offset: { type: "number", minimum: 0, description: "Result offset. Defaults to 0." },
      limit: { type: "number", minimum: 1, maximum: 50, description: "Page size. Defaults to 20." },
    },
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    try {
      await psm.ensureBridgeCapabilities(["paginated_sessions"]);
      const tagName = String(params.tag || "").trim();
      let filterTagIds: string[] | undefined;
      if (tagName) {
        await psm.ensureBridgeCapabilities(["tag_api"]);
        const tag = findTag(tagName, await psm.getAllTags());
        if (!tag) return { content: [{ type: "text", text: `Tag not found: ${tagName}` }], isError: true };
        filterTagIds = [tag.id];
      }

      const result = await psm.scanSessionsPaginated({
        offset: Math.max(0, Number(params.offset) || 0),
        limit: Math.min(Math.max(Number(params.limit) || 20, 1), 50),
        ...(String(params.query || "").trim() ? { search_query: String(params.query).trim() } : {}),
        ...(String(params.projectPath || "").trim() ? { project_filter: String(params.projectPath).trim() } : {}),
        ...(filterTagIds ? { filter_tag_ids: filterTagIds } : {}),
        ...(String(params.source || "").trim() ? { source_filter_slugs: [String(params.source).trim()] } : {}),
        sort_by: String(params.sortBy || "modified_desc"),
      });

      const lines = [
        `Sessions ${result.offset + 1}-${result.offset + result.sessions.length} of ${result.total}${result.has_more ? " (more available)" : ""}`,
        "",
        ...result.sessions.map((session, index) => [
          `${index + 1}. ${session.name || session.id.slice(0, 8)}`,
          `   sessionId: ${session.id}`,
          `   sessionPath: ${session.path}`,
          `   project: ${session.cwd}`,
          `   modified: ${session.modified} · messages: ${session.message_count}`,
        ].join("\n")),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Session list failed: ${error}` }], isError: true };
    }
  },
};

export const sessionSearchTool = {
  name: "session_search",
  label: "Session Search",
  description: "Search indexed Pi sessions and return bounded evidence with full session IDs/paths. Use for historical recall; skip for self-contained current-session tasks.",
  parameters: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query." },
      roleFilter: { type: "string", enum: ["all", "user", "assistant"], description: "Role filter. Defaults to all." },
      matchMode: { type: "string", enum: ["any", "all", "phrase", "smart"], description: "Match mode. Defaults to any; smart is opt-in until relevance benchmarks justify changing the default." },
      pageSize: { type: "number", minimum: 1, maximum: 20, description: "Top-K hits. Defaults to 8." },
      sortOrder: { type: "string", enum: ["relevance", "newest", "oldest"], description: "Sort order. Defaults to relevance." },
      includeTools: { type: "boolean", description: "Include indexed tool-result evidence. Defaults to true." },
      from: { type: "string", description: "Optional RFC3339 start time." },
      to: { type: "string", description: "Optional RFC3339 end time." },
      projectPath: { type: "string", description: "Optional exact session cwd/project path." },
    },
    required: ["query"],
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    const query = String(params.query || "").trim();
    if (!query) return { content: [{ type: "text", text: "query is required." }], isError: true };

    try {
      await psm.ensureBridgeCapabilities(["bounded_search_content", "tool_result_search"]);
      const from = String(params.from || "").trim();
      const to = String(params.to || "").trim();
      const projectPath = String(params.projectPath || params.project_path || "").trim();
      const includeTools = params.includeTools !== false;
      const fts = await psm.fullTextSearch({
        query,
        role_filter: String(params.roleFilter || "all"),
        match_mode: String(params.matchMode || "any"),
        page_size: Math.min(Math.max(Number(params.pageSize) || 8, 1), 20),
        sort_order: String(params.sortOrder || "relevance"),
        source_filter: "content_only",
        max_content_chars: SEARCH_HIT_CONTENT_CHARS,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(projectPath ? { project_path: projectPath } : {}),
      });

      const hits = (fts.hits || []).filter((hit) =>
        hit.source_type === "user" || hit.source_type === "assistant" || (includeTools && hit.source_type === "tool_result"),
      );
      if (hits.length === 0) return { content: [{ type: "text", text: `No matching messages found for: ${query}` }] };

      const lines = [
        `Session search results for: ${query}`,
        `Found ${hits.length} bounded hit(s)${fts.has_more ? " (more available)" : ""}`,
        "",
        ...hits.map((hit, index) => {
          const label = hit.session_name || hit.session_id.slice(0, 8);
          const excerpt = truncateText(hit.content.replace(/\s+/g, " "), SEARCH_EXCERPT_CHARS, "excerpt truncated");
          return [
            `${index + 1}. ${label} [${hit.session_id.slice(0, 8)}]`,
            `   sessionId: ${hit.session_id}`,
            `   sessionPath: ${hit.session_path}`,
            `   entryId: ${hit.entry_id} · source: ${hit.source_type}`,
            `   ${excerpt}`,
          ].join("\n");
        }),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Search failed: ${error}` }], isError: true };
    }
  },
};

export const sessionContextTool = {
  name: "session_context",
  label: "Session Context",
  description: "Return a bounded tail or anchored context window from one known session. Full session materialization is not used for Pi JSONL sessions.",
  parameters: {
    type: "object" as const,
    properties: {
      sessionId: { type: "string", description: "Full session ID from session_search/session_list. Legacy unique prefixes are accepted." },
      sessionPath: { type: "string", description: "Full session path." },
      anchorEntryId: { type: "string", description: "Optional entry ID to anchor the window." },
      before: { type: "number", minimum: 0, maximum: 20, description: "Entries before anchor; contributes to tail size without an anchor. Default 4." },
      after: { type: "number", minimum: 0, maximum: 20, description: "Entries after anchor; contributes to tail size without an anchor. Default 4." },
      includeTools: { type: "boolean", description: "Include toolResult entries. Defaults to false." },
      maxChars: { type: "number", minimum: 512, maximum: 32000, description: "Maximum text budget. Defaults to 16000." },
    },
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    const sessionId = String(params.sessionId || "").trim();
    let sessionPath = String(params.sessionPath || "").trim();
    if (!sessionId && !sessionPath) return { content: [{ type: "text", text: "sessionId or sessionPath required." }], isError: true };

    try {
      await psm.ensureBridgeCapabilities(["entry_window", "session_lookup"]);
      if (!sessionPath && sessionId) {
        const session = await resolveSessionId(sessionId);
        if (!session) return { content: [{ type: "text", text: `Session not found: ${sessionId}` }], isError: true };
        sessionPath = session.path;
      }
      const before = Math.min(Math.max(Number(params.before) || 4, 0), 20);
      const after = Math.min(Math.max(Number(params.after) || 4, 0), 20);
      const maxChars = Math.min(Math.max(Number(params.maxChars) || DEFAULT_CONTEXT_CHARS, 512), MAX_CONTEXT_CHARS);
      const anchorEntryId = String(params.anchorEntryId || "").trim();
      const window = await psm.getSessionEntryWindow({
        path: sessionPath,
        ...(anchorEntryId ? { anchorEntryId } : {}),
        before,
        after,
        includeTools: params.includeTools === true,
        maxChars,
      });

      if (anchorEntryId && !window.anchorFound) {
        return { content: [{ type: "text", text: `Anchor is no longer available in this session: ${anchorEntryId}` }], isError: true };
      }
      if (window.entries.length === 0) return { content: [{ type: "text", text: "No matching context entries found." }] };

      const lines = [
        `Session context${window.stale ? " [session changed while reading]" : ""}${window.truncated ? " [bounded]" : ""}`,
        `sessionPath: ${window.sessionPath}`,
        anchorEntryId ? `anchorEntryId: ${anchorEntryId}` : "tail window",
        "",
        ...window.entries.map((entry) => renderWindowEntry(entry, entry.id === anchorEntryId ? "->" : "  ")),
      ];
      return { content: [{ type: "text", text: truncateText(lines.join("\n"), maxChars + 2_000, "context output truncated") }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed: ${error}` }], isError: true };
    }
  },
};

export const sessionRecallTool = {
  name: "session_recall",
  label: "Session Recall",
  description: "Search past sessions and retrieve bounded anchored windows. Uses FTS hit paths directly and never scans the full session catalog.",
  parameters: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query." },
      maxResults: { type: "number", minimum: 1, maximum: 5, description: "Max recall windows. Default 3." },
      before: { type: "number", minimum: 0, maximum: 10, description: "Entries before hit. Default 2." },
      after: { type: "number", minimum: 0, maximum: 10, description: "Entries after hit. Default 2." },
    },
    required: ["query"],
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    const query = String(params.query || "").trim();
    if (!query) return { content: [{ type: "text", text: "query is required." }], isError: true };

    try {
      await psm.ensureBridgeCapabilities(["bounded_search_content", "tool_result_search", "entry_window"]);
      const maxResults = Math.max(1, Math.min(Number(params.maxResults) || 3, 5));
      const before = Math.min(Math.max(Number(params.before) || 2, 0), 10);
      const after = Math.min(Math.max(Number(params.after) || 2, 0), 10);
      const fts = await psm.fullTextSearch({
        query,
        page_size: maxResults * 3,
        source_filter: "content_only",
        max_content_chars: SEARCH_HIT_CONTENT_CHARS,
      });
      const hits = (fts.hits || []).filter((hit) => ["user", "assistant", "tool_result"].includes(hit.source_type)).slice(0, maxResults);
      if (hits.length === 0) return { content: [{ type: "text", text: `No matching context found for: ${query}` }] };

      const windowBudget = Math.max(2_000, Math.floor(MAX_RECALL_OUTPUT_CHARS / maxResults));
      const sections = await mapWithConcurrency<SearchHit, string>(hits, 2, async (hit, index) => {
        const matched = truncateText(hit.content.replace(/\s+/g, " "), SEARCH_EXCERPT_CHARS, "match truncated");
        const window = await psm.getSessionEntryWindow({
          path: hit.session_path,
          anchorEntryId: hit.entry_id,
          before,
          after,
          includeTools: true,
          maxChars: windowBudget,
        });
        const header = [
          `${index + 1}. ${hit.session_name || hit.session_id.slice(0, 8)}`,
          `sessionId: ${hit.session_id}`,
          `sessionPath: ${hit.session_path}`,
          `entryId: ${hit.entry_id} · source: ${hit.source_type}`,
          `matched: ${matched}`,
        ];
        if (!window.anchorFound) return [...header, "context: [stale anchor — no unrelated window returned]"].join("\n");
        const context = window.entries.map((entry) => renderWindowEntry(entry, entry.id === hit.entry_id ? "->" : "  ")).join("\n");
        return [...header, `context${window.stale ? " [session changed while reading]" : ""}:`, context].join("\n");
      });

      const output = [`Session recall for: ${query}`, "", ...sections].join("\n\n");
      return { content: [{ type: "text", text: truncateText(output, MAX_RECALL_OUTPUT_CHARS, "recall output truncated") }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Recall failed: ${error}` }], isError: true };
    }
  },
};

export const sessionTagTool = {
  name: "session_tag",
  label: "Session Tag Manager",
  description: "Inspect or change tags on the current session through PSM's tag API. set/remove mutate metadata only when explicitly requested.",
  parameters: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["list", "set", "remove"], description: "Action: list, set, or remove." },
      tag: { type: "string", description: "Tag name for set/remove." },
    },
    required: ["action"],
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    try {
      await psm.ensureBridgeCapabilities(["tag_api"]);
      const sessionId = getSessionId();
      const [allTags, allSessionTags] = await Promise.all([psm.getAllTags(), psm.getAllSessionTags()]);
      const assignedIds = new Set(allSessionTags.filter((item) => item.session_id === sessionId).map((item) => item.tag_id));
      const currentTags = allTags.filter((tag) => assignedIds.has(tag.id));

      if (params.action === "list") {
        const lines = [
          `Session Tags (ID: ${sessionId})`,
          `Active: ${currentTags.length > 0 ? currentTags.map((tag) => tag.name).join(", ") : "none"}`,
          "",
          "Available:",
          ...allTags.map((tag) => `  ${assignedIds.has(tag.id) ? "[x]" : "[ ]"} ${tag.name}`),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      const tagName = String(params.tag || "").trim();
      if (!tagName) return { content: [{ type: "text", text: `tag is required for ${String(params.action)}.` }], isError: true };

      if (params.action === "set") {
        let target = findTag(tagName, allTags);
        if (!target) target = await psm.createTag(tagName, "info");
        if (!assignedIds.has(target.id)) await psm.assignTag(sessionId, target.id);
        notifyPsmTagChange(sessionId, []);
        return { content: [{ type: "text", text: `Tag set: ${target.name}` }] };
      }

      if (params.action === "remove") {
        const target = findTag(tagName, allTags);
        if (!target) return { content: [{ type: "text", text: `Tag not found: ${tagName}` }], isError: true };
        if (assignedIds.has(target.id)) await psm.removeTagFromSession(sessionId, target.id);
        notifyPsmTagChange(sessionId, []);
        return { content: [{ type: "text", text: `Removed: ${target.name}` }] };
      }

      return { content: [{ type: "text", text: "Unknown action" }], isError: true };
    } catch (error) {
      return { content: [{ type: "text", text: `Tag operation failed: ${error}` }], isError: true };
    }
  },
};
