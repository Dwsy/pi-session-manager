/**
 * BridgeConnection — WebSocket connection to PSM with heartbeat and RPC.
 *
 * Responsibilities:
 * - Connect / reconnect with exponential backoff
 * - Heartbeat (ping/pong) with timeout detection
 * - Request/response RPC over WS
 * - Fire-and-forget event forwarding
 *
 * Does NOT know about live mode, session IDs, or UI —
 * that's connection-manager's job.
 */
import {
  WS_URL,
  AUTH_TOKEN,
  HB_INTERVAL,
  HB_TIMEOUT,
  RECONNECT_BASE,
  RECONNECT_MAX,
} from "./config.js";
import type { BridgeState, ConnectionCallbacks, PendingRequest } from "./types.js";

export class BridgeConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;
  private _state: BridgeState = "disconnected";
  private hbTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPongAt = 0;
  private requestId = 0;
  private readonly pendingRequests = new Map<string, PendingRequest>();

  get state(): BridgeState {
    return this._state;
  }

  constructor(private readonly cb: ConnectionCallbacks) {
    this.connect();
  }

  // ── Public API ──────────────────────────────────────

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  request(command: string, payload: unknown = {}, timeoutMs = 15_000): Promise<unknown> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("PSM bridge is not connected"));
    }

    const id = `ext-${++this.requestId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`PSM request timeout: ${command}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ id, command, payload }));
    });
  }

  sendEntry(sessionId: string, sessionPath: string, eventType: string, event: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload =
      event && typeof event === "object" && !Array.isArray(event) ? { ...event } : { event };
    this.send({ type: eventType, sessionId, sessionPath, ...payload });
  }

  register(sessionId: string, sessionPath: string, entries: unknown[]) {
    this.send({
      type: "register",
      payload: {
        sessionId,
        sessionPath,
        pid: process.pid,
        cwd: process.cwd(),
        entries,
      },
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongAt = Date.now();
    this.ping();
    this.hbTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat();
        return;
      }
      if (Date.now() - this.lastPongAt > HB_TIMEOUT) {
        this.setState("disconnected");
        this.cleanup();
        return;
      }
      this.ping();
    }, HB_INTERVAL);
  }

  pongReceived() {
    this.lastPongAt = Date.now();
  }

  disconnect() {
    this.intentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
  }

  // ── Private ─────────────────────────────────────────

  private setState(s: BridgeState) {
    this._state = s;
    this.cb.onState(s, this.reconnectAttempts);
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
      return;
    this.cleanup();
    this.intentionallyClosed = false;

    const url = AUTH_TOKEN ? `${WS_URL}?token=${AUTH_TOKEN}` : WS_URL;
    this.ws = new WebSocket(url);

    // Node.js built-in WebSocket uses onopen/onmessage/onclose/onerror
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.lastPongAt = Date.now();
      this.setState("connected");
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
        const parsed = JSON.parse(raw);
        // RPC response — route to pending request
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.id === "string" &&
          typeof parsed.command === "string" &&
          typeof parsed.success === "boolean" &&
          this.pendingRequests.has(parsed.id)
        ) {
          const pending = this.pendingRequests.get(parsed.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(parsed.id);
          if (parsed.success) {
            pending.resolve(parsed.data);
          } else {
            pending.reject(new Error(parsed.error || `PSM command failed: ${parsed.command}`));
          }
          return;
        }
        // Regular message — forward to handler
        this.cb.onMessage(parsed);
      } catch { /* skip malformed */ }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (Date.now() - this.lastPongAt > HB_TIMEOUT) this.setState("disconnected");
      if (!this.intentionallyClosed) this.scheduleReconnect();
    };

    this.ws.onerror = () => { /* onclose fires after */ };
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    this.setState("reconnecting");
    const delay = Math.min(RECONNECT_MAX, RECONNECT_BASE * Math.pow(1.5, this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private ping() {
    try {
      this.ws?.send(JSON.stringify({ ping: true }));
    } catch { /* ignore */ }
  }

  private stopHeartbeat() {
    if (this.hbTimer) {
      clearInterval(this.hbTimer);
      this.hbTimer = null;
    }
  }

  private cleanup() {
    this.stopHeartbeat();
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("PSM bridge disconnected"));
      this.pendingRequests.delete(id);
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }
}
