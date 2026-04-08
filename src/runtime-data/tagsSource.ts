import type { SessionTag, Tag } from "@/types";
import { resolveTagsProvider } from "./providers";

export async function loadRuntimeTags(): Promise<{
  tags: Tag[];
  sessionTags: SessionTag[];
}> {
  return resolveTagsProvider().loadTags();
}

export async function createRuntimeTag(
  name: string,
  color: string,
  icon?: string,
  parentId?: string,
): Promise<Tag> {
  return resolveTagsProvider().createTag(name, color, icon, parentId);
}

export async function updateRuntimeTag(
  id: string,
  updates: Partial<Pick<Tag, "name" | "color" | "icon">>,
): Promise<void> {
  return resolveTagsProvider().updateTag(id, updates);
}

export async function deleteRuntimeTag(id: string): Promise<void> {
  return resolveTagsProvider().deleteTag(id);
}

export async function assignRuntimeTag(
  sessionId: string,
  tagId: string,
): Promise<void> {
  return resolveTagsProvider().assignTag(sessionId, tagId);
}

export async function removeRuntimeTagFromSession(
  sessionId: string,
  tagId: string,
): Promise<void> {
  return resolveTagsProvider().removeTagFromSession(sessionId, tagId);
}

export async function moveRuntimeSessionTag(
  sessionId: string,
  fromTagId: string | null,
  toTagId: string,
  position: number,
): Promise<void> {
  return resolveTagsProvider().moveSessionTag(
    sessionId,
    fromTagId,
    toTagId,
    position,
  );
}

export async function reorderRuntimeTags(tagIds: string[]): Promise<void> {
  return resolveTagsProvider().reorderTags(tagIds);
}

export async function updateRuntimeTagAutoRules(
  id: string,
  rules: string | null,
): Promise<void> {
  return resolveTagsProvider().updateTagAutoRules(id, rules);
}

export async function evaluateRuntimeAutoRules(
  sessionId: string,
  text: string,
): Promise<string[]> {
  return resolveTagsProvider().evaluateAutoRules(sessionId, text);
}
