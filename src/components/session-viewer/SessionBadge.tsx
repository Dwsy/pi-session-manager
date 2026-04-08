import { AgentIcon } from "./AgentIcon";

type SessionBadgeProps =
  | {
      type: "new" | "updated";
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
    };

/**
 * Session status badge component
 * Displays NEW or UPDATED labels
 */
export function SessionBadge(props: SessionBadgeProps) {
  if (typeof (props as { label?: string }).label === "string") {
    const sourceProps = props as Extract<SessionBadgeProps, { label: string }>;
    const tone = sourceProps.tone ?? "source";
    const showIcon = sourceProps.showIcon === true;
    const sourceSlug = sourceProps.sourceSlug;
    return (
      <span
        className={`
          inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
          flex-shrink-0 leading-none border
          ${
            tone === "source"
              ? "border-blue-500/20 bg-blue-500/10 text-blue-500/90"
              : "border-border/60 bg-muted/30 text-muted-foreground"
          }
          ${props.className ?? ""}
        `}
      >
        {showIcon && sourceSlug && (
          <AgentIcon
            source={sourceSlug}
            size={14}
            className={tone === "source" ? "text-current" : "text-current"}
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
