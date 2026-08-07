import { describe, expect, it, vi } from "vitest";
import type {
  PsmCapabilityClient,
  PsmPluginHostContext,
  PsmSessionJsonlEntry,
} from "@pi-session-manager/plugin-sdk";

import { buildSessionBranchModel, buildTopologyLayout } from "@/utils/session-branch";

import { refreshDecisionGraphWithAgent } from "./decisionGraphAgent";
import { buildDecisionGraphContext } from "./decisionGraphContext";
import {
  DECISION_GRAPH_RECORD_TYPE,
  isDecisionGraphFresh,
  parseDecisionGraphPayload,
} from "./decisionGraphTypes";
import activate, { manifest } from "./index";
import { resolveBranchMapNavigation } from "./SessionGraphView";

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
    // Activation only exercises UI registration; the remaining host surface is intentionally absent.
    const ctx = { ui: { registerSessionTreeView } } as unknown as PsmPluginHostContext;

    activate(ctx);

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

  it("is opt-in and declares the semantic record capabilities", () => {
    expect(manifest).toMatchObject({
      defaultEnabled: false,
      permissions: expect.arrayContaining([
        "sessions:read",
        "records:read",
        "records:write",
        "agent:invoke",
      ]),
      records: [
        {
          type: DECISION_GRAPH_RECORD_TYPE,
          scope: "session",
          schemaVersion: 1,
        },
      ],
    });
  });

  it("validates decision graph entry anchors and freshness", () => {
    const payload = parseDecisionGraphPayload(
      {
        schemaVersion: 1,
        generatedAt: "2026-01-01T00:00:05Z",
        source: { entryCount: ENTRIES.length, lastEntryId: "alternate" },
        nodes: [
          {
            id: "decision-1",
            kind: "decision",
            title: "Keep semantic navigation",
            summary: "Decision evidence should reveal the corresponding session entry.",
            anchorEntryId: "result",
            evidenceEntryIds: ["assistant", "assistant"],
            status: "active",
          },
        ],
        edges: [],
      },
      ENTRIES,
    );

    expect(payload.nodes[0]?.evidenceEntryIds).toEqual(["assistant"]);
    expect(isDecisionGraphFresh(payload, ENTRIES)).toBe(true);
    expect(isDecisionGraphFresh(payload, [...ENTRIES, { ...ENTRIES[0], id: "new" }])).toBe(false);

    expect(() =>
      parseDecisionGraphPayload(
        {
          ...payload,
          nodes: [{ ...payload.nodes[0], anchorEntryId: "missing" }],
        },
        ENTRIES,
      ),
    ).toThrow("Unknown decision graph anchor entry: missing");
  });

  it("builds bounded agent context from session entry ids", () => {
    const context = buildDecisionGraphContext(ENTRIES);

    expect(context).toContain("ENTRY root");
    expect(context).toContain("ENTRY alternate");
    expect(context.length).toBeLessThanOrEqual(36000);
  });

  it("prioritizes decision evidence when the context is crowded", () => {
    const toolNoise = Array.from({ length: 120 }, (_, index): PsmSessionJsonlEntry => ({
      type: "message",
      id: `noise-${index}`,
      parentId: null,
      timestamp: `2026-01-01T00:${String(index % 60).padStart(2, "0")}:00Z`,
      message: {
        role: "toolResult",
        toolCallId: `call-${index}`,
        content: [{ type: "text", text: `Routine tool output ${index}` }],
      },
    }));
    const crowdedEntries = [
      ...toolNoise.slice(0, 60),
      {
        type: "message",
        id: "critical-user",
        parentId: null,
        timestamp: "2026-01-01T01:00:00Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "Switch to evidence-first decision extraction." }],
        },
      } as PsmSessionJsonlEntry,
      {
        type: "compaction",
        id: "decision-compaction",
        parentId: "critical-user",
        timestamp: "2026-01-01T01:00:01Z",
        summary: "Compacted after the extraction strategy changed.",
      } as PsmSessionJsonlEntry,
      {
        type: "model_change",
        id: "reasoning-model",
        parentId: "decision-compaction",
        timestamp: "2026-01-01T01:00:02Z",
        provider: "openai",
        modelId: "gpt-5.6",
        thinkingLevel: "high",
      } as PsmSessionJsonlEntry,
      ...toolNoise.slice(60),
    ];

    const context = buildDecisionGraphContext(crowdedEntries);

    expect(context).toContain("ENTRY critical-user");
    expect(context).toContain("Switch to evidence-first decision extraction.");
    expect(context).toContain("ENTRY decision-compaction");
    expect(context).toContain("ENTRY reasoning-model");
    expect(context).toContain("provider=openai model=gpt-5.6 thinking=high");
    expect(context.length).toBeLessThanOrEqual(36000);
  });

  it("validates agent output before persisting a decision record", async () => {
    const createSession = vi.fn().mockResolvedValue({ sessionId: "agent-1" });
    const runStream = vi.fn().mockResolvedValue({
      sessionId: "agent-1",
      text: JSON.stringify({
        nodes: [
          {
            id: "decision-1",
            kind: "decision",
            title: "Preserve branch navigation",
            summary: "Decision sources use the same navigation semantics as topology nodes.",
            anchorEntryId: "result",
            evidenceEntryIds: ["assistant"],
            status: "active",
          },
        ],
        edges: [],
      }),
    });
    const dispose = vi.fn().mockResolvedValue(undefined);
    const upsert = vi.fn().mockResolvedValue(undefined);
    // The function under test only touches agent and records capabilities.
    const client = {
      agent: {
        createSession,
        runStream,
        dispose,
      },
      records: {
        upsert,
      },
    } as unknown as PsmCapabilityClient;

    const payload = await refreshDecisionGraphWithAgent(client, {
      path: "/tmp/session.jsonl",
      entries: ENTRIES,
    });

    expect(payload.nodes[0]?.anchorEntryId).toBe("result");
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingLevel: "high",
        systemPrompt: expect.stringContaining("Apply an evidence gate before emitting every node"),
      }),
    );
    expect(runStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "agent-1",
        prompt: expect.stringContaining("ENTRY result"),
      }),
      expect.any(Object),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "builtin.session-graph",
        scopeType: "session",
        scopeId: "/tmp/session.jsonl",
        recordType: DECISION_GRAPH_RECORD_TYPE,
        payload,
      }),
    );
    expect(dispose).toHaveBeenCalledWith("agent-1");
  });
});
