/**
 * Compatibility facade for historical imports.
 *
 * Tag state is owned by Pi Session Manager. This module intentionally performs
 * no direct filesystem IO; all reads and mutations go through PSM dispatch.
 */
import * as psm from "./psm-client.js";
import type { SessionTagItem, TagItem } from "./types.js";

async function ensureTagApi(): Promise<void> {
  await psm.ensureBridgeCapabilities(["tag_api"]);
}

export async function getAllTags(): Promise<TagItem[]> {
  await ensureTagApi();
  return psm.getAllTags();
}

export async function getAllSessionTags(): Promise<SessionTagItem[]> {
  await ensureTagApi();
  return psm.getAllSessionTags();
}

export async function createTag(name: string, color = "info"): Promise<TagItem> {
  await ensureTagApi();
  return psm.createTag(name, color);
}

export async function removeTagFromSession(sessionId: string, tagId: string): Promise<void> {
  await ensureTagApi();
  await psm.removeTagFromSession(sessionId, tagId);
}

export async function moveSessionTag(
  sessionId: string,
  fromTagId: string | null,
  toTagId: string,
  position = 0,
): Promise<void> {
  await ensureTagApi();
  await psm.moveSessionTag(sessionId, fromTagId, toTagId, position);
}
