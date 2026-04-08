import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { BridgeConnection } from "./ws-bridge.ts";

type SessionContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: string | Record<string, unknown>;
};

type SessionEntryMessage = {
  role?: string;
  content?: SessionContentBlock[];
};

type SessionEntry = {
  type?: string;
  id?: string;
  timestamp?: string;
  message?: SessionEntryMessage;
};

function formatContentBlocks(blocks: SessionContentBlock[] = [], includeThinking = false): string {
  const parts = blocks.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    if (block.type === "text" && block.text) return [block.text];
    if (includeThinking && block.type === "thinking" && block.thinking) {
      return [`[thinking] ${block.thinking}`];
    }
    return [];
  });

  return parts.join("\n").trim();
}

function formatEntry(entry: SessionEntry, includeThinking = false): string {
  const role = entry.message?.role || entry.type || "unknown";
  const content = formatContentBlocks(entry.message?.content || [], includeThinking);
  const timestamp = entry.timestamp || "";
  return [
    `id=${entry.id || "unknown"} role=${role}${timestamp ? ` time=${timestamp}` : ""}`,
    content || "(no textual content)",
  ].join("\n");
}

function isDialogueEntry(entry: SessionEntry): boolean {
  return entry.type === "message"
    && (entry.message?.role === "user" || entry.message?.role === "assistant");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function registerSessionContextTool(
  pi: ExtensionAPI,
  conn: () => BridgeConnection | null,
) {
  pi.registerTool({
    name: "session_context",
    label: "Session Context",
    description: "Fetch message context from a specific Pi session path via Pi Session Manager. Use this after session_search when you need surrounding conversation context from a matched session.",
    parameters: Type.Object({
      sessionPath: Type.String({
        description: "Full session path returned by session_search.",
      }),
      entryId: Type.Optional(Type.String({
        description: "Optional entry ID from session_search to center the context window around.",
      })),
      before: Type.Optional(Type.Integer({
        minimum: 0,
        maximum: 20,
        description: "How many entries before the target to include. Defaults to 4.",
      })),
      after: Type.Optional(Type.Integer({
        minimum: 0,
        maximum: 20,
        description: "How many entries after the target to include. Defaults to 4.",
      })),
      limit: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 40,
        description: "Maximum number of entries to return when no entryId is provided. Defaults to 8.",
      })),
      includeThinking: Type.Optional(Type.Boolean({
        description: "Include assistant thinking blocks in the returned context. Defaults to false.",
      })),
    }),
    async execute(_toolCallId, params) {
      const bridge = conn();
      if (!bridge || bridge.state !== "connected") {
        return {
          content: [{
            type: "text",
            text: "❌ PSM bridge is not connected. Enable live mode and connect to Pi Session Manager before using session_context.",
          }],
          details: {},
          isError: true,
        } as any;
      }

      try {
        const rawEntries = await bridge.request("get_session_entries", {
          path: params.sessionPath,
        }) as SessionEntry[];

        const entries = (Array.isArray(rawEntries) ? rawEntries : []).filter(isDialogueEntry);

        if (entries.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No user/assistant dialogue entries found for session: ${params.sessionPath}`,
            }],
            details: { sessionPath: params.sessionPath },
          } as any;
        }

        const before = clamp(params.before ?? 4, 0, 20);
        const after = clamp(params.after ?? 4, 0, 20);
        const limit = clamp(params.limit ?? 8, 1, 40);

        let start = Math.max(entries.length - limit, 0);
        let end = entries.length;
        let targetIndex = -1;

        if (params.entryId) {
          targetIndex = entries.findIndex((entry) => entry.id === params.entryId);
          if (targetIndex !== -1) {
            start = Math.max(0, targetIndex - before);
            end = Math.min(entries.length, targetIndex + after + 1);
          }
        }

        const windowEntries = entries.slice(start, end);
        const lines = [
          `📚 Session context`,
          `path=${params.sessionPath}`,
          `dialogue entries ${start + 1}-${end} / ${entries.length}${targetIndex !== -1 ? ` (centered on ${params.entryId})` : ""}`,
          `Only user and assistant messages are included${params.includeThinking ? " (assistant thinking included)" : ""}.`,
          "",
          ...windowEntries.map((entry, index) => {
            const absoluteIndex = start + index;
            const marker = entry.id === params.entryId ? "→" : " ";
            return `${marker} [${absoluteIndex + 1}] ${formatEntry(entry, params.includeThinking === true)}`;
          }),
        ];

        return {
          content: [{ type: "text", text: lines.join("\n\n") }],
          details: {
            sessionPath: params.sessionPath,
            entryId: params.entryId || null,
            totalEntries: entries.length,
            start,
            end,
            entries: windowEntries,
          },
        } as any;
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to load session context: ${error?.message || String(error)}`,
          }],
          details: { sessionPath: params.sessionPath },
          isError: true,
        } as any;
      }
    },
  });
}
