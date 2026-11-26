import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function withHome() {
  const home = mkdtempSync(join(tmpdir(), "psm-kanban-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  vi.resetModules();
  return {
    home,
    configDir: join(home, ".pi", "pi-session-manager"),
    cleanup() {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      rmSync(home, { recursive: true, force: true });
      vi.resetModules();
    },
  };
}

describe("kanban file store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("migrates legacy Tag assignments deterministically into one current Status", async () => {
    const env = withHome();
    try {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(env.configDir, { recursive: true });
      writeFileSync(join(env.configDir, "tags_config.json"), JSON.stringify({
        version: 1,
        tags: [
          { id: "tag-todo", name: "Todo", color: "info", sortOrder: 0, isBuiltin: false, createdAt: "now", parentId: null },
          { id: "tag-done", name: "Done", color: "success", sortOrder: 1, isBuiltin: false, createdAt: "now", parentId: null },
        ],
      }));
      writeFileSync(join(env.configDir, "session_mark.json"), JSON.stringify({
        version: 1,
        sessionTags: [
          { sessionId: "sid", tagId: "tag-todo", position: 3, assignedAt: "2026-09-01T00:00:00.000Z" },
          { sessionId: "other", tagId: "tag-todo", position: 1, assignedAt: "2026-09-01T00:00:00.000Z" },
          { sessionId: "sid", tagId: "tag-done", position: 0, assignedAt: "2026-09-02T00:00:00.000Z" },
        ],
      }));

      const store = await import("./kanban-store.js");

      await expect(store.getAllStatuses()).resolves.toHaveLength(2);
      await expect(store.getSessionStatus("sid")).resolves.toEqual(expect.objectContaining({ id: "tag-done", name: "Done" }));

      await store.setSessionStatus("sid", "tag-todo", 0);
      const marksFile = JSON.parse(readFileSync(join(env.configDir, "session_mark.json"), "utf-8"));
      expect(marksFile.sessionTags.filter((mark: { sessionId: string }) => mark.sessionId === "sid")).toEqual([
        expect.objectContaining({ sessionId: "sid", tagId: "tag-todo", position: 0 }),
      ]);
      expect(marksFile.sessionTags).toContainEqual(expect.objectContaining({ sessionId: "other", tagId: "tag-todo" }));
    } finally {
      env.cleanup();
    }
  });

  it("creates Status and independent multi Labels in the shared Kanban files", async () => {
    const env = withHome();
    try {
      const store = await import("./kanban-store.js");

      const status = await store.createStatus("review", "info");
      await store.setSessionStatus("sid", status.id, 0);
      const backend = await store.createLabel("backend", "#0969da", "Backend work");
      const urgent = await store.createLabel("urgent", "#d1242f", "Needs attention");
      await store.assignLabel("sid", backend.id);
      await store.assignLabel("sid", urgent.id);

      const statusesFile = JSON.parse(readFileSync(join(env.configDir, "tags_config.json"), "utf-8"));
      const marksFile = JSON.parse(readFileSync(join(env.configDir, "session_mark.json"), "utf-8"));
      const labelsFile = JSON.parse(readFileSync(join(env.configDir, "plugin-config", "builtin.kanban-board", "labels.json"), "utf-8"));
      expect(statusesFile.tags[0].name).toBe("review");
      expect(marksFile.sessionTags).toEqual([expect.objectContaining({ sessionId: "sid", tagId: status.id, position: 0 })]);
      expect(labelsFile.labels).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "backend", color: "#0969da", description: "Backend work" }),
        expect.objectContaining({ name: "urgent", color: "#d1242f", description: "Needs attention" }),
      ]));
      await expect(store.getAllSessionLabels()).resolves.toEqual(expect.arrayContaining([
        { session_id: "sid", label_id: backend.id },
        { session_id: "sid", label_id: urgent.id },
      ]));
    } finally {
      env.cleanup();
    }
  });

  it("supports moving/reordering cards, updating/reordering/deleting statuses, and editing/deleting labels", async () => {
    const env = withHome();
    try {
      const store = await import("./kanban-store.js");
      const todo = await store.createStatus("Todo", "info");
      const doing = await store.createStatus("Doing", "warning");

      await store.moveSessionInStatus("s1", todo.id, 0);
      await store.moveSessionInStatus("s2", todo.id, 1);
      await store.moveSessionInStatus("s2", todo.id, 0); // reorder s2 above s1

      const marks = await store.getAllSessionStatuses();
      expect(marks.find((m) => m.session_id === "s2")?.position).toBe(0);
      expect(marks.find((m) => m.session_id === "s1")?.position).toBe(1);

      await store.moveSessionInStatus("s1", doing.id, 0);
      expect((await store.getSessionStatus("s1"))?.id).toBe(doing.id);

      await store.updateStatus(todo.id, { name: "Backlog", color: "purple" });
      await store.reorderStatuses([doing.id, todo.id]);
      const statuses = await store.getAllStatuses();
      expect(statuses.map((s) => s.name)).toEqual(["Doing", "Backlog"]);
      expect(statuses[1]?.color).toBe("purple");

      await store.deleteStatus(doing.id);
      expect((await store.getAllStatuses()).map((s) => s.name)).toEqual(["Backlog"]);
      expect(await store.getSessionStatus("s1")).toBeNull();

      const lbl = await store.createLabel("bug", "#d1242f", "Bugs");
      await store.assignLabel("s2", lbl.id);
      await store.updateLabel(lbl.id, { name: "critical", description: "High prio" });
      expect((await store.getAllLabels())[0]?.name).toBe("critical");

      await store.deleteLabel(lbl.id);
      expect(await store.getAllLabels()).toHaveLength(0);
      expect(await store.getAllSessionLabels()).toHaveLength(0);
    } finally {
      env.cleanup();
    }
  });
});
