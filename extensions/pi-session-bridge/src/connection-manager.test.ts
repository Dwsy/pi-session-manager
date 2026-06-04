import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

function makeContext(sessionFile: string, entries: unknown[] = []): ExtensionContext {
  return {
    sessionManager: {
      getSessionFile: () => sessionFile,
      getEntries: () => entries,
    },
    ui: {
      setStatus: vi.fn(),
      notify: vi.fn(),
    },
  } as unknown as ExtensionContext;
}

describe("pi-session-bridge connection manager session identity", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses the session entry id instead of the timestamped file stem", async () => {
    const connMgr = await import("./connection-manager.js");
    const ctx = makeContext(
      "/Users/me/.pi/agent/sessions/project/2026-05-31T10-10-37-968Z_019e7d83-9d10-7554-a0e1-3238c9151aba.jsonl",
      [{ type: "session", id: "019e7d83-9d10-7554-a0e1-3238c9151aba" }],
    );

    connMgr.initSession(ctx);

    expect(connMgr.getSessionId()).toBe("019e7d83-9d10-7554-a0e1-3238c9151aba");
    expect(connMgr.getSessionPath()).toBe(ctx.sessionManager.getSessionFile());
  });

  it("falls back to the uuid suffix from timestamped pi session filenames", async () => {
    const connMgr = await import("./connection-manager.js");
    const ctx = makeContext(
      "/Users/me/.pi/agent/sessions/project/2026-05-31T10-10-37-968Z_019e7d83-9d10-7554-a0e1-3238c9151aba.jsonl",
      [],
    );

    connMgr.initSession(ctx);

    expect(connMgr.getSessionId()).toBe("019e7d83-9d10-7554-a0e1-3238c9151aba");
  });

  it("refreshes identity during mid-session init even when live mode is off", async () => {
    const connMgr = await import("./connection-manager.js");
    const ctx = makeContext(
      "/Users/me/.pi/agent/sessions/project/2026-05-31T10-10-37-968Z_019e7d83-9d10-7554-a0e1-3238c9151aba.jsonl",
      [{ type: "session", id: "019e7d83-9d10-7554-a0e1-3238c9151aba" }],
    );

    connMgr.tryMidSessionInit({ getCurrentContext: () => ctx });

    expect(connMgr.getSessionId()).toBe("019e7d83-9d10-7554-a0e1-3238c9151aba");
  });
});
