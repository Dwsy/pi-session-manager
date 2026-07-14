// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "@/types";
import { useSessionViewerData } from "./useSessionViewerData";
import {
  getPreviewEntriesFromDB,
  readRuntimeSessionChunk,
  shouldListenRuntimeSessionEvents,
} from "@/runtime-data/sessionSource";

vi.mock("@/transport", () => ({
  invoke: vi.fn(),
  isTauri: () => false,
  listen: vi.fn(),
}));

vi.mock("@/runtime-data/sessionSource", () => ({
  getPreviewEntriesFromDB: vi.fn(),
  readRuntimeSessionChunk: vi.fn(),
  shouldListenRuntimeSessionEvents: vi.fn(),
}));

vi.mock("@/utils/settingsApi", () => ({
  getCachedSettings: () => ({
    session: {
      openPosition: "top",
    },
  }),
}));

function sessionEntry(): SessionEntry {
  return {
    type: "session",
    id: "session-1",
    timestamp: "2026-05-23T00:00:00.000Z",
  };
}

describe("useSessionViewerData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldListenRuntimeSessionEvents).mockReturnValue(false);
  });

  it("falls back to JSONL preview when DB preview has no messages", async () => {
    vi.mocked(getPreviewEntriesFromDB).mockResolvedValue([sessionEntry()]);
    vi.mocked(readRuntimeSessionChunk).mockResolvedValue({
      content:
        '{"type":"message","id":"msg-1","timestamp":"2026-05-23T00:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"hello from jsonl"}]}}\n',
      next_offset: 150,
      file_size: 150,
      has_more: false,
    });

    const isAtBottomRef = { current: true };
    const { result } = renderHook(() =>
      useSessionViewerData({
        sessionPath: "/tmp/session-1.jsonl",
        loadErrorMessage: "failed",
        isAtBottomRef,
        previewMode: true,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(readRuntimeSessionChunk).toHaveBeenCalledWith(
      "/tmp/session-1.jsonl",
      0,
      384 * 1024,
    );
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].id).toBe("msg-1");
    expect(result.current.activeEntryId).toBe("msg-1");
  });

  it("renders the first JSONL chunk before top-mode hydration finishes", async () => {
    vi.mocked(getPreviewEntriesFromDB).mockResolvedValue([]);

    let releaseSecondChunk!: () => void;
    const secondChunkReady = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve;
    });

    let releaseThirdChunk!: () => void;
    const thirdChunkReady = new Promise<void>((resolve) => {
      releaseThirdChunk = resolve;
    });

    vi.mocked(readRuntimeSessionChunk)
      .mockResolvedValueOnce({
        content:
          '{"type":"message","id":"msg-1","timestamp":"2026-05-23T00:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"first chunk"}]}}\n',
        next_offset: 150,
        file_size: 450,
        has_more: true,
      })
      .mockImplementationOnce(async () => {
        await secondChunkReady;
        return {
          content:
            '{"type":"message","id":"msg-2","timestamp":"2026-05-23T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"second chunk"}]}}\n',
          next_offset: 300,
          file_size: 450,
          has_more: true,
        };
      })
      .mockImplementationOnce(async () => {
        await thirdChunkReady;
        return {
          content:
            '{"type":"message","id":"msg-3","timestamp":"2026-05-23T00:00:03.000Z","message":{"role":"user","content":[{"type":"text","text":"third chunk"}]}}\n',
          next_offset: 450,
          file_size: 450,
          has_more: false,
        };
      });

    const isAtBottomRef = { current: true };
    const { result } = renderHook(() =>
      useSessionViewerData({
        sessionPath: "/tmp/session-progressive.jsonl",
        loadErrorMessage: "failed",
        isAtBottomRef,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries.map((entry) => entry.id)).toEqual(["msg-1"]);
    expect(result.current.hasMoreHistory).toBe(true);

    releaseSecondChunk();

    await waitFor(() =>
      expect(readRuntimeSessionChunk).toHaveBeenCalledTimes(3),
    );
    expect(result.current.entries.map((entry) => entry.id)).toEqual(["msg-1"]);
    expect(result.current.hasMoreHistory).toBe(true);

    releaseThirdChunk();

    await waitFor(() =>
      expect(result.current.entries.map((entry) => entry.id)).toEqual([
        "msg-1",
        "msg-2",
        "msg-3",
      ]),
    );
    expect(result.current.hasMoreHistory).toBe(false);
  });
});
