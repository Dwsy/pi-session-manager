import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SessionInfo, StatusItem, LabelItem, SessionStatusItem, SessionLabelItem } from "./types.js";

const scanSessions = vi.fn();
const openPsmSession = vi.fn();
const notifyPsmStatusChange = vi.fn();
const getAllStatuses = vi.fn();
const getAllSessionStatuses = vi.fn();
const getSessionStatus = vi.fn();
const getAllLabels = vi.fn();
const getAllSessionLabels = vi.fn();
const moveSessionInStatus = vi.fn();
const updateStatus = vi.fn();
const deleteStatus = vi.fn();
const reorderStatuses = vi.fn();
const assignLabel = vi.fn();
const removeLabel = vi.fn();
const deleteLabel = vi.fn();

vi.mock("./psm-client.js", () => ({ scanSessions }));
vi.mock("./open-psm.js", () => ({ openPsmSession }));
vi.mock("./connection-manager.js", () => ({
  getConnection: () => ({ state: "connected" }),
  isLiveEnabled: () => true,
  getSessionId: () => "sess-1",
  doDisconnect: vi.fn(),
  doConnect: vi.fn(),
  disableLiveMode: vi.fn(),
  enableLiveMode: vi.fn(),
  notifyPsmStatusChange,
}));
vi.mock("./kanban-store.js", () => ({
  getAllStatuses,
  getAllSessionStatuses,
  getSessionStatus,
  getAllLabels,
  getAllSessionLabels,
  moveSessionInStatus,
  updateStatus,
  deleteStatus,
  reorderStatuses,
  assignLabel,
  removeLabel,
  deleteLabel,
}));

const sampleStatuses: StatusItem[] = [
  { id: "st-todo", name: "Todo", color: "info", sort_order: 0, is_builtin: false, created_at: "", parent_id: null },
  { id: "st-doing", name: "Doing", color: "warning", sort_order: 1, is_builtin: false, created_at: "", parent_id: null },
  { id: "st-done", name: "Done", color: "success", sort_order: 2, is_builtin: true, created_at: "", parent_id: null },
];

const sampleLabels: LabelItem[] = [
  { id: "lb-be", name: "backend", color: "#0969da", description: "Backend tasks", created_at: "", updated_at: "" },
  { id: "lb-ui", name: "tui", color: "#8250df", description: "TUI polish", created_at: "", updated_at: "" },
];

const sampleSessions: SessionInfo[] = [
  {
    id: "sess-1",
    path: "/tmp/s1.jsonl",
    cwd: "/Users/dev/alpha",
    name: "Build Horizontal Kanban",
    created: "2026-11-26T01:00:00Z",
    modified: "2026-11-26T03:00:00Z",
    message_count: 14,
    first_message: "Upgrade kanban TUI",
    last_message: "Done",
    last_message_role: "assistant",
  },
  {
    id: "sess-2",
    path: "/tmp/s2.jsonl",
    cwd: "/Users/dev/alpha",
    name: "Fix OAuth Bridge",
    created: "2026-11-26T00:00:00Z",
    modified: "2026-11-26T02:00:00Z",
    message_count: 8,
    first_message: "Bridge pi mcp",
    last_message: "Merged",
    last_message_role: "assistant",
  },
  {
    id: "sess-other",
    path: "/tmp/s3.jsonl",
    cwd: "/Users/dev/beta",
    name: "Other Project Task",
    created: "2026-11-26T00:00:00Z",
    modified: "2026-11-26T01:00:00Z",
    message_count: 5,
    first_message: "Beta work",
    last_message: "Ok",
    last_message_role: "assistant",
  },
];

const sampleStatusMarks: SessionStatusItem[] = [
  { session_id: "sess-1", status_id: "st-todo", position: 0, assigned_at: "2026-11-26T03:00:00Z" },
  { session_id: "sess-2", status_id: "st-doing", position: 0, assigned_at: "2026-11-26T02:00:00Z" },
  { session_id: "sess-other", status_id: "st-todo", position: 1, assigned_at: "2026-11-26T01:00:00Z" },
];

const sampleLabelMarks: SessionLabelItem[] = [
  { session_id: "sess-1", label_id: "lb-ui" },
  { session_id: "sess-2", label_id: "lb-be" },
];

type RenderedComponent = {
  render(width: number): string[];
  handleInput(data: string): void;
  handleMouse(event: {
    type: "press" | "release" | "move" | "drag" | "click" | "wheel";
    button: "left" | "middle" | "right" | "none";
    x: number;
    y: number;
    wheelDelta?: number;
  }): { handled?: boolean; focus?: boolean; capture?: boolean; render?: boolean } | undefined;
};

