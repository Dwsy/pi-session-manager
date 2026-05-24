// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionInfo } from "@/types";
import { useSessions } from "./useSessions";

const mocks = vi.hoisted(() => ({
  loadRuntimeSessionList: vi.fn(),
  getSessionRuntimeMode: vi.fn(() => "browser-dataset"),
  canResolveRuntimeSession: vi.fn(async () => true),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue || key,
  }),
}));

vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({
    sendNotification: vi.fn(),
  }),
}));

vi.mock("@/transport", () => ({
  listen: vi.fn(),
}));

vi.mock("@/browser-dataset", () => ({
  BROWSER_DATASET_REFRESHED_EVENT: "browser-dataset:refreshed",
  isBrowserDatasetModeEnabled: () => false,
}));

vi.mock("@/runtime-data/sessionSource", () => ({
  canResolveRuntimeSession: mocks.canResolveRuntimeSession,
  deleteRuntimeSessionItems: vi.fn(),
  forkRuntimeSessionItem: vi.fn(),
  getRuntimeSessionOperationCapability: () => ({
    supported: true,
    fallbackMessage: "",
  }),
  getSessionRuntimeMode: mocks.getSessionRuntimeMode,
  loadRuntimeSessionList: mocks.loadRuntimeSessionList,
  renameRuntimeSessionItem: vi.fn(),
}));

const datasetSession: SessionInfo = {
  id: "session-1",
  path: "/datasets/demo/session-1.jsonl",
  cwd: "/repo/demo",
  name: "Dataset Session",
  created: "2026-05-24T10:00:00.000Z",
  modified: "2026-05-24T10:01:00.000Z",
  message_count: 1,
  first_message: "hello",
  last_message: "world",
  last_message_role: "assistant",
};

describe("useSessions dataset loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionRuntimeMode.mockReturnValue("browser-dataset");
  });

  it("keeps loading while an incomplete dataset has no sessions yet", async () => {
    mocks.loadRuntimeSessionList.mockResolvedValue({
      sessions: [],
      isComplete: false,
    });

    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await result.current.loadSessions();
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it("stops loading when an empty dataset is complete", async () => {
    mocks.loadRuntimeSessionList.mockResolvedValue({
      sessions: [],
      isComplete: true,
    });

    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await result.current.loadSessions();
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("shows partial sessions while an incomplete dataset continues refreshing", async () => {
    mocks.loadRuntimeSessionList.mockResolvedValue({
      sessions: [datasetSession],
      isComplete: false,
    });

    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await result.current.loadSessions();
    });

    expect(result.current.sessions).toEqual([datasetSession]);
    expect(result.current.loading).toBe(false);
  });
});
