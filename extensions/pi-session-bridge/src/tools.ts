/**
 * Tools — LLM-callable tools registered via pi.registerTool().
 *
 * session_search:  Full-text search across indexed sessions.
 * session_context: Fetch dialogue context from a specific session.
 * session_recall:  Search + retrieve surrounding context.
 * session_tag:     Tag management via PSM JSON files.
 */

import * as psm from "./psm-client.js";
import * as kanbanStore from "./kanban-store.js";
import { getSessionId } from "./connection-manager.js";
import { notifyPsmTagChange } from "./connection-manager.js";
import type { FullTextSearchResponse, SessionEntry, SessionInfo, TagItem } from "./types.js";

// ── Session cache (shared across tools) ───────────────

let cachedSessions: SessionInfo[] | null = null;

async function getSessions(): Promise<SessionInfo[]> {
  if (cachedSessions) return cachedSessions;
  try {
    cachedSessions = await psm.scanSessions();
  } catch {
    cachedSessions = [];
  }
  return cachedSessions!;
}

async function getEntriesByPath(sessionPath: string): Promise<SessionEntry[]> {
  const entries = await psm.getSessionEntries(sessionPath);
  return entries.filter(
    (e) => e.type === "message" && (e.message?.role === "user" || e.message?.role === "assistant"),
  );
}

async function getEntriesForSession(sessionId: string): Promise<SessionEntry[]> {
  const sessions = await getSessions();
  const session = sessions.find((s) => s.id === sessionId || s.id.startsWith(sessionId));
  if (!session?.path) return [];
  return getEntriesByPath(session.path);
}

// ── Tool: session_search ──────────────────────────────

