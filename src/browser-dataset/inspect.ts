import type { SessionEntry } from "@/types";
import type {
  InspectData,
  NameHistoryEntry,
  CompactionEntry,
  CustomEntry,
  ToolResultDetail,
} from "@/types/trace";
import { loadDatasetCache } from "./core";

export async function getBrowserDatasetInspectData(
  sessionPath: string
): Promise<InspectData> {
  const dataset = await loadDatasetCache();
  const session = dataset.sessionByPath.get(sessionPath);
  const entries: SessionEntry[] | undefined = session?.entries;
  if (!entries?.length) {
    throw new Error(`No session data found for path: ${sessionPath}`);
  }

  // Parse header
  const header = entries[0] as any;
  const version = header?.version ?? 1;
  const parentSession = header?.parentSession ?? null;

  // Extract inspect data
  const nameHistory: NameHistoryEntry[] = [];
  const compactionEntries: CompactionEntry[] = [];
  const customEntries: CustomEntry[] = [];
  const toolResults: Record<string, ToolResultDetail> = {};

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i] as any;
    const entryType = entry?.type;
    const id = entry?.id ?? "";
    const timestamp = entry?.timestamp ?? "";

    if (entryType === "session_info" && entry?.name) {
      nameHistory.push({
        id,
        timestamp,
        name: entry.name,
      });
    } else if (entryType === "compaction") {
      compactionEntries.push({
        id,
        timestamp,
        summary: entry?.summary ?? null,
        first_kept_entry_id: entry?.firstKeptEntryId ?? null,
        tokens_before: entry?.tokensBefore ?? null,
        details: entry?.details ?? null,
        from_hook: entry?.fromHook ?? null,
      });
    } else if (entryType === "custom") {
      customEntries.push({
        id,
        timestamp,
        custom_type: entry?.customType ?? "",
        data: entry?.data ?? null,
      });
    } else if (entryType === "message") {
      const msg = entry?.message;
      if (msg?.role === "toolResult") {
        const toolCallId = msg.toolCallId ?? "";
        toolResults[toolCallId] = {
          tool_name: msg.toolName ?? "result",
          is_error: msg.isError ?? false,
          content: msg.content ?? null,
          timestamp,
        };
      }
    }
  }

  return {
    version,
    parent_session: parentSession,
    name_history: nameHistory,
    compaction_entries: compactionEntries,
    custom_entries: customEntries,
    tool_results: toolResults,
    total_raw_entries: entries.length,
  };
}
