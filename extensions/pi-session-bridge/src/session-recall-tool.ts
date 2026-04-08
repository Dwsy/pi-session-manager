import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { BridgeConnection } from "./ws-bridge.ts";

type SearchHit = {
  session_id: string;
  session_path: string;
  session_name?: string;
  entry_id: string;
  role: string;
  source_type: string;
  content: string;
  timestamp: string;
  score: number;
};

type FullTextSearchResponse = {
  hits: SearchHit[];
  total_hits: number;
  has_more: boolean;
};

type SessionContentBlock = {
  type?: string;
  text?: string;
};

type SessionEntry = {
  type?: string;
  id?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: SessionContentBlock[];
  };
};

function isDialogueHit(hit: SearchHit): boolean {
  return hit.source_type === "user" || hit.source_type === "assistant";
}

function isDialogueEntry(entry: SessionEntry): boolean {
  return entry.type === "message"
    && (entry.message?.role === "user" || entry.message?.role === "assistant");
}

function extractText(entry: SessionEntry): string {
  const parts = (entry.message?.content || [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text!.trim())
    .filter(Boolean);
  return parts.join("\n");
}

function formatContextWindow(entries: SessionEntry[], centerId: string | undefined, before: number, after: number): string {
  let start = Math.max(entries.length - (before + after + 1), 0);
  let end = entries.length;

  if (centerId) {
    const index = entries.findIndex((entry) => entry.id === centerId);
    if (index !== -1) {
      start = Math.max(0, index - before);
      end = Math.min(entries.length, index + after + 1);
    }
  }

  return entries.slice(start, end).map((entry, idx) => {
    const marker = centerId && entry.id === centerId ? "→" : " ";
    const absolute = start + idx + 1;
    const role = entry.message?.role || "unknown";
    const text = extractText(entry) || "(no textual content)";
    return `${marker} [${absolute}] ${role}: ${text}`;
  }).join("\n");
}

export function registerSessionRecallTool(
  pi: ExtensionAPI,
  conn: () => BridgeConnection | null,
) {
  pi.registerTool({
    name: "session_recall",
    label: "Session Recall",
    description: "Search Pi Session Manager and immediately return surrounding dialogue context from matching sessions. Only user and assistant messages are searched and returned.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query for recalling prior user/assistant dialogue from indexed sessions.",
      }),
      maxResults: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 5,
        description: "Maximum number of matched recall windows to return. Defaults to 3.",
      })),
      before: Type.Optional(Type.Integer({
        minimum: 0,
        maximum: 10,
        description: "How many dialogue entries before each hit to include. Defaults to 2.",
      })),
      after: Type.Optional(Type.Integer({
        minimum: 0,
        maximum: 10,
        description: "How many dialogue entries after each hit to include. Defaults to 2.",
      })),
      projectPath: Type.Optional(Type.String({
        description: "Optional exact project path filter.",
      })),
      globPattern: Type.Optional(Type.String({
        description: "Optional glob pattern for session paths.",
      })),
      matchMode: Type.Optional(Type.Union([
        Type.Literal("any"),
        Type.Literal("all"),
        Type.Literal("phrase"),
      ])),
      sortOrder: Type.Optional(Type.Union([
        Type.Literal("relevance"),
        Type.Literal("newest"),
        Type.Literal("oldest"),
      ])),
    }),
    async execute(_toolCallId, params) {
      const bridge = conn();
      if (!bridge || bridge.state !== "connected") {
        return {
          content: [{
            type: "text",
            text: "❌ PSM bridge is not connected. Enable live mode and connect to Pi Session Manager before using session_recall.",
          }],
          details: {},
          isError: true,
        } as any;
      }

      const query = params.query.trim();
      if (!query) {
        return {
          content: [{ type: "text", text: "❌ query is required." }],
          details: {},
          isError: true,
        } as any;
      }

      try {
        const response = await bridge.request("full_text_search", {
          query,
          roleFilter: "all",
          globPattern: params.globPattern || null,
          projectPath: params.projectPath || null,
          page: 0,
          pageSize: Math.min(Math.max((params.maxResults || 3) * 3, 3), 15),
          matchMode: params.matchMode || "any",
          sortOrder: params.sortOrder || "relevance",
        }) as FullTextSearchResponse;

        const hits = (response?.hits || []).filter(isDialogueHit).slice(0, Math.max(1, Math.min(params.maxResults || 3, 5)));
        if (hits.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No matching user/assistant dialogue found for query: ${query}`,
            }],
            details: { query, response },
          } as any;
        }

        const before = Math.max(0, Math.min(params.before || 2, 10));
        const after = Math.max(0, Math.min(params.after || 2, 10));
        const sessionCache = new Map<string, SessionEntry[]>();
        const sections: string[] = [];

        for (const [index, hit] of hits.entries()) {
          if (!sessionCache.has(hit.session_path)) {
            const entries = await bridge.request("get_session_entries", { path: hit.session_path }) as SessionEntry[];
            sessionCache.set(hit.session_path, (entries || []).filter(isDialogueEntry));
          }
          const entries = sessionCache.get(hit.session_path) || [];
          const context = formatContextWindow(entries, hit.entry_id, before, after);
          sections.push([
            `${index + 1}. ${(hit.session_name || hit.session_id.slice(0, 8))} [${hit.session_id.slice(0, 8)}]`,
            `path=${hit.session_path}`,
            `matched ${hit.role} at ${hit.timestamp}`,
            `hit=${hit.content.replace(/\s+/g, " ").trim().slice(0, 220)}`,
            "",
            context,
          ].join("\n"));
        }

        return {
          content: [{
            type: "text",
            text: [
              `🧠 Session recall for: ${query}`,
              `Only user and assistant messages are searched and returned; tool calls, tool results, thinking, and snapshots are skipped.`,
              "",
              ...sections,
            ].join("\n\n"),
          }],
          details: {
            query,
            hits,
          },
        } as any;
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `❌ Session recall failed: ${error?.message || String(error)}`,
          }],
          details: {},
          isError: true,
        } as any;
      }
    },
  });
}
