import {
  parseDiffFromFile,
  parsePatchFiles,
  type CodeViewItem,
} from "@pierre/diffs";
import type { GitStatusEntry } from "@pierre/trees";

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
  status?: GitStatusEntry["status"];
}

export interface ReviewTreeModel {
  paths: string[];
  nodes: ReviewFileNode[];
  status: GitStatusEntry[];
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

export function getReviewTreePath(operation: FileOperation) {
  if (operation.toolName === "bash") return getShellTreePath(operation);
  return normalizeReviewPath(operation.filePath) || `Unknown/#${operation.sequence}`;
}

function getOperationGitStatus(operation: FileOperation): GitStatusEntry["status"] | undefined {
  if (operation.isError) return "modified";
  if (operation.toolName === "write") return "added";
  if (operation.toolName === "edit") return "modified";
  return undefined;
}

export function buildReviewTreeModel(operations: FileOperation[]): ReviewTreeModel {
  const byPath = new Map<string, ReviewFileNode>();

  for (const operation of operations) {
    const path = getReviewTreePath(operation);
    const existing = byPath.get(path);
    const node = existing ?? {
      path,
      operations: [],
      additions: 0,
      deletions: 0,
      hasError: false,
      status: getOperationGitStatus(operation),
    };

    node.operations.push(operation);
    node.additions += operation.metrics.additions;
    node.deletions += operation.metrics.deletions;
    node.hasError ||= operation.isError;
    if (operation.isError) node.status = "modified";
    if (!node.status) node.status = getOperationGitStatus(operation);
    byPath.set(path, node);
  }

  const nodes = Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
  return {
    nodes,
    paths: nodes.map((node) => node.path),
    status: nodes
      .filter(
        (node): node is ReviewFileNode & { status: GitStatusEntry["status"] } =>
          Boolean(node.status),
      )
      .map((node) => ({ path: node.path, status: node.status })),
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
