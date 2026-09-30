// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Content, SessionEntry } from "@/types";
import type { ToolRenderContext } from "@/plugins/tools-render/types";
import { toolRenderRegistry } from "@/plugins/tools-render/registry";
import { registerBuiltinToolPlugins } from "./index";
import { bashToolPlugin, powershellToolPlugin } from "./bash";

const context: ToolRenderContext = {
  isExpanded: true,
  toggleExpanded: vi.fn(),
  ensureExpanded: vi.fn(),
  theme: "dark",
  isMobile: false,
  t: (_key, fallback) => (typeof fallback === "string" ? fallback : ""),
  copyToClipboard: vi.fn(),
  disableSuccessStyle: false,
};

function renderShell(
  plugin: typeof bashToolPlugin,
  command: string,
  result?: Partial<SessionEntry["message"]>,
) {
  const entry: SessionEntry | undefined = result
    ? {
        type: "message",
        id: "result-1",
        timestamp: "2026-09-30T13:00:00.000Z",
        message: { role: "toolResult", content: [], ...result } as never,
      }
    : undefined;

  const toolCall = {
    type: "toolCall" as const,
    id: "call-1",
    name: plugin.id === "builtin-powershell" ? "powershell" : "bash",
    arguments: { command },
  };

  const resolvedData = plugin.resolveData
    ? plugin.resolveData(toolCall, 0, new Map(entry ? [["call-1", entry]] : []))
    : null;

  const Component = plugin.component;
  return render(
    <Component
      toolCall={toolCall}
      resolvedData={resolvedData ?? ({ name: toolCall.name, args: toolCall.arguments } as never)}
      context={context}
    />,
  );
}

describe("shell tool registration", () => {
  it("resolves both shell tools through the registry", () => {
    registerBuiltinToolPlugins();

    const lookup = (name: string) =>
      toolRenderRegistry.findPlugin({ type: "toolCall", name, arguments: {} } as Content).id;

    expect(lookup("bash")).toBe("builtin-bash");
    expect(lookup("powershell")).toBe("builtin-powershell");
  });
});

describe("bashToolPlugin", () => {
  it("renders the command behind a $ prompt with the bash header class", () => {
    const { container } = renderShell(bashToolPlugin, "ls -la", { exitCode: 0 });

    expect(container.querySelector(".bash-command-prefix")?.textContent).toBe("$ ");
    expect(container.querySelector(".tool-header-bash")).toBeTruthy();
    expect(container.querySelector("code.language-bash")).toBeTruthy();
    expect(screen.getByText("exit 0")).toBeTruthy();
  });
});

describe("powershellToolPlugin", () => {
  it("matches the powershell tool", () => {
    expect(powershellToolPlugin.match).toBe("powershell");
    expect(powershellToolPlugin.id).toBe("builtin-powershell");
  });

  it("renders the command behind a PS> prompt, highlighted as powershell", () => {
    const { container } = renderShell(powershellToolPlugin, "Get-ChildItem | Select-Object Name", {
      exitCode: 0,
    });

    expect(container.querySelector(".bash-command-prefix")?.textContent).toBe("PS> ");
    expect(container.querySelector(".tool-header-powershell")).toBeTruthy();
    expect(container.querySelector("code.language-powershell")).toBeTruthy();
    expect(screen.getByText("exit 0")).toBeTruthy();
  });

  it("marks a non-zero exit code as failed", () => {
    const { container } = renderShell(powershellToolPlugin, "Remove-Item missing", { exitCode: 1 });

    expect(container.querySelector(".tool-execution.error")).toBeTruthy();
    expect(screen.getByText("exit 1")).toBeTruthy();
  });

  it("shows output when the script result carries text", () => {
    renderShell(powershellToolPlugin, "Write-Output hi", {
      exitCode: 0,
      content: [{ type: "text", text: "hi" }],
    });

    expect(screen.getByText("Output")).toBeTruthy();
  });

  it("previews the command with the powershell prompt", () => {
    const data = {
      name: "powershell",
      args: { command: "Get-Date" },
    } as never;

    expect(powershellToolPlugin.getPreview?.({} as never, data)).toBe("PS> Get-Date");
  });
});
