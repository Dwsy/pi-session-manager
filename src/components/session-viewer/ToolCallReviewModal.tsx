import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  X,
  FileText,
  FileEdit,
  FilePlus,
  Terminal,
  Brain,
  Wrench,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
} from "lucide-react";
import type { SessionEntry, Content } from "@/types";
import { defaultResolveData } from "@/plugins/tools-render/utils/resolveData";
import CodeBlock from "@/components/ui/CodeBlock";
import { getLanguageFromPath } from "@/utils/markdown";
import { FileDiff } from "@pierre/diffs/react";
import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import "@/utils/diffs-init";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FileOperation {
  id: string;
  entryId: string;
  toolName: string;
  filePath: string;
  content?: string;
  output?: string;
  diff?: string;
  args: Record<string, any>;
  isError: boolean;
  timestamp: string;
}

interface ToolCallReviewModalProps {
  entries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Tool Config ─────────────────────────────────────────────────────────────

const TOOL_CONFIG: Record<
  string,
  { icon: typeof FileText; color: string; bg: string; dot: string }
> = {
  write: { icon: FilePlus, color: "text-emerald-400", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
  edit: { icon: FileEdit, color: "text-sky-400", bg: "bg-sky-400/10", dot: "bg-sky-400" },
  read: { icon: FileText, color: "text-amber-400", bg: "bg-amber-400/10", dot: "bg-amber-400" },
  bash: { icon: Terminal, color: "text-purple-400", bg: "bg-purple-400/10", dot: "bg-purple-400" },
  thinking: { icon: Brain, color: "text-pink-400", bg: "bg-pink-400/10", dot: "bg-pink-400" },
  _default: { icon: Wrench, color: "text-muted-foreground", bg: "bg-secondary/50", dot: "bg-muted-foreground" },
};

function getToolConfig(toolName: string) {
  return TOOL_CONFIG[toolName.toLowerCase()] ?? TOOL_CONFIG._default;
}

// ─── Diff Helpers ─────────────────────────────────────────────────────────────

function makeNewFileDiff(filePath: string, content: string): string {
  const lines = content.split("\n");
  const lineCount = lines.length;
  const additionLines = lines.map((l) => `+${l}`).join("\n");
  return `--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lineCount} @@
${additionLines}
`;
}

function tryParseDiff(diffStr: string): FileDiffMetadata | null {
  try {
    const patches = parsePatchFiles(diffStr);
    if (patches.length > 0 && patches[0].files.length > 0) {
      return patches[0].files[0];
    }
  } catch {
    // fall through
  }
  return null;
}

// ─── Extract Operations ──────────────────────────────────────────────────────

function extractFileOperations(
  entries: SessionEntry[],
  toolResultByCallId: Map<string, SessionEntry>,
): FileOperation[] {
  const operations: FileOperation[] = [];

  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message?.content) continue;

    const toolCalls = entry.message.content.filter(
      (item): item is Content & { type: "toolCall" } => item.type === "toolCall",
    );

    for (const toolCall of toolCalls) {
      const name = toolCall.name || "unknown";
      const resolved = defaultResolveData(toolCall, 0, toolResultByCallId);
      const args = resolved.args;

      let filePath = "";
      if (name === "write" || name === "edit" || name === "read") {
        filePath = args.file_path || args.path || "";
      } else if (name === "bash") {
        filePath = args.command || "";
      }

      operations.push({
        id: toolCall.id || `${entry.id}-${operations.length}`,
        entryId: entry.id,
        toolName: name,
        filePath: filePath || `[${name}]`,
        content: args.content,
        output: resolved.output,
        diff: resolved.diff,
        args,
        isError: resolved.isError,
        timestamp: entry.timestamp,
      });
    }
  }

  return operations;
}

// ─── File Tree ───────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  operations: FileOperation[];
}

function buildFileTree(operations: FileOperation[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map(), operations: [] };

  for (const op of operations) {
    if (op.toolName === "bash") {
      let bashNode = root.children.get("[bash]");
      if (!bashNode) {
        bashNode = { name: "[bash]", path: "[bash]", children: new Map(), operations: [] };
        root.children.set("[bash]", bashNode);
      }
      bashNode.operations.push(op);
      continue;
    }

    const parts = op.filePath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partialPath = parts.slice(0, i + 1).join("/");
      let child = current.children.get(part);
      if (!child) {
        child = { name: part, path: partialPath, children: new Map(), operations: [] };
        current.children.set(part, child);
      }
      if (i === parts.length - 1) child.operations.push(op);
      current = child;
    }
  }

  collapseSingleChildren(root);
  return root;
}

function collapseSingleChildren(node: TreeNode): void {
  for (const child of node.children.values()) {
    if (child.children.size > 0) collapseSingleChildren(child);
  }
  while (node.children.size === 1 && node.operations.length === 0) {
    const onlyChild = node.children.values().next().value!;
    if (onlyChild.children.size === 0) break;
    node.name = node.name ? `${node.name}.${onlyChild.name}` : onlyChild.name;
    node.path = onlyChild.path;
    node.children = onlyChild.children;
    node.operations = onlyChild.operations;
  }
}

