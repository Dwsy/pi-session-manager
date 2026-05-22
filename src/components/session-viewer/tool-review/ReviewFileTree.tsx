import { ChevronDown, File, FileTerminal, Folder } from "lucide-react";
import { useMemo } from "react";

import type { ReviewFileNode, ReviewTreeModel } from "./viewModel";

interface ReviewFileTreeProps {
  tree: ReviewTreeModel;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  ariaLabel: string;
}

interface TreeDirectory {
  type: "directory";
  name: string;
  path: string;
  children: TreeEntry[];
}

interface TreeFile {
  type: "file";
  name: string;
  path: string;
  node: ReviewFileNode;
}

type TreeEntry = TreeDirectory | TreeFile;

function getDirectory(children: TreeEntry[], name: string, path: string) {
  let directory = children.find(
    (entry): entry is TreeDirectory =>
      entry.type === "directory" && entry.name === name,
  );

  if (!directory) {
    directory = { type: "directory", name, path, children: [] };
    children.push(directory);
  }

  return directory;
}

function buildEntries(nodes: ReviewFileNode[]) {
  const root: TreeEntry[] = [];

  for (const node of nodes) {
    const parts = node.path.split("/").filter(Boolean);
    const fileName = parts.pop() || node.path;
    let children = root;
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      children = getDirectory(children, part, currentPath).children;
    }

    children.push({ type: "file", name: fileName, path: node.path, node });
  }

  const sortEntries = (entries: TreeEntry[]) => {
    entries.sort((a, b) => {
      if (a.name === "Shell") return 1;
      if (b.name === "Shell") return -1;
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (entry.type === "directory") sortEntries(entry.children);
    }
  };

  sortEntries(root);
  return root;
}

function getStatusText(node: ReviewFileNode) {
  if (node.hasError) return "!";
  if (node.status === "added") return "A";
  if (node.status === "deleted") return "D";
  if (node.status === "modified") return "M";
  return "";
}

function getDeltaText(node: ReviewFileNode) {
  if (node.additions === 0 && node.deletions === 0) return "";
  if (node.deletions === 0) return `+${node.additions}`;
  if (node.additions === 0) return `-${node.deletions}`;
  return `+${node.additions} -${node.deletions}`;
}

function TreeRows({
  entries,
  depth,
  selectedPath,
  onSelectPath,
}: {
  entries: TreeEntry[];
  depth: number;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
}) {
  return (
    <>
      {entries.map((entry) => {
        if (entry.type === "directory") {
          return (
            <div key={entry.path}>
              <div
                className="flex h-6 items-center gap-1.5 px-2 text-[12px] text-muted-foreground"
                style={{ paddingLeft: 8 + depth * 14 }}
              >
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/65" aria-hidden="true" />
                <span className="min-w-0 truncate">{entry.name}</span>
              </div>
              <TreeRows
                entries={entry.children}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
              />
            </div>
          );
        }

        const selected = selectedPath === entry.path;
        const statusText = getStatusText(entry.node);
        const deltaText = getDeltaText(entry.node);
        const isShell = entry.path.startsWith("Shell/");

        return (
          <button
            key={entry.path}
            type="button"
            onClick={() => onSelectPath(entry.path)}
            className={`group flex h-6 w-full min-w-0 items-center gap-1.5 border-l-2 pr-2 text-left text-[12px] motion-color focus-ring ${
              selected
                ? "border-accent bg-accent/10 text-foreground"
                : "border-transparent text-foreground hover:bg-surface/60"
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={entry.path}
          >
            {isShell ? (
              <FileTerminal className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70" aria-hidden="true" />
            ) : (
              <File className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/65" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {deltaText && (
              <span className="ml-2 flex-shrink-0 font-mono text-[10px] tabular-nums text-success">
                {deltaText}
              </span>
            )}
            {statusText && (
              <span className="ml-1 w-4 flex-shrink-0 text-right font-mono text-[11px] text-warning">
                {statusText}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

export default function ReviewFileTree({
  tree,
  selectedPath,
  onSelectPath,
  ariaLabel,
}: ReviewFileTreeProps) {
  const entries = useMemo(() => buildEntries(tree.nodes), [tree.nodes]);
  if (entries.length === 0) return null;

  return (
    <div
      role="tree"
      aria-label={ariaLabel}
      className="custom-scrollbar h-full overflow-auto bg-background py-1"
    >
      <TreeRows
        entries={entries}
        depth={0}
        selectedPath={selectedPath}
        onSelectPath={onSelectPath}
      />
    </div>
  );
}
