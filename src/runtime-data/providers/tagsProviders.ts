import { invoke } from "@/transport";
import type { SessionTag, Tag } from "@/types";
import {
  assignDemoTag,
  createDemoTag,
  deleteDemoTag,
  evaluateDemoAutoRules,
  getDemoSessionTags,
  getDemoTags,
  moveDemoSessionTag,
  removeDemoTagFromSession,
  reorderDemoTags,
  updateDemoTag,
  updateDemoTagAutoRules,
} from "@/demo";
import {
  assignBrowserDatasetTag,
  createBrowserDatasetTag,
  deleteBrowserDatasetTag,
  evaluateBrowserDatasetAutoRules,
  getBrowserDatasetSessionTags,
  getBrowserDatasetTags,
  moveBrowserDatasetSessionTag,
  removeBrowserDatasetTagFromSession,
  reorderBrowserDatasetTags,
  updateBrowserDatasetTag,
  updateBrowserDatasetTagAutoRules,
} from "@/browser-dataset";
import { getRuntimeMode } from "../runtimeMode";
import type { TagsProvider } from "./types";

export const backendTagsProvider: TagsProvider = {
  mode: "backend",
  async loadTags() {
    const [tags, sessionTags] = await Promise.all([
      invoke<Tag[]>("get_all_tags"),
      invoke<SessionTag[]>("get_all_session_tags"),
    ]);
    return { tags, sessionTags };
  },
  async createTag(name, color, icon, parentId) {
    return invoke<Tag>("create_tag", { name, color, icon, parentId });
  },
  async updateTag(id, updates) {
    await invoke("update_tag", { id, ...updates });
  },
  async deleteTag(id) {
    await invoke("delete_tag", { id });
  },
  async assignTag(sessionId, tagId) {
    await invoke("assign_tag", { sessionId, tagId });
  },
  async removeTagFromSession(sessionId, tagId) {
    await invoke("remove_tag_from_session", { sessionId, tagId });
  },
  async moveSessionTag(sessionId, fromTagId, toTagId, position) {
    await invoke("move_session_tag", {
      sessionId,
      fromTagId,
      toTagId,
      position,
    });
  },
  async reorderTags(tagIds) {
    await invoke("reorder_tags", { tagIds });
  },
  async updateTagAutoRules(id, rules) {
    await invoke("update_tag_auto_rules", { id, autoRules: rules });
  },
  async evaluateAutoRules(sessionId, text) {
    return invoke<string[]>("evaluate_auto_rules", { sessionId, text });
  },
};

export const demoTagsProvider: TagsProvider = {
  mode: "demo",
  loadTags: async () => ({
    tags: getDemoTags(),
    sessionTags: getDemoSessionTags(),
  }),
  createTag: async (name, color, icon, parentId) =>
    createDemoTag(name, color, icon, parentId),
  updateTag: async (id, updates) => updateDemoTag(id, updates),
  deleteTag: async (id) => deleteDemoTag(id),
  assignTag: async (sessionId, tagId) => assignDemoTag(sessionId, tagId),
  removeTagFromSession: async (sessionId, tagId) =>
    removeDemoTagFromSession(sessionId, tagId),
  moveSessionTag: async (sessionId, fromTagId, toTagId, position) =>
    moveDemoSessionTag(sessionId, fromTagId, toTagId, position),
  reorderTags: async (tagIds) => reorderDemoTags(tagIds),
  updateTagAutoRules: async (id, rules) => updateDemoTagAutoRules(id, rules),
  evaluateAutoRules: async (sessionId, text) =>
    evaluateDemoAutoRules(sessionId, text),
};

export const browserTagsProvider: TagsProvider = {
  mode: "browser-dataset",
  loadTags: async () => ({
    tags: getBrowserDatasetTags(),
    sessionTags: getBrowserDatasetSessionTags(),
  }),
  createTag: async (name, color, icon, parentId) =>
    createBrowserDatasetTag(name, color, icon, parentId),
  updateTag: async (id, updates) => updateBrowserDatasetTag(id, updates),
  deleteTag: async (id) => deleteBrowserDatasetTag(id),
  assignTag: async (sessionId, tagId) =>
    assignBrowserDatasetTag(sessionId, tagId),
  removeTagFromSession: async (sessionId, tagId) =>
    removeBrowserDatasetTagFromSession(sessionId, tagId),
  moveSessionTag: async (sessionId, fromTagId, toTagId, position) =>
    moveBrowserDatasetSessionTag(sessionId, fromTagId, toTagId, position),
  reorderTags: async (tagIds) => reorderBrowserDatasetTags(tagIds),
  updateTagAutoRules: async (id, rules) =>
    updateBrowserDatasetTagAutoRules(id, rules),
  evaluateAutoRules: async (sessionId, text) =>
    evaluateBrowserDatasetAutoRules(sessionId, text),
};

export function resolveTagsProvider(): TagsProvider {
  switch (getRuntimeMode()) {
    case "demo":
      return demoTagsProvider;
    case "browser-dataset":
      return browserTagsProvider;
    default:
      return backendTagsProvider;
  }
}