function makeTheme() {
  const allowed = new Set(["accent", "border", "success", "error", "warning", "muted", "dim", "text"]);
  return {
    fg: vi.fn((color: string, text: string) => {
      if (!allowed.has(color)) throw new Error(`Invalid theme color: ${color}`);
      return text;
    }),
    bold: vi.fn((text: string) => text),
  };
}

async function mountKanban(options?: { allProjects?: boolean; initialView?: "board" | "manage" }) {
  const { showKanbanBoard, createInitialKanbanState } = await import("./kanban-tui.js");
  let captured: RenderedComponent | undefined;
  let exitResult: unknown;
  const done = vi.fn((res: unknown) => { exitResult = res; });
  const custom = vi.fn(async (factory: (tui: unknown, theme: unknown, kb: unknown, done: (r: unknown) => void) => unknown) => {
    captured = factory({ requestRender: vi.fn() }, makeTheme(), {}, done) as RenderedComponent;
    return exitResult;
  });
  const ctx = {
    hasUI: true,
    cwd: "/Users/dev/alpha",
    ui: { notify: vi.fn(), input: vi.fn(), custom },
  } as unknown as ExtensionContext;
  const state = createInitialKanbanState("/Users/dev/alpha", options);
  const promise = showKanbanBoard(ctx, "sess-1", state);
  await new Promise((r) => setTimeout(r, 0));
  return { component: captured!, state, done, promise };
}

