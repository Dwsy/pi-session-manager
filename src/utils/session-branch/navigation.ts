import type { SessionModel, SessionNode } from "./types";

export interface BranchNavigationTarget {
  leafUid: string;
  leafId: string;
  targetId: string;
}

export function resolveBranchNavigation(
  model: SessionModel,
  node: SessionNode,
): BranchNavigationTarget {
  const leaf = node.children.length > 0 ? node.newestLeaf : node;
  const entry = node.entry;
  let targetId = node.id;

  if (entry.type === "label" && entry.targetId) {
    targetId = String(entry.targetId);
  } else if (
    entry.type === "message" &&
    entry.message?.role === "toolResult" &&
    entry.message.toolCallId
  ) {
    targetId =
      model.toolCallMap.get(String(entry.message.toolCallId))?.node.id ??
      node.id;
  }

  return { leafUid: leaf.uid, leafId: leaf.id, targetId };
}
