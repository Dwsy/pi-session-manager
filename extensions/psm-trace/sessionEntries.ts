import type { SessionEntry } from "@/types";
import { parseSessionEntriesWithLineCount } from "@/utils/session";
import type {
  PsmCapabilityClient,
  PsmSessionReference,
} from "@pi-session-manager/plugin-sdk";

const READ_CHUNK_BYTES = 384 * 1024;

export interface TraceSessionReference extends PsmSessionReference {
  created?: string;
  modified?: string;
}

export async function loadSessionEntries(
  client: PsmCapabilityClient,
  sessionPath: string,
): Promise<SessionEntry[]> {
  let offset = 0;
  let content = "";

  for (;;) {
    const chunk = await client.sessions.readFileChunk(sessionPath, {
      offset,
      maxBytes: READ_CHUNK_BYTES,
    });
    content += chunk.content;
    if (!chunk.has_more) break;
    if (chunk.next_offset <= offset) {
      throw new Error("Session chunk reader did not advance");
    }
    offset = chunk.next_offset;
  }

  return parseSessionEntriesWithLineCount(content).entries;
}
