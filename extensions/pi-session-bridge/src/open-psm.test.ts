import { afterEach, describe, expect, it, vi } from "vitest";

async function loadOpenPsm(psmUrl = "http://127.0.0.1:5002") {
  vi.resetModules();
  process.env.PSM_URL = psmUrl;
  return import("./open-psm.js");
}

describe("open PSM session", () => {
  afterEach(() => {
    delete process.env.PSM_URL;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("builds web and desktop session URLs", async () => {
    const openPsm = await loadOpenPsm();

    expect(openPsm.buildWebSessionUrl("sid 1")).toBe("http://127.0.0.1:5002/#/sessions/sid%201");
    expect(openPsm.buildDesktopSessionUrl("sid 1")).toBe("pi-session://sessions/sid%201");
  });

  it("detects web argument regardless of other args", async () => {
    const openPsm = await loadOpenPsm();

    expect(openPsm.shouldForceWeb("web")).toBe(true);
    expect(openPsm.shouldForceWeb("desktop web now")).toBe(true);
    expect(openPsm.shouldForceWeb("desktop")).toBe(false);
  });

  it("detects CLI mode from PSM health endpoint", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ mode: "cli" }) })) as unknown as typeof fetch;
    const openPsm = await loadOpenPsm();

    await expect(openPsm.detectPsmMode()).resolves.toBe("cli");
  });
});
