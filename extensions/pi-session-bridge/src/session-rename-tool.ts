import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { BridgeConnection } from "./ws-bridge.ts";

function getCurrentSessionPath(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionFile() || "";
}

export function registerSessionRenameTool(
  pi: ExtensionAPI,
  conn: () => BridgeConnection | null,
) {
  pi.registerTool({
    name: "session_rename",
    label: "Session Rename",
    description: "Rename the current session or a specific session path in Pi Session Manager. Use this to turn vague session titles into meaningful, searchable names.",
    parameters: Type.Object({
      name: Type.String({
        description: "The new session name.",
      }),
      sessionPath: Type.Optional(Type.String({
        description: "Optional explicit session path. If omitted, renames the current session.",
      })),
    }),
    async execute(_toolCallId, params, _signal, _onPartial, ctx) {
      const bridge = conn();
      if (!bridge || bridge.state !== "connected") {
        return {
          content: [{
            type: "text",
            text: "❌ PSM bridge is not connected. Enable live mode and connect to Pi Session Manager before using session_rename.",
          }],
          details: {},
          isError: true,
        } as any;
      }

      const newName = params.name.trim();
      if (!newName) {
        return {
          content: [{ type: "text", text: "❌ name is required." }],
          details: {},
          isError: true,
        } as any;
      }

      const sessionPath = (params.sessionPath || getCurrentSessionPath(ctx)).trim();
      if (!sessionPath) {
        return {
          content: [{ type: "text", text: "❌ sessionPath is required when no current session file is available." }],
          details: {},
          isError: true,
        } as any;
      }

      try {
        await bridge.request("rename_session", {
          path: sessionPath,
          newName: newName,
        });

        return {
          content: [{
            type: "text",
            text: `✅ Session renamed to: ${newName}`,
          }],
          details: {
            sessionPath,
            newName,
          },
        } as any;
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to rename session: ${error?.message || String(error)}`,
          }],
          details: {
            sessionPath,
            newName,
          },
          isError: true,
        } as any;
      }
    },
  });
}
