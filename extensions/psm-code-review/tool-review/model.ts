import type { FileContents } from "@pierre/diffs/react";

import type { Content, SessionEntry } from "@/types";
import { defaultResolveData } from "@/plugins/tools-render/utils/resolveData";
import { getLanguageFromPath } from "@/utils/markdown";

export interface OperationMetrics {
  additions: number;
  deletions: number;
  lines: number;
  bytes: number;
}

export interface FileOperation {
  id: string;
  entryId: string;
  sequence: number;
  toolName: string;
  filePath: string;
  content?: string;
  output?: string;
  diff?: string;
  args: Record<string, unknown>;
  isError: boolean;
  timestamp: string;
  preview: string;
  metrics: OperationMetrics;
}

export type ReviewFilter = "all" | "writes" | "edits" | "reads" | "shell" | "errors";

export const DEFAULT_REVIEW_FILTER: ReviewFilter = "all";

const EMPTY_METRICS: OperationMetrics = {
  additions: 0,
  deletions: 0,
  lines: 0,
  bytes: 0,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringArg(
  args: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
}

function getEditTextPair(args: Record<string, unknown>) {
  const oldText = getStringArg(
    args,
    "old_string",
    "oldStr",
    "before",
    "oldText",
  );
  const newText = getStringArg(
    args,
    "new_string",
    "newStr",
    "after",
    "newText",
  );

  if (oldText || newText) {
    return { oldText, newText };
  }

  const edits = args.edits;
  if (!Array.isArray(edits)) return null;

  for (const item of edits) {
    const edit = asRecord(item);
    const nestedOldText = getStringArg(
      edit,
      "old_string",
      "oldStr",
      "before",
      "oldText",
    );
    const nestedNewText = getStringArg(
      edit,
      "new_string",
      "newStr",
      "after",
      "newText",
    );

    if (nestedOldText || nestedNewText) {
      return { oldText: nestedOldText, newText: nestedNewText };
    }
  }

  return null;
}

function normalizeReviewToolName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized === "bash" || normalized === "shell" || normalized === "exec") {
    return "bash";
  }
  if (normalized === "read" || normalized === "read_file") return "read";
  if (normalized === "write" || normalized === "write_file") return "write";
  if (
    normalized === "edit" ||
    normalized === "edit_file" ||
    normalized === "multiedit" ||
    normalized === "apply_patch"
  ) {
    return "edit";
  }
  return normalized;
}

export function stringifyArgs(args: Record<string, unknown>) {
  try {
    return JSON.stringify(args, null, 2) || "{}";
  } catch {
    return "{}";
  }
}

function countLines(value: string) {
  if (!value) return 0;
  return value.endsWith("\n")
    ? value.split("\n").length - 1
    : value.split("\n").length;
}

function getBytes(value: string) {
  return new Blob([value]).size;
}

function parseDiffMetrics(
  diff: string,
): Pick<OperationMetrics, "additions" | "deletions"> {
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
}

function buildMetrics(
  toolName: string,
  content: string,
  output: string,
  diff: string,
): OperationMetrics {
  if (diff) {
    const { additions, deletions } = parseDiffMetrics(diff);
    return {
      additions,
      deletions,
      lines: Math.max(additions + deletions, countLines(diff)),
      bytes: getBytes(diff),
    };
  }

  const text = content || output;
  if (!text) return EMPTY_METRICS;

  return {
    additions: toolName === "write" ? countLines(text) : 0,
    deletions: 0,
    lines: countLines(text),
    bytes: getBytes(text),
  };
}

function firstMeaningfulLine(value: string) {
  return (
    value
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 0 &&
          !line.startsWith("@@") &&
          !line.startsWith("diff --git"),
      ) || ""
  );
}

function getOperationPreview(
  toolName: string,
  args: Record<string, unknown>,
  output: string,
  content: string,
  diff: string,
) {
  if (toolName === "bash") {
    return getStringArg(args, "command").replace(/\s+/g, " ").trim();
  }

  if (diff) return firstMeaningfulLine(diff);
  if (content) return firstMeaningfulLine(content);
  if (output) return firstMeaningfulLine(output);

  return stringifyArgs(args).replace(/\s+/g, " ").slice(0, 160);
}

function getOperationPath(toolName: string, args: Record<string, unknown>) {
  if (toolName === "bash") {
    return getStringArg(args, "command") || "Shell command";
  }

  return (
    getStringArg(args, "file_path", "path", "filePath", "absolutePath", "notebook_path", "absolute_path") ||
    getStringArg(args, "description") ||
    "Unknown target"
  );
}

function getPathBasename(path: string) {
  return path.split("/").filter(Boolean).pop() || path || "file";
}

export function getOperationTitle(operation: FileOperation) {
  if (operation.toolName === "bash") return "Shell command";
  return getPathBasename(operation.filePath);
}

export function getOperationScope(operation: FileOperation) {
  if (operation.toolName === "bash") {
    return operation.filePath;
  }

  const parts = operation.filePath.split("/").filter(Boolean);
  if (parts.length <= 1) return operation.filePath;
  return parts.slice(0, -1).join("/");
}

