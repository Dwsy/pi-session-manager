import type { SessionEntry } from "@/types";

export interface TreeNodeData {
  entry: SessionEntry;
  children: TreeNodeData[];
  label?: string;
}

export interface FlatNode {
  node: TreeNodeData;
  indent: number;
  showConnector: boolean;
  isLast: boolean;
  gutters: Array<{ position: number; show: boolean }>;
  isVirtualRootChild: boolean;
  multipleRoots: boolean;
}

const TREE_SETTINGS_TYPES = new Set([
  "session",
  "session_info",
  "label",
  "model_change",
  "thinking_level_change",
]);

export function isNoneParent(parentId: unknown): boolean {
  return (
    parentId == null ||
    parentId === "None" ||
    parentId === "null" ||
    parentId === "NONE"
  );
}

export function buildTree(
  entries: SessionEntry[],
  resolvedLabelsByTargetId: Record<string, string> = {},
): TreeNodeData[] {
  const entriesById = new Map<string, SessionEntry>();
  const childrenById = new Map<string, TreeNodeData[]>();

  for (const entry of entries) {
    entriesById.set(entry.id, entry);
    childrenById.set(entry.id, []);
  }

  const createNode = (entry: SessionEntry): TreeNodeData => ({
    entry,
    children: childrenById.get(entry.id) ?? [],
    label: resolvedLabelsByTargetId[entry.id],
  });

  for (const entry of entries) {
    const parentId = isNoneParent(entry.parentId) ? null : entry.parentId;
    // Self-reference (parentId === entry.id) or missing parent → treated as root below
    if (parentId && parentId !== entry.id && entriesById.has(parentId)) {
      childrenById.get(parentId)?.push(createNode(entry));
    }
  }

  const roots = entries
    .filter((entry) => {
      const parentId = isNoneParent(entry.parentId) ? null : entry.parentId;
      return !parentId || parentId === entry.id || !entriesById.has(parentId);
    })
    .map(createNode);

  const sortChildren = (node: TreeNodeData) => {
    node.children.sort(
      (left, right) =>
        new Date(left.entry.timestamp || 0).getTime() -
        new Date(right.entry.timestamp || 0).getTime(),
    );
    node.children.forEach(sortChildren);
  };

  roots.forEach(sortChildren);
  return roots;
}

export function flattenTree(
  roots: TreeNodeData[],
  activePathIds: Set<string>,
): FlatNode[] {
  const result: FlatNode[] = [];
  const multipleRoots = roots.length > 1;

  // Pre-compute which subtrees contain the active path (post-order)
  const containsActive = new Map<TreeNodeData, boolean>();
  {
    const allNodes: TreeNodeData[] = [];
    const preStack: TreeNodeData[] = [...roots];
    while (preStack.length > 0) {
      const n = preStack.pop()!;
      allNodes.push(n);
      for (let i = n.children.length - 1; i >= 0; i -= 1) {
        preStack.push(n.children[i]);
      }
    }
    // Post-order: children before parents
    for (let i = allNodes.length - 1; i >= 0; i -= 1) {
      const n = allNodes[i];
      let has = activePathIds.has(n.entry.id);
      for (const child of n.children) {
        if (containsActive.get(child)) has = true;
      }
      containsActive.set(n, has);
    }
  }

  type StackItem = [
    TreeNodeData,
    number,
    boolean,
    boolean,
    boolean,
    Array<{ position: number; show: boolean }>,
    boolean,
  ];

  const stack: StackItem[] = [];
  // Sort roots: active path first, then by timestamp
  const orderedRoots = [...roots].sort(
    (a, b) => Number(containsActive.get(b)) - Number(containsActive.get(a)),
  );
  for (let index = orderedRoots.length - 1; index >= 0; index -= 1) {
    stack.push([
      orderedRoots[index],
      multipleRoots ? 1 : 0,
      multipleRoots,
      multipleRoots,
      index === orderedRoots.length - 1,
      [],
      multipleRoots,
    ]);
  }

  while (stack.length > 0) {
    const [
      node,
      indent,
      justBranched,
      showConnector,
      isLast,
      gutters,
      isVirtualRootChild,
    ] = stack.pop()!;

    result.push({
      node,
      indent,
      showConnector,
      isLast,
      gutters,
      isVirtualRootChild,
      multipleRoots,
    });

    const children = node.children;
    const multipleChildren = children.length > 1;
    const childIndent = multipleChildren
      ? indent + 1
      : justBranched && indent > 0
        ? indent + 1
        : indent;
    const connectorDisplayed = showConnector && !isVirtualRootChild;
    const displayIndent = multipleRoots ? Math.max(0, indent - 1) : indent;
    const connectorPosition = Math.max(0, displayIndent - 1);
    const childGutters = connectorDisplayed
      ? [...gutters, { position: connectorPosition, show: !isLast }]
      : gutters;

    // Sort children: active path first, then by timestamp
    const orderedChildren = [...children].sort(
      (a, b) => Number(containsActive.get(b)) - Number(containsActive.get(a)),
    );
    for (let index = orderedChildren.length - 1; index >= 0; index -= 1) {
      stack.push([
        orderedChildren[index],
        childIndent,
        multipleChildren,
        multipleChildren,
        index === orderedChildren.length - 1,
        childGutters,
        false,
      ]);
    }
  }

  return result;
}

