import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig(psmUrl?: string) {
  vi.resetModules();
  if (psmUrl) {
    process.env.PSM_URL = psmUrl;
  } else {
    delete process.env.PSM_URL;
  }
  return import("./config.js");
}

describe("pi-session-bridge config", () => {
  afterEach(() => {
    delete process.env.PSM_URL;
    vi.resetModules();
  });

  it("derives HTTP and WebSocket URLs from a ws PSM_URL", async () => {
    const config = await loadConfig("ws://127.0.0.1:5002/ws");

    expect(config.WS_URL).toBe("ws://127.0.0.1:5002/ws");
    expect(config.HTTP_BASE).toBe("http://127.0.0.1:5002");
  });

  it("derives HTTP and WebSocket URLs from an http PSM_URL", async () => {
    const config = await loadConfig("http://127.0.0.1:5002");

    expect(config.WS_URL).toBe("ws://127.0.0.1:5002/ws");
    expect(config.HTTP_BASE).toBe("http://127.0.0.1:5002");
  });

  it("rejects unsupported PSM_URL protocols with a clear error", async () => {
    await expect(loadConfig("ftp://127.0.0.1:5002")).rejects.toThrow(
      "Unsupported PSM_URL protocol: ftp:",
    );
  });
});
