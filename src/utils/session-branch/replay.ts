import type { BranchFork, SessionModel, SessionNode } from "./types";
import { buildPath, isConversationNode, isErrorNode } from "./selectors";

export type ReplayCheckpointKind =
  | "start"
  | "conversation"
  | "tool"
  | "fork"
  | "compaction"
  | "error"
  | "end";

export interface ReplayCheckpoint {
  node: SessionNode;
  kind: ReplayCheckpointKind;
  fork?: BranchFork;
}

function checkpointKind(
  model: SessionModel,
  node: SessionNode,
  index: number,
  lastIndex: number,
): ReplayCheckpointKind | null {
  if (index === 0) return "start";
  if (index === lastIndex) return "end";
  const fork = model.forkByAnchorUid.get(node.uid);
  if (fork) return "fork";
  if (isErrorNode(node)) return "error";
  if (node.entry.type === "compaction") return "compaction";
  if (
    node.entry.type === "message" &&
    ["toolResult", "bashExecution"].includes(node.entry.message?.role ?? "")
  ) {
    return "tool";
  }
  return isConversationNode(node) ? "conversation" : null;
}

/**
 * Build the meaningful beats of one chosen branch. Replay deliberately skips
 * transport and setting churn while retaining decisions, tools, forks and errors.
 */
export function buildBranchReplayCheckpoints(
  model: SessionModel,
  leafUid: string,
): ReplayCheckpoint[] {
  const path = buildPath(model, leafUid);
  const lastIndex = path.length - 1;
  return path.flatMap((node, index) => {
    const kind = checkpointKind(model, node, index, lastIndex);
    if (!kind) return [];
    const fork = model.forkByAnchorUid.get(node.uid);
    return [{ node, kind, fork }];
  });
}
