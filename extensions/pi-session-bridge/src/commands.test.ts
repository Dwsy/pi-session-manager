import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

vi.mock("@earendil-works/pi-tui", () => ({
  visibleWidth: (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "").length,
}));

const openPsmSession = vi.fn();
const getSessionId = vi.fn();
const notifyPsmStatusChange = vi.fn();
const getAllStatuses = vi.fn();
const getSessionStatus = vi.fn();
const getAllLabels = vi.fn();
const getAllSessionLabels = vi.fn();
const setSessionStatus = vi.fn();
const clearSessionStatus = vi.fn();
const createStatus = vi.fn();
const assignLabel = vi.fn();
const removeLabel = vi.fn();
const createLabel = vi.fn();

vi.mock("./open-psm.js", () => ({ openPsmSession }));
vi.mock("./connection-manager.js", () => ({
  getConnection: () => null,
  isLiveEnabled: () => false,
  getSessionId,
  doDisconnect: vi.fn(),
  doConnect: vi.fn(),
  disableLiveMode: vi.fn(),
  enableLiveMode: vi.fn(),
  notifyPsmStatusChange,
}));
vi.mock("./kanban-store.js", () => ({
  getAllStatuses,
  getSessionStatus,
  getAllLabels,
  getAllSessionLabels,
  setSessionStatus,
  clearSessionStatus,
  createStatus,
  assignLabel,
  removeLabel,
  createLabel,
}));

function makePi() {
  const handlers = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
  const pi = {
    registerCommand(name: string, opts: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
      handlers.set(name, opts.handler);
    },
  } as ExtensionAPI;
  return { pi, handlers };
}

