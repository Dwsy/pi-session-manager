// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { parseSessionContent } from "./core";

describe("parseSessionContent", () => {
  it("rejects dataset manifest jsonl files instead of creating synthetic sessions", () => {
    const manifestContent = [
      JSON.stringify({
        file: "2026-01-16T02-31-35-233Z_session.jsonl",
        source_hash: "sha256:source",
      }),
      JSON.stringify({
        file: "2026-01-16T02-37-34-075Z_session.jsonl",
        source_hash: "sha256:source-2",
      }),
    ].join("\n");

    expect(
      parseSessionContent("owner/repo", "manifest.jsonl", manifestContent),
    ).toBeNull();
  });

  it("uses the latest entry timestamp as modified time", () => {
    const content = [
      JSON.stringify({
        type: "session",
        id: "session-1",
        timestamp: "2026-05-24T10:00:00.000Z",
        cwd: "/repo/demo",
      }),
      JSON.stringify({
        type: "message",
        id: "user-1",
        timestamp: "2026-05-24T10:01:00.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      }),
      JSON.stringify({
        type: "session_info",
        id: "name-1",
        timestamp: "2026-05-24T10:03:00.000Z",
        name: "Renamed",
      }),
    ].join("\n");

    const session = parseSessionContent("owner/repo", "session.jsonl", content);

    expect(session?.info).toMatchObject({
      id: "session-1",
      cwd: "/repo/demo",
      name: "Renamed",
      created: "2026-05-24T10:00:00.000Z",
      modified: "2026-05-24T10:03:00.000Z",
      message_count: 1,
      first_message: "hello",
    });
  });
});
