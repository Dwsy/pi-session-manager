import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const openPsmSession = vi.fn();

vi.mock("./open-psm.js", () => ({ openPsmSession }));
vi.mock("./connection-manager.js", () => ({
  getConnection: () => null,
  isLiveEnabled: () => false,
  getSessionId: () => "sid",
  doDisconnect: vi.fn(),
  doConnect: vi.fn(),
  disableLiveMode: vi.fn(),
  enableLiveMode: vi.fn(),
  notifyPsmTagChange: vi.fn(),
}));

describe("pi-session-bridge commands", () => {
  beforeEach(() => {
    vi.resetModules();
    openPsmSession.mockReset();
    openPsmSession.mockResolvedValue({ url: "pi-session://sessions/sid", mode: "desktop" });
  });

  it("registers only open-in-psm", async () => {
    const handlers = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
    const pi = {
      registerCommand(name: string, opts: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
        handlers.set(name, opts.handler);
      },
    } as ExtensionAPI;
    const { registerAll } = await import("./commands.js");

    registerAll(pi);

    expect(handlers.has("open-in-psm")).toBe(true);
    expect(handlers.has("open-in-pms")).toBe(false);
  });

  it("opens current session from open-in-psm command", async () => {
    const handlers = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
    const pi = {
      registerCommand(name: string, opts: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
        handlers.set(name, opts.handler);
      },
    } as ExtensionAPI;
    const ctx = { ui: { notify: vi.fn() } } as unknown as ExtensionContext;
    const { registerAll } = await import("./commands.js");
    registerAll(pi);

    openPsmSession.mockResolvedValue({ url: "http://127.0.0.1:5002/#/sessions/sid", mode: "web" });

    await handlers.get("open-in-psm")!("web", ctx);

    expect(openPsmSession).toHaveBeenCalledWith("sid", "web");
    expect(ctx.ui.notify).toHaveBeenCalledWith("Opened PSM web session", "info");
  });
});
