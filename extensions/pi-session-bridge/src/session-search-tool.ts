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
  match_reason?: string;
};

type FullTextSearchResponse = {
  hits: SearchHit[];
  total_hits: number;
  has_more: boolean;
};

function isDialogueHit(hit: SearchHit): boolean {
  return hit.source_type === "user" || hit.source_type === "assistant";
}

function formatHit(hit: SearchHit, index: number): string {
  const shortId = hit.session_id.slice(0, 8);
  const sessionLabel = hit.session_name || shortId;
  const pathTail = hit.session_path.split("/").slice(-2).join("/");
  const excerpt = hit.content.replace(/\s+/g, " ").trim().slice(0, 220);
  const role = hit.role || hit.source_type || "unknown";
  return [
    `${index + 1}. ${sessionLabel} [${shortId}]`,
    `   role=${role} time=${hit.timestamp}`,
    `   path=${pathTail}`,
    `   ${excerpt}${hit.content.length > 220 ? "…" : ""}`,
  ].join("\n");
}

export function registerSessionSearchTool(pi: ExtensionAPI, conn: () => BridgeConnection | null) {
  pi.registerTool({
    name: "session_search",
    label: "Session Search",
    description: "Search indexed Pi sessions in Pi Session Manager over the active WebSocket bridge. Use this to find relevant past conversations, fixes, snippets, or sessions by content.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query to run against indexed sessions in Pi Session Manager.",
      }),
      roleFilter: Type.Optional(Type.Union([
        Type.Literal("all"),
        Type.Literal("user"),
        Type.Literal("assistant"),
      ], {
        description: "Optional role filter. Defaults to all.",
      })),
      matchMode: Type.Optional(Type.Union([
        Type.Literal("any"),
        Type.Literal("all"),
        Type.Literal("phrase"),
      ], {
        description: "Match mode. Defaults to any.",
      })),
      pageSize: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 20,
        description: "Maximum number of hits to return, between 1 and 20. Defaults to 8.",
      })),
      projectPath: Type.Optional(Type.String({
        description: "Optional exact project path filter.",
      })),
      globPattern: Type.Optional(Type.String({
        description: "Optional glob pattern to filter session paths, e.g. */backend/*.",
      })),
      sortOrder: Type.Optional(Type.Union([
        Type.Literal("relevance"),
        Type.Literal("newest"),
        Type.Literal("oldest"),
      ], {
        description: "Sort order. Defaults to relevance.",
      })),
    }),
    async execute(_toolCallId, params, _signal, onPartial) {
      const bridge = conn();
      if (!bridge || bridge.state !== "connected") {
        return {
          content: [{
            type: "text",
            text: "❌ PSM bridge is not connected. Enable live mode and connect to Pi Session Manager before using session_search.",
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

      onPartial?.({
        content: [{ type: "text", text: `🔎 Searching Pi sessions for: ${query}` }],
        details: {},
      });

      try {
        const response = await bridge.request("full_text_search", {
          query,
          roleFilter: params.roleFilter || "all",
          globPattern: params.globPattern || null,
          projectPath: params.projectPath || null,
          page: 0,
          pageSize: Math.min(Math.max(params.pageSize || 8, 1), 20),
          matchMode: params.matchMode || "any",
          sortOrder: params.sortOrder || "relevance",
        }) as FullTextSearchResponse;

        const hits = (response?.hits || []).filter(isDialogueHit);
        if (hits.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No matching user/assistant messages found for query: ${query}`,
            }],
            details: { query, response },
          } as any;
        }

        const lines = [
          `🔎 Session search results for: ${query}`,
          `Found ${hits.length} user/assistant hit(s)${response.has_more ? " (truncated)" : ""}`,
          `Only user and assistant messages are returned here. Use session_context(sessionPath, entryId) for surrounding dialogue context.`,
          "",
          ...hits.map((hit, index) => formatHit(hit, index)),
        ];

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            query,
            totalHits: response.total_hits,
            hasMore: response.has_more,
            hits,
          },
        } as any;
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `❌ Session search failed: ${error?.message || String(error)}`,
          }],
          details: {},
          isError: true,
        } as any;
      }
    },
  });
}
