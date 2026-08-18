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
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
  PsmToolResultEntry,
} from "@pi-session-manager/plugin-sdk";
import ToolHeader from "@/components/tool-calls/ToolHeader";
import ToolSectionHeader from "@/components/tool-calls/ToolSectionHeader";
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from "@/plugins/tools-render/utils/status";
import { escapeHtml } from "@/utils/markdown";
import { highlightSearchInHTML } from "@/utils/search";
import {
  CROSS_AGENT_TOOLS,
  formatArgs,
  getToolPresentation,
  normalizeArgs,
  type CrossAgentKind,
} from "./profiles";

const ICON_BY_KIND: Partial<Record<CrossAgentKind, typeof Wrench>> = {
  shell: Terminal,
  read: FileText,
  write: PlusSquare,
  edit: FilePenLine,
  search: Search,
  todo: ListTodo,
};

const PI_BUILTIN_TOOLS = new Set([
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
]);

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
  const { kind, title, primaryText } = getToolPresentation(name, args);
  const argsText = formatArgs(args);
  const hasArgs = Object.keys(args).length > 0;
  const hasDetails = hasArgs || Boolean(output);
  const Icon = ICON_BY_KIND[kind] || Wrench;

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
        <span className={`tool-status tool-status-${status}`}>
          {getToolStatusLabel(status, context.t)}
        </span>
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
                      label={context.t(
                        "components.toolCall.arguments",
                        "Arguments",
                      )}
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
                      label={context.t("components.toolCall.output", "Output")}
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
  match: (toolCall) => {
    const name = toolCall.name || "";
    return !PI_BUILTIN_TOOLS.has(name) && CROSS_AGENT_TOOLS.has(name);
  },
  priority: 115,
  component: CrossAgentToolRenderer,
  resolveData: resolveCrossAgentData,
  getSearchSegments: (_toolCall, data) =>
    [data.name, formatArgs(normalizeArgs(data.args)), data.output].filter(
      Boolean,
    ),
  getPreview: (_toolCall, data) => {
    const { title, primaryText } = getToolPresentation(
      data.name,
      normalizeArgs(data.args),
    );
    return `${title}: ${primaryText}`;
  },
};
