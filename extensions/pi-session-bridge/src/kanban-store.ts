import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionTagItem, TagItem } from "./types.js";

type TagsFile = {
  version: number;
  migratedAt?: string | null;
  tags: RawTagItem[];
};

type SessionMarksFile = {
  version: number;
  migratedAt?: string | null;
  sessionTags: RawSessionTagItem[];
};

type RawTagItem = {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  sortOrder?: number;
  sort_order?: number;
  isBuiltin?: boolean;
  is_builtin?: boolean;
  createdAt?: string;
  created_at?: string;
  parentId?: string | null;
  parent_id?: string | null;
};

type RawSessionTagItem = {
  sessionId?: string;
  session_id?: string;
  tagId?: string;
  tag_id?: string;
  position: number;
  assignedAt?: string;
  assigned_at?: string;
};

function configDir(): string {
  return join(homedir(), ".pi", "pi-session-manager");
}

function tagsPath(): string {
  return join(configDir(), "tags_config.json");
}

function marksPath(): string {
  return join(configDir(), "session_mark.json");
}

function now(): string {
  return new Date().toISOString();
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readTagsFile(): TagsFile {
  return readJson<TagsFile>(tagsPath(), { version: 1, migratedAt: null, tags: [] });
}

function writeTagsFile(file: TagsFile): void {
  writeJson(tagsPath(), file);
}

function readMarksFile(): SessionMarksFile {
  return readJson<SessionMarksFile>(marksPath(), { version: 1, migratedAt: null, sessionTags: [] });
}

function writeMarksFile(file: SessionMarksFile): void {
  writeJson(marksPath(), file);
}

function normalizeTag(tag: RawTagItem): TagItem {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    icon: tag.icon ?? undefined,
    sort_order: tag.sort_order ?? tag.sortOrder ?? 0,
    is_builtin: tag.is_builtin ?? tag.isBuiltin ?? false,
    created_at: tag.created_at ?? tag.createdAt ?? "",
    parent_id: tag.parent_id ?? tag.parentId ?? null,
  };
}

function serializeTag(tag: TagItem): RawTagItem {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    icon: tag.icon ?? null,
    sortOrder: tag.sort_order,
    isBuiltin: tag.is_builtin,
    createdAt: tag.created_at,
    parentId: tag.parent_id ?? null,
  };
}

function normalizeSessionTag(mark: RawSessionTagItem): SessionTagItem {
  return {
    session_id: mark.session_id ?? mark.sessionId ?? "",
    tag_id: mark.tag_id ?? mark.tagId ?? "",
    position: mark.position,
    assigned_at: mark.assigned_at ?? mark.assignedAt ?? "",
  };
}

function serializeSessionTag(mark: SessionTagItem): RawSessionTagItem {
  return {
    sessionId: mark.session_id,
    tagId: mark.tag_id,
    position: mark.position,
    assignedAt: mark.assigned_at,
  };
}

function nextSortOrder(tags: TagItem[]): number {
  return Math.max(-1, ...tags.map((tag) => tag.sort_order)) + 1;
}

export async function getAllTags(): Promise<TagItem[]> {
  return readTagsFile().tags.map(normalizeTag).sort((a, b) => a.sort_order - b.sort_order);
}

export async function getAllSessionTags(): Promise<SessionTagItem[]> {
  return readMarksFile().sessionTags.map(normalizeSessionTag);
}

export async function createTag(name: string, color = "info", icon?: string, parentId?: string): Promise<TagItem> {
  const file = readTagsFile();
  const tags = file.tags.map(normalizeTag);
  let id = `tag-${Date.now()}`;
  while (tags.some((tag) => tag.id === id)) id += "x";
  const tag: TagItem = {
    id,
    name,
    color,
    icon,
    sort_order: nextSortOrder(tags),
    is_builtin: false,
    created_at: now(),
    parent_id: parentId ?? null,
  };
  file.tags.push(serializeTag(tag));
  writeTagsFile(file);
  return tag;
}

export async function removeTagFromSession(sessionId: string, tagId: string): Promise<void> {
  const file = readMarksFile();
  file.sessionTags = file.sessionTags
    .map(normalizeSessionTag)
    .filter((mark) => !(mark.session_id === sessionId && mark.tag_id === tagId))
    .map(serializeSessionTag);
  writeMarksFile(file);
}

export async function moveSessionTag(sessionId: string, fromTagId: string | null, toTagId: string, position = 0): Promise<void> {
  const file = readMarksFile();
  const marks = file.sessionTags
    .map(normalizeSessionTag)
    .filter((mark) => !(mark.session_id === sessionId && mark.tag_id === fromTagId))
    .filter((mark) => !(mark.session_id === sessionId && mark.tag_id === toTagId));
  marks.push({ session_id: sessionId, tag_id: toTagId, position, assigned_at: now() });
  file.sessionTags = marks.map(serializeSessionTag);
  writeMarksFile(file);
}