export function buildActivePathIds(
  activeLeafId: string | null | undefined,
  entries: SessionEntry[],
): Set<string> {
  if (!activeLeafId) {
    return new Set();
  }

  const entriesById = new Map<string, SessionEntry>();
  for (const entry of entries) {
    entriesById.set(entry.id, entry);
  }

  const ids = new Set<string>();
  let currentId: string | undefined = activeLeafId;

  while (currentId) {
    ids.add(currentId);
    const entry = entriesById.get(currentId);
    if (!entry) {
      break;
    }

    const parentId = entry.parentId;
    if (isNoneParent(parentId) || parentId === entry.id) {
      break;
    }

    const parentEntry = entriesById.get(parentId as string);
    if (parentEntry) {
      currentId = parentEntry.id;
      continue;
    }

    const entryIndex = entries.findIndex((candidate) => candidate.id === currentId);
    if (entryIndex > 0) {
      currentId = entries[entryIndex - 1]?.id;
      continue;
    }

    break;
  }

  return ids;
}

export function findNewestLeaf(treeData: TreeNodeData[]): Map<string, string> {
  const newestLeafById = new Map<string, string>();

  const visit = (node: TreeNodeData): string => {
    let newestLeafId = node.entry.id;
    for (const child of node.children) {
      visit(child);
    }

    if (node.children.length > 0) {
      const lastChild = node.children[node.children.length - 1];
      newestLeafId = newestLeafById.get(lastChild.entry.id) || lastChild.entry.id;
    }

    newestLeafById.set(node.entry.id, newestLeafId);
    return newestLeafId;
  };

  treeData.forEach(visit);
  return newestLeafById;
}

export function getSearchableText(
  entry: SessionEntry,
  extractContent: (content: unknown) => string,
  label?: string,
): string {
  const parts: string[] = [];

  if (label) {
    parts.push(label);
  }

  switch (entry.type) {
    case "message": {
      const message = entry.message;
      if (message) {
        parts.push(message.role);
        if (message.content) {
          parts.push(extractContent(message.content));
        }
      }
      break;
    }
    case "custom_message":
      parts.push(entry.customType || "");
      parts.push(
        typeof entry.content === "string"
          ? entry.content
          : extractContent(entry.content),
      );
      break;
    case "compaction":
      parts.push("compaction");
      break;
    case "branch_summary":
      parts.push("branch summary", entry.summary || "");
      break;
    case "label":
      parts.push("label", entry.label || "");
      break;
    case "session_info":
      parts.push("session", entry.name || "");
      break;
    case "model_change":
      parts.push("model", entry.modelId || "");
      break;
    case "thinking_level_change":
      parts.push("thinking", entry.thinkingLevel || "");
      break;
    default:
      break;
  }

  return parts.join(" ");
}

function isSettingsEntry(entry: SessionEntry): boolean {
  return TREE_SETTINGS_TYPES.has(entry.type);
}

export function filterFlatNodes(
  flatNodes: FlatNode[],
  searchTerms: string[],
  currentFilter: string,
  extractContent: (content: unknown) => string,
): FlatNode[] {
  const baseFiltered = flatNodes.filter((flatNode) => {
    const entry = flatNode.node.entry;
    const label = flatNode.node.label;

    if (searchTerms.length > 0) {
      const searchableText = getSearchableText(entry, extractContent, label)
        .toLowerCase();
      if (!searchTerms.every((term) => searchableText.includes(term.toLowerCase()))) {
        return false;
      }
    }

    switch (currentFilter) {
      case "user-only":
        return entry.type === "message" && entry.message?.role === "user";
      case "no-tools":
        if (entry.type === "message" && entry.message?.role === "toolResult") {
          return false;
        }
        return !isSettingsEntry(entry);
      case "default":
        return !isSettingsEntry(entry);
      case "labeled-only":
        return !!label;
      case "all":
        return true;
      default:
        if (currentFilter.startsWith("tool-")) {
          const toolName = currentFilter.slice(5);
          if (entry.type === "message" && entry.message?.role === "assistant") {
            const content = Array.isArray(entry.message.content)
              ? entry.message.content
              : [];
            return content.some(
              (block: any) => block.type === "toolCall" && block.name === toolName,
            );
          }
          return false;
        }
        return true;
    }
  });

  if (searchTerms.length > 0 || currentFilter !== "no-tools") {
    return recalculateVisualStructure(baseFiltered, flatNodes);
  }

  return baseFiltered;
}

