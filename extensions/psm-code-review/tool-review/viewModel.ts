import {
  parseDiffFromFile,
  parsePatchFiles,
  type CodeViewItem,
} from "@pierre/diffs";
import type { GitStatusEntry } from "@pierre/trees";
import { normalizePathSeparators } from "@/utils/path";

import {
  getOperationFileDiff,
  getOperationPatch,
  isChangeOperation,
  type FileOperation,
} from "./model";

export interface ReviewFileNode {
  path: string;
  operations: FileOperation[];
  additions: number;
  deletions: number;
  hasError: boolean;
  hasPending: boolean;
  status?: GitStatusEntry["status"];
}

export interface ReviewTreeModel {
  /** Display paths safe for @pierre/trees (no file/directory segment collisions). */
  paths: string[];
  nodes: ReviewFileNode[];
  status: GitStatusEntry[];
  /** Maps canonical review path → tree display path. */
  displayPathByCanonical: Map<string, string>;
  /** Maps tree display path → canonical review path. */
  canonicalPathByDisplay: Map<string, string>;
}

const FILE_TREE_LEAF_SUFFIX = " (file)";

/**
 * When a short path is also a prefix of a longer path (e.g. file `payment-core` vs
 * `payment-core/foo.ts`), Pierre trees treat the segment as a file and later refuse
 * to create a directory with the same name. Rename prefix-only leaves for the tree.
 */
export function resolveFileTreeDisplayPaths(paths: string[]) {
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  const displayPathByCanonical = new Map<string, string>();

  for (const path of sorted) {
    const collidesWithDeeperPath = sorted.some(
      (other) => other !== path && other.startsWith(`${path}/`),
    );
    displayPathByCanonical.set(
      path,
      collidesWithDeeperPath ? `${path}${FILE_TREE_LEAF_SUFFIX}` : path,
    );
  }

  const displayPaths = sorted.map((path) => displayPathByCanonical.get(path)!);
  const canonicalPathByDisplay = new Map(
    [...displayPathByCanonical.entries()].map(([canonical, display]) => [
      display,
      canonical,
    ]),
  );

  return { displayPaths, displayPathByCanonical, canonicalPathByDisplay };
}

const SOURCE_ROOT_MARKERS = [
  "/src/main/java/",
  "/src/test/java/",
  "/src/main/kotlin/",
  "/src/test/kotlin/",
  "/src/main/resources/",
  "/src/test/resources/",
  "/src/",
  "/app/",
  "/packages/",
];

export function isShellReviewOperation(operation: FileOperation) {
  return operation.toolName === "bash";
}

export function isFileReviewOperation(operation: FileOperation) {
  return !isShellReviewOperation(operation);
}

export function normalizeReviewPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "Unknown target") return "";

  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
  for (const marker of SOURCE_ROOT_MARKERS) {
    const index = `/${normalized}`.indexOf(marker);
    if (index >= 0) return `/${normalized}`.slice(index + 1);
  }

  return normalized;
}

function getShellTreePath(operation: FileOperation) {
  const command = operation.filePath.replace(/\s+/g, " ").trim();
  const summary = command.length > 72 ? `${command.slice(0, 69)}...` : command;
  return `Shell/#${operation.sequence} ${summary || "command"}`;
}

/**
 * Resolve aliases against the known session cwd. Unlike display-path shortening,
 * identity must never collapse two independent src/ trees into one file.
 */
export function canonicalReviewPath(path: string, cwd: string): string {
  const normal = normalizePathSeparators(path.trim());
  if (!normal || normal === "Unknown target") return "";
  const base = normalizePathSeparators(cwd.trim());
  if (!base || !/^(\/|[a-zA-Z]:\/)/.test(base)) return normalizeReviewPath(path);
  const absolute = /^(\/|[a-zA-Z]:\/)/.test(normal);
  const resolved = absolute ? normal : `${base.replace(/\/+$/, "")}/${normal}`;
  const segments = (value: string) => {
    const normalized = normalizePathSeparators(value);
    const prefix = /^[A-Za-z]:\//.test(normalized) ? normalized.slice(0, 2).toLowerCase() : "/";
    const body = prefix === "/" ? normalized : normalized.slice(2);
    const parts: string[] = [];
    for (const segment of body.split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") parts.pop();
      else parts.push(segment);
    }
    return { prefix, parts };
  };
  const file = segments(resolved);
  const project = segments(base);
  const caseInsensitive = file.prefix !== "/" || project.prefix !== "/";
  const equal = (a: string, b: string) =>
    caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
  const within = file.prefix === project.prefix
    && file.parts.length > project.parts.length
    && project.parts.every((segment, index) => equal(segment, file.parts[index]));
  return within
    ? file.parts.slice(project.parts.length).join("/")
    : `External/${file.prefix === "/" ? "" : file.prefix + "/"}${file.parts.join("/")}`;
}

