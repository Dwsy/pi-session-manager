import type { ToolReviewAdapter, ToolReviewKind } from "@/plugins/tools-render/types";
import { toolRenderRegistry } from "@/plugins/tools-render/registry";

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

function stripToolNamespace(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return "";
  const colonIdx = trimmed.lastIndexOf(":");
  const afterColon = colonIdx >= 0 ? trimmed.slice(colonIdx + 1) : trimmed;
  const mcpMatch = afterColon.match(/^mcp__[^_]+__(.+)$/i);
  return (mcpMatch ? mcpMatch[1] : afterColon).toLowerCase();
}

function extractPathFromPatchText(patchText: string): string {
  if (!patchText) return "";
  const envelopeMatch = patchText.match(
    /^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/m,
  );
  if (envelopeMatch?.[1]) return envelopeMatch[1].trim();
  const diffGitMatch = patchText.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (diffGitMatch?.[2]) return diffGitMatch[2].trim();
  const plusMatch = patchText.match(/^\+\+\+\s+(?:b\/)?([^\s\t]+)$/m);
  if (plusMatch?.[1] && plusMatch[1] !== "/dev/null") return plusMatch[1].trim();
  return "";
}

const PATH_KEYS = [
  "file_path",
  "path",
  "filePath",
  "TargetFile",
  "AbsolutePath",
  "absolutePath",
  "absolute_path",
  "notebook_path",
  "target_file",
  "targetPath",
  "filename",
  "file",
  "File",
  "Path",
  "uri",
];

const COMMAND_KEYS = [
  "command",
  "CommandLine",
  "cmd",
  "script",
  "command_line",
  "shell_command",
];

const WRITE_CONTENT_KEYS = [
  "content",
  "Content",
  "CodeContent",
  "file_text",
  "new_content",
  "text",
  "Text",
  "contents",
  "Contents",
  "code",
];

function extractEditPairs(args: Record<string, unknown>): {
  oldText: string;
  newText: string;
} | null {
  const oldText = getStringArg(
    args,
    "old_string",
    "old_str",
    "oldStr",
    "before",
    "oldText",
    "old",
    "search",
    "Target",
    "TargetContent",
    "OldContent",
    "OldText",
  );
  const newText = getStringArg(
    args,
    "new_string",
    "new_str",
    "newStr",
    "after",
    "newText",
    "new",
    "replace",
    "Replacement",
    "ReplacementContent",
    "NewContent",
    "NewText",
  );
  if (oldText || newText) {
    return { oldText, newText };
  }

  const listCandidates = [args.edits, args.ReplacementChunks, args.chunks];
  for (const list of listCandidates) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const pairs: Array<{ oldText: string; newText: string }> = [];
    for (const item of list) {
      const rec = asRecord(item);
      const o = getStringArg(
        rec,
        "old_string",
        "old_str",
        "oldStr",
        "before",
        "oldText",
        "old",
        "Target",
        "TargetContent",
      );
      const n = getStringArg(
        rec,
        "new_string",
        "new_str",
        "newStr",
        "after",
        "newText",
        "new",
        "Replacement",
        "ReplacementContent",
      );
      if (o || n) pairs.push({ oldText: o, newText: n });
    }
    if (pairs.length === 1) return pairs[0];
    if (pairs.length > 1) {
      return {
        oldText: pairs.map((p) => p.oldText).join("\n\n"),
        newText: pairs.map((p) => p.newText).join("\n\n"),
      };
    }
  }

  return null;
}

const SHELL_TOOLS = new Set([
  "bash",
  "shell",
  "exec",
  "run_command",
  "exec_command",
  "execute_command",
  "shell_command",
  "run_shell_command",
  "run_terminal_cmd",
  "terminal",
]);

const READ_TOOLS = new Set([
  "read",
  "read_file",
  "view_file",
  "view_file_outline",
  "view_code_item",
  "open_file",
  "cat",
  "read_many_files",
]);

const WRITE_TOOLS = new Set([
  "write",
  "write_file",
  "write_to_file",
  "create_file",
  "save_file",
  "overwrite_file",
]);

const EDIT_TOOLS = new Set([
  "edit",
  "edit_file",
  "file_edit",
  "multiedit",
  "multi_edit",
  "apply_patch",
  "patch_file",
  "replace_file_content",
  "multi_replace_file_content",
  "str_replace",
  "str_replace_editor",
  "str_replace_based_edit_tool",
  "search_replace",
  "replace_in_file",
  "notebookedit",
  "notebook_edit",
]);

function resolveKind(baseName: string, args: Record<string, unknown>): ToolReviewKind | null {
  if (baseName === "file_edit") {
    const action = typeof args.action === "string" ? args.action.toLowerCase() : "";
    if (action === "add") return "write";
    return "edit";
  }
  if (SHELL_TOOLS.has(baseName)) return "bash";
  if (READ_TOOLS.has(baseName)) return "read";
  if (WRITE_TOOLS.has(baseName)) return "write";
  if (EDIT_TOOLS.has(baseName)) return "edit";
  if (baseName === "task") return "task";
  return null;
}

export const builtinMultiAgentReviewAdapter: ToolReviewAdapter = {
  id: "builtin.code-review.multi-agent",
  priority: 10,
  match: (toolCall) => {
    const baseName = stripToolNamespace(toolCall.name || "");
    return (
      SHELL_TOOLS.has(baseName) ||
      READ_TOOLS.has(baseName) ||
      WRITE_TOOLS.has(baseName) ||
      EDIT_TOOLS.has(baseName) ||
      baseName === "task"
    );
  },
  extract: (toolCall, args, resolved) => {
    const baseName = stripToolNamespace(toolCall.name || "");
    const kind = resolveKind(baseName, args);
    if (!kind) return null;

    if (kind === "bash") {
      const command = getStringArg(args, ...COMMAND_KEYS);
      return {
        toolName: "bash",
        filePath: command || "Shell command",
        preview: command.replace(/\s+/g, " ").trim(),
      };
    }

    const patchArg = getStringArg(args, "patch", "diff", "input");
    const filePath =
      getStringArg(args, ...PATH_KEYS) ||
      extractPathFromPatchText(patchArg) ||
      getStringArg(args, "description");

    if (kind === "edit") {
      const pair = extractEditPairs(args);
      return {
        toolName: "edit",
        filePath: filePath || undefined,
        oldText: pair?.oldText,
        newText: pair?.newText,
        content: pair?.newText || getStringArg(args, ...WRITE_CONTENT_KEYS) || undefined,
        diff: patchArg || undefined,
      };
    }

    if (kind === "write") {
      return {
        toolName: "write",
        filePath: filePath || undefined,
        content: getStringArg(args, ...WRITE_CONTENT_KEYS) || undefined,
      };
    }

    if (kind === "read") {
      return {
        toolName: "read",
        filePath: filePath || undefined,
        content: resolved.output || getStringArg(args, ...WRITE_CONTENT_KEYS) || undefined,
      };
    }

    return {
      toolName: kind,
      filePath: filePath || undefined,
    };
  },
};

export function ensureBuiltinReviewAdapters(): void {
  toolRenderRegistry.registerReviewAdapter(builtinMultiAgentReviewAdapter);
}