export function recalculateVisualStructure(
  filteredNodes: FlatNode[],
  allFlatNodes: FlatNode[],
): FlatNode[] {
  if (filteredNodes.length === 0) {
    return filteredNodes;
  }

  const visibleIds = new Set(filteredNodes.map((node) => node.node.entry.id));
  const flatNodeById = new Map<string, FlatNode>();
  for (const flatNode of allFlatNodes) {
    flatNodeById.set(flatNode.node.entry.id, flatNode);
  }

  const findVisibleAncestor = (nodeId: string): string | null => {
    let currentId: string | undefined = flatNodeById.get(nodeId)?.node.entry.parentId;
    while (currentId != null) {
      if (visibleIds.has(currentId)) {
        return currentId;
      }
      currentId = flatNodeById.get(currentId)?.node.entry.parentId;
    }
    return null;
  };

  const visibleChildren = new Map<string | null, string[]>();
  visibleChildren.set(null, []);

  for (const filteredNode of filteredNodes) {
    const nodeId = filteredNode.node.entry.id;
    const ancestorId = findVisibleAncestor(nodeId);
    if (!visibleChildren.has(ancestorId ?? null)) {
      visibleChildren.set(ancestorId ?? null, []);
    }
    visibleChildren.get(ancestorId ?? null)?.push(nodeId);
  }

  const visibleRootIds = visibleChildren.get(null) ?? [];
  const multipleRoots = visibleRootIds.length > 1;
  const filteredNodeById = new Map<string, FlatNode>();
  for (const filteredNode of filteredNodes) {
    filteredNodeById.set(filteredNode.node.entry.id, filteredNode);
  }

  type StackItem = [
    string,
    number,
    boolean,
    boolean,
    boolean,
    Array<{ position: number; show: boolean }>,
    boolean,
  ];

  const stack: StackItem[] = [];
  for (let index = visibleRootIds.length - 1; index >= 0; index -= 1) {
    stack.push([
      visibleRootIds[index],
      multipleRoots ? 1 : 0,
      multipleRoots,
      multipleRoots,
      index === visibleRootIds.length - 1,
      [],
      multipleRoots,
    ]);
  }

  while (stack.length > 0) {
    const [
      nodeId,
      indent,
      justBranched,
      showConnector,
      isLast,
      gutters,
      isVirtualRootChild,
    ] = stack.pop()!;

    const flatNode = filteredNodeById.get(nodeId);
    if (!flatNode) {
      continue;
    }

    flatNode.indent = indent;
    flatNode.showConnector = showConnector;
    flatNode.isLast = isLast;
    flatNode.gutters = gutters;
    flatNode.isVirtualRootChild = isVirtualRootChild;
    flatNode.multipleRoots = multipleRoots;

    const children = visibleChildren.get(nodeId) ?? [];
    const multipleChildren = children.length > 1;
    const childIndent = multipleChildren
      ? indent + 1
      : justBranched && indent > 0
        ? indent + 1
        : indent;
    const connectorDisplayed = showConnector && !isVirtualRootChild;
    const displayIndent = multipleRoots ? Math.max(0, indent - 1) : indent;
    const connectorPosition = Math.max(0, displayIndent - 1);
    const childGutters = connectorDisplayed
      ? [...gutters, { position: connectorPosition, show: !isLast }]
      : gutters;

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push([
        children[index],
        childIndent,
        multipleChildren,
        multipleChildren,
        index === children.length - 1,
        childGutters,
        false,
      ]);
    }
  }

  return filteredNodes;
}

