import { useCallback, useEffect, useRef, useState } from "react";

export interface SessionViewerToolbarTitleProps {
  title: string;
  onRename?: (newName: string) => void | Promise<void>;
  className?: string;
}

export default function SessionViewerToolbarTitle({
  title,
  onRename,
  className = "",
}: SessionViewerToolbarTitleProps) {
  const editable = Boolean(onRename);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const titleRef = useRef(title);

  useEffect(() => {
    titleRef.current = title;
    if (!isEditing) {
      setDraft(title);
    }
  }, [title, isEditing]);

  const commit = useCallback(async () => {
    if (!onRename || savingRef.current) {
      return;
    }

    const next = draft.trim();
    const previous = titleRef.current.trim();
    setIsEditing(false);

    if (next === previous) {
      setDraft(titleRef.current);
      return;
    }

    savingRef.current = true;
    try {
      await onRename(next);
    } finally {
      savingRef.current = false;
    }
  }, [draft, onRename]);

  const cancel = useCallback(() => {
    setDraft(titleRef.current);
    setIsEditing(false);
  }, []);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      input.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isEditing]);

  if (!editable) {
    return (
      <span className={`text-base font-semibold tracking-tight truncate ${className}`}>
        {title}
      </span>
    );
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        data-no-window-drag
        className={`min-w-0 max-w-[min(100%,28rem)] text-base font-semibold tracking-tight truncate rounded border border-border/80 bg-background px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
        aria-label={title}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(titleRef.current);
        setIsEditing(true);
      }}
      onMouseDown={(event) => event.stopPropagation()}
      data-no-window-drag
      className={`min-w-0 max-w-full text-left text-base font-semibold tracking-tight truncate rounded px-0.5 py-0.5 text-foreground transition-colors hover:bg-secondary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
      title={title}
    >
      {title}
    </button>
  );
}