import { WebSocket } from "ws";

// ── Config ─────────────────────────────────────────────

const PSM_URL = process.env.PSM_URL || "ws://127.0.0.1:52131/ws";
const PSM_TOKEN = process.env.PSM_TOKEN || "";
const HB_INTERVAL = 15_000;
const HB_TIMEOUT = 30_000;
const RECONNECT_BASE = 3000;
const RECONNECT_MAX = 30_000;

export type BridgeState = "connected" | "reconnecting" | "disconnected";

interface ConnectionCallbacks {
  onState: (state: BridgeState, attempt: number) => void;
  onMessage: (msg: any) => void;
}

export class BridgeConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;
  private _state: BridgeState = "disconnected";
  private hbTimer: NodeJS.Timeout | null = null;
  private lastPongAt = 0;

  get state() { return this._state; }

  constructor(private readonly cb: ConnectionCallbacks) { this.connect(); }

  private setState(s: BridgeState) {
    this._state = s;
    this.cb.onState(s, this.reconnectAttempts);
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.cleanup();
    this.intentionallyClosed = false;
    const url = PSM_TOKEN ? `${PSM_URL}?token=${PSM_TOKEN}` : PSM_URL;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => { this.reconnectAttempts = 0; this.lastPongAt = Date.now(); this.setState("connected"); });
    this.ws.on("message", (data: Buffer) => { try { this.cb.onMessage(JSON.parse(data.toString())); } catch { /* skip */ } });
    this.ws.on("close", () => {
      this.stopHeartbeat();
      if (Date.now() - this.lastPongAt > HB_TIMEOUT) this.setState("disconnected");
      if (!this.intentionallyClosed) this.scheduleReconnect();
    });
    this.ws.on("error", () => { /* onclose fires after */ });
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    this.setState("reconnecting");
    const delay = Math.min(RECONNECT_MAX, RECONNECT_BASE * Math.pow(1.5, this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }

  send(data: any) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data)); }

  sendEntry(sessionId: string, sessionPath: string, eventType: string, event: any) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload = event && typeof event === "object" && !Array.isArray(event)
      ? { ...event }
      : { event };
    this.send({ type: eventType, sessionId, sessionPath, ...payload });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongAt = Date.now();
    if (this.ws?.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify({ ping: true })); } catch {} }
    this.hbTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) { this.stopHeartbeat(); return; }
      if (Date.now() - this.lastPongAt > HB_TIMEOUT) { this.setState("disconnected"); this.cleanup(); return; }
      try { this.ws.send(JSON.stringify({ ping: true })); } catch {}
    }, HB_INTERVAL);
  }

  private stopHeartbeat() { if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; } }
  pongReceived() { this.lastPongAt = Date.now(); }

  private cleanup() {
    this.stopHeartbeat();
    if (this.ws) { this.ws.removeAllListeners(); try { this.ws.close(); } catch {} this.ws = null; }
  }

  disconnect() {
    this.intentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.cleanup();
  }
}
