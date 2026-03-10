import { memo } from "react";
import AssistantMessage from "../AssistantMessage";
import BranchSummary from "../BranchSummary";
import Compaction from "../Compaction";
import CustomMessage from "../CustomMessage";
import ModelChange from "../ModelChange";
import UserMessage from "../UserMessage";

import type { SessionEntry } from "../../types";

const EMPTY_TOOL_RESULTS = new Map<string, SessionEntry>();

export interface SessionEntryRendererProps {
  entry: SessionEntry;
  toolResultByCallId?: Map<string, SessionEntry>;
  searchQuery?: string;
}

export function renderSessionEntry(
  entry: SessionEntry,
  toolResultByCallId: Map<string, SessionEntry> = EMPTY_TOOL_RESULTS,
  searchQuery = "",
): JSX.Element | null {
  switch (entry.type) {
    case "message": {
      if (!entry.message) return null;
      const role = entry.message.role;

      if (role === "user") {
        return (
          <UserMessage
            key={entry.id}
            content={entry.message.content}
            timestamp={entry.timestamp}
            id={entry.id}
            searchQuery={searchQuery}
          />
        );
      }

      if (role === "assistant") {
        return (
          <AssistantMessage
            key={entry.id}
            content={entry.message.content}
            timestamp={entry.timestamp}
            entryId={entry.id}
            toolResultByCallId={toolResultByCallId}
            searchQuery={searchQuery}
          />
        );
      }

      return null;
    }

    case "model_change":
      return (
        <ModelChange
          key={entry.id}
          provider={entry.provider}
          modelId={entry.modelId}
          timestamp={entry.timestamp}
        />
      );

    case "compaction":
      return (
        <Compaction
          key={entry.id}
          tokensBefore={entry.tokensBefore}
          summary={entry.summary}
        />
      );

    case "branch_summary":
      return (
        <BranchSummary
          key={entry.id}
          summary={entry.summary}
          timestamp={entry.timestamp}
        />
      );

    case "custom_message":
      return (
        <CustomMessage
          key={entry.id}
          customType={entry.customType}
          content={entry.content}
          timestamp={entry.timestamp}
        />
      );

    default:
      return null;
  }
}

export const SessionEntryRenderer = memo(
  function SessionEntryRenderer({
    entry,
    toolResultByCallId = EMPTY_TOOL_RESULTS,
    searchQuery = "",
  }: SessionEntryRendererProps): JSX.Element | null {
    return renderSessionEntry(entry, toolResultByCallId, searchQuery);
  },
  (prev, next) =>
    prev.entry === next.entry &&
    prev.toolResultByCallId === next.toolResultByCallId &&
    prev.searchQuery === next.searchQuery,
);

export default SessionEntryRenderer;