export function getReviewTreePath(operation: FileOperation, sessionCwd?: string) {
  if (operation.toolName === "bash") return getShellTreePath(operation);
  if (sessionCwd) return canonicalReviewPath(operation.filePath, sessionCwd) || `Unknown/#${operation.sequence}`;
  return normalizeReviewPath(operation.filePath) || `Unknown/#${operation.sequence}`;
}

function getOperationGitStatus(operation: FileOperation): GitStatusEntry["status"] | undefined {
  // A failed/pending edit may have a diff preview, but no confirmed filesystem
  // mutation. Never decorate it as a successful Git-like file change.
  if (operation.isError || (operation.outcome && operation.outcome !== "succeeded")) return undefined;
  if (operation.toolName === "write") return "added";
  if (operation.toolName === "edit") return "modified";
  return undefined;
}

export function buildReviewTreeModel(operations: FileOperation[], sessionCwd?: string): ReviewTreeModel {
  const byPath = new Map<string, ReviewFileNode>();

  for (const operation of operations) {
    const path = getReviewTreePath(operation, sessionCwd);
    const existing = byPath.get(path);
    const node = existing ?? {
      path,
      operations: [],
      additions: 0,
      deletions: 0,
      hasError: false,
      hasPending: false,
      status: getOperationGitStatus(operation),
    };

    node.operations.push(operation);
    if (!operation.isError && (!operation.outcome || operation.outcome === "succeeded")) {
      node.additions += operation.metrics.additions;
      node.deletions += operation.metrics.deletions;
    }
    node.hasError ||= operation.isError;
    node.hasPending ||= operation.outcome === "pending";
    if (!node.status) node.status = getOperationGitStatus(operation);
    byPath.set(path, node);
  }

  const nodes = Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
  const canonicalPaths = nodes.map((node) => node.path);
  const { displayPaths, displayPathByCanonical, canonicalPathByDisplay } =
    resolveFileTreeDisplayPaths(canonicalPaths);

  return {
    nodes,
    paths: displayPaths,
    displayPathByCanonical,
    canonicalPathByDisplay,
    status: nodes
      .filter(
        (node): node is ReviewFileNode & { status: GitStatusEntry["status"] } =>
          Boolean(node.status),
      )
      .map((node) => ({
        path: displayPathByCanonical.get(node.path) ?? node.path,
        status: node.status,
      })),
  };
}

function getPatchCodeViewItem(operation: FileOperation): CodeViewItem | null {
  const patch = getOperationPatch(operation);
  if (!patch) return null;

  const patchFiles = parsePatchFiles(patch, operation.id);
  const fileDiff = patchFiles.flatMap((patchFile) => patchFile.files)[0];
  if (!fileDiff) return null;

  return {
    id: operation.id,
    type: "diff",
    fileDiff,
    version: operation.sequence,
  };
}

function getGeneratedDiffCodeViewItem(operation: FileOperation): CodeViewItem | null {
  const fileDiff = getOperationFileDiff(operation);
  if (!fileDiff) return null;

  return {
    id: operation.id,
    type: "diff",
    fileDiff: parseDiffFromFile(fileDiff.oldFile, fileDiff.newFile, undefined, false),
    version: operation.sequence,
  };
}

export function buildCodeViewItems(operations: FileOperation[]): CodeViewItem[] {
  const items: CodeViewItem[] = [];

  for (const operation of operations) {
    if (!isChangeOperation(operation)) continue;
    const item = getPatchCodeViewItem(operation) ?? getGeneratedDiffCodeViewItem(operation);
    if (item) items.push(item);
  }

  return items;
}
