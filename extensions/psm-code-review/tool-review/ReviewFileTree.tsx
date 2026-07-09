import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { FileTreeIconConfig } from "@pierre/trees";
import { Copy, ExternalLink, FileText, FolderOpen } from "lucide-react";

import type { ReviewFileNode, ReviewTreeModel } from "./viewModel";

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

interface ReviewFileTreeProps {
  tree: ReviewTreeModel;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  ariaLabel: string;
}

const REVIEW_TREE_ICONS: FileTreeIconConfig = {
  set: "complete",
  colored: true,
  byFileExtension: {
    java: "file-tree-builtin-c",
    jav: "file-tree-builtin-c",
    kt: "file-tree-builtin-c",
    kts: "file-tree-builtin-c",
    groovy: "file-tree-builtin-c",
  },
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
    border-radius: 5px;
    box-shadow: inset 0 0 0 1px transparent, inset 2px 0 0 transparent;
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease,
      color 140ms ease;
  }

  [data-type='item']:hover {
    background: rgb(var(--color-background) / 0.52);
    box-shadow: inset 0 0 0 1px rgb(var(--color-border) / 0.28), inset 2px 0 0 transparent;
  }

  [data-type='item'][data-item-selected] {
    background: rgb(var(--color-background) / 0.88);
    box-shadow: inset 0 0 0 1px rgb(var(--color-border) / 0.62), inset 2px 0 0 var(--trees-accent), inset 0 1px 2px rgb(0 0 0 / 0.14);
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

  [data-file-tree-virtualized-scroll='true'] {
    overscroll-behavior: contain;
    scrollbar-color: rgb(var(--color-muted-foreground) / 0.34) transparent;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-thumb {
    background-color: rgb(var(--color-muted-foreground) / 0.26);
  }

  [data-file-tree-virtualized-scroll='true']:hover::-webkit-scrollbar-thumb {
    background-color: rgb(var(--color-muted-foreground) / 0.42);
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
  "--trees-scrollbar-thumb-override": "rgb(var(--color-muted-foreground) / 0.34)",
  "--trees-status-added-override": "rgb(var(--color-success))",
  "--trees-status-modified-override": "rgb(var(--color-info))",
  "--trees-status-deleted-override": "rgb(var(--color-destructive))",
  "--trees-font-family-override": "var(--font-family)",
  "--trees-font-size-override": "12px",
  "--trees-item-margin-x-override": "0px",
  "--trees-item-padding-x-override": "7px",
  "--trees-padding-inline-override": "4px",
  "--trees-scrollbar-gutter-override": "6px",
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

const REVIEW_TREE_MENU_WIDTH = 192;
const REVIEW_TREE_MENU_ROW_HEIGHT = 36;
const REVIEW_TREE_MENU_VIEWPORT_PADDING = 10;

function clampReviewTreeMenuPosition(
  x: number,
  y: number,
  rowCount: number,
): { x: number; y: number } {
  const menuHeight = rowCount * REVIEW_TREE_MENU_ROW_HEIGHT + 8;
  let nextX = x;
  let nextY = y;
  const maxX = window.innerWidth - REVIEW_TREE_MENU_WIDTH - REVIEW_TREE_MENU_VIEWPORT_PADDING;
  const maxY = window.innerHeight - menuHeight - REVIEW_TREE_MENU_VIEWPORT_PADDING;
  if (nextX > maxX) nextX = Math.max(REVIEW_TREE_MENU_VIEWPORT_PADDING, maxX);
  if (nextY > maxY) nextY = Math.max(REVIEW_TREE_MENU_VIEWPORT_PADDING, maxY);
  if (nextX < REVIEW_TREE_MENU_VIEWPORT_PADDING) nextX = REVIEW_TREE_MENU_VIEWPORT_PADDING;
  if (nextY < REVIEW_TREE_MENU_VIEWPORT_PADDING) nextY = REVIEW_TREE_MENU_VIEWPORT_PADDING;
  return { x: nextX, y: nextY };
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
  const nodeByDisplayPath = useMemo(() => {
    return new Map(
      tree.nodes.map((node) => [
        tree.displayPathByCanonical.get(node.path) ?? node.path,
        node,
      ]),
    );
  }, [tree.nodes, tree.displayPathByCanonical]);
  const nodeByDisplayPathRef = useRef(nodeByDisplayPath);
  const canonicalPathByDisplayRef = useRef(tree.canonicalPathByDisplay);
  const onSelectPathRef = useRef(onSelectPath);
  nodeByDisplayPathRef.current = nodeByDisplayPath;
  canonicalPathByDisplayRef.current = tree.canonicalPathByDisplay;
  onSelectPathRef.current = onSelectPath;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const hoveredPathRef = useRef<string | null>(null);

  const { model } = useFileTree({
    flattenEmptyDirectories: true,
    gitStatus: tree.status,
    icons: REVIEW_TREE_ICONS,
    initialExpansion: "open",
    initialSelectedPaths: selectedPath
      ? [
          tree.displayPathByCanonical.get(selectedPath) ?? selectedPath,
        ]
      : [],
    itemHeight: 26,
    onSelectionChange: (paths) => {
      const path = paths[paths.length - 1];
      if (!path) return;
      const canonical =
        canonicalPathByDisplayRef.current.get(path) ?? path;
      if (nodeByDisplayPathRef.current.has(path)) {
        onSelectPathRef.current(canonical);
      }
    },
    paths: tree.paths,
    renderRowDecoration: ({ item }) => {
      hoveredPathRef.current = item.path;
      const node = nodeByDisplayPathRef.current.get(item.path);
      if (!node) return null;

      const deltaText = getDeltaText(node);
      const statusText = getStatusText(node);
      const text = [deltaText, statusText].filter(Boolean).join(" ");
      return text ? { text, title: item.path } : null;
    },
    stickyFolders: false,
    unsafeCSS: REVIEW_TREE_UNSAFE_CSS,
  });

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const rowCount = isDir ? 3 : 4;
    const { x, y } = clampReviewTreeMenuPosition(e.clientX, e.clientY, rowCount);
    setMenuPosition({ x, y });
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
  }, []);

  useLayoutEffect(() => {
    if (!contextMenu) return;
    const rowCount = contextMenu.isDir ? 3 : 4;
    const { x, y } = clampReviewTreeMenuPosition(contextMenu.x, contextMenu.y, rowCount);
    setMenuPosition({ x, y });
  }, [contextMenu]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = path;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setContextMenu(null);
  }, []);

  const handleCopyRelativePath = useCallback(async (path: string) => {
    const parts = path.split("/");
    const relativePath = parts.slice(1).join("/") || parts[0] || path;
    try {
      await navigator.clipboard.writeText(relativePath);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = relativePath;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setContextMenu(null);
  }, []);

  const handleOpenDefault = useCallback(async (path: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_path_with_default_app", { path });
    } catch (err) {
      console.error("Failed to open with default app:", err);
    }
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const menu = document.getElementById("review-file-tree-context-menu");
      if (menu && !menu.contains(target)) {
        setContextMenu(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [contextMenu]);

  useEffect(() => {
    model.resetPaths(tree.paths, {
      initialExpandedPaths: getDirectoryPaths(tree.paths),
    });
    model.setGitStatus(tree.status);
    model.setIcons(REVIEW_TREE_ICONS);
  }, [model, tree.paths, tree.status]);

  useEffect(() => {
    const selectedDisplayPath = selectedPath
      ? tree.displayPathByCanonical.get(selectedPath) ?? selectedPath
      : null;
    for (const path of model.getSelectedPaths()) {
      if (path !== selectedDisplayPath) model.getItem(path)?.deselect();
    }

    if (!selectedDisplayPath) return;

    const item = model.getItem(selectedDisplayPath);
    if (!item) return;

    if (!item.isSelected()) item.select();
    item.focus();
    model.scrollToPath(selectedDisplayPath, { focus: false, offset: "nearest" });
  }, [model, selectedPath, tree.displayPathByCanonical]);

  if (tree.paths.length === 0) return null;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-transparent py-1.5"
      onContextMenu={(e) => {
        const path = hoveredPathRef.current;
        if (path) {
          const node = nodeByDisplayPathRef.current.get(path);
          const isDir = !node || node.operations.length === 0;
          handleContextMenu(e, path, isDir);
        }
      }}
    >
      <FileTree
        model={model}
        aria-label={ariaLabel}
        className="h-full min-h-0 w-full"
        style={reviewTreeStyle}
      />
      {contextMenu &&
        createPortal(
          <div
            id="review-file-tree-context-menu"
            className="fixed z-[10050] w-48 rounded-lg border border-border bg-card shadow-xl overflow-hidden py-1"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              onClick={() => handleCopyPath(contextMenu.path)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-secondary"
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              <span>复制路径</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopyRelativePath(contextMenu.path)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-secondary"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span>复制相对路径</span>
            </button>
            {!contextMenu.isDir && (
              <button
                type="button"
                onClick={() => handleOpenDefault(contextMenu.path)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-secondary"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                <span>打开 (默认程序)</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCloseContextMenu}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-secondary border-t border-border/50 mt-1"
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span>取消</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
