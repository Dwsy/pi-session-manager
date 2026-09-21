import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeConnection } from "./bridge-connection.js";

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(_url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

describe("BridgeConnection heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reconnects after heartbeat timeout and reports the completed attempt", () => {
    const states: Array<[string, number]> = [];
    const connection = new BridgeConnection({
      onState: (state, attempt) => states.push([state, attempt]),
      onMessage: vi.fn(),
    });

    FakeWebSocket.instances[0].open();
    connection.startHeartbeat();

    vi.advanceTimersByTime(45_000);
    expect(states).toContainEqual(["disconnected", 0]);
    expect(states).toContainEqual(["reconnecting", 1]);

    vi.advanceTimersByTime(3_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].open();
    expect(states.at(-1)).toEqual(["connected", 1]);

    connection.disconnect();
  });
});
