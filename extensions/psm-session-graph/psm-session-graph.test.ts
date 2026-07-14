import { describe, expect, it, vi } from "vitest";

import { buildSessionBranchModel, buildTopologyLayout } from "@/utils/session-branch";

import activate, { manifest } from "./index";
import { resolveBranchMapNavigation } from "./SessionGraphView";

const ENTRIES = [
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

describe("psm-session-graph plugin", () => {
  it("uses shared fork-only topology for Branch Map", () => {
    const model = buildSessionBranchModel(ENTRIES);
    const layout = buildTopologyLayout(model, "sequence");

    expect(model.forks).toHaveLength(1);
    expect(model.forks[0]?.anchor.id).toBe("root");
    expect(layout.forkLinks).toHaveLength(2);
  });

  it("keeps Tree-compatible navigation for label and toolResult nodes", () => {
    const model = buildSessionBranchModel(ENTRIES);

    expect(
      resolveBranchMapNavigation(model, model.firstById.get("result")!),
    ).toMatchObject({ leafId: "label", targetId: "assistant" });
    expect(
      resolveBranchMapNavigation(model, model.firstById.get("label")!),
    ).toMatchObject({ leafId: "label", targetId: "assistant" });
  });

  it("registers Branch Map as the only graph tree view", () => {
    const registerSessionTreeView = vi.fn();
    const ctx = { ui: { registerSessionTreeView } };

    activate(ctx as any);

    expect(manifest).toMatchObject({
      id: "builtin.session-graph",
      name: "Branch Map",
      version: "0.2.0",
    });
    expect(registerSessionTreeView).toHaveBeenCalledTimes(1);
    expect(registerSessionTreeView).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "builtin.session-graph.flow",
        title: "Branch Map",
      }),
    );
  });
});