export function buildTreePrefix(flatNode: FlatNode): string {
  const {
    indent,
    showConnector,
    isLast,
    gutters,
    isVirtualRootChild,
    multipleRoots,
  } = flatNode;

  const displayIndent = multipleRoots ? Math.max(0, indent - 1) : indent;
  const connector =
    showConnector && !isVirtualRootChild ? (isLast ? "└─ " : "├─ ") : "";
  const connectorPosition = connector ? displayIndent - 1 : -1;
  const prefixChars: string[] = [];

  for (let index = 0; index < displayIndent * 3; index += 1) {
    const level = Math.floor(index / 3);
    const positionInLevel = index % 3;
    const gutter = gutters.find((candidate) => candidate.position === level);

    if (gutter) {
      prefixChars.push(
        positionInLevel === 0 ? (gutter.show ? "│" : " ") : " ",
      );
      continue;
    }

    if (connector && level === connectorPosition) {
      prefixChars.push(
        positionInLevel === 0
          ? isLast
            ? "└"
            : "├"
          : positionInLevel === 1
            ? "─"
            : " ",
      );
      continue;
    }

    prefixChars.push(" ");
  }

  return prefixChars.join("");
}

export function getEntryDisplayText(entry: SessionEntry, label?: string): string {
  if (label) {
    return label;
  }

  const truncate = (value: string, maxLength = 100) =>
    value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
  const truncateMiddle = (value: string, maxLength = 80): string => {
    if (value.length <= maxLength) return value;
    const ellipsis = "…";
    const headLength = Math.max(8, Math.floor((maxLength - ellipsis.length) * 0.35));
    const tailLength = Math.max(12, maxLength - headLength - ellipsis.length);
    return `${value.slice(0, headLength)}${ellipsis}${value.slice(-tailLength)}`;
  };
  const compactToolPath = (value: string): string => {
    const normalized = value.replace(/\\/g, "/");
    const marker = "/src/";
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) {
      return `./${normalized.slice(markerIndex + marker.length)}`;
    }

    const parts = normalized.split("/").filter(Boolean);
    if (normalized.startsWith("/") && parts.length > 4) {
      return `./${parts.slice(-4).join("/")}`;
    }
    return value;
  };
  const extractContent = (content: unknown): string => {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter((block: any) => block.type === "text" && block.text)
        .map((block: any) => block.text)
        .join("");
    }
    return "";
  };

  if (entry.type === "label") {
    return entry.label ? `Label: ${entry.label}` : "Label cleared";
  }

  if (entry.type === "message" && entry.message) {
    if (entry.message.role === "user") {
      const text = truncate(extractContent(entry.message.content));
      return text || "User";
    }

    if (entry.message.role === "assistant") {
      const content = Array.isArray(entry.message.content)
        ? entry.message.content
        : [];
      const toolCall = content.find((block: any) => block.type === "toolCall") as
        | { name?: string; arguments?: Record<string, unknown> }
        | undefined;

      if (toolCall?.name) {
        const path = String(
          toolCall.arguments?.path || toolCall.arguments?.file_path || "",
        );
        const command = String(toolCall.arguments?.command || "");
        const displayValue = path && ["read", "write", "edit"].includes(toolCall.name)
          ? compactToolPath(path)
          : path || command;
        return `${toolCall.name}: ${truncateMiddle(displayValue, 80)}`;
      }

      const text = truncate(extractContent(entry.message.content));
      return text || "Assistant";
    }

    if (entry.message.role === "toolResult") {
      return "Tool result";
    }
  }

  switch (entry.type) {
    case "model_change":
      return entry.modelId ? `Model: ${entry.modelId}` : "Model";
    case "thinking_level_change":
      return `Thinking: ${entry.thinkingLevel || "default"}`;
    case "session":
      return "Session";
    case "session_info":
      return entry.name ? `Session: ${entry.name}` : "Session";
    case "compaction":
      return "Compaction";
    case "branch_summary":
      return "Branch Summary";
    case "custom_message":
      return entry.customType || "Custom";
    default:
      return entry.type;
  }
}

export function getEntryRoleClass(entry: SessionEntry): string {
  if (entry.type === "message" && entry.message?.role === "user") {
    return "tree-role-user";
  }
  if (entry.type === "message" && entry.message?.role === "assistant") {
    return "tree-role-assistant";
  }
  if (entry.type === "message" && entry.message?.role === "toolResult") {
    return "tree-role-tool";
  }
  if (entry.type === "compaction") {
    return "tree-compaction";
  }
  if (entry.type === "branch_summary") {
    return "tree-branch-summary";
  }
  if (entry.type === "custom_message") {
    return "tree-custom-message";
  }
  return "tree-muted";
}

export function getEntryToolName(entry: SessionEntry): string | null {
  if (entry.type !== "message" || entry.message?.role !== "assistant") {
    return null;
  }

  const content = Array.isArray(entry.message.content)
    ? entry.message.content
    : [];
  const toolCall = content.find((block: any) => block.type === "toolCall") as
    | { name?: string }
    | undefined;

  return toolCall?.name || null;
}
