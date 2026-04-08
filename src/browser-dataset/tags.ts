import type { SessionTag, Tag } from "@/types";
import { getActiveDatasetId } from "./core";

interface BrowserDatasetTagsState {
  tags: Tag[];
  sessionTags: SessionTag[];
}

function tagsKey(datasetId: string): string {
  return `pi-session-manager-browser-dataset-tags:${datasetId}`;
}

function defaultState(): BrowserDatasetTagsState {
  const now = new Date().toISOString();
  return {
    tags: [
      {
        id: "builtin-todo",
        name: "To Do",
        color: "warning",
        sortOrder: 0,
        isBuiltin: true,
        createdAt: now,
      },
      {
        id: "builtin-wip",
        name: "In Progress",
        color: "info",
        sortOrder: 1,
        isBuiltin: true,
        createdAt: now,
      },
      {
        id: "builtin-done",
        name: "Done",
        color: "success",
        sortOrder: 2,
        isBuiltin: true,
        createdAt: now,
      },
    ],
    sessionTags: [],
  };
}

function readState(datasetId: string): BrowserDatasetTagsState {
  if (typeof window === "undefined" || !datasetId) return defaultState();
  try {
    const raw = localStorage.getItem(tagsKey(datasetId));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as BrowserDatasetTagsState;
    return {
      tags: parsed.tags || defaultState().tags,
      sessionTags: parsed.sessionTags || [],
    };
  } catch {
    return defaultState();
  }
}

function writeState(datasetId: string, state: BrowserDatasetTagsState): void {
  if (typeof window === "undefined" || !datasetId) return;
  try {
    localStorage.setItem(tagsKey(datasetId), JSON.stringify(state));
  } catch {}
}

export function getBrowserDatasetTags(): Tag[] {
  return readState(getActiveDatasetId()).tags;
}

export function getBrowserDatasetSessionTags(): SessionTag[] {
  return readState(getActiveDatasetId()).sessionTags;
}

export function createBrowserDatasetTag(
  name: string,
  color: string,
  icon?: string,
  parentId?: string,
): Tag {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  const tag: Tag = {
    id: `user-${Date.now()}`,
    name,
    color,
    icon,
    parentId: parentId || null,
    sortOrder: state.tags.length,
    isBuiltin: false,
    createdAt: new Date().toISOString(),
  };
  state.tags.push(tag);
  writeState(datasetId, state);
  return tag;
}

export function updateBrowserDatasetTag(
  id: string,
  updates: Partial<Pick<Tag, "name" | "color" | "icon">>,
): void {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  state.tags = state.tags.map((tag) =>
    tag.id === id ? { ...tag, ...updates } : tag,
  );
  writeState(datasetId, state);
}

export function deleteBrowserDatasetTag(id: string): void {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  state.tags = state.tags.filter((tag) => tag.id !== id);
  state.sessionTags = state.sessionTags.filter((tag) => tag.tagId !== id);
  writeState(datasetId, state);
}

export function assignBrowserDatasetTag(
  sessionId: string,
  tagId: string,
): void {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  state.sessionTags = [
    ...state.sessionTags.filter(
      (tag) => !(tag.sessionId === sessionId && tag.tagId === tagId),
    ),
    {
      sessionId,
      tagId,
      position: 0,
      assignedAt: new Date().toISOString(),
    },
  ];
  writeState(datasetId, state);
}

export function removeBrowserDatasetTagFromSession(
  sessionId: string,
  tagId: string,
): void {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  state.sessionTags = state.sessionTags.filter(
    (tag) => !(tag.sessionId === sessionId && tag.tagId === tagId),
  );
  writeState(datasetId, state);
}

export function moveBrowserDatasetSessionTag(
  sessionId: string,
  fromTagId: string | null,
  toTagId: string,
  position: number,
): void {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  state.sessionTags = state.sessionTags.filter((tag) => {
    if (fromTagId && tag.sessionId === sessionId && tag.tagId === fromTagId) {
      return false;
    }
    return !(tag.sessionId === sessionId && tag.tagId === toTagId);
  });
  state.sessionTags.push({
    sessionId,
    tagId: toTagId,
    position,
    assignedAt: new Date().toISOString(),
  });
  writeState(datasetId, state);
}

export function reorderBrowserDatasetTags(tagIds: string[]): void {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  const orderMap = new Map(tagIds.map((id, index) => [id, index]));
  state.tags = state.tags
    .map((tag) => ({
      ...tag,
      sortOrder: orderMap.get(tag.id) ?? tag.sortOrder,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  writeState(datasetId, state);
}

export function updateBrowserDatasetTagAutoRules(
  id: string,
  rules: string | null,
): void {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  state.tags = state.tags.map((tag) =>
    tag.id === id ? { ...tag, autoRules: rules ?? undefined } : tag,
  );
  writeState(datasetId, state);
}

export function evaluateBrowserDatasetAutoRules(
  sessionId: string,
  text: string,
): string[] {
  const datasetId = getActiveDatasetId();
  const state = readState(datasetId);
  const matched: string[] = [];

  for (const tag of state.tags) {
    if (!tag.autoRules) continue;
    let rules: Array<{ enabled?: boolean; pattern?: string }> = [];
    try {
      rules = JSON.parse(tag.autoRules);
    } catch {
      rules = [];
    }

    for (const rule of rules) {
      if (!rule.enabled || !rule.pattern) continue;
      try {
        if (new RegExp(rule.pattern).test(text)) {
          matched.push(tag.id);
          break;
        }
      } catch {
        if (text.includes(rule.pattern)) {
          matched.push(tag.id);
          break;
        }
      }
    }
  }

  if (matched.length > 0) {
    const existing = new Set(
      state.sessionTags
        .filter((tag) => tag.sessionId === sessionId)
        .map((tag) => tag.tagId),
    );
    for (const tagId of matched) {
      if (!existing.has(tagId)) {
        state.sessionTags.push({
          sessionId,
          tagId,
          position: 0,
          assignedAt: new Date().toISOString(),
        });
      }
    }
    writeState(datasetId, state);
  }

  return matched;
}