describe("pi-session-bridge commands", () => {
  beforeEach(() => {
    vi.resetModules();
    openPsmSession.mockReset();
    getSessionId.mockReset();
    notifyPsmStatusChange.mockReset();
    getAllStatuses.mockReset();
    getSessionStatus.mockReset();
    getAllLabels.mockReset();
    getAllSessionLabels.mockReset();
    setSessionStatus.mockReset();
    clearSessionStatus.mockReset();
    createStatus.mockReset();
    assignLabel.mockReset();
    removeLabel.mockReset();
    createLabel.mockReset();

    getSessionId.mockReturnValue("sid");
    openPsmSession.mockResolvedValue({ url: "pi-session://sessions/sid", mode: "desktop" });
    getAllStatuses.mockResolvedValue([{ id: "tag-1", name: "Todo", color: "info", sort_order: 0, is_builtin: false, created_at: "", parent_id: null }]);
    getSessionStatus.mockResolvedValue(null);
    getAllLabels.mockResolvedValue([{ id: "label-1", name: "backend", color: "#0969da", description: "Backend work", created_at: "", updated_at: "" }]);
    getAllSessionLabels.mockResolvedValue([]);
    setSessionStatus.mockResolvedValue(undefined);
    clearSessionStatus.mockResolvedValue(undefined);
    createStatus.mockResolvedValue({ id: "tag-new", name: "New", color: "info", sort_order: 1, is_builtin: false, created_at: "", parent_id: null });
    assignLabel.mockResolvedValue(undefined);
    removeLabel.mockResolvedValue(undefined);
    createLabel.mockResolvedValue({ id: "label-new", name: "New", color: "#0969da", description: "", created_at: "", updated_at: "" });
  });

  it("registers bridge and kanban commands", async () => {
    const { pi, handlers } = makePi();
    const { registerAll } = await import("./commands.js");

    registerAll(pi);

    expect(handlers.has("open-in-psm")).toBe(true);
    expect(handlers.has("psm")).toBe(true);
    expect(handlers.has("kanban")).toBe(true);
    expect(handlers.has("open-in-pms")).toBe(false);
  });

  it("opens current session from open-in-psm command", async () => {
    const { pi, handlers } = makePi();
    const ctx = { ui: { notify: vi.fn() } } as unknown as ExtensionContext;
    const { registerAll } = await import("./commands.js");
    registerAll(pi);

    openPsmSession.mockResolvedValue({ url: "http://127.0.0.1:5002/#/sessions/sid", mode: "web" });

    await handlers.get("open-in-psm")!("web", ctx);

    expect(openPsmSession).toHaveBeenCalledWith("sid", "web");
    expect(ctx.ui.notify).toHaveBeenCalledWith("Opened PSM web session", "info");
  });

  it("uses command context session id when cached bridge session is empty", async () => {
    getSessionId.mockReturnValue("");
    const { pi, handlers } = makePi();
    const ctx = {
      sessionManager: { getSessionId: () => "ctx-session-id" },
      ui: { notify: vi.fn() },
    } as unknown as ExtensionContext;
    const { registerAll } = await import("./commands.js");
    registerAll(pi);

    await handlers.get("open-in-psm")!("", ctx);

    expect(openPsmSession).toHaveBeenCalledWith("ctx-session-id", "");
    expect(ctx.ui.notify).toHaveBeenCalledWith("Opened PSM desktop session", "info");
  });

  it("rejects /kanban outside TUI mode", async () => {
    const { pi, handlers } = makePi();
    const ctx = { mode: "headless", ui: { notify: vi.fn() } } as unknown as ExtensionContext;
    const { registerAll } = await import("./commands.js");
    registerAll(pi);

    await handlers.get("kanban")!("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("/kanban requires TUI mode", "error");
  });

  it("sets the selected Kanban Status from the custom TUI popup", async () => {
    const { pi, handlers } = makePi();
    const render = vi.fn();
    const custom = vi.fn(async (
      factory: (tui: unknown, theme: unknown, kb: unknown, done: (result: unknown) => void) => unknown,
      opts?: { overlay?: boolean },
    ) => {
      expect(opts).toEqual({ overlay: true });
      const allowedThemeColors = new Set(["accent", "border", "success", "error", "warning", "muted", "dim", "text"]);
      const theme = {
        fg: vi.fn((color: string, text: string) => {
          if (!allowedThemeColors.has(color)) throw new Error(`Unknown theme color: ${color}`);
          return text;
        }),
        bold: vi.fn((text: string) => text),
      };
      const component = factory({ requestRender: render }, theme, {}, vi.fn()) as { width?: number; render(width: number): string[]; handleInput(data: string): void };
      const output = component.render(80).join("\n");
      expect(component.width).toBe(76);
      expect(output).toContain("╭");
      expect(output).toContain("( ) Todo");
      expect(output).toContain("[ ] backend #0969da — Backend work");
      expect(theme.fg).toHaveBeenCalledWith("accent", expect.any(String));
      expect(theme.fg).toHaveBeenCalledWith("border", expect.any(String));
      component.handleInput("\r");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const ctx = {
      mode: "tui",
      ui: { notify: vi.fn(), input: vi.fn(), custom },
    } as unknown as ExtensionContext;
    const { registerAll } = await import("./commands.js");
    registerAll(pi);

    await handlers.get("kanban")!("", ctx);

    expect(custom).toHaveBeenCalledWith(expect.any(Function), { overlay: true });
    expect(setSessionStatus).toHaveBeenCalledWith("sid", "tag-1", 0);
    expect(notifyPsmStatusChange).toHaveBeenCalledWith("sid");
  });

  it("maps every PSM Status color to a valid Pi theme color", async () => {
    const { mapKanbanStatusColorToTheme } = await import("./commands.js");

    expect(mapKanbanStatusColorToTheme("info")).toBe("accent");
    expect(mapKanbanStatusColorToTheme("success")).toBe("success");
    expect(mapKanbanStatusColorToTheme("emerald")).toBe("success");
    expect(mapKanbanStatusColorToTheme("warning")).toBe("warning");
    expect(mapKanbanStatusColorToTheme("amber")).toBe("warning");
    expect(mapKanbanStatusColorToTheme("destructive")).toBe("error");
    expect(mapKanbanStatusColorToTheme("slate")).toBe("muted");
    for (const color of ["purple", "pink", "indigo", "cyan", "ring"]) {
      expect(mapKanbanStatusColorToTheme(color)).toBe("accent");
    }
    expect(mapKanbanStatusColorToTheme("#4f46e5")).toBe("accent");
    expect(mapKanbanStatusColorToTheme("future-color")).toBe("accent");
    expect(mapKanbanStatusColorToTheme(undefined)).toBe("accent");
  });
});
