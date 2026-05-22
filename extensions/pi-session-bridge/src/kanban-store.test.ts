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

  it("loads tags and marks directly from PSM JSON files", async () => {
    const env = withHome();
    try {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(env.configDir, { recursive: true });
      writeFileSync(join(env.configDir, "tags_config.json"), JSON.stringify({
        version: 1,
        tags: [{ id: "tag-1", name: "review", color: "info", sortOrder: 2, isBuiltin: false, createdAt: "now", parentId: null }],
      }));
      writeFileSync(join(env.configDir, "session_mark.json"), JSON.stringify({
        version: 1,
        sessionTags: [{ sessionId: "sid", tagId: "tag-1", position: 3, assignedAt: "now" }],
      }));

      const store = await import("./kanban-store.js");

      await expect(store.getAllTags()).resolves.toEqual([{ id: "tag-1", name: "review", color: "info", icon: undefined, sort_order: 2, is_builtin: false, created_at: "now", parent_id: null }]);
      await expect(store.getAllSessionTags()).resolves.toEqual([{ session_id: "sid", tag_id: "tag-1", position: 3, assigned_at: "now" }]);
    } finally {
      env.cleanup();
    }
  });

  it("creates missing files when setting a new session tag", async () => {
    const env = withHome();
    try {
      const store = await import("./kanban-store.js");

      const tag = await store.createTag("review", "info");
      await store.moveSessionTag("sid", null, tag.id, 0);

      const tagsFile = JSON.parse(readFileSync(join(env.configDir, "tags_config.json"), "utf-8"));
      const marksFile = JSON.parse(readFileSync(join(env.configDir, "session_mark.json"), "utf-8"));
      expect(tagsFile.tags[0].name).toBe("review");
      expect(marksFile.sessionTags).toEqual([expect.objectContaining({ sessionId: "sid", tagId: tag.id, position: 0 })]);
    } finally {
      env.cleanup();
    }
  });
});