export const sessionSearchTool = {
  name: "session_search",
  label: "Session Search",
  description:
    "Search across all indexed Pi sessions. Use this to find relevant past conversations.",
  parameters: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query to run against indexed sessions." },
      roleFilter: {
        type: "string",
        enum: ["all", "user", "assistant"],
        description: "Optional role filter. Defaults to all.",
      },
      matchMode: {
        type: "string",
        enum: ["any", "all", "phrase"],
        description: "Match mode. Defaults to any.",
      },
      pageSize: {
        type: "number",
        minimum: 1,
        maximum: 20,
        description: "Max hits to return. Defaults to 8.",
      },
      sortOrder: {
        type: "string",
        enum: ["relevance", "newest", "oldest"],
        description: "Sort order. Defaults to relevance.",
      },
      from: {
        type: "string",
        description: "Optional start time, RFC3339 format, e.g. 2026-05-01T00:00:00Z.",
      },
      to: {
        type: "string",
        description: "Optional end time, RFC3339 format, e.g. 2026-05-31T23:59:59Z.",
      },
      projectPath: {
        type: "string",
        description: "Optional project path filter. Matches session cwd exactly (path), e.g. /Users/me/projects/demo.",
      },
    },
    required: ["query"],
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    const query = String(params.query || "").trim();
    if (!query) return { content: [{ type: "text", text: "query is required." }], isError: true };

    try {
      const fromRaw = String(params.from || "").trim();
      const toRaw = String(params.to || "").trim();
      const projectPathRaw = String((params as Record<string, unknown>).projectPath || params.project_path || "").trim();

      const fts = await psm.fullTextSearch({
        query,
        role_filter: String(params.roleFilter || "all"),
        match_mode: String(params.matchMode || "any"),
        page_size: Math.min(Math.max(Number(params.pageSize) || 8, 1), 20),
        sort_order: String(params.sortOrder || "relevance"),
        source_filter: "content_only",
        ...(fromRaw ? { from: fromRaw } : {}),
        ...(toRaw ? { to: toRaw } : {}),
        ...(projectPathRaw ? { project_path: projectPathRaw } : {}),
      });

      const hits = (fts.hits || []).filter(
        (h) => h.source_type === "user" || h.source_type === "assistant",
      );

      if (hits.length === 0) {
        return { content: [{ type: "text", text: `No matching messages found for: ${query}` }] };
      }

      const lines = [
        `Session search results for: ${query}`,
        `Found ${hits.length} hit(s)${fts.has_more ? " (truncated)" : ""}`,
        "",
        ...hits.map((hit, i) => {
          const shortId = hit.session_id.slice(0, 8);
          const label = hit.session_name || shortId;
          const excerpt = hit.content.replace(/\s+/g, " ").trim().slice(0, 200);
          const ellipsis = hit.content.length > 200 ? "..." : "";
          return `${i + 1}. ${label} [${shortId}]\n   ${excerpt}${ellipsis}`;
        }),
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Search failed: ${err}` }], isError: true };
    }
  },
};

// ── Tool: session_context ─────────────────────────────

export const sessionContextTool = {
  name: "session_context",
  label: "Session Context",
  description: "Fetch message context from a specific session.",
  parameters: {
    type: "object" as const,
    properties: {
      sessionId: { type: "string", description: "Session ID from search results." },
      sessionPath: { type: "string", description: "Full session path." },
      before: { type: "number", description: "Entries before target. Default: 4." },
      after: { type: "number", description: "Entries after target. Default: 4." },
    },
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    const sid = String(params.sessionId || "");
    const spath = String(params.sessionPath || "");

    if (!sid && !spath) {
      return { content: [{ type: "text", text: "sessionId or sessionPath required." }], isError: true };
    }

    try {
      let entries: SessionEntry[] = [];
      if (sid) entries = await getEntriesForSession(sid);
      if (entries.length === 0 && spath) entries = await getEntriesByPath(spath);

      if (entries.length === 0) {
        return { content: [{ type: "text", text: "No dialogue entries found." }] };
      }

      const before = Math.min(Math.max(Number(params.before) || 4, 0), 20);
      const after = Math.min(Math.max(Number(params.after) || 4, 0), 20);
      const start = Math.max(entries.length - (before + after + 1), 0);
      const window = entries.slice(start);

      const lines = [
        `Session context (${entries.length} entries)`,
        "",
        ...window.map((entry, i) => {
          const role = entry.message?.role || "unknown";
          const content = (entry.message?.content || [])
            .filter((b) => b?.type === "text" && b.text)
            .map((b) => b.text!.trim())
            .join("\n");
          return `[${start + i + 1}] ${role}: ${content || "(no text)"}`;
        }),
      ];

      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed: ${err}` }], isError: true };
    }
  },
};

// ── Tool: session_recall ──────────────────────────────