export function isChangeOperation(operation: FileOperation) {
  return operation.toolName === "write" || operation.toolName === "edit";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatShortPath(path: string) {
  if (!path || path === "Unknown target") return path;
  if (path.length <= 64) return path;
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

function isUnifiedDiff(value: string) {
  return (
    /(^|\n)@@ /.test(value) &&
    (/(^|\n)--- /.test(value) || value.includes("diff --git"))
  );
}

export function getOperationPatch(operation: FileOperation) {
  if (operation.diff && isUnifiedDiff(operation.diff)) {
    return operation.diff;
  }

  return "";
}

function parsePiDiff(
  diffText: string,
): { oldText: string; newText: string } | null {
  if (!diffText) return null;

  const lines = diffText.split("\n");
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let sawMarkedLine = false;

  for (const line of lines) {
    if (line.trim() === "...") continue;
    if (line.trim() === "") {
      oldLines.push("");
      newLines.push("");
      continue;
    }

    const lineMatch = line.match(/^([+-]?)\s*\d+\s+(.*)$/);
    if (!lineMatch) continue;

    sawMarkedLine = true;
    const [, marker, content] = lineMatch;
    if (marker === "-") {
      oldLines.push(content);
    } else if (marker === "+") {
      newLines.push(content);
    } else {
      oldLines.push(content);
      newLines.push(content);
    }
  }

  if (!sawMarkedLine) return null;

  return {
    oldText: oldLines.join("\n"),
    newText: newLines.join("\n"),
  };
}

function getEditFileContents(operation: FileOperation): {
  oldFile: FileContents;
  newFile: FileContents;
} | null {
  const fileName = getPathBasename(operation.filePath);
  const textPair = getEditTextPair(operation.args);

  if (textPair) {
    return {
      oldFile: { name: fileName, contents: textPair.oldText },
      newFile: { name: fileName, contents: textPair.newText },
    };
  }

  if (operation.diff) {
    const parsed = parsePiDiff(operation.diff);
    if (parsed) {
      return {
        oldFile: { name: fileName, contents: parsed.oldText },
        newFile: { name: fileName, contents: parsed.newText },
      };
    }
  }

  return null;
}

function getWriteFileContents(operation: FileOperation): {
  oldFile: FileContents;
  newFile: FileContents;
} | null {
  if (!operation.content) return null;
  const fileName = getPathBasename(operation.filePath);
  return {
    oldFile: { name: fileName, contents: "" },
    newFile: { name: fileName, contents: operation.content },
  };
}

export function getOperationFileDiff(operation: FileOperation) {
  if (operation.toolName === "edit") {
    return getEditFileContents(operation);
  }
  if (operation.toolName === "write") {
    return getWriteFileContents(operation);
  }
  return null;
}

export function getOperationLanguage(operation: FileOperation) {
  if (operation.toolName === "bash") return "bash";
  return getLanguageFromPath(operation.filePath);
}

export function getClipboardText(operation: FileOperation) {
  if (operation.toolName === "bash") {
    return operation.output
      ? `${operation.filePath}\n\n${operation.output}`
      : operation.filePath;
  }

  return (
    operation.diff ||
    operation.content ||
    operation.output ||
    stringifyArgs(operation.args)
  );
}

export function getReviewStatus(
  operation: FileOperation,
  hasPatch: boolean,
  hasPrimaryOutput: boolean,
) {
  if (operation.isError) {
    return {
      labelKey: "components.toolCallReview.status.error",
      fallbackLabel: "Needs attention",
      className: "border-destructive/25 bg-destructive/10 text-destructive",
    };
  }

  if (hasPatch || isChangeOperation(operation)) {
    return {
      labelKey: "components.toolCallReview.status.change",
      fallbackLabel: "Change review",
      className: "border-success/25 bg-success/10 text-success",
    };
  }

  if (hasPrimaryOutput) {
    return {
      labelKey: "components.toolCallReview.status.captured",
      fallbackLabel: "Captured output",
      className: "border-info/25 bg-info/10 text-info",
    };
  }

  return {
    labelKey: "components.toolCallReview.status.metadata",
    fallbackLabel: "Metadata only",
    className: "border-border/45 bg-surface/40 text-muted-foreground",
  };
}

export function extractFileOperations(
  entries: SessionEntry[],
  toolResultByCallId: Map<string, SessionEntry>,
): FileOperation[] {
  const operations: FileOperation[] = [];

  entries.forEach((entry) => {
    const content = entry.message?.content;
    if (!Array.isArray(content)) return;

    content.forEach((item: Content, itemIndex) => {
      if (item.type !== "toolCall") return;

      const toolCall = item as Content & {
        type: "toolCall";
        id?: string;
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const toolName = normalizeReviewToolName(toolCall.name || "unknown");
      if (!["write", "edit", "read", "bash", "task"].includes(toolName)) return;

      const resolved = defaultResolveData(
        toolCall,
        itemIndex,
        toolResultByCallId,
      );
      const args = asRecord(resolved.args ?? toolCall.arguments);
      const output = typeof resolved.output === "string" ? resolved.output : "";
      const diff = typeof resolved.diff === "string" ? resolved.diff : "";
      const editTextPair = toolName === "edit" ? getEditTextPair(args) : null;
      const contentArg =
        toolName === "edit"
          ? (editTextPair?.newText || getStringArg(args, "content", "new_string"))
          : toolName === "read"
            ? output || getStringArg(args, "content", "new_string")
            : getStringArg(args, "content", "new_string");
      const filePath = getOperationPath(toolName, args);
      const preview = getOperationPreview(
        toolName,
        args,
        output,
        contentArg,
        diff,
      );

      operations.push({
        id: `${entry.id}-${toolCall.id || operations.length}`,
        entryId: entry.id,
        sequence: operations.length + 1,
        toolName,
        filePath,
        content: contentArg || undefined,
        output: output || undefined,
        diff: diff || undefined,
        args,
        isError: Boolean(resolved.isError),
        timestamp: entry.timestamp,
        preview,
        metrics: buildMetrics(toolName, contentArg, output, diff),
      });
    });
  });

  return operations;
}
