import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureBridgeCapabilities = vi.fn();
const getAllTags = vi.fn();
const getAllSessionTags = vi.fn();
const createTag = vi.fn();
const removeTagFromSession = vi.fn();
const moveSessionTag = vi.fn();

vi.mock("./psm-client.js", () => ({
  ensureBridgeCapabilities,
  getAllTags,
  getAllSessionTags,
  createTag,
  removeTagFromSession,
  moveSessionTag,
}));

describe("kanban-store compatibility facade", () => {
  beforeEach(() => {
    for (const mock of [ensureBridgeCapabilities, getAllTags, getAllSessionTags, createTag, removeTagFromSession, moveSessionTag]) mock.mockReset();
    ensureBridgeCapabilities.mockResolvedValue({ protocolVersion: 1, capabilities: ["tag_api"] });
    vi.resetModules();
  });

  it("reads tags through PSM dispatch", async () => {
    const tags = [{ id: "tag-1", name: "review", color: "info", sort_order: 0, is_builtin: false, created_at: "now", parent_id: null }];
    getAllTags.mockResolvedValue(tags);
    const store = await import("./kanban-store.js");

    await expect(store.getAllTags()).resolves.toEqual(tags);
    expect(ensureBridgeCapabilities).toHaveBeenCalledWith(["tag_api"]);
  });

  it("moves tags through PSM dispatch without filesystem writes", async () => {
    moveSessionTag.mockResolvedValue(undefined);
    const store = await import("./kanban-store.js");

    await store.moveSessionTag("sid", null, "tag-1", 3);

    expect(moveSessionTag).toHaveBeenCalledWith("sid", null, "tag-1", 3);
  });
});
