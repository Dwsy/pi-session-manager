import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserDatasetInspectData } from "./inspect";

const { mockLoadDatasetCache } = vi.hoisted(() => ({
  mockLoadDatasetCache: vi.fn(),
}));

vi.mock("./core", () => {
  return {
    loadDatasetCache: (...args: unknown[]) => mockLoadDatasetCache(...args),
  };
});

describe("getBrowserDatasetInspectData", () => {
  beforeEach(() => {
    const path = "/datasets/demo/session.jsonl";
    const entries: any[] = [
      {
        type: "session",
        id: "session-1",
        timestamp: "2026-05-24T10:00:00Z",
        version: 2,
        parentSession: "/datasets/demo/parent.jsonl",
      },
      {
        type: "session_info",
        id: "name-1",
        timestamp: "2026-05-24T10:01:00Z",
        name: "Dataset Session",
      },
      {
        type: "compaction",
        id: "compact-1",
        timestamp: "2026-05-24T10:02:00Z",
        summary: "short summary",
        firstKeptEntryId: "msg-2",
        tokensBefore: 1200,
      },
      {
        type: "custom",
        id: "custom-1",
        timestamp: "2026-05-24T10:03:00Z",
        customType: "checkpoint",
        data: { ok: true },
      },
      {
        type: "message",
        id: "tool-result-1",
        timestamp: "2026-05-24T10:04:00Z",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "read",
          isError: false,
          content: [{ type: "text", text: "done" }],
        },
      },
    ];
    const session = {
      info: {
        path,
        id: "session-1",
        cwd: "/repo/demo",
        created: "2026-05-24T10:00:00Z",
        modified: "2026-05-24T10:04:00Z",
        message_count: 1,
        first_message: "hello",
        last_message: "done",
        last_message_role: "assistant",
      },
      content: entries.map((entry) => JSON.stringify(entry)).join("\n"),
      path,
      relativePath: "session.jsonl",
      fileSize: 1,
      entries,
    };

    mockLoadDatasetCache.mockResolvedValue({
      datasetId: "demo",
      sessions: [session],
      sessionByPath: new Map([[path, session]]),
    });
  });

  it("reads inspect entries from the dataset session path map", async () => {
    const inspect = await getBrowserDatasetInspectData(
      "/datasets/demo/session.jsonl",
    );

    expect(inspect.version).toBe(2);
    expect(inspect.parent_session).toBe("/datasets/demo/parent.jsonl");
    expect(inspect.name_history).toEqual([
      {
        id: "name-1",
        timestamp: "2026-05-24T10:01:00Z",
        name: "Dataset Session",
      },
    ]);
    expect(inspect.compaction_entries[0]).toMatchObject({
      id: "compact-1",
      summary: "short summary",
      first_kept_entry_id: "msg-2",
      tokens_before: 1200,
    });
    expect(inspect.custom_entries[0]).toMatchObject({
      id: "custom-1",
      custom_type: "checkpoint",
      data: { ok: true },
    });
    expect(inspect.tool_results["call-1"]).toMatchObject({
      tool_name: "read",
      is_error: false,
      timestamp: "2026-05-24T10:04:00Z",
    });
    expect(inspect.total_raw_entries).toBe(5);
  });
});
