import type { SessionNode } from "@/utils/session-branch";

/** i18n key for a node's parent relation (shared by AtlasDialog and GlobalMapCanvas). */
export function entryRelationKey(node: SessionNode): string {
  if (node.relation === "branch-start")
    return "components.branchMap.entry.relation.branchStart";
  if (node.relation === "root")
    return "components.branchMap.entry.relation.root";
  if (node.children.length > 1)
    return "components.branchMap.entry.relation.forkAnchor";
  return "components.branchMap.entry.relation.linear";
}
