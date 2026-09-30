// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SessionEntry } from "@/types";
import type { ToolRenderContext } from "@/plugins/tools-render/types";
import {
  buildScriptPreview,
  codemodeToolPlugin,
  formatCost,
  formatDuration,
  resolveCodemodeData,
} from "./codemode";

const context: ToolRenderContext = {
  isExpanded: true,
  toggleExpanded: vi.fn(),
  ensureExpanded: vi.fn(),
  theme: "dark",
  isMobile: false,
  // Mirrors i18next: interpolates the fallback string with the passed options.
  t: (_key, fallback, options) =>
    typeof fallback === "string"
      ? fallback.replace(/\{\{(\w+)\}\}/g, (_match, name) =>
          String((options as Record<string, unknown> | undefined)?.[name] ?? `{{${name}}}`),
        )
      : "",
  copyToClipboard: vi.fn(),
  disableSuccessStyle: false,
};

function toolCall(code: string) {
  return {
    type: "toolCall" as const,
    id: "call-codemode",
    name: "codemode",
    arguments: { code },
  };
}

function toolResult(
  content: Array<{ type: string; text: string }>,
  details?: unknown,
): SessionEntry {
  return {
    type: "message",
    id: "result-codemode",
    timestamp: "2026-09-30T02:15:11.828Z",
    message: {
      role: "toolResult",
      toolCallId: "call-codemode",
      toolName: "codemode",
      content,
      details: details as never,
    },
  };
}

function renderCodemode(
  code: string,
  result: SessionEntry | undefined,
  overrides: Partial<ToolRenderContext> = {},
) {
  const results = new Map<string, SessionEntry>();
  if (result) results.set("call-codemode", result);

  const data = resolveCodemodeData(toolCall(code), 0, results);
  const Component = codemodeToolPlugin.component;

  return {
    data,
    ...render(
      <Component
        toolCall={toolCall(code)}
        resolvedData={data}
        context={{ ...context, ...overrides }}
      />,
    ),
  };
}

