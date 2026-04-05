import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { BridgeConnection } from "./ws-bridge.ts";
import {
  getTagsForSession, refreshTagCache, getCachedTags, findTag, getOrCreateTag,
  moveSessionTag, removeTag, TAG_DESCRIPTIONS,
} from "./tag-db.ts";
import type { Tag } from "./types.ts";

function getSessionId(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId() || "";
}

function notifyPsmTagChange(sessionId: string, conn: BridgeConnection | null) {
  if (!conn?.state || conn.state !== "connected") return;
  const tagsResult = getTagsForSession(sessionId);
  const tags = tagsResult.success ? (tagsResult.data || []) : [];
  conn.send({ type: "session_tag_changed", payload: { sessionId, tags } });
}

export function registerSessionTagTool(pi: ExtensionAPI, conn: () => BridgeConnection | null) {
  refreshTagCache();

  pi.registerTool({
    name: "session_tag",
    label: "Session Tag Manager",
    description: "Manage session status tags. Actions: list(show tags), set(assign tag), remove(unassign tag). Built-in tags: todo, wip, done, important, archive.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list", { description: "List current session tags and all available tags" }),
        Type.Literal("set", { description: "Set or toggle session tag" }),
        Type.Literal("remove", { description: "Remove specified tag" }),
      ], { description: "Action type: list, set, or remove" }),
      tag: Type.Optional(Type.String({
        description: "Tag name (required for set/remove). Supports: todo, wip, done, important, archive.",
      })),
      fromTag: Type.Optional(Type.String({
        description: "Optional for set: which tag to transition from (workflow flow).",
      })),
    }),
    async execute(_toolCallId, params, _signal, onPartial, ctx) {
      const sid = getSessionId(ctx);
      await refreshTagCache();

      // ── LIST ──
      if (params.action === "list") {
        const currentResult = getTagsForSession(sid);
        const currentTags = currentResult.success ? (currentResult.data || []) : [];
        const lines = [
          `📋 Session Tags (ID: ${sid.slice(0, 8)}...)`, "",
          `🎯 Active: ${currentTags.length > 0 ? currentTags.map((t: Tag) => t.name).join(", ") : "none"}`, "",
          `📚 Available Tags:`,
          ...getCachedTags().map((t: Tag) => {
            const assigned = currentTags.some((ct: Tag) => ct.id === t.id);
            const desc = TAG_DESCRIPTIONS[t.name] || "";
            return `  ${assigned ? "✓" : "○"} ${t.name}${desc ? ` - ${desc}` : ""}${t.isBuiltin ? " [system]" : ""}`;
          }),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }], details: { sessionId: sid, currentTags, availableTags: getCachedTags() } } as any;
      }

      // ── SET ──
      if (params.action === "set") {
        if (!params.tag) return { content: [{ type: "text", text: "❌ set action requires a tag parameter" }], details: {}, isError: true } as any;
        onPartial?.({ content: [{ type: "text", text: `🔄 Setting tag: ${params.tag}...` }], details: {} });
        let targetTag = findTag(params.tag, getCachedTags());
        if (!targetTag) {
          onPartial?.({ content: [{ type: "text", text: `📝 Creating new tag: ${params.tag}...` }], details: {} });
          const createResult = getOrCreateTag(params.tag, "info");
          if (createResult.success && createResult.data) { targetTag = createResult.data as Tag; }
        }
        if (!targetTag) return { content: [{ type: "text", text: `❌ Tag not found: ${params.tag}` }], details: {}, isError: true } as any;

        let fromTagId: string | null = null;
        if (params.fromTag) { const fromTag = findTag(params.fromTag, getCachedTags()); if (fromTag) fromTagId = fromTag.id; }

        const currentResult = getTagsForSession(sid);
        const currentTags = currentResult.success ? (currentResult.data || []) : [];
        const oldTag = fromTagId ? currentTags.find((t: Tag) => t.id === fromTagId)?.name || params.fromTag : currentTags[0]?.name || "none";

        const result = moveSessionTag(sid, fromTagId, targetTag.id);
        if (!result.success) return { content: [{ type: "text", text: `❌ Failed to set: ${result.error}` }], details: {}, isError: true } as any;
        notifyPsmTagChange(sid, conn());

        return {
          content: [{ type: "text", text: ["✅ Tag updated", "", `📍 ${oldTag} → ${targetTag.name}`, `🏷️ ${targetTag.name}${targetTag.isBuiltin ? " [system]" : ""}`].join("\n") }],
          details: { sessionId: sid, tagId: targetTag.id, tagName: targetTag.name, fromTag: fromTagId },
        } as any;
      }

      // ── REMOVE ──
      if (params.action === "remove") {
        if (!params.tag) return { content: [{ type: "text", text: "❌ remove action requires a tag parameter" }], details: {}, isError: true } as any;
        const targetTag = findTag(params.tag, getCachedTags());
        if (!targetTag) return { content: [{ type: "text", text: `❌ Tag not found: ${params.tag}` }], details: {}, isError: true } as any;
        const result = removeTag(sid, targetTag.id);
        if (!result.success) return { content: [{ type: "text", text: `❌ Failed to remove: ${result.error}` }], details: {}, isError: true } as any;
        notifyPsmTagChange(sid, conn());
        return { content: [{ type: "text", text: `✅ Removed tag: ${targetTag.name}` }], details: {} } as any;
      }

      return { content: [{ type: "text", text: "❌ Unknown action" }], details: {}, isError: true } as any;
    },
  });
}
