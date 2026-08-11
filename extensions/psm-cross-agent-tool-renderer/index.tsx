import {
  FilePenLine,
  FileText,
  ListTodo,
  PlusSquare,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import type {
  PsmPluginHostContext,
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
  PsmToolResultEntry,
} from "@pi-session-manager/plugin-sdk";
import { escapeHtml } from "@/utils/markdown";
import { highlightSearchInHTML } from "@/utils/search";
import { manifest } from "./manifest";
import ToolHeader from "@/components/tool-calls/ToolHeader";
import ToolSectionHeader from "@/components/tool-calls/ToolSectionHeader";
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from "@/plugins/tools-render/utils/status";

type CrossAgentKind =
  | "shell"
  | "read"
  | "write"
  | "edit"
  | "search"
  | "todo"
  | "agent"
  | "wait"
  | "generic";

const OMP_BUILTIN_TOOLS = new Set([
  "read", "bash", "edit", "ast_grep", "ast_edit", "ask", "debug", "eval", "github", "glob",
  "grep", "lsp", "inspect_image", "browser", "computer", "checkpoint", "rewind", "security_scan",
  "task", "hub", "todo", "web_search", "write", "memory_edit", "retain", "recall", "reflect",
  "learn", "manage_skill", "yield", "goal",
]);
const SHELL_TOOLS = new Set(["Bash", "bash", "shell", "exec"]);
const READ_TOOLS = new Set(["Read", "read", "read_file"]);
const WRITE_TOOLS = new Set(["Write", "write", "write_file"]);
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "edit", "ast_edit", "edit_file", "apply_patch"]);
const SEARCH_TOOLS = new Set(["grep", "glob", "ast_grep", "web_search", "search", "find"]);
const TODO_TOOLS = new Set(["todo"]);
const AGENT_TOOLS = new Set([
  "task",
  "spawn_agent",
  "send_message",
  "followup_task",
  "interrupt_agent",
  "list_agents",
]);
const WAIT_TOOLS = new Set(["wait", "wait_agent", "yield"]);
const CROSS_AGENT_TOOLS = new Set([
  ...OMP_BUILTIN_TOOLS,
  ...SHELL_TOOLS,
  ...READ_TOOLS,
  ...WRITE_TOOLS,
  ...EDIT_TOOLS,
  ...SEARCH_TOOLS,
  ...TODO_TOOLS,
  ...AGENT_TOOLS,
  ...WAIT_TOOLS,
]);

