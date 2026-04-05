import { memo } from "react";
import AssistantMessage from "../messages/AssistantMessage";
import BranchSummary from "../BranchSummary";
import Compaction from "../messages/Compaction";
import CustomMessage from "../messages/CustomMessage";
import LabelEntry from "../tags/LabelEntry";
import ModelChange from "../messages/ModelChange";
import SessionInfoEntry from "../session-viewer/SessionInfoEntry";
import ThinkingLevelChange from "../messages/ThinkingLevelChange";
import UserMessage from "../messages/UserMessage";

import type { SessionEntry } from "../../types";

const EMPTY_TOOL_RESULTS = new Map<string, SessionEntry>();

export interface SessionEntryRendererProps {
  entry: SessionEntry;
  toolResultByCallId?: Map<string, SessionEntry>;
  searchQuery?: string;
  isStreaming?: boolean;
}

export function renderSessionEntry(
  entry: SessionEntry,
  toolResultByCallId: Map<string, SessionEntry> = EMPTY_TOOL_RESULTS,
  searchQuery = "",
  isStreaming = false,
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
            isStreaming={isStreaming}
          />
        );
      }

      return null;
    }

    case "session_info":
      return (
        <SessionInfoEntry
          key={entry.id}
          name={entry.name}
          timestamp={entry.timestamp}
        />
      );

    case "label":
      return (
        <LabelEntry
          key={entry.id}
          label={entry.label}
          timestamp={entry.timestamp}
        />
      );

    case "thinking_level_change":
      return (
        <ThinkingLevelChange
          key={entry.id}
          thinkingLevel={entry.thinkingLevel}
          timestamp={entry.timestamp}
        />
      );

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
    isStreaming = false,
  }: SessionEntryRendererProps): JSX.Element | null {
    return renderSessionEntry(entry, toolResultByCallId, searchQuery, isStreaming);
  },
  (prev, next) =>
    prev.entry === next.entry &&
    prev.toolResultByCallId === next.toolResultByCallId &&
    prev.searchQuery === next.searchQuery,
);

export default SessionEntryRenderer;
