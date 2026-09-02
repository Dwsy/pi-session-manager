import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LabelItem, SessionLabelItem, SessionStatusItem, StatusItem } from "./types.js";

type StatusesFile = {
  version: number;
  migratedAt?: string | null;
  tags: RawStatusItem[];
};

type SessionMarksFile = {
  version: number;
  migratedAt?: string | null;
  sessionTags: RawSessionStatusItem[];
};

type LabelsFile = {
  version: 1;
  labels: RawLabelItem[];
  assignments: RawSessionLabelItem[];
};

type RawStatusItem = {
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

type RawSessionStatusItem = {
  sessionId?: string;
  session_id?: string;
  tagId?: string;
  tag_id?: string;
  position: number;
  assignedAt?: string;
  assigned_at?: string;
};

type RawLabelItem = {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RawSessionLabelItem = {
  sessionId?: string;
  session_id?: string;
  labelId?: string;
  label_id?: string;
};

const KANBAN_PLUGIN_ID = "builtin.kanban-board";
const DEFAULT_LABEL_COLOR = "#0969da";

function configDir(): string {
  return join(homedir(), ".pi", "pi-session-manager");
}

function statusesPath(): string {
  return join(configDir(), "tags_config.json");
}

function marksPath(): string {
  return join(configDir(), "session_mark.json");
}

function labelsPath(): string {
  return join(configDir(), "plugin-config", KANBAN_PLUGIN_ID, "labels.json");
}

function now(): string {
  return new Date().toISOString();
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readStatusesFile(): StatusesFile {
  return readJson<StatusesFile>(statusesPath(), { version: 1, migratedAt: null, tags: [] });
}

function writeStatusesFile(file: StatusesFile): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(statusesPath(), JSON.stringify(file, null, 2));
}

function readMarksFile(): SessionMarksFile {
  return readJson<SessionMarksFile>(marksPath(), { version: 1, migratedAt: null, sessionTags: [] });
}

function writeMarksFile(file: SessionMarksFile): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(marksPath(), JSON.stringify(file, null, 2));
}

function readLabelsFile(): LabelsFile {
  return readJson<LabelsFile>(labelsPath(), { version: 1, labels: [], assignments: [] });
}

function writeLabelsFile(file: LabelsFile): void {
  mkdirSync(join(configDir(), "plugin-config", KANBAN_PLUGIN_ID), { recursive: true });
  writeFileSync(labelsPath(), JSON.stringify(file, null, 2));
}

function normalizeStatus(status: RawStatusItem): StatusItem {
  return {
    id: status.id,
    name: status.name,
    color: status.color,
    icon: status.icon ?? undefined,
    sort_order: status.sort_order ?? status.sortOrder ?? 0,
    is_builtin: status.is_builtin ?? status.isBuiltin ?? false,
    created_at: status.created_at ?? status.createdAt ?? "",
    parent_id: status.parent_id ?? status.parentId ?? null,
  };
}

function serializeStatus(status: StatusItem): RawStatusItem {
  return {
    id: status.id,
    name: status.name,
    color: status.color,
    icon: status.icon ?? null,
    sortOrder: status.sort_order,
    isBuiltin: status.is_builtin,
    createdAt: status.created_at,
    parentId: status.parent_id ?? null,
  };
}

function normalizeSessionStatus(mark: RawSessionStatusItem): SessionStatusItem {
  return {
    session_id: mark.session_id ?? mark.sessionId ?? "",
    status_id: mark.tag_id ?? mark.tagId ?? "",
    position: mark.position,
    assigned_at: mark.assigned_at ?? mark.assignedAt ?? "",
  };
}

function serializeSessionStatus(mark: SessionStatusItem): RawSessionStatusItem {
  return {
    sessionId: mark.session_id,
    tagId: mark.status_id,
    position: mark.position,
    assignedAt: mark.assigned_at,
  };
}

function normalizeLabel(label: RawLabelItem): LabelItem {
  return {
    id: label.id,
    name: label.name,
    color: /^#[0-9a-fA-F]{6}$/.test(label.color) ? label.color : DEFAULT_LABEL_COLOR,
    description: label.description?.trim() ?? "",
    created_at: label.createdAt ?? "",
    updated_at: label.updatedAt ?? label.createdAt ?? "",
  };
}

function serializeLabel(label: LabelItem): RawLabelItem {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description,
    createdAt: label.created_at,
    updatedAt: label.updated_at,
  };
}

function normalizeSessionLabel(mark: RawSessionLabelItem): SessionLabelItem {
  return {
    session_id: mark.session_id ?? mark.sessionId ?? "",
    label_id: mark.label_id ?? mark.labelId ?? "",
  };
}

function serializeSessionLabel(mark: SessionLabelItem): RawSessionLabelItem {
  return { sessionId: mark.session_id, labelId: mark.label_id };
}

function nextSortOrder(statuses: StatusItem[]): number {
  return Math.max(-1, ...statuses.map((status) => status.sort_order)) + 1;
}

