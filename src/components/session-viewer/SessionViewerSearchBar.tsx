import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import type { SessionSearchScope } from "../../hooks/useSessionViewerInMessageSearch";

const SEARCH_SCOPE_OPTIONS: Array<{
  value: SessionSearchScope;
  labelKey: string;
  fallback: string;
}> = [
  { value: "all", labelKey: "search.scope.all", fallback: "All" },
  {
    value: "messages",
    labelKey: "search.scope.messages",
    fallback: "Messages",
  },
  { value: "user", labelKey: "search.scope.user", fallback: "User" },
];

export interface SessionViewerSearchBarProps {
  searchQuery: string;
  searchScope: SessionSearchScope;
  totalMatches: number;
  currentMatchNumber: number;
  focusKey: number;
  onSearchChange: (query: string) => void;
  onSearchScopeChange: (scope: SessionSearchScope) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

export default function SessionViewerSearchBar({
  searchQuery,
  searchScope,
  totalMatches,
  currentMatchNumber,
  focusKey,
  onSearchChange,
  onSearchScopeChange,
  onPrevious,
  onNext,
  onClose,
}: SessionViewerSearchBarProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = searchQuery.trim().length > 0;
  const hasMatches = totalMatches > 0;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusKey]);

  const handleClear = useCallback(() => {
    onSearchChange("");
    inputRef.current?.focus();
  }, [onSearchChange]);

  return (
    <div className="border-b border-border/70 bg-secondary/30 px-3 py-2">
      <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/95 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                if (event.shiftKey) {
                  onPrevious();
                } else {
                  onNext();
                }
              }
            }}
            placeholder={t("search.placeholder")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />

          {hasQuery && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title={t("search.clear")}
              aria-label={t("search.clear")}
            >
              {t("search.clear")}
            </button>
          )}

          <div className="ml-auto flex items-center gap-1.5 border-l border-border/60 pl-2">
            {hasQuery && (
              <span
                className="min-w-[3.5rem] text-right text-xs font-medium text-muted-foreground"
                aria-live="polite"
              >
                {hasMatches
                  ? t("search.resultsCounter", {
                      current: currentMatchNumber,
                      total: totalMatches,
                    })
                  : t("search.noResults")}
              </span>
            )}

            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasMatches}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title={t("search.previous")}
              aria-label={t("search.previous")}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasMatches}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title={t("search.next")}
              aria-label={t("search.next")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title={t("search.close")}
              aria-label={t("search.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("search.scope.label", "Scope")}
          </span>
          <div
            className="inline-flex flex-wrap items-center gap-1"
            role="radiogroup"
            aria-label={t("search.scope.label", "Scope")}
          >
            {SEARCH_SCOPE_OPTIONS.map((option) => {
              const isActive = searchScope === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => onSearchScopeChange(option.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/70 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {t(option.labelKey, option.fallback)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