export const sessionRecallTool = {
  name: "session_recall",
  label: "Session Recall",
  description: "Search and retrieve surrounding dialogue context from past sessions.",
  parameters: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query." },
      maxResults: { type: "number", description: "Max recall windows. Default: 3." },
      before: { type: "number", description: "Entries before hit. Default: 2." },
      after: { type: "number", description: "Entries after hit. Default: 2." },
    },
    required: ["query"],
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    const query = String(params.query || "").trim();
    if (!query) return { content: [{ type: "text", text: "query is required." }], isError: true };

    try {
      const maxResults = Math.max(1, Math.min(Number(params.maxResults) || 3, 5));
      const fts = await psm.fullTextSearch({
        query,
        page_size: maxResults * 3,
      });

      const hits = (fts.hits || [])
        .filter((h) => h.source_type === "user" || h.source_type === "assistant")
        .slice(0, maxResults);

      if (hits.length === 0) {
        return { content: [{ type: "text", text: `No matching dialogue for: ${query}` }] };
      }

      const before = Math.min(Math.max(Number(params.before) || 2, 0), 10);
      const after = Math.min(Math.max(Number(params.after) || 2, 0), 10);
      const sessions = await getSessions();
      const pathToSession = new Map(sessions.map((s) => [s.path, s]));
      const sections: string[] = [];

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const matchedText = hit.content.replace(/\s+/g, " ").trim().slice(0, 200);
        let context = "";

        try {
          const session = pathToSession.get(hit.session_path);
          const entryPath = session?.path || hit.session_path;
          if (entryPath) {
            const entries = await getEntriesByPath(entryPath);
            const idx = entries.findIndex((e) => e.id === hit.entry_id);
            if (idx >= 0) {
              const start = Math.max(0, idx - before);
              const end = Math.min(entries.length, idx + after + 1);
              context = entries
                .slice(start, end)
                .map((e, j) => {
                  const role = e.message?.role || "unknown";
                  const text = (e.message?.content || [])
                    .filter((b) => b?.type === "text" && b.text)
                    .map((b) => b.text!.trim())
                    .join("\n");
                  const marker = idx === start + j ? "->" : "  ";
                  return `${marker} ${role}: ${text || "(no text)"}`;
                })
                .join("\n");
            }
          }
        } catch { /* skip */ }

        sections.push(
          `${i + 1}. ${hit.session_name || hit.session_id.slice(0, 8)}\nmatched: ${matchedText}${context ? "\n\n" + context : ""}`,
        );
      }

      return {
        content: [{ type: "text", text: [`Session recall for: ${query}`, "", ...sections].join("\n\n") }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Recall failed: ${err}` }], isError: true };
    }
  },
};

// ── Tool: session_tag ─────────────────────────────────

function findTag(name: string, tags: TagItem[]): TagItem | null {
  const n = name.toLowerCase().trim();
  return tags.find((t) => t.name.toLowerCase() === n)
    || tags.find((t) => t.name.toLowerCase().includes(n)) || null;
}

export const sessionTagTool = {
  name: "session_tag",
  label: "Session Tag Manager",
  description: "Manage session status tags. Actions: list(show tags), set(assign tag), remove(unassign tag).",
  parameters: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["list", "set", "remove"], description: "Action: list, set, or remove" },
      tag: { type: "string", description: "Tag name for set/remove actions." },
    },
    required: ["action"],
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    const sid = getSessionId();
    const allTags = await kanbanStore.getAllTags();
    const allSessionTags = await kanbanStore.getAllSessionTags();
    const assignedIds = new Set(allSessionTags.filter((st) => st.session_id === sid).map((st) => st.tag_id));
    const currentTags = allTags.filter((t) => assignedIds.has(t.id));

    if (params.action === "list") {
      const lines = [
        `Session Tags (ID: ${sid.slice(0, 8)}...)`,
        `Active: ${currentTags.length > 0 ? currentTags.map((t) => t.name).join(", ") : "none"}`,
        "", "Available:",
        ...allTags.map((t) => `  ${assignedIds.has(t.id) ? "[x]" : "[ ]"} ${t.name}`),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (params.action === "set") {
      const tagName = String(params.tag || "").trim();
      if (!tagName) return { content: [{ type: "text", text: "tag is required for set." }], isError: true };
      let target = findTag(tagName, allTags);
      if (!target) {
        try { target = await kanbanStore.createTag(tagName, "info"); } catch (e) {
          return { content: [{ type: "text", text: `Failed: ${e}` }], isError: true };
        }
      }
      try {
        await kanbanStore.moveSessionTag(sid, null, target.id, 0);
        notifyPsmTagChange(sid, []);
        return { content: [{ type: "text", text: `Tag set: ${target.name}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Failed: ${e}` }], isError: true };
      }
    }

    if (params.action === "remove") {
      const tagName = String(params.tag || "").trim();
      if (!tagName) return { content: [{ type: "text", text: "tag is required for remove." }], isError: true };
      const target = findTag(tagName, allTags);
      if (!target) return { content: [{ type: "text", text: `Tag not found: ${tagName}` }], isError: true };
      try {
        await kanbanStore.removeTagFromSession(sid, target.id);
        notifyPsmTagChange(sid, []);
        return { content: [{ type: "text", text: `Removed: ${target.name}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Failed: ${e}` }], isError: true };
      }
    }

    return { content: [{ type: "text", text: "Unknown action" }], isError: true };
  },
};