// ─── File Tree Component ─────────────────────────────────────────────────────

function FileTreeView({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (op: FileOperation) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (n: TreeNode) => {
      if (n.children.size > 0) s.add(n.path || "/");
      n.children.forEach(walk);
    };
    walk(node);
    return s;
  });

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const sortedChildren = useMemo(
    () =>
      Array.from(node.children.values()).sort((a, b) => {
        const aIsDir = a.children.size > 0;
        const bIsDir = b.children.size > 0;
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [node.children],
  );

  if (depth === 0 && node.operations.length === 0 && node.children.size === 0) return null;

  return (
    <div>
      {sortedChildren.map((child) => {
        const isDir = child.children.size > 0;
        const isExpanded = expanded.has(child.path || "/");
        const hasOps = child.operations.length > 0;
        const isLeaf = !isDir && hasOps;
        const isSelected = isLeaf && child.operations.some((op) => op.id === selectedId);

        return (
          <div key={child.path}>
            {/* Directory or file row */}
            <button
              type="button"
              className={`
                flex items-center gap-1.5 w-full text-left
                transition-colors duration-75
                ${isSelected
                  ? "bg-primary/12 text-primary"
                  : "text-foreground/70 hover:bg-secondary/40 hover:text-foreground/90"
                }
                ${isDir ? "py-[5px]" : "py-[4px]"}
              `}
              style={{ paddingLeft: `${depth * 14 + 10}px`, paddingRight: 8 }}
              onClick={() => {
                if (isDir) toggle(child.path || "/");
                else if (hasOps) onSelect(child.operations[0]);
              }}
            >
              {/* Expand chevron */}
              {isDir ? (
                <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center text-muted-foreground/50">
                  {isExpanded
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />}
                </span>
              ) : (
                <span className="flex-shrink-0 w-3.5" />
              )}

              {/* Icon */}
              {isDir ? (
                isExpanded
                  ? <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-amber-400/60" />
                  : <Folder className="h-3.5 w-3.5 flex-shrink-0 text-amber-400/60" />
              ) : hasOps ? (
                (() => {
                  const cfg = getToolConfig(child.operations[0].toolName);
                  const Icon = cfg.icon;
                  return <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? "text-primary" : cfg.color}`} />;
                })()
              ) : (
                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />
              )}

              {/* Name */}
              <span className={`
                truncate text-[12px] leading-tight
                ${isDir ? "font-medium text-foreground/75" : "font-mono text-[11px]"}
                ${isSelected ? "text-primary font-medium" : ""}
              `}>
                {child.name}
              </span>

              {/* Op count for multi-op files */}
              {!isDir && child.operations.length > 1 && (
                <span className="ml-auto flex-shrink-0 text-[9px] text-muted-foreground/40 tabular-nums">
                  {child.operations.length}
                </span>
              )}
            </button>

            {/* Expanded file with multiple operations */}
            {!isDir && isExpanded && child.operations.length > 1 && (
              <div className="ml-4">
                {child.operations.map((op) => {
                  const cfg = getToolConfig(op.toolName);
                  const isActive = selectedId === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      className={`
                        flex items-center gap-1.5 w-full text-left py-[3px]
                        text-[11px] transition-colors duration-75 rounded-sm
                        ${isActive
                          ? "bg-primary/12 text-primary font-medium"
                          : "text-muted-foreground hover:bg-secondary/30 hover:text-foreground/80"
                        }
                      `}
                      style={{ paddingLeft: `${depth * 14 + 10 + 14 + 14}px`, paddingRight: 8 }}
                      onClick={() => onSelect(op)}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-primary" : cfg.dot}`} />
                      <span className="truncate font-mono">{op.toolName}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Directory children */}
            {isDir && isExpanded && (
              <FileTreeView node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ operation, t }: { operation: FileOperation | null; t: (k: string, d: string) => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, []);

  const fileDiff = useMemo((): FileDiffMetadata | null => {
    if (!operation) return null;
    if (operation.toolName === "edit" && operation.diff) return tryParseDiff(operation.diff);
    if (operation.toolName === "write" && operation.content) return tryParseDiff(makeNewFileDiff(operation.filePath, operation.content));
    return null;
  }, [operation]);

  if (!operation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground/50">
        <div className="text-center space-y-2">
          <FileText className="h-10 w-10 mx-auto opacity-20" />
          <p className="text-xs">{t("review.selectFile", "Select a file to review")}</p>
        </div>
      </div>
    );
  }

  const config = getToolConfig(operation.toolName);
  const Icon = config.icon;
  const lang = operation.toolName !== "bash" ? getLanguageFromPath(operation.filePath) : "bash";

  const handleCopyClick = () => {
    const text = operation.toolName === "bash"
      ? operation.filePath
      : operation.content || operation.diff || operation.output || "";
    void handleCopy(text);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* File header bar */}
      <div className="flex items-center gap-2.5 px-4 py-2 border-b border-border/30 bg-background/30 flex-shrink-0">
        <div className={`p-1 rounded ${config.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
        </div>

        <span className="flex-1 min-w-0 text-[12px] font-mono text-foreground/70 truncate">
          {operation.toolName === "bash" ? (
            <>
              <span className="text-foreground/40">$ </span>
              {operation.filePath}
            </>
          ) : (
            operation.filePath
          )}
        </span>

        {operation.toolName === "write" && operation.content && (
          <span className="text-[10px] text-muted-foreground/50 bg-secondary/40 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
            {operation.content.split("\n").length}L
          </span>
        )}

        {operation.toolName === "edit" && operation.diff && (
          <span className="text-[10px] text-muted-foreground/50 bg-secondary/40 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
            diff
          </span>
        )}

        <button
          onClick={handleCopyClick}
          className="p-1 rounded hover:bg-secondary/60 transition-colors flex-shrink-0"
          aria-label={copied ? t("review.copied", "Copied") : t("review.copy", "Copy")}
        >
          {copied
            ? <Check className="h-3.5 w-3.5 text-emerald-400" />
            : <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />}
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {/* @pierre/diffs FileDiff */}
        {fileDiff && (
          <div className="p-2">
            <FileDiff
              fileDiff={fileDiff}
              options={{
                theme: { dark: "one-dark-pro", light: "one-light" },
                overflow: "scroll",
                disableFileHeader: false,
              }}
            />
          </div>
        )}

        {/* Fallback: raw diff */}
        {!fileDiff && operation.toolName === "edit" && operation.diff && (
          <div className="p-2">
            <CodeBlock code={operation.diff} language="diff" showLineNumbers={false} scrollable maxHeight={600} />
          </div>
        )}

        {/* Fallback: raw write content */}
        {!fileDiff && operation.toolName === "write" && operation.content && (
          <div className="p-2">
            <CodeBlock code={operation.content} language={lang} showLineNumbers scrollable maxHeight={600} />
          </div>
        )}

        {/* Bash output */}
        {operation.toolName === "bash" && operation.output && (
          <div className="p-2">
            <CodeBlock code={operation.output} language="shell" showLineNumbers={false} scrollable maxHeight={500} />
          </div>
        )}

        {/* Read content */}
        {operation.toolName === "read" && operation.output && (
          <div className="p-2">
            <CodeBlock code={operation.output} language={lang} showLineNumbers scrollable maxHeight={600} />
          </div>
        )}

        {/* Error output */}
        {operation.isError && operation.output && (
          <div className="p-2 border-t border-destructive/15">
            <div className="text-[10px] font-medium text-destructive/80 uppercase tracking-wider mb-1.5 px-1">
              {t("review.errorOutput", "Error Output")}
            </div>
            <CodeBlock code={operation.output} language="shell" showLineNumbers={false} scrollable maxHeight={200} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function ToolCallReviewModal({
  entries,
  toolResultByCallId,
  isOpen,
  onClose,
}: ToolCallReviewModalProps) {
  const { t } = useTranslation();
  const [selectedOp, setSelectedOp] = useState<FileOperation | null>(null);

  const allOperations = useMemo(
    () => extractFileOperations(entries, toolResultByCallId),
    [entries, toolResultByCallId],
  );

  const fileTree = useMemo(() => buildFileTree(allOperations), [allOperations]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const op of allOperations) counts[op.toolName] = (counts[op.toolName] ?? 0) + 1;
    return counts;
  }, [allOperations]);

  // Auto-select first
  useEffect(() => {
    if (!selectedOp && allOperations.length > 0) setSelectedOp(allOperations[0]);
  }, [allOperations, selectedOp]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const statEntries = [
    { key: "write", count: stats.write, dot: "bg-emerald-400" },
    { key: "edit", count: stats.edit, dot: "bg-sky-400" },
    { key: "read", count: stats.read, dot: "bg-amber-400" },
    { key: "bash", count: stats.bash, dot: "bg-purple-400" },
  ].filter((s) => s.count && s.count > 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />

      {/* Modal */}
      <div
        className="
          relative flex flex-col
          w-[80vw] h-[80vh]
          bg-card
          border border-border/50
          rounded-xl shadow-2xl shadow-black/40
          overflow-hidden
          animate-[ui-zoom-in_120ms_ease-out]
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/40 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-primary/8">
              <FileText className="h-4 w-4 text-primary/70" />
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-[13px] font-semibold text-foreground/90 tracking-tight">
                {t("review.title", "Tool Call Review")}
              </h2>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50">
                <span className="font-mono tabular-nums">{allOperations.length} ops</span>
                {statEntries.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.count}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-secondary/60 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-muted-foreground/60" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-[240px] flex-shrink-0 border-r border-border/30 bg-background/40 overflow-y-auto py-1">
            <FileTreeView
              node={fileTree}
              selectedId={selectedOp?.id ?? null}
              onSelect={setSelectedOp}
            />
          </div>

          {/* Detail */}
          <DetailPanel operation={selectedOp} t={t} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