describe("resolveCodemodeData", () => {
  it("strips the Script completed header and keeps the script output", () => {
    const { data } = renderCodemode(
      "const a = await tools.bash({ command: 'pwd' });\nreturn a",
      toolResult([
        { type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
        { type: "text", text: '{"cwd":"/Users/dengwenyu"}' },
      ]),
    );

    expect(data.output).toBe('{"cwd":"/Users/dengwenyu"}');
    expect(data.wallTimeMs).toBeCloseTo(100, 5);
    expect(data.scriptFailed).toBe(false);
  });

  it("marks a failed script and keeps its error output", () => {
    const { data } = renderCodemode(
      "syntax error here",
      toolResult([
        { type: "text", text: "Script failed\nWall time 0.0 seconds\nOutput:\n" },
        { type: "text", text: "Script error:\nSyntaxError: Expected ','" },
      ]),
    );

    expect(data.scriptFailed).toBe(true);
    expect(data.output).toContain("SyntaxError");
  });

  it("joins multiple output blocks without the header", () => {
    const { data } = renderCodemode(
      "text('one'); text('two')",
      toolResult([
        { type: "text", text: "Script completed\nWall time 1.5 seconds\nOutput:\n" },
        { type: "text", text: "one" },
        { type: "text", text: "two" },
      ]),
    );

    expect(data.output).toBe("one\ntwo");
    expect(data.wallTimeMs).toBeCloseTo(1500, 5);
  });

  it("reads nested calls from details and sums model cost", () => {
    const { data } = renderCodemode(
      "await tools.bash({ command: 'pwd' })",
      toolResult(
        [{ type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" }],
        {
          calls: [
            { id: "c/1", name: "bash", args: '{"command":"pwd"}', status: "ok", durationMs: 6.4 },
            { id: "c/2", name: "read", args: '{"path":"a"}', status: "error", error: "nope" },
            { id: "c/3", name: "models.classify", args: "{}", status: "ok", cost: 0.02 },
            { id: "c/4", name: "models.classify", args: "{}", status: "ok", cost: 0.005 },
          ],
          fullOutputPath: "/tmp/pi-codemode-abc.txt",
        },
      ),
    );

    expect(data.calls).toHaveLength(4);
    expect(data.calls[1].error).toBe("nope");
    expect(data.totalCost).toBeCloseTo(0.025, 5);
    expect(data.fullOutputPath).toBe("/tmp/pi-codemode-abc.txt");
  });

  it("falls back to the persisted nestedCalls snapshot", () => {
    const result = toolResult([
      { type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
    ]);
    (result.message as unknown as Record<string, unknown>).nestedCalls = {
      calls: [
        { id: "c/1", name: "bash", status: "ok", arguments: { command: "pwd" }, durationMs: 7 },
        { id: "c/2", name: "read", status: "unfinished" },
      ],
    };

    const { data } = renderCodemode("await tools.bash({ command: 'pwd' })", result);

    expect(data.calls).toHaveLength(2);
    expect(data.calls[0].args).toBe('{"command":"pwd"}');
    expect(data.calls[1].status).toBe("running");
  });

  it("keeps results without the script header untouched", () => {
    const { data } = renderCodemode("x", toolResult([{ type: "text", text: "plain output" }]));

    expect(data.output).toBe("plain output");
    expect(data.scriptFailed).toBe(false);
    expect(data.wallTimeMs).toBeUndefined();
  });
});

describe("codemode header", () => {
  it("shows the call count and the first script line when collapsed", () => {
    const { data } = renderCodemode(
      "// @options: {\"max_output_tokens\": 1000}\nconst cwd = await tools.bash({ command: 'pwd' });",
      toolResult(
        [{ type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" }],
        {
          calls: [
            { id: "c/1", name: "bash", args: '{"command":"pwd"}', status: "ok", durationMs: 6 },
            { id: "c/2", name: "read", args: '{"path":"a"}', status: "ok", durationMs: 3 },
          ],
        },
      ),
      { isExpanded: false },
    );

    expect(buildScriptPreview(data.code)).toBe("const cwd = await tools.bash({ command: 'pwd' });");
    expect(screen.getByText("2 calls")).toBeTruthy();
  });

  it("renders script, nested calls and output when expanded", () => {
    const { container } = renderCodemode(
      "const cwd = await tools.bash({ command: 'pwd' });",
      toolResult(
        [
          { type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
          { type: "text", text: '{"cwd":"/Users/dengwenyu"}' },
        ],
        {
          calls: [
            { id: "c/1", name: "bash", args: '{"command":"pwd"}', status: "ok", durationMs: 6400 },
          ],
        },
      ),
    );

    expect(screen.getByText("Script")).toBeTruthy();
    expect(screen.getByText("Nested calls")).toBeTruthy();
    expect(screen.getByText("Output")).toBeTruthy();
    // The script body also mentions `bash`, so scope the assertion to the call list.
    const callNames = Array.from(container.querySelectorAll(".codemode-call-name")).map(
      (node) => node.textContent,
    );
    expect(callNames).toEqual(["bash"]);
    expect(screen.getByText("6.4s")).toBeTruthy();
  });

  it("marks a failed script with the error status", () => {
    const { container } = renderCodemode(
      "boom",
      toolResult(
        [
          { type: "text", text: "Script failed\nWall time 0.0 seconds\nOutput:\n" },
          { type: "text", text: "SyntaxError" },
        ],
        { calls: [{ id: "c/1", name: "bash", args: "{}", status: "error", error: "bad" }] },
      ),
    );

    expect(container.querySelector(".tool-execution.error")).toBeTruthy();
    expect(screen.getByText("bad")).toBeTruthy();
  });
});

describe("codemode formatting helpers", () => {
  it("formats durations below and above a second", () => {
    expect(formatDuration(640)).toBe("640ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(undefined)).toBe("");
  });

  it("formats model costs", () => {
    expect(formatCost(0.02)).toBe("$0.02");
    expect(formatCost(0.005)).toBe("$0.0050");
  });
});
