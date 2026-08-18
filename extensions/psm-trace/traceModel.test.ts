import { describe, expect, it } from "vitest";

import { buildSessionBranchModel } from "@/utils/session-branch";
import type { SessionEntry } from "@/types";

import {
  buildTraceTimeline,
  filterTraceSteps,
  formatLatency,
  observedToolSignature,
} from "./traceModel";

function entry(value: Record<string, unknown>): SessionEntry {
  return value as unknown as SessionEntry;
}

const ENTRIES: SessionEntry[] = [
  entry({ type: "session", id: "session", version: 3, timestamp: "2026-08-13T10:00:00.000Z" }),
  entry({
    type: "message",
    id: "u1",
    parentId: null,
    timestamp: "2026-08-13T10:00:00.000Z",
    message: { role: "user", content: [{ type: "text", text: "find the docs" }] },
  }),
  entry({
    type: "message",
    id: "a1",
    parentId: "u1",
    timestamp: "2026-08-13T10:00:04.000Z",
    message: {
      role: "assistant",
      model: "gpt-x",
      provider: "openai",
      usage: { input: 100, output: 50, cacheRead: 900, cacheWrite: 0, totalTokens: 1050 },
      content: [
        { type: "toolCall", id: "call-1", name: "web_search", arguments: { query: "pi docs" } },
      ],
    },
  }),
  entry({
    type: "message",
    id: "t1",
    parentId: "a1",
    timestamp: "2026-08-13T10:00:04.250Z",
    message: {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "web_search",
      isError: true,
      content: [{ type: "text", text: "WEB_PROVIDER_ERROR" }],
    },
  }),
  entry({
    type: "message",
    id: "a2",
    parentId: "t1",
    timestamp: "2026-08-13T10:00:06.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Search failed." }] },
  }),
  entry({
    type: "message",
    id: "u2",
    parentId: "a2",
    timestamp: "2026-08-13T10:00:10.000Z",
    message: { role: "user", content: [{ type: "text", text: "try again" }] },
  }),
];

function timeline() {
  const model = buildSessionBranchModel(ENTRIES, { sessionName: "trace" });
  return { model, trace: buildTraceTimeline(model, model.defaultLeaf.uid) };
}

describe("traceModel", () => {
  it("numbers turns from user prompts and steps within each turn", () => {
    const { trace } = timeline();
    expect(trace.steps.map((step) => [step.node.id, step.turn, step.step])).toEqual([
      ["u1", 1, 1],
      ["a1", 1, 2],
      ["t1", 1, 3],
      ["a2", 1, 4],
      ["u2", 2, 1],
    ]);
  });

  it("derives step duration from the gap since the previous path entry", () => {
    const { trace } = timeline();
    const durations = Object.fromEntries(
      trace.steps.map((step) => [step.node.id, step.durationMs]),
    );
    expect(durations.u1).toBe(0);
    expect(durations.a1).toBe(4000);
    expect(durations.t1).toBe(250);
    expect(trace.stats.modelMs).toBe(4000 + 1750);
    expect(trace.stats.toolMs).toBe(250);
  });

  it("pairs a tool result with the arguments of its originating call", () => {
    const { trace } = timeline();
    const tool = trace.steps.find((step) => step.node.id === "t1");
    expect(tool?.badge).toBe("TOOL");
    expect(tool?.title).toBe('web_search {query: pi docs}');
    expect(tool?.detail).toBe("WEB_PROVIDER_ERROR");
    expect(tool?.isError).toBe(true);
    expect(tool?.tool?.callerUid).toBe(
      trace.steps.find((step) => step.node.id === "a1")?.uid,
    );
  });

  it("assigns lanes and reports cache and throughput stats", () => {
    const { trace } = timeline();
    expect(trace.steps.map((step) => step.lane)).toEqual([
      "input",
      "model",
      "tools",
      "model",
      "input",
    ]);
    expect(trace.stats.turns).toBe(2);
    expect(trace.stats.errors).toBe(1);
    expect(trace.stats.cacheHitRate).toBeCloseTo(900 / 1000, 5);
    expect(trace.stats.outputPerSecond).toBeCloseTo(50 / 5.75, 3);
  });

  it("filters steps per lens and search token", () => {
    const { trace } = timeline();
    expect(filterTraceSteps(trace.steps, "calls", "").map((step) => step.node.id)).toEqual([
      "t1",
    ]);
    expect(filterTraceSteps(trace.steps, "errors", "").map((step) => step.node.id)).toEqual([
      "t1",
    ]);
    // The tool-only assistant message drops out of the conversation lens.
    expect(filterTraceSteps(trace.steps, "turns", "").map((step) => step.node.id)).toEqual([
      "u1",
      "a2",
      "u2",
    ]);
    expect(
      filterTraceSteps(trace.steps, "duration", "try again").map((step) => step.node.id),
    ).toEqual(["u2"]);
  });

  it("reports the tool signature observed in the session", () => {
    const { model } = timeline();
    const signature = observedToolSignature(model, "web_search");
    expect(signature.calls).toBe(1);
    expect(signature.failures).toBe(1);
    expect(signature.parameters).toEqual([
      { key: "query", types: ["string"], presence: 1 },
    ]);
  });

  it("formats latency across millisecond, second, and minute ranges", () => {
    expect(formatLatency(0)).toBe("0s");
    expect(formatLatency(245)).toBe("245ms");
    expect(formatLatency(4000)).toBe("4.0s");
    expect(formatLatency(332_000)).toBe("5m32s");
  });
});
