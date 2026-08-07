// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginRecord,
  PsmCapabilityClient,
  PsmSessionJsonlEntry,
} from "@pi-session-manager/plugin-sdk";

vi.mock("@/components/session-branch-map", () => ({
  AtlasDialog: () => null,
  GlobalMap: () => <div data-testid="topology-map">Topology map</div>,
  readBranchMapSettings: () => ({}),
  writeBranchMapSettings: vi.fn(),
}));

import SessionGraphView from "./SessionGraphView";
import {
  DECISION_GRAPH_RECORD_TYPE,
  type DecisionGraphPayload,
} from "./decisionGraphTypes";

const ENTRIES: PsmSessionJsonlEntry[] = [
  {
    type: "message",
    id: "root",
    parentId: null,
    timestamp: "2026-01-01T00:00:00Z",
    message: { role: "user", content: [{ type: "text", text: "Root" }] },
  },
  {
    type: "message",
    id: "assistant",
    parentId: "root",
    timestamp: "2026-01-01T00:00:01Z",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "call-1", name: "bash" }],
    },
  },
  {
    type: "message",
    id: "result",
    parentId: "assistant",
    timestamp: "2026-01-01T00:00:02Z",
    message: { role: "toolResult", toolCallId: "call-1", content: [] },
  },
  {
    type: "label",
    id: "label",
    parentId: "result",
    targetId: "assistant",
    label: "Pinned",
    timestamp: "2026-01-01T00:00:03Z",
  },
  {
    type: "message",
    id: "alternate",
    parentId: "root",
    timestamp: "2026-01-01T00:00:04Z",
    message: { role: "assistant", content: [{ type: "text", text: "Alt" }] },
  },
];

const DEFAULT_NODES: DecisionGraphPayload["nodes"] = [
  {
    id: "decision-1",
    kind: "decision",
    title: "Preserve branch navigation",
    summary: "Decision evidence navigates through the same branch-aware resolver.",
    anchorEntryId: "result",
    evidenceEntryIds: ["assistant"],
    status: "active",
  },
];

function record(
  source = { entryCount: ENTRIES.length, lastEntryId: "alternate" },
  nodes: DecisionGraphPayload["nodes"] = DEFAULT_NODES,
): PluginRecord {
  return {
    id: "builtin.session-graph:/tmp/session.jsonl",
    plugin_id: "builtin.session-graph",
    scope_type: "session",
    scope_id: "/tmp/session.jsonl",
    record_type: DECISION_GRAPH_RECORD_TYPE,
    schema_version: 1,
    payload_json: "{}",
    updated_at: "2026-01-01T00:00:05Z",
    payload: {
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:05Z",
      source,
      nodes,
      edges: [],
    },
  };
}

function clientWithRecord(savedRecord = record()) {
  const listForScope = vi.fn().mockResolvedValue([savedRecord]);
  // This view only exercises records plus the agent methods used by refresh.
  const client = {
    records: {
      listForScope,
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    agent: {
      createSession: vi.fn(),
      runStream: vi.fn(),
      dispose: vi.fn(),
    },
  } as unknown as PsmCapabilityClient;
  return { client, listForScope };
}

describe("SessionGraphView decisions mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads a saved decision map and navigates evidence with branch semantics", async () => {
    const { client, listForScope } = clientWithRecord();
    const onNavigate = vi.fn();

    render(
      <SessionGraphView
        client={client}
        session={{ path: "/tmp/session.jsonl" }}
        entries={ENTRIES}
        onNavigate={onNavigate}
      />,
    );

    expect(await screen.findByText("Preserve branch navigation")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(listForScope).toHaveBeenCalledWith({
      scopeType: "session",
      scopeId: "/tmp/session.jsonl",
      recordType: DECISION_GRAPH_RECORD_TYPE,
      limit: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: /Source result/i }));
    expect(onNavigate).toHaveBeenCalledWith("label", "assistant");
  });

  it("marks saved decisions stale when the session source advances", async () => {
    const { client } = clientWithRecord(record({ entryCount: 4, lastEntryId: "label" }));

    render(
      <SessionGraphView
        client={client}
        session={{ path: "/tmp/session.jsonl" }}
        entries={ENTRIES}
      />,
    );

    expect(await screen.findByText("Stale")).toBeTruthy();
    expect(screen.getByText(/predates the latest session entries/i)).toBeTruthy();
  });

  it("shows a successful empty state when no high-signal decisions are found", async () => {
    const { client } = clientWithRecord(record(undefined, []));

    render(
      <SessionGraphView
        client={client}
        session={{ path: "/tmp/session.jsonl" }}
        entries={ENTRIES}
      />,
    );

    expect(await screen.findByText("No high-signal decisions found.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Session decision graph" })).toBeNull();
  });

  it("preserves the original topology view behind the mode switch", async () => {
    const { client, listForScope } = clientWithRecord();

    render(
      <SessionGraphView
        client={client}
        session={{ path: "/tmp/session.jsonl" }}
        entries={ENTRIES}
      />,
    );

    await waitFor(() => expect(listForScope).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Topology" }));
    expect(screen.getByTestId("topology-map")).toBeTruthy();
  });
});
