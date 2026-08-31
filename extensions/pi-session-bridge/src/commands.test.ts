import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

vi.mock("@earendil-works/pi-tui", () => ({
  visibleWidth: (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "").length,
}));

const openPsmSession = vi.fn();
const getSessionId = vi.fn();
const notifyPsmTagChange = vi.fn();
const getAllTags = vi.fn();
const getAllSessionTags = vi.fn();
const moveSessionTag = vi.fn();
const removeTagFromSession = vi.fn();
const createTag = vi.fn();

vi.mock("./open-psm.js", () => ({ openPsmSession }));
vi.mock("./connection-manager.js", () => ({
  getConnection: () => null,
  isLiveEnabled: () => false,
  getSessionId,
  doDisconnect: vi.fn(),
  doConnect: vi.fn(),
  disableLiveMode: vi.fn(),
  enableLiveMode: vi.fn(),
  notifyPsmTagChange,
}));
vi.mock("./kanban-store.js", () => ({
  getAllTags,
  getAllSessionTags,
  moveSessionTag,
  removeTagFromSession,
  createTag,
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
    notifyPsmTagChange.mockReset();
    getAllTags.mockReset();
    getAllSessionTags.mockReset();
    moveSessionTag.mockReset();
    removeTagFromSession.mockReset();
    createTag.mockReset();

    getSessionId.mockReturnValue("sid");
    openPsmSession.mockResolvedValue({ url: "pi-session://sessions/sid", mode: "desktop" });
    getAllTags.mockResolvedValue([{ id: "tag-1", name: "Todo", color: "info", sort_order: 0, is_builtin: false, created_at: "", parent_id: null }]);
    getAllSessionTags.mockResolvedValue([]);
    moveSessionTag.mockResolvedValue(undefined);
    removeTagFromSession.mockResolvedValue(undefined);
    createTag.mockResolvedValue({ id: "tag-new", name: "New", color: "info", sort_order: 1, is_builtin: false, created_at: "", parent_id: null });
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

  it("toggles the selected Kanban tag from the custom TUI popup", async () => {
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
      expect(component.width).toBe(70);
      expect(output).toContain("╭");
      expect(output).toContain("[ ] Todo");
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
    expect(moveSessionTag).toHaveBeenCalledWith("sid", null, "tag-1", 0);
    expect(notifyPsmTagChange).toHaveBeenCalledWith("sid", []);
  });

  it("maps every PSM tag color to a valid Pi theme color", async () => {
    const { mapKanbanTagColorToTheme } = await import("./commands.js");

    expect(mapKanbanTagColorToTheme("info")).toBe("accent");
    expect(mapKanbanTagColorToTheme("success")).toBe("success");
    expect(mapKanbanTagColorToTheme("emerald")).toBe("success");
    expect(mapKanbanTagColorToTheme("warning")).toBe("warning");
    expect(mapKanbanTagColorToTheme("amber")).toBe("warning");
    expect(mapKanbanTagColorToTheme("destructive")).toBe("error");
    expect(mapKanbanTagColorToTheme("slate")).toBe("muted");
    for (const color of ["purple", "pink", "indigo", "cyan", "ring"]) {
      expect(mapKanbanTagColorToTheme(color)).toBe("accent");
    }
    expect(mapKanbanTagColorToTheme("#4f46e5")).toBe("accent");
    expect(mapKanbanTagColorToTheme("future-color")).toBe("accent");
    expect(mapKanbanTagColorToTheme(undefined)).toBe("accent");
  });
});
