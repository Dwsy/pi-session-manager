import { memo } from "react";
import AssistantMessage from "@/components/messages/AssistantMessage";
import BranchSummary from "@/components/BranchSummary";
import Compaction from "@/components/messages/Compaction";
import CustomMessage from "@/components/messages/CustomMessage";
import LabelEntry from "@/components/tags/LabelEntry";
import ModelChange from "@/components/messages/ModelChange";
import SessionInfoEntry from "@/components/session-viewer/SessionInfoEntry";
import ThinkingLevelChange from "@/components/messages/ThinkingLevelChange";
import UserMessage from "@/components/messages/UserMessage";

import type { Content, SessionEntry } from "@/types";

const EMPTY_TOOL_RESULTS = new Map<string, SessionEntry>();

function stripPreviewAssistantContent(content: Content[]): Content[] {
  return content.filter((item) => item.type === "text");
}

function contentToText(content: Content[]): string {
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n");
}

export interface SessionEntryRendererProps {
  entry: SessionEntry;
  toolResultByCallId?: Map<string, SessionEntry>;
  searchQuery?: string;
  isStreaming?: boolean;
  previewMode?: boolean;
}

export function renderSessionEntry(
  entry: SessionEntry,
  toolResultByCallId: Map<string, SessionEntry> = EMPTY_TOOL_RESULTS,
  searchQuery = "",
  isStreaming = false,
  previewMode = false,
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
            content={previewMode ? stripPreviewAssistantContent(entry.message.content) : entry.message.content}
            timestamp={entry.timestamp}
            entryId={entry.id}
            toolResultByCallId={toolResultByCallId}
            searchQuery={searchQuery}
            isStreaming={isStreaming}
            previewMode={previewMode}
          />
        );
      }

      if (role === "developer" || role === "system") {
        return (
          <CustomMessage
            key={entry.id}
            customType={role}
            content={contentToText(entry.message.content)}
            timestamp={entry.timestamp}
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
    previewMode = false,
  }: SessionEntryRendererProps): JSX.Element | null {
    return renderSessionEntry(entry, toolResultByCallId, searchQuery, isStreaming, previewMode);
  },
  (prev, next) =>
    prev.entry === next.entry &&
    prev.toolResultByCallId === next.toolResultByCallId &&
    prev.searchQuery === next.searchQuery &&
    prev.previewMode === next.previewMode,
);

export default SessionEntryRenderer;
