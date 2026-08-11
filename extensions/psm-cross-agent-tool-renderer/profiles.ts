export type CrossAgentKind =
  | "shell"
  | "read"
  | "write"
  | "edit"
  | "search"
  | "todo"
  | "agent"
  | "wait"
  | "generic";

type ToolProfile = {
  names: readonly string[];
  kind: CrossAgentKind;
  title: string;
  primaryKeys?: readonly string[];
  durationKeys?: readonly string[];
};

const DEFAULT_PRIMARY_KEYS = [
  "i",
  "query",
  "prompt",
  "description",
  "action",
  "op",
  "name",
  "path",
  "file_path",
  "url",
  "symbol",
  "text",
  "skill",
  "key",
  "value",
] as const;

const OMP_BUILTIN_TOOLS = [
  "read",
  "bash",
  "edit",
  "ast_grep",
  "ast_edit",
  "ask",
  "debug",
  "eval",
  "github",
  "glob",
  "grep",
  "lsp",
  "inspect_image",
  "browser",
  "computer",
  "checkpoint",
  "rewind",
  "security_scan",
  "task",
  "hub",
  "todo",
  "web_search",
  "write",
  "memory_edit",
  "retain",
  "recall",
  "reflect",
  "learn",
  "manage_skill",
  "yield",
  "goal",
] as const;

const TOOL_PROFILES = [
  {
    names: ["Bash", "bash", "shell", "exec"],
    kind: "shell",
    title: "Shell",
    primaryKeys: ["command", "cmd", "script", "value"],
  },
  {
    names: ["Read", "read", "read_file"],
    kind: "read",
    title: "Read",
    primaryKeys: ["file_path", "path", "absolute_path"],
  },
  {
    names: ["Write", "write", "write_file"],
    kind: "write",
    title: "Write",
    primaryKeys: ["file_path", "path", "absolute_path"],
  },
  {
    names: ["Edit", "MultiEdit", "edit", "edit_file"],
    kind: "edit",
    title: "Edit",
    primaryKeys: ["file_path", "path", "absolute_path"],
  },
  {
    names: ["apply_patch"],
    kind: "edit",
    title: "Patch",
    primaryKeys: ["file_path", "path", "absolute_path"],
  },
  {
    names: ["ast_edit"],
    kind: "edit",
    title: "AST Edit",
    primaryKeys: ["file_path", "path", "absolute_path"],
  },
  {
    names: ["grep", "search"],
    kind: "search",
    title: "Grep",
    primaryKeys: ["i", "pattern", "query", "path"],
  },
  {
    names: ["glob", "find"],
    kind: "search",
    title: "Glob",
    primaryKeys: ["i", "pattern", "query", "path"],
  },
  {
    names: ["ast_grep"],
    kind: "search",
    title: "AST Grep",
    primaryKeys: ["i", "pattern", "query", "path"],
  },
  {
    names: ["web_search"],
    kind: "search",
    title: "Web Search",
    primaryKeys: ["i", "query", "pattern"],
  },
  {
    names: ["todo"],
    kind: "todo",
    title: "Tasks",
    primaryKeys: ["i", "op"],
  },
  {
    names: ["task"],
    kind: "agent",
    title: "Task",
    primaryKeys: [
      "task_name",
      "description",
      "prompt",
      "task",
      "target",
      "message",
    ],
  },
  {
    names: ["spawn_agent", "send_message", "followup_task", "interrupt_agent"],
    kind: "agent",
    title: "Agent",
    primaryKeys: [
      "task_name",
      "description",
      "prompt",
      "task",
      "target",
      "message",
    ],
  },
  {
    names: ["list_agents"],
    kind: "agent",
    title: "Agents",
    primaryKeys: ["task_name", "target", "message"],
  },
  {
    names: ["wait", "wait_agent"],
    kind: "wait",
    title: "Wait",
    primaryKeys: ["i", "message", "reason"],
    durationKeys: ["yield_time_ms", "timeout_ms"],
  },
  {
    names: ["yield"],
    kind: "wait",
    title: "Yield",
    primaryKeys: ["i", "message", "reason"],
    durationKeys: ["yield_time_ms", "timeout_ms"],
  },
] satisfies readonly ToolProfile[];

const TOOL_PROFILE_BY_NAME: ReadonlyMap<string, ToolProfile> = new Map(
  TOOL_PROFILES.flatMap((profile) =>
    profile.names.map((name) => [name, profile] as const),
  ),
);

export const CROSS_AGENT_TOOLS = new Set([
  ...OMP_BUILTIN_TOOLS,
  ...TOOL_PROFILE_BY_NAME.keys(),
]);

export function normalizeArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    const trimmed = args.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return { value: args };
      }
    }
    return { value: args };
  }
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function getStringArg(
  args: Record<string, unknown>,
  ...keys: readonly string[]
): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function getNumberArg(
  args: Record<string, unknown>,
  ...keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

const TOOL_WORD_LABELS: Record<string, string> = {
  ast: "AST",
  github: "GitHub",
  lsp: "LSP",
};

function humanizeToolName(name: string): string {
  if (!name) return "Tool";
  return name
    .split("_")
    .map(
      (word) =>
        TOOL_WORD_LABELS[word] ||
        `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
}

export function getToolPresentation(
  name: string,
  args: Record<string, unknown>,
): { kind: CrossAgentKind; title: string; primaryText: string } {
  const profile = TOOL_PROFILE_BY_NAME.get(name);
  const duration = profile?.durationKeys
    ? getNumberArg(args, ...profile.durationKeys)
    : undefined;
  const primaryText =
    duration !== undefined
      ? `${duration} ms`
      : getStringArg(args, ...(profile?.primaryKeys || DEFAULT_PRIMARY_KEYS)) ||
        name;

  return {
    kind: profile?.kind || "generic",
    title: profile?.title || humanizeToolName(name),
    primaryText,
  };
}

export function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}
