import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserDatasetDayStats, getBrowserDatasetStats } from "./stats";
import type { RemoteDatasetSession } from "./core";

const { mockLoadDatasetCache } = vi.hoisted(() => ({
  mockLoadDatasetCache: vi.fn(),
}));

vi.mock("./core", () => {
  return {
    loadDatasetCache: (...args: unknown[]) => mockLoadDatasetCache(...args),
  };
});

function buildDatasetSession(timestamp: string): RemoteDatasetSession {
  const path = "/datasets/demo/session.jsonl";
  const entries: any[] = [
    {
      type: "session",
      id: "session-1",
      timestamp,
    },
    {
      type: "message",
      id: "user-1",
      timestamp,
      message: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    },
    {
      type: "message",
      id: "assistant-1",
      timestamp,
      message: {
        role: "assistant",
        model: "model-a",
        content: [{ type: "text", text: "first" }],
        usage: {
          input: 10,
          output: 20,
          cacheRead: 1,
          cacheWrite: 2,
          cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.02 },
        },
      },
    },
    {
      type: "message",
      id: "assistant-2",
      timestamp,
      message: {
        role: "assistant",
        model: "model-b",
        content: [{ type: "text", text: "second" }],
        usage: {
          input_tokens: 5,
          output_tokens: 7,
          cache_read: 3,
          cache_creation_input_tokens: 4,
          cost: { input_cost: 0.05, output_cost: 0.07, cache_read_cost: 0.03, cache_write_cost: 0.04 },
        },
      },
    },
  ];

  return {
    info: {
      path,
      id: "session-1",
      cwd: "/repo/demo",
      created: timestamp,
      modified: timestamp,
      message_count: 3,
      first_message: "hello",
      user_messages_text: "hello",
      assistant_messages_text: "first\nsecond",
      last_message: "second",
      last_message_role: "assistant",
    },
    content: entries.map((entry) => JSON.stringify(entry)).join("\n"),
    path,
    relativePath: "session.jsonl",
    fileSize: 1,
    entries,
  };
}

describe("browser dataset stats", () => {
  beforeEach(() => {
    const date = new Date().toISOString().slice(0, 10);
    const session = buildDatasetSession(`${date}T10:00:00Z`);
    mockLoadDatasetCache.mockResolvedValue({
      datasetId: "demo",
      sessions: [session],
      sessionByPath: new Map([[session.path, session]]),
    });
  });

  it("aggregates tokens and messages per model without duplicating multi-model sessions", async () => {
    const stats = await getBrowserDatasetStats();

    expect(stats.token_details.total_input).toBe(15);
    expect(stats.token_details.total_output).toBe(27);
    expect(stats.token_details.total_cache_read).toBe(4);
    expect(stats.token_details.total_cache_write).toBe(6);
    expect(stats.token_details.total_cost).toBeCloseTo(0.52);
    expect(stats.total_tokens).toBe(42);

    expect(stats.token_details.tokens_by_model["model-a"]).toMatchObject({
      messages: 1,
      input: 10,
      output: 20,
      cache_read: 1,
      cache_write: 2,
    });
    expect(stats.token_details.tokens_by_model["model-a"].cost).toBeCloseTo(0.33);
    expect(stats.token_details.tokens_by_model["model-b"]).toMatchObject({
      messages: 1,
      input: 5,
      output: 7,
      cache_read: 3,
      cache_write: 4,
    });
    expect(stats.token_details.tokens_by_model["model-b"].cost).toBeCloseTo(0.19);
  });

  it("keeps day stats token cost aligned with session usage", async () => {
    const date = new Date().toISOString().slice(0, 10);
    const day = await getBrowserDatasetDayStats(date);

    expect(day.total_tokens).toBe(52);
    expect(day.token_details.total_input).toBe(15);
    expect(day.token_details.total_output).toBe(27);
    expect(day.token_details.total_cache_read).toBe(4);
    expect(day.token_details.total_cache_write).toBe(6);
    expect(day.token_details.total_cost).toBeCloseTo(0.52);
  });
});
