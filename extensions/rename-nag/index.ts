/**
 * rename-nag — Smart session rename reminder
 *
 * Monitors agent sessions and injects a hidden prompt when the agent
 * should consider naming the session but hasn't done so yet.
 *
 * Trigger conditions:
 *   - First: tool calls > 6, full reminder
 *   - Follow-up: every 40 tool calls (40, 80, 120...), short reminder
 *
 * Uses before_agent_start to inject a hidden message (display: false).
 * Tracks tool_call to detect when session_rename is invoked.
 *
 * No external dependencies — uses pi's SessionManager.list() API.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── Helpers ──────────────────────────────────────────

/** Detect default timestamp-based session name (unmodified) */
function isDefaultName(name: string | null | undefined): boolean {
  if (!name) return true;
  // Matches: 2026-05-08T14-30-00.123 or 2026-05-08T14:30:00Z
  return /^\d{4}-\d{2}-\d{2}T\d{2}[:\-]\d{2}[:\-]\d{2}/.test(name);
}

/** Count existing tool calls from session entries (for resume) */
function countToolCalls(ctx: ExtensionContext): number {
  let count = 0;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type !== "message") continue;
    const msg = (entry as { message?: { role?: string; content?: Array<{ type?: string }> } }).message;
    if (msg?.role !== "assistant") continue;
    for (const block of msg.content ?? []) {
      if (block.type === "toolCall") count++;
    }
  }
  return count;
}

/** Generate a name in the language used by the user, not English by default. */
function getLanguageInstruction(): string {
  return "When calling session_rename, use the same language the user uses in this conversation to generate a concise, descriptive name. Do not translate the name to English or default to English.";
}

// ── Extension ────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let toolCallCount = 0;
  let firstNagSent = false;

  // ── Tool: session_rename ───────────────────────────
  // (migrated from pi-session-bridge, with rename tracking)

  pi.registerTool({
    name: "session_rename",
    label: "Session Rename",
    description: "Rename the current session. Call this when you detect user intent to rename, such as 'rename this session', 'call it xxx', 'set the title to', 'name it xxx', 'title it xxx', 'let's call this', 'this should be named', '给它起个名字', '重命名'. Extract the desired name from user's message and pass it as the 'name' parameter.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The new session name." },
      },
      required: ["name"],
    },
    async execute(_toolCallId, params: Record<string, unknown>) {
      const newName = String(params.name || "").trim();
      if (!newName) return { content: [{ type: "text", text: "name is required." }], isError: true };

      const currentName = pi.getSessionName?.() || "";
      pi.setSessionName(newName);
      return {
        content: [{ type: "text", text: `Session renamed: ${currentName || "(untitled)"} -> ${newName}` }],
      };
    },
  });

  // ── Event: tool_call ─────────────────────────────

  pi.on("tool_call", async (_event: { toolCall?: { name?: string; arguments?: unknown } }) => {
    toolCallCount++;
  });

  // ── Event: session_start ───────────────────────────

  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    // Resume: count existing tool calls instead of resetting to 0
    toolCallCount = countToolCalls(ctx);
    const name = pi.getSessionName?.() || "";
    firstNagSent = !isDefaultName(name) || toolCallCount > 6;
  });

  // ── Event: before_agent_start (inject reminder) ────

  pi.on("before_agent_start", async (_event: unknown, _ctx: ExtensionContext) => {
    const sessionName = pi.getSessionName?.() || "";
    const isNamed = !isDefaultName(sessionName);

    // First reminder: unnamed + tool calls > 6
    if (!isNamed && !firstNagSent && toolCallCount > 6) {
      firstNagSent = true;
      return {
        message: {
          customType: "name-session",
          content:
            "[Reminder] This session has been going on for a while without a name. You have a session_rename tool available. " +
            "Please call session_rename with a concise, descriptive name that summarizes the main task or topic of this session. " +
            getLanguageInstruction() +
            ' This helps with session organization and recall.',
          display: false,
        },
      };
    }

    // Follow-up: already named, check if topic shifted (every 40 tool calls)
    if (isNamed && toolCallCount > 0 && toolCallCount % 40 === 0) {
      return {
        message: {
          customType: "name-session",
          content:
            `[Reminder] This session is named "${sessionName}". If the conversation has shifted to a different topic, call session_rename to update it. ` +
            getLanguageInstruction(),
          display: false,
        },
      };
    }
  });
}
