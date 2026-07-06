import { AgentIcon } from "./AgentIcon";
import { ModelIcon } from "./ModelIcon";

type SessionBadgeProps =
  | {
      type: "new" | "updated";
      className?: string;
      label?: never;
      tone?: never;
      model?: never;
    }
  | {
      type: "model";
      model: string;
      showIcon?: boolean;
      className?: string;
      label?: never;
      tone?: never;
    }
  | {
      label: string;
      tone?: "source" | "neutral";
      sourceSlug?: string;
      showIcon?: boolean;
      className?: string;
      type?: never;
      model?: never;
    };

/**
 * Session status badge component
 * Displays NEW, UPDATED, SOURCE, or MODEL labels
 */
export function SessionBadge(props: SessionBadgeProps) {
  if (props.type === "model") {
    const modelStr = props.model || "";
    const parts = modelStr.split("/");
    const modelId = parts.length > 1 ? parts[1] : parts[0];
    const showIcon = props.showIcon !== false;

    return (
      <span
        className={`
          inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
          flex-shrink-0 leading-none border border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-300
          ${props.className ?? ""}
        `}
        title={modelStr}
      >
        {showIcon && modelId && (
          <ModelIcon
            model={modelId}
            size={12}
            className="flex-shrink-0"
          />
        )}
        <span className="truncate max-w-[100px]">{modelId}</span>
      </span>
    );
  }

  if (typeof (props as { label?: string }).label === "string") {
    const sourceProps = props as Extract<SessionBadgeProps, { label: string }>;
    const tone = sourceProps.tone ?? "source";
    const showIcon = sourceProps.showIcon === true;
    const sourceSlug = sourceProps.sourceSlug;
    const sourceToneStyle =
      tone === "source"
        ? {
            borderColor: "rgba(var(--accent-rgb), 0.2)",
            backgroundColor: "rgba(var(--accent-rgb), 0.1)",
            color: "var(--accent)",
          }
        : undefined;

    return (
      <span
        className={`
          inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
          flex-shrink-0 leading-none border
          ${tone === "source" ? "" : "border-border/60 bg-muted/30 text-muted-foreground"}
          ${props.className ?? ""}
        `}
        style={sourceToneStyle}
      >
        {showIcon && sourceSlug && (
          <AgentIcon
            source={sourceSlug}
            size={14}
            className="text-current"
          />
        )}
        {sourceProps.label}
      </span>
    );
  }

  const isNew = props.type === "new";

  return (
    <span
      className={`
          inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
          flex-shrink-0 leading-none border
          ${
            !isNew
              ? "border-blue-500/20 bg-blue-500/10 text-blue-500/90"
              : "border-border/60 bg-muted/30 text-muted-foreground"
          }
          ${props.className ?? ""}
        `}
    >
      {isNew ? "N" : "U"}
    </span>
  );
}