describe("Kanban horizontal TUI & PSM Control Center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scanSessions.mockResolvedValue(sampleSessions);
    openPsmSession.mockResolvedValue({ url: "pi-session://sessions/sess-1", mode: "desktop" });
    getAllStatuses.mockResolvedValue(sampleStatuses);
    getAllSessionStatuses.mockResolvedValue(sampleStatusMarks);
    getSessionStatus.mockResolvedValue(sampleStatuses[0]);
    getAllLabels.mockResolvedValue(sampleLabels);
    getAllSessionLabels.mockResolvedValue(sampleLabelMarks);
    moveSessionInStatus.mockResolvedValue(undefined);
    updateStatus.mockResolvedValue(sampleStatuses[0]);
    deleteStatus.mockResolvedValue(undefined);
    reorderStatuses.mockResolvedValue(sampleStatuses);
    assignLabel.mockResolvedValue(undefined);
    removeLabel.mockResolvedValue(undefined);
    deleteLabel.mockResolvedValue(undefined);
  });

  it("renders default horizontal multi-column layout scoped to current project", async () => {
    const { component } = await mountKanban();
    const output = component.render(120).join("\n");

    expect(output).toContain("[↔ Board]");
    expect(output).toContain("[Proj: alpha ▾]");
    expect(output).toContain("┬"); // horizontal multi-column divider
    expect(output).toContain("Todo");
    expect(output).toContain("Doing");
    expect(output).toContain("Done");
    expect(output).toContain("Build Horizontal Kanban");
    expect(output).toContain("Fix OAuth Bridge");
    // Project-scoped: Beta project session is excluded by default
    expect(output).not.toContain("Other Project Task");
  });

  it("supports live search filtering and project switching to All Projects", async () => {
    const { component } = await mountKanban();
    component.render(120);

    // Search filter
    component.handleInput("/");
    for (const ch of "OAuth") component.handleInput(ch);
    component.handleInput("\r");
    let output = component.render(120).join("\n");
    expect(output).toContain("\x1b[7mOAuth\x1b[27m");
    expect(output.replace(/\x1b\[[0-9;]*m/g, "")).toContain("Fix OAuth Bridge");
    expect(output).not.toContain("Build Horizontal Kanban");

    // Clear filter and switch to All Projects via Project menu
    component.handleInput("x");
    component.handleInput("p");
    const menuOutput = component.render(120).join("\n");
    expect(menuOutput).toContain("Project Scope");
    expect(menuOutput).toContain("All Projects");
    component.handleInput("\r"); // first selectable item is All Projects
    await new Promise((r) => setTimeout(r, 0));

    output = component.render(120).join("\n");
    expect(output).toContain("[Proj: All ▾]");
    expect(output).toContain("Other Project Task");
  });

  it("supports 1-key quick column move (L) and keyboard grab mode (m -> → -> Enter)", async () => {
    const { component, state } = await mountKanban();
    component.render(120);

    // Focus Todo column (index 1 because No Status is index 0)
    component.handleInput("l");
    expect(state.focusedColIdx).toBe(1);

    // Quick move right (Todo -> Doing)
    component.handleInput("L");
    await new Promise((r) => setTimeout(r, 0));
    expect(moveSessionInStatus).toHaveBeenCalledWith("sess-1", "st-doing", 0);
    expect(notifyPsmStatusChange).toHaveBeenCalledWith("sess-1");

    // Keyboard grab mode: press m on sess-1 (still in Todo in mocked store), move right twice to Done, press Enter
    moveSessionInStatus.mockClear();
    component.handleInput("m");
    component.handleInput("\x1b[C"); // Doing
    component.handleInput("\x1b[C"); // Done
    const dragOutput = component.render(120).join("\n");
    expect(dragOutput).toContain("MOVING");
    expect(dragOutput).toContain("drop here");
    component.handleInput("\r");
    await new Promise((r) => setTimeout(r, 0));
    expect(moveSessionInStatus).toHaveBeenCalledWith("sess-1", "st-done", 0);
  });

  it("supports mouse drag & drop across horizontal columns", async () => {
    const { component } = await mountKanban();
    const lines = component.render(120);

    // Find card row for "Build Horizontal Kanban" in Todo column (col 1 of 4 columns, ~x=35..55)
    const cardY = lines.findIndex((l) => l.includes("Build Horizontal Kanban"));
    expect(cardY).toBeGreaterThan(6);
    const cardX = lines[cardY]!.indexOf("Build Horizontal Kanban");
    // Drop into Doing column (to the right, around x = cardX + 30)
    const targetX = Math.min(110, cardX + 32);

    const pressRes = component.handleMouse({ type: "press", button: "left", x: cardX, y: cardY });
    expect(pressRes?.capture).toBe(true);

    const dragRes = component.handleMouse({ type: "drag", button: "left", x: targetX, y: cardY });
    expect(dragRes?.handled).toBe(true);

    component.handleMouse({ type: "release", button: "left", x: targetX, y: cardY });
    await new Promise((r) => setTimeout(r, 0));
    expect(moveSessionInStatus).toHaveBeenCalledWith("sess-1", "st-doing", expect.any(Number));
  });

  it("opens floating card context menu & toggles labels inline", async () => {
    const { component } = await mountKanban();
    component.render(120);
    component.handleInput("l"); // Todo column -> sess-1

    component.handleInput("\r"); // open card menu
    let menuOut = component.render(120).join("\n");
    expect(menuOut).toContain("Move to status column");
    expect(menuOut).toContain("Toggle labels");
    expect(menuOut).toContain("Open in PSM");

    // Navigate to "Toggle labels…" (index 2) and open submenu
    component.handleInput("j");
    component.handleInput("j");
    component.handleInput("\r");
    menuOut = component.render(120).join("\n");
    expect(menuOut).toContain("Toggle Labels");
    expect(menuOut).toContain("backend");

    // Toggle "backend" label on sess-1
    component.handleInput("\r");
    await new Promise((r) => setTimeout(r, 0));
    expect(assignLabel).toHaveBeenCalledWith("sess-1", "lb-be");
  });

  it("renders two-pane Manage view and cycles status column color", async () => {
    const { component } = await mountKanban({ initialView: "manage" });
    const out = component.render(100).join("\n");
    expect(out).toContain("Status Columns (3)");
    expect(out).toContain("Labels (2)");

    component.handleInput("c");
    await new Promise((r) => setTimeout(r, 0));
    expect(updateStatus).toHaveBeenCalledWith("st-todo", { color: "warning" });
  });

  it("renders /psm split overlay control center with telemetry and Kanban shortcut", async () => {
    const { showPsmControlPanel } = await import("./psm-tui.js");
    let captured: RenderedComponent | undefined;
    const done = vi.fn();
    const custom = vi.fn(async (factory: (tui: unknown, theme: unknown, kb: unknown, done: (r: unknown) => void) => unknown) => {
      captured = factory({ requestRender: vi.fn() }, makeTheme(), {}, done) as RenderedComponent;
      return undefined;
    });
    const ctx = {
      hasUI: true,
      cwd: "/Users/dev/alpha",
      ui: { notify: vi.fn(), custom },
    } as unknown as ExtensionContext;

    const pending = showPsmControlPanel(ctx, "sess-1");
    await new Promise((r) => setTimeout(r, 0));

    const out = captured!.render(90).join("\n");
    expect(out).toContain("PSM Bridge");
    expect(out).toContain("Bridge Telemetry");
    expect(out).toContain("Open Kanban Board (↔)");
    expect(out).toContain("alpha");

    captured!.handleInput("k");
    expect(done).toHaveBeenCalledWith("open-kanban");
    await pending;
  });
});
