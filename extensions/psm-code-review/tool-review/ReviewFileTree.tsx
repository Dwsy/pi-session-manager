import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { FileTreeIconConfig } from "@pierre/trees";

import type { ReviewFileNode, ReviewTreeModel } from "./viewModel";

interface ReviewFileTreeProps {
  tree: ReviewTreeModel;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  ariaLabel: string;
}

const REVIEW_TREE_ICONS: FileTreeIconConfig = {
  set: "complete",
  colored: true,
  byFileNameContains: {
    bash: "file-tree-builtin-bash",
    cargo: "file-tree-builtin-bash",
    git: "file-tree-builtin-bash",
    npm: "file-tree-builtin-bash",
    pnpm: "file-tree-builtin-bash",
    python: "file-tree-builtin-python",
    sh: "file-tree-builtin-bash",
  },
};

const REVIEW_TREE_UNSAFE_CSS = `
  :host {
    background: transparent;
  }

  [data-type='item'] {
    margin: 1px 6px;
    border: 1px solid transparent;
    border-left: 2px solid transparent;
    border-radius: 5px;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  [data-type='item']:hover {
    background: rgb(var(--color-background) / 0.52);
    border-color: rgb(var(--color-border) / 0.28);
  }

  [data-type='item'][data-item-selected] {
    background: rgb(var(--color-background) / 0.88);
    border-color: rgb(var(--color-border) / 0.62);
    border-left-color: var(--trees-accent);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.14);
  }

  [data-type='item'][data-item-selected] [data-item-section='label'] {
    font-weight: 600;
  }

  [data-item-section='icon'] {
    opacity: 0.95;
  }

  [data-item-section='decoration'] {
    font-family: var(--trees-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    opacity: 0.78;
    padding-right: 3px;
  }
`;

const reviewTreeStyle = {
  "--trees-bg-override": "transparent",
  "--trees-bg-muted-override": "rgb(var(--color-background) / 0.44)",
  "--trees-fg-override": "rgb(var(--color-foreground))",
  "--trees-fg-muted-override": "rgb(var(--color-muted-foreground))",
  "--trees-accent-override": "var(--accent)",
  "--trees-border-color-override": "rgb(var(--color-border) / 0.25)",
  "--trees-selected-bg-override": "rgb(var(--color-background) / 0.88)",
  "--trees-selected-fg-override": "rgb(var(--color-foreground))",
  "--trees-focus-ring-color-override": "rgb(var(--color-ring) / 0.62)",
  "--trees-status-added-override": "rgb(var(--color-success))",
  "--trees-status-modified-override": "rgb(var(--color-info))",
  "--trees-status-deleted-override": "rgb(var(--color-destructive))",
  "--trees-font-family-override": "var(--font-family)",
  "--trees-font-size-override": "12px",
  "--trees-item-margin-x-override": "0px",
  "--trees-item-padding-x-override": "7px",
  "--trees-padding-inline-override": "4px",
  "--trees-border-radius-override": "5px",
  "--trees-git-lane-width-override": "16px",
} as CSSProperties;

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

function getDirectoryPaths(paths: string[]) {
  const directories = new Set<string>();

  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    parts.pop();

    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      directories.add(currentPath);
    }
  }

  return Array.from(directories);
}

export default function ReviewFileTree({
  tree,
  selectedPath,
  onSelectPath,
  ariaLabel,
}: ReviewFileTreeProps) {
  const nodeByPath = useMemo(() => {
    return new Map(tree.nodes.map((node) => [node.path, node]));
  }, [tree.nodes]);
  const nodeByPathRef = useRef(nodeByPath);
  const onSelectPathRef = useRef(onSelectPath);
  nodeByPathRef.current = nodeByPath;
  onSelectPathRef.current = onSelectPath;

  const { model } = useFileTree({
    flattenEmptyDirectories: true,
    gitStatus: tree.status,
    icons: REVIEW_TREE_ICONS,
    initialExpansion: "open",
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    itemHeight: 26,
    onSelectionChange: (paths) => {
      const path = paths[paths.length - 1];
      if (path && nodeByPathRef.current.has(path)) {
        onSelectPathRef.current(path);
      }
    },
    paths: tree.paths,
    renderRowDecoration: ({ item }) => {
      const node = nodeByPathRef.current.get(item.path);
      if (!node) return null;

      const deltaText = getDeltaText(node);
      const statusText = getStatusText(node);
      const text = [deltaText, statusText].filter(Boolean).join(" ");
      return text ? { text, title: item.path } : null;
    },
    stickyFolders: false,
    unsafeCSS: REVIEW_TREE_UNSAFE_CSS,
  });

  useEffect(() => {
    model.resetPaths(tree.paths, {
      initialExpandedPaths: getDirectoryPaths(tree.paths),
    });
    model.setGitStatus(tree.status);
    model.setIcons(REVIEW_TREE_ICONS);
  }, [model, tree.paths, tree.status]);

  useEffect(() => {
    for (const path of model.getSelectedPaths()) {
      if (path !== selectedPath) model.getItem(path)?.deselect();
    }

    if (!selectedPath) return;

    const item = model.getItem(selectedPath);
    if (!item) return;

    if (!item.isSelected()) item.select();
    item.focus();
    model.scrollToPath(selectedPath, { focus: false, offset: "nearest" });
  }, [model, selectedPath]);

  if (tree.paths.length === 0) return null;

  return (
    <div className="h-full bg-transparent py-1.5">
      <FileTree
        model={model}
        aria-label={ariaLabel}
        className="h-full w-full"
        style={reviewTreeStyle}
      />
    </div>
  );
}
