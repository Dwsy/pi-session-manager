// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ToolRenderContext } from "@/plugins/tools-render/types";
import { writeToolPlugin } from "./write";

const context: ToolRenderContext = {
  isExpanded: false,
  toggleExpanded: vi.fn(),
  ensureExpanded: vi.fn(),
  theme: "dark",
  isMobile: false,
  t: (_key, fallback) => (typeof fallback === "string" ? fallback : ""),
  copyToClipboard: vi.fn(),
  disableSuccessStyle: false,
};

function renderWrite(path: string, content: string) {
  const Component = writeToolPlugin.component;
  const args = { path, content };
  return render(
    <Component
      toolCall={{
        type: "toolCall",
        id: "call-write",
        name: "write",
        arguments: args,
      }}
      resolvedData={{
        name: "write",
        args,
        toolCallId: "call-write",
        entryId: "tool-result-call-write",
        output: "",
        isError: false,
      }}
      context={context}
    />,
  );
}

describe("writeToolPlugin HTML preview", () => {
  it("opens written HTML in a sandboxed preview dialog", () => {
    const html = "<main><h1>Hello</h1></main>";
    renderWrite("preview.html", html);

    fireEvent.click(screen.getByRole("button", { name: "Preview HTML" }));

    expect(
      screen.getByRole("dialog", { name: "Preview HTML: preview.html" }),
    ).toBeTruthy();
    const frame = screen.getByTitle("Preview HTML: preview.html");
    expect(frame.getAttribute("srcdoc")).toBe(html);
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("does not show a preview action for non-HTML writes", () => {
    renderWrite("notes.md", "# Notes");

    expect(screen.queryByRole("button", { name: "Preview HTML" })).toBeNull();
  });
});
