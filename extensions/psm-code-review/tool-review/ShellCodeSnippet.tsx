import { memo, useCallback, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

import { renderCodeHtml } from "@/utils/markdown";
import { useResolvedCodeTheme } from "@/hooks/useResolvedCodeTheme";

interface ShellCodeSnippetProps {
  code: string;
  language: "bash" | "log";
  showLineNumbers?: boolean;
  scrollable?: boolean;
  maxHeight?: number | string;
  className?: string;
  compact?: boolean;
  copyOnHover?: boolean;
}

function ShellCodeSnippet({
  code,
  language,
  showLineNumbers = false,
  scrollable = false,
  maxHeight,
  className = "",
  compact = false,
  copyOnHover = false,
}: ShellCodeSnippetProps) {
  const { t } = useTranslation();
  const resolvedTheme = useResolvedCodeTheme();
  const [copied, setCopied] = useState(false);

  const highlightedCode = useMemo(
    () => renderCodeHtml(code, language),
    [code, language, resolvedTheme],
  );

  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const lineNumbers = useMemo(() => {
    if (!showLineNumbers) return [];
    return Array.from({ length: lineCount }, (_, index) => index + 1);
  }, [lineCount, showLineNumbers]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [code]);

  const rootClassName = [
    "tool-review-shell-snippet",
    compact ? "tool-review-shell-snippet--compact" : "",
    scrollable ? "tool-review-shell-snippet--scrollable" : "",
    copyOnHover ? "tool-review-shell-snippet--copyable" : "",
    showLineNumbers ? "tool-review-shell-snippet--numbered" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const rootStyle =
    scrollable && maxHeight !== undefined
      ? { maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight }
      : undefined;

  const codeBlock = showLineNumbers ? (
    <div className="tool-review-shell-snippet__body">
      <div className="tool-review-shell-snippet__gutter" aria-hidden="true">
        {lineNumbers.map((lineNumber) => (
          <div key={lineNumber} className="tool-review-shell-snippet__line-no">
            {lineNumber}
          </div>
        ))}
      </div>
      <pre className="tool-review-shell-snippet__code">
        <code
          className={`shiki ${language}`.trim()}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  ) : (
    <pre className="tool-review-shell-snippet__code">
      <code
        className={`shiki ${language}`.trim()}
        dangerouslySetInnerHTML={{ __html: highlightedCode }}
      />
    </pre>
  );

  return (
    <div className={rootClassName} style={rootStyle}>
      {copyOnHover && (
        <div className="tool-review-shell-snippet__toolbar">
          <button
            type="button"
            onClick={handleCopy}
            className="tool-review-shell-snippet__copy"
            aria-label={t("components.codeBlock.copy", "Copy")}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>
              {copied
                ? t("components.codeBlock.copied", "Copied!")
                : t("components.codeBlock.copy", "Copy")}
            </span>
          </button>
        </div>
      )}
      {codeBlock}
    </div>
  );
}

export default memo(ShellCodeSnippet);