function uniqueId(prefix: string, ids: Set<string>): string {
  let id = `${prefix}-${Date.now()}`;
  while (ids.has(id)) id += "x";
  return id;
}

export async function getAllStatuses(): Promise<StatusItem[]> {
  return readStatusesFile().tags.map(normalizeStatus).sort((a, b) => a.sort_order - b.sort_order);
}

export async function getAllSessionStatuses(): Promise<SessionStatusItem[]> {
  return readMarksFile().sessionTags.map(normalizeSessionStatus);
}

export async function getSessionStatus(sessionId: string): Promise<StatusItem | null> {
  const [statuses, assignments] = await Promise.all([getAllStatuses(), getAllSessionStatuses()]);
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  let current: SessionStatusItem | null = null;
  let currentIndex = -1;
  assignments.forEach((assignment, index) => {
    if (assignment.session_id !== sessionId || !statusById.has(assignment.status_id)) return;
    if (!current) {
      current = assignment;
      currentIndex = index;
      return;
    }
    const currentTime = Date.parse(current.assigned_at) || 0;
    const nextTime = Date.parse(assignment.assigned_at) || 0;
    if (nextTime > currentTime || (nextTime === currentTime && index > currentIndex)) {
      current = assignment;
      currentIndex = index;
    }
  });
  return current ? statusById.get(current.status_id) ?? null : null;
}

export async function createStatus(name: string, color = "info", icon?: string, parentId?: string): Promise<StatusItem> {
  const file = readStatusesFile();
  const statuses = file.tags.map(normalizeStatus);
  const status: StatusItem = {
    id: uniqueId("tag", new Set(statuses.map((item) => item.id))),
    name,
    color,
    icon,
    sort_order: nextSortOrder(statuses),
    is_builtin: false,
    created_at: now(),
    parent_id: parentId ?? null,
  };
  file.tags.push(serializeStatus(status));
  writeStatusesFile(file);
  return status;
}

export async function clearSessionStatus(sessionId: string): Promise<void> {
  const file = readMarksFile();
  file.sessionTags = file.sessionTags
    .map(normalizeSessionStatus)
    .filter((mark) => mark.session_id !== sessionId)
    .map(serializeSessionStatus);
  writeMarksFile(file);
}

export async function setSessionStatus(sessionId: string, statusId: string, position = 0): Promise<void> {
  const file = readMarksFile();
  const marks = file.sessionTags
    .map(normalizeSessionStatus)
    .filter((mark) => mark.session_id !== sessionId);
  marks.push({ session_id: sessionId, status_id: statusId, position, assigned_at: now() });
  file.sessionTags = marks.map(serializeSessionStatus);
  writeMarksFile(file);
}

export async function getAllLabels(): Promise<LabelItem[]> {
  return readLabelsFile().labels.map(normalizeLabel);
}

export async function getAllSessionLabels(): Promise<SessionLabelItem[]> {
  const file = readLabelsFile();
  const labelIds = new Set(file.labels.map((label) => label.id));
  return file.assignments
    .map(normalizeSessionLabel)
    .filter((assignment) => assignment.session_id && assignment.label_id && labelIds.has(assignment.label_id));
}

export async function createLabel(name: string, color = DEFAULT_LABEL_COLOR, description = ""): Promise<LabelItem> {
  const file = readLabelsFile();
  const labels = file.labels.map(normalizeLabel);
  const timestamp = now();
  const label: LabelItem = {
    id: uniqueId("label", new Set(labels.map((item) => item.id))),
    name: name.trim(),
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_LABEL_COLOR,
    description: description.trim(),
    created_at: timestamp,
    updated_at: timestamp,
  };
  if (!label.name) throw new Error("Label name is required");
  file.labels.push(serializeLabel(label));
  writeLabelsFile(file);
  return label;
}

export async function assignLabel(sessionId: string, labelId: string): Promise<void> {
  const file = readLabelsFile();
  const assignments = file.assignments.map(normalizeSessionLabel);
  if (!assignments.some((item) => item.session_id === sessionId && item.label_id === labelId)) {
    assignments.push({ session_id: sessionId, label_id: labelId });
  }
  file.assignments = assignments.map(serializeSessionLabel);
  writeLabelsFile(file);
}

export async function removeLabel(sessionId: string, labelId: string): Promise<void> {
  const file = readLabelsFile();
  file.assignments = file.assignments
    .map(normalizeSessionLabel)
    .filter((item) => !(item.session_id === sessionId && item.label_id === labelId))
    .map(serializeSessionLabel);
  writeLabelsFile(file);
}

export async function clearSessionLabels(sessionId: string): Promise<void> {
  const file = readLabelsFile();
  file.assignments = file.assignments
    .map(normalizeSessionLabel)
    .filter((item) => item.session_id !== sessionId)
    .map(serializeSessionLabel);
  writeLabelsFile(file);
}
