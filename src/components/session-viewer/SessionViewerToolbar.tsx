import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  ArrowDown,
  Bot,
  Search,
  Eye,
  EyeOff,
  ChevronsUpDown,
  MoreVertical,
  Pencil,
  Download,
  Play,
  List,
} from "lucide-react";

import KbdTooltip from "../KbdTooltip";
import type { SessionViewerToolbarProps } from "./SessionViewerToolbarTypes";

function SidebarToggleIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

export default function SessionViewerToolbar({
  isMobile,
  title,
  messageCount,
  showSidebar,
  showThinking,
  toolsExpanded,
  showScrollMarkers,
  isMobileMenuOpen,
  isScrollMarkersFeatureEnabled,
  onBack,
  onToggleSidebar,
  onToggleThinking,
  onToggleToolsExpanded,
  onToggleScrollMarkers,
  onMobileMenuOpenChange,
  onOpenSystemPromptDialog,
  onScrollToTop,
  onScrollToBottom,
  onRename,
  onExport,
  onResume,
  desktopResumeButton,
}: SessionViewerToolbarProps) {
  const { t } = useTranslation();
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobile || !isMobileMenuOpen) return;

    const handler = (event: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        onMobileMenuOpenChange(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isMobile, isMobileMenuOpen, onMobileMenuOpenChange]);

  const closeMobileMenu = () => {
    onMobileMenuOpenChange(false);
  };

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 border-b border-border relative z-20"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {isMobile && onBack && (
          <button
            onClick={onBack}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors flex-shrink-0"
          >
            <BackIcon />
          </button>
        )}
        {!isMobile && (
          <button
            onClick={onToggleSidebar}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors flex-shrink-0"
            title={showSidebar ? t("session.hideSidebar") : t("session.showSidebar")}
          >
            <SidebarToggleIcon />
          </button>
        )}
        <span className="text-sm font-medium truncate">{title}</span>
        <span className="text-[11px] text-muted-foreground flex-shrink-0">
          {messageCount} {t("session.messages")}
        </span>
      </div>

      {isMobile ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
            title={t("session.showSidebar")}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onToggleThinking}
            className={`p-1.5 text-xs rounded transition-colors ${showThinking ? "bg-accent/15 text-accent" : "bg-secondary hover:bg-secondary-hover"}`}
          >
            {showThinking ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onToggleToolsExpanded}
            className={`p-1.5 text-xs rounded transition-colors ${toolsExpanded ? "bg-accent/15 text-accent" : "bg-secondary hover:bg-secondary-hover"}`}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          {isScrollMarkersFeatureEnabled && onToggleScrollMarkers && (
            <button
              onClick={onToggleScrollMarkers}
              className={`p-1.5 text-xs rounded transition-colors ${showScrollMarkers ? "bg-accent/15 text-accent" : "bg-secondary hover:bg-secondary-hover"}`}
              title={t("session.userMarkers", "用户消息锚点")}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="relative" ref={mobileMenuRef}>
            <button
              onClick={() => onMobileMenuOpenChange(!isMobileMenuOpen)}
              className={`p-1.5 text-xs rounded transition-colors ${isMobileMenuOpen ? "bg-accent/15 text-accent" : "bg-secondary hover:bg-secondary-hover"}`}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {isMobileMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-popover border border-border rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    onOpenSystemPromptDialog();
                    closeMobileMenu();
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("session.systemPromptAndTools", "系统提示词")}
                </button>
                <button
                  onClick={() => {
                    onScrollToTop();
                    closeMobileMenu();
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("session.scrollToTop", "滚动到顶部")}
                </button>
                <button
                  onClick={() => {
                    onScrollToBottom();
                    closeMobileMenu();
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("session.scrollToBottom", "滚动到底部")}
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => {
                    onRename();
                    closeMobileMenu();
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("common.rename")}
                </button>
                <button
                  onClick={() => {
                    onExport();
                    closeMobileMenu();
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("common.export")}
                </button>
                {onResume && (
                  <button
                    onClick={() => {
                      onResume();
                      closeMobileMenu();
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
                  >
                    <Play className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("session.resume", "恢复")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0">
          <KbdTooltip shortcut="Cmd+T">
            <button
              onClick={onToggleThinking}
              className={`p-1.5 text-xs rounded transition-colors ${showThinking ? "bg-accent/15 text-accent" : "bg-secondary hover:bg-secondary-hover"}`}
              title={`${showThinking ? "Hide" : "Show"} thinking (⌘T)`}
            >
              {showThinking ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </button>
          </KbdTooltip>
          <KbdTooltip shortcut="Cmd+O">
            <button
              onClick={onToggleToolsExpanded}
              className={`p-1.5 text-xs rounded transition-colors ${toolsExpanded ? "bg-accent/15 text-accent" : "bg-secondary hover:bg-secondary-hover"}`}
              title={`${toolsExpanded ? "Collapse" : "Expand"} tools (⌘O)`}
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </button>
          </KbdTooltip>
          <button
            onClick={onOpenSystemPromptDialog}
            className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
            title={t("session.systemPromptAndTools", "系统提示词和工具")}
          >
            <Bot className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onScrollToTop}
            className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
            title={t("session.scrollToTop", "滚动到顶部")}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onScrollToBottom}
            className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
            title={t("session.scrollToBottom", "滚动到底部")}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRename}
            className="px-2.5 py-1 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
          >
            {t("common.rename")}
          </button>
          <KbdTooltip shortcut="Cmd+E">
            <button
              onClick={onExport}
              className="px-2.5 py-1 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
            >
              {t("common.export")}
            </button>
          </KbdTooltip>
          {desktopResumeButton ??
            (onResume && (
              <KbdTooltip shortcut="Cmd+R">
                <button
                  onClick={onResume}
                  className="px-3 py-1 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors flex items-center gap-1.5"
                  title={t("session.resume", "恢复")}
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>{t("session.resume", "恢复")}</span>
                </button>
              </KbdTooltip>
            ))}
        </div>
      )}
    </div>
  );
}