function normalizeArgs(args: unknown): Record<string, unknown> {
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
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function getKind(name: string): CrossAgentKind {
  if (SHELL_TOOLS.has(name)) return "shell";
  if (READ_TOOLS.has(name)) return "read";
  if (WRITE_TOOLS.has(name)) return "write";
  if (EDIT_TOOLS.has(name)) return "edit";
  if (SEARCH_TOOLS.has(name)) return "search";
  if (TODO_TOOLS.has(name)) return "todo";
  if (AGENT_TOOLS.has(name)) return "agent";
  if (WAIT_TOOLS.has(name)) return "wait";
  return "generic";
}

function getTitle(kind: CrossAgentKind, name: string): string {
  if (kind === "shell") return "Shell";
  if (kind === "read") return "Read";
  if (kind === "write") return "Write";
  if (kind === "edit") return name === "apply_patch" ? "Patch" : name === "ast_edit" ? "AST Edit" : "Edit";
  if (kind === "search") {
    if (name === "glob" || name === "find") return "Glob";
    if (name === "ast_grep") return "AST Grep";
    if (name === "web_search") return "Web Search";
    return "Grep";
  }
  if (kind === "todo") return "Tasks";
  if (kind === "agent") return name === "task" ? "Task" : name === "list_agents" ? "Agents" : "Agent";
  if (kind === "wait") return name === "yield" ? "Yield" : "Wait";
  return name || "Tool";
}

function getPrimaryText(
  kind: CrossAgentKind,
  args: Record<string, unknown>,
  name: string,
): string {
  if (kind === "shell")
    return getStringArg(args, "command", "cmd", "script", "value") || name;
  if (kind === "read")
    return getStringArg(args, "file_path", "path", "absolute_path") || name;
  if (kind === "write")
    return getStringArg(args, "file_path", "path", "absolute_path") || name;
  if (kind === "edit")
    return getStringArg(args, "file_path", "path", "absolute_path") || name;
  if (kind === "search")
    return getStringArg(args, "i", "pattern", "query", "path") || name;
  if (kind === "todo")
    return getStringArg(args, "i", "op") || name;
  if (kind === "agent")
    return getStringArg(args, "task_name", "description", "prompt", "task", "target", "message") || name;
  if (kind === "wait") {
    const duration = args.yield_time_ms ?? args.timeout_ms;
    if (typeof duration === "number") return `${duration} ms`;
    return getStringArg(args, "i", "message", "reason") || name;
  }
  return getStringArg(args, "i", "query", "prompt", "description", "action", "op", "name", "path", "file_path", "url", "symbol", "text", "skill", "key", "value") || name;
}

function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function highlighted(value: string, searchQuery?: string) {
  const escaped = escapeHtml(value);
  return searchQuery ? highlightSearchInHTML(escaped, searchQuery) : escaped;
}

function CrossAgentToolRenderer({
  resolvedData,
  searchQuery,
  context,
}: PsmToolRenderProps) {
  const { name, output, entryId } = resolvedData;
  const status = getToolRenderStatus(resolvedData);
  const args = normalizeArgs(resolvedData.args);
  const kind = getKind(name);
  const title = getTitle(kind, name);
  const primaryText = getPrimaryText(kind, args, name);
  const argsText = formatArgs(args);
  const hasArgs = Object.keys(args).length > 0;
  const hasDetails = hasArgs || Boolean(output);
  const Icon =
    kind === "shell"
      ? Terminal
      : kind === "read"
        ? FileText
        : kind === "write"
          ? PlusSquare
          : kind === "edit"
            ? FilePenLine
            : kind === "search"
              ? Search
              : kind === "todo"
                ? ListTodo
                : Wrench;

  return (
    <div
      className={`tool-execution ${getToolExecutionClass(resolvedData, context.disableSuccessStyle)}`.trim()}
      id={`entry-${entryId}`}
    >
      <ToolHeader
        expandable={hasDetails}
        expanded={context.isExpanded}
        onToggle={context.toggleExpanded}
        ariaLabel={`${title}: ${getToolStatusLabel(status, context.t)}`}
      >
        {hasDetails && (
          <span className="tool-expand-indicator">
            {context.isExpanded ? "▾" : "▸"}
          </span>
        )}
        <span className="tool-name inline-flex items-center gap-1.5">
          <Icon className="h-4 w-4" />
          {title}
        </span>
        <span className="tool-path" title={primaryText}>
          {primaryText}
        </span>
        <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, context.t)}</span>
      </ToolHeader>

      {hasDetails && (
        <div
          className={`tool-output-wrapper collapsible ${context.isExpanded ? "expanded" : ""}`}
        >
          <div
            className={`tool-expand-content ${context.isExpanded ? "expanded" : ""}`}
          >
            {context.isExpanded && (
              <div className="space-y-3 p-3 text-sm">
                {hasArgs && (
                  <div className="tool-output">
                    <ToolSectionHeader
                      label={context.t('components.toolCall.arguments', 'Arguments')}
                      text={argsText}
                      copyText={context.copyToClipboard}
                    />
                    <pre className="tool-output-plain">
                      <code
                        dangerouslySetInnerHTML={{
                          __html: highlighted(argsText, searchQuery),
                        }}
                      />
                    </pre>
                  </div>
                )}
                {output && (
                  <div className="tool-output">
                    <ToolSectionHeader
                      label={context.t('components.toolCall.output', 'Output')}
                      text={output}
                      copyText={context.copyToClipboard}
                    />
                    <pre
                      className="tool-output-plain"
                      dangerouslySetInnerHTML={{
                        __html: highlighted(output, searchQuery),
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function resolveCrossAgentData(
  toolCall: PsmToolCallContent,
  index: number,
  toolResultByCallId: Map<string, PsmToolResultEntry>,
): PsmToolResolvedData {
  const toolCallId = toolCall.id || "";
  const result = toolCallId
    ? (toolResultByCallId.get(toolCallId) as
        | PsmToolResolvedData["result"]
        | undefined)
    : undefined;
  const message = result?.message as
    | { content?: unknown[]; output?: string; isError?: boolean }
    | undefined;
  const firstContent = Array.isArray(message?.content)
    ? (message?.content[0] as
        | { text?: string; output?: string; isError?: boolean }
        | undefined)
    : undefined;
  const output =
    message?.output || firstContent?.text || firstContent?.output || "";

  return {
    name: toolCall.name || "unknown",
    args: normalizeArgs(toolCall.arguments),
    toolCallId,
    entryId: toolCallId
      ? `tool-result-${toolCallId}`
      : `cross-agent-tool-${index}`,
    result,
    output,
    isError: Boolean(message?.isError || firstContent?.isError),
  };
}

export const crossAgentToolRenderer: PsmToolRendererRegistration = {
  id: "builtin-cross-agent-tool-renderer",
  name: "Cross-Agent Tool Renderer",
  match: (toolCall) => CROSS_AGENT_TOOLS.has(toolCall.name || ""),
  priority: 115,
  component: CrossAgentToolRenderer,
  resolveData: resolveCrossAgentData,
  getSearchSegments: (_toolCall, data) =>
    [data.name, formatArgs(normalizeArgs(data.args)), data.output].filter(
      Boolean,
    ),
  getPreview: (_toolCall, data) =>
    `${getTitle(getKind(data.name), data.name)}: ${getPrimaryText(getKind(data.name), normalizeArgs(data.args), data.name)}`,
};

export { manifest };

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(crossAgentToolRenderer);
}
