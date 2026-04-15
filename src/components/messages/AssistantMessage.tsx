import type { Content, SessionEntry } from "@/types";
import MarkdownContent from "@/components/ui/MarkdownContent";
import ThinkingBlock from "./ThinkingBlock";
import ToolCallList from "@/components/tool-calls/ToolCallList";
import { useSessionView } from "@/contexts/SessionViewContext";
import { formatDate } from "@/utils/format";
import { getAssistantDisplayedBlocks } from "@/utils/assistantContent";
import { Copy, Check } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { useClipboard } from "@/hooks/useClipboard";
import {
  buildAssistantProcessSteps,
  splitAssistantContent,
} from "./assistantProcess";

interface AssistantMessageProps {
  content: Content[];
  timestamp?: string;
  entryId: string;
  toolResultByCallId?: Map<string, SessionEntry>;
  searchQuery?: string;
  isStreaming?: boolean;
  previewMode?: boolean;
  /** Previous assistant entries (tools only, no text) to fold into this message */
  foldEntries?: SessionEntry[];
}

function AssistantMessage({
  content,
  timestamp,
  entryId,
  toolResultByCallId = new Map(),
  searchQuery = "",
  isStreaming = false,
  previewMode = false,
  foldEntries,
}: AssistantMessageProps) {
  const { showThinking } = useSessionView();
  const [copied, setCopied] = useState(false);
  const { copyText } = useClipboard();

  const { visibleContent } = useMemo(
    () => splitAssistantContent(content),
    [content],
  );

  const { thinkingBlocks, textBlocks } = useMemo(
    () => getAssistantDisplayedBlocks(visibleContent),
    [visibleContent],
  );

  const processSteps = useMemo(
    () => buildAssistantProcessSteps(entryId, content, foldEntries),
    [content, entryId, foldEntries],
  );

  const allText = useMemo(() => textBlocks.join("\n"), [textBlocks]);

  const handleCopy = async () => {
    try {
      await copyText(allText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy assistant text:", err);
    }
  };

  return (
    <div className="assistant-message" id={`entry-${entryId}`}>
      {timestamp && (textBlocks.length > 0 || thinkingBlocks.length > 0) && (
        <div className="message-timestamp">{formatDate(timestamp)}</div>
      )}

      {showThinking &&
        thinkingBlocks.map((thinkingText, index) => (
          <ThinkingBlock
            key={`thinking-${index}`}
            content={thinkingText}
            searchQuery={searchQuery}
          />
        ))}

      {textBlocks.map((text, index) => (
        <div key={`text-${index}`} className="assistant-text">
          <MarkdownContent content={text} searchQuery={searchQuery} />
          {isStreaming && index === textBlocks.length - 1 && (
            <span className="typing-cursor" />
          )}
        </div>
      ))}
      {textBlocks.length > 0 && !previewMode && (
        <div className="flex justify-end mt-2">
          <button
            onClick={handleCopy}
            className="tool-copy-button"
            aria-label={copied ? "Copied" : "Copy text"}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      )}

      {processSteps.length > 0 && (
        <ToolCallList
          processSteps={processSteps}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
        />
      )}
    </div>
  );
}

export default memo(AssistantMessage);