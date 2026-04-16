import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Bot,
  Brain,
  BrainCircuit,
  ChevronLeft,
  Copy,
  Download,
  List,
  ListTree,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Search,
} from "lucide-react";

import KbdTooltip from "@/components/ui/KbdTooltip";
import { isTauri } from "@/transport";
import type { SessionViewerToolbarProps } from "./SessionViewerToolbarTypes";
import SessionViewerOnlineStatusBar from "./SessionViewerOnlineStatusBar";
import SessionViewerModelControls from "./SessionViewerModelControls";

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
  isSearchOpen,
  previewMode = false,
  slots,
  onToggleTraceMode,
  traceModeActive = false,
  onBack,
  onToggleSidebar,
  onToggleThinking,
  onToggleToolsExpanded,
  collapseToolCalls,
  onToggleCollapseToolCalls,
  onToggleScrollMarkers,
  onOpenSearch,
  onMobileMenuOpenChange,
  onOpenSystemPromptDialog,
  onScrollToTop,
  onScrollToBottom,
  onRename,
  onFork,
  onExport,
  onConvert,
  onResume,
  desktopResumeButton,
  liveSession,
}: SessionViewerToolbarProps) {
  const { t } = useTranslation();
  const sidebarToggleLabel = showSidebar
    ? t("session.hideSidebar")
    : t("session.showSidebar");
  const thinkingToggleLabel = showThinking
    ? t("session.toolbar.hideThinking", "Hide thinking")
    : t("session.toolbar.showThinking", "Show thinking");
  const toolsToggleLabel = toolsExpanded
    ? t("session.toolbar.collapseTools", "Collapse tools")
    : t("session.toolbar.expandTools", "Expand tools");
  const collapseToolCallsToggleLabel = collapseToolCalls
    ? t("session.toolbar.collapseToolCallsOn", "Grouped tools")
    : t("session.toolbar.collapseToolCallsOff", "Expanded tools");
  const searchToggleLabel = t(
    "session.toolbar.searchMessages",
    "Search messages",
  );
  const scrollMarkersToggleLabel = showScrollMarkers
    ? t("session.toolbar.hideUserMarkers", "Hide message markers")
    : t("session.toolbar.showUserMarkers", "Show message markers");
  const toggleButtonBase =
    "rounded border border-border/90 transition-colors text-foreground";
  const toggleButtonActive =
    " bg-primary/14 hover:bg-primary/18 active:bg-primary/18";
  const toggleButtonInactive =
    "border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover";
  const mobileQuickActionBase =
    "h-9 w-full px-1.5 inline-flex items-center justify-center gap-1 rounded-xl border text-[11px] font-medium transition-colors touch-manipulation min-w-0";
  const mobileQuickActionActive =
    "border-primary/45 bg-primary/14 text-foreground hover:bg-primary/18 active:bg-primary/18";
  const mobileQuickActionInactive =
    "border-border/70 bg-background text-foreground hover:bg-secondary active:bg-secondary";
  const mobileSheetItemClass =
    "flex items-center gap-3 w-full px-3 py-3 text-sm text-foreground hover:bg-secondary rounded-xl transition-colors touch-manipulation";

  const closeMobileMenu = () => {
    onMobileMenuOpenChange(false);
  };

  const handleToolbarMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (isMobile || !isTauri()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, input, textarea, select, [role='button'], .no-drag, [data-no-window-drag]",
      )
    ) {
      return;
    }

    void getCurrentWindow().startDragging();
  };

  return (
    <>
      <div
        className={`border-b border-border relative z-20 ${isMobile ? "px-2.5 py-2" : "px-3 py-1.5"}`}
        data-tauri-drag-region
        onMouseDown={handleToolbarMouseDown}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {isMobile && onBack && (
              <button
                onClick={onBack}
                className="h-9 w-9 inline-flex items-center justify-center border border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors flex-shrink-0"
                aria-label={t("common.back")}
                title={t("common.back")}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {!isMobile && !previewMode && (
              <button
                onClick={onToggleSidebar}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors flex-shrink-0"
                title={sidebarToggleLabel}
                aria-label={sidebarToggleLabel}
              >
                {showSidebar ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </button>
            )}
            <div
              className={`flex items-center gap-1.5 min-w-0 ${!isMobile ? "tauri-drag-handle" : ""}`}
            >
              <span className="text-base font-semibold tracking-tight truncate">
                {title}
              </span>
              {liveSession && (
                <SessionViewerOnlineStatusBar liveSession={liveSession} />
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border/60 bg-background text-[11px] text-muted-foreground flex-shrink-0">
                {messageCount} {t("session.messages")}
              </span>
              {/* Custom left slot */}
              {slots?.left}
            </div>
          </div>

          {!isMobile && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {!previewMode && liveSession && (
                <>
                  <SessionViewerModelControls liveSession={liveSession} />
                  <div className="h-4 w-px bg-border/60 mx-1" />
                </>
              )}

              <KbdTooltip shortcut="Cmd+F">
                <button
                  onClick={onOpenSearch}
                  className={`p-1.5 text-xs ${toggleButtonBase} ${isSearchOpen ? toggleButtonActive : toggleButtonInactive}`}
                  title={`${searchToggleLabel} (⌘F)`}
                  aria-label={searchToggleLabel}
                  aria-pressed={isSearchOpen}
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </KbdTooltip>
              {!previewMode && (
                <>
                  <KbdTooltip shortcut="Cmd+T">
                    <button
                      onClick={onToggleThinking}
                      className={`p-1.5 text-xs ${toggleButtonBase} ${showThinking ? toggleButtonActive : toggleButtonInactive}`}
                      title={`${thinkingToggleLabel} (⌘T)`}
                      aria-label={thinkingToggleLabel}
                      aria-pressed={showThinking}
                    >
                      {showThinking ? (
                        <BrainCircuit className="h-3.5 w-3.5" />
                      ) : (
                        <Brain className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </KbdTooltip>
                  <KbdTooltip shortcut="Cmd+O">
                    <button
                      onClick={onToggleToolsExpanded}
                      className={`p-1.5 text-xs ${toggleButtonBase} ${toolsExpanded ? toggleButtonActive : toggleButtonInactive}`}
                      title={`${toolsToggleLabel} (⌘O)`}
                      aria-label={toolsToggleLabel}
                      aria-pressed={toolsExpanded}
                    >
                      <ListTree className="h-3.5 w-3.5" />
                    </button>
                  </KbdTooltip>
                  {onToggleCollapseToolCalls && (
                    <button
                      onClick={onToggleCollapseToolCalls}
                      className={`p-1.5 text-xs ${toggleButtonBase} ${collapseToolCalls ? toggleButtonActive : toggleButtonInactive}`}
                      title={collapseToolCallsToggleLabel}
                      aria-label={collapseToolCallsToggleLabel}
                      aria-pressed={collapseToolCalls}
                    >
                      {collapseToolCalls ? (
                        <ListTree className="h-3.5 w-3.5" />
                      ) : (
                        <List className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={onOpenSystemPromptDialog}
                    className="p-1.5 text-xs rounded border border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover transition-colors"
                    title={t(
                      "session.systemPromptAndTools",
                      "System prompt & tools",
                    )}
                    aria-label={t(
                      "session.systemPromptAndTools",
                      "System prompt & tools",
                    )}
                  >
                    <Bot className="h-3.5 w-3.5" />
                  </button>
                  {onToggleTraceMode && (
                    <button
                      onClick={onToggleTraceMode}
                      className={`p-1.5 text-xs rounded border transition-colors ${
                        traceModeActive
                          ? "border-primary/40 bg-primary/14 text-primary"
                          : "border-border/70 bg-secondary hover:bg-secondary-hover text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("trace.toggle", "Trace mode")}
                      aria-label={t("trace.toggle", "Trace mode")}
                      aria-pressed={traceModeActive}
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    </button>
                  )}
                </>
              )}
              <button
                onClick={onScrollToTop}
                className="p-1.5 text-xs rounded border border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover transition-colors"
                title={t("session.scrollToTop", "Scroll to top")}
                aria-label={t("session.scrollToTop", "Scroll to top")}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onScrollToBottom}
                className="p-1.5 text-xs rounded border border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover transition-colors"
                title={t("session.scrollToBottom", "Scroll to bottom")}
                aria-label={t("session.scrollToBottom", "Scroll to bottom")}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              {!previewMode && (
                <>
                  <button
                    onClick={onRename}
                    className="px-2.5 py-1 text-xs rounded border border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover transition-colors"
                  >
                    {t("common.rename")}
                  </button>
                  {onFork && (
                    <button
                      onClick={onFork}
                      className="px-2.5 py-1 text-xs rounded border border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover transition-colors flex items-center gap-1"
                      title={t("session.fork.title")}
                    >
                      <Copy className="h-3 w-3" />
                      {t("session.fork.confirm")}
                    </button>
                  )}
                  <KbdTooltip shortcut="Cmd+E">
                    <button
                      onClick={onExport}
                      className="px-2.5 py-1 text-xs rounded border border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover transition-colors"
                    >
                      {t("common.export")}
                    </button>
                  </KbdTooltip>
                  {desktopResumeButton ??
                    (onResume && (
                      <KbdTooltip shortcut="Cmd+R">
                        <button
                          onClick={onResume}
                          className="px-3 py-1 text-xs rounded border border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover transition-colors flex items-center gap-1.5"
                          title={t("session.resume", "Resume")}
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>{t("session.resume", "Resume")}</span>
                        </button>
                      </KbdTooltip>
                    ))}
                </>
              )}
              {/* Custom right slot */}
              {slots?.right}
            </div>
          )}
        </div>

        {isMobile && (
          <div className="mt-2 rounded-2xl border border-border/60 bg-background/90 p-1.5 shadow-sm">
            <div className="grid grid-cols-5 gap-1">
              <button
                onClick={onToggleSidebar}
                className={`${mobileQuickActionBase} ${showSidebar ? mobileQuickActionActive : mobileQuickActionInactive}`}
                title={sidebarToggleLabel}
                aria-label={sidebarToggleLabel}
                aria-pressed={showSidebar}
              >
                {showSidebar ? (
                  <PanelLeftClose className="h-3.5 w-3.5 flex-shrink-0" />
                ) : (
                  <PanelLeftOpen className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                <span className="truncate">
                  {t("session.toolbar.outline", "Outline")}
                </span>
              </button>
              <button
                onClick={onToggleThinking}
                className={`${mobileQuickActionBase} ${showThinking ? mobileQuickActionActive : mobileQuickActionInactive}`}
                title={thinkingToggleLabel}
                aria-label={thinkingToggleLabel}
                aria-pressed={showThinking}
              >
                {showThinking ? (
                  <BrainCircuit className="h-3.5 w-3.5 flex-shrink-0" />
                ) : (
                  <Brain className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                <span className="truncate">
                  {t("session.toolbar.thinking", "Thinking")}
                </span>
              </button>
              <button
                onClick={onScrollToTop}
                className={`${mobileQuickActionBase} ${mobileQuickActionInactive}`}
                title={t("session.scrollToTop", "Scroll to top")}
                aria-label={t("session.scrollToTop", "Scroll to top")}
              >
                <ArrowUp className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {t("session.toolbar.top", "Top")}
                </span>
              </button>
              <button
                onClick={onScrollToBottom}
                className={`${mobileQuickActionBase} ${mobileQuickActionInactive}`}
                title={t("session.scrollToBottom", "Scroll to bottom")}
                aria-label={t("session.scrollToBottom", "Scroll to bottom")}
              >
                <ArrowDown className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {t("session.toolbar.bottom", "Bottom")}
                </span>
              </button>
              <button
                onClick={() => onMobileMenuOpenChange(!isMobileMenuOpen)}
                className={`${mobileQuickActionBase} ${isMobileMenuOpen ? mobileQuickActionActive : mobileQuickActionInactive}`}
                title={t("session.toolbar.moreActions", "More actions")}
                aria-label={t("session.toolbar.moreActions", "More actions")}
                aria-expanded={isMobileMenuOpen}
              >
                <MoreVertical className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {t("session.toolbar.more", "More")}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {isMobile && isMobileMenuOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            onClick={closeMobileMenu}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label={t("common.close")}
            type="button"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] border border-border/70 bg-popover/95 shadow-[0_-18px_48px_rgba(0,0,0,0.28)] p-2 pb-[max(0.875rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 duration-200 backdrop-blur-md">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
            <div className="px-1 pb-2 text-xs font-medium text-muted-foreground">
              {t("session.toolbar.moreActions", "More actions")}
            </div>
            <button
              onClick={() => {
                onOpenSearch();
                closeMobileMenu();
              }}
              className={mobileSheetItemClass}
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              {searchToggleLabel}
            </button>
            <button
              onClick={() => {
                onToggleToolsExpanded();
                closeMobileMenu();
              }}
              className={mobileSheetItemClass}
            >
              <ListTree className="h-4 w-4 text-muted-foreground" />
              {toolsToggleLabel}
            </button>
            {onToggleCollapseToolCalls && (
              <button
                onClick={() => {
                  onToggleCollapseToolCalls();
                  closeMobileMenu();
                }}
                className={mobileSheetItemClass}
              >
                {collapseToolCalls ? (
                  <ListTree className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <List className="h-4 w-4 text-muted-foreground" />
                )}
                {collapseToolCallsToggleLabel}
              </button>
            )}
            <button
              onClick={() => {
                onOpenSystemPromptDialog();
                closeMobileMenu();
              }}
              className={mobileSheetItemClass}
            >
              <Bot className="h-4 w-4 text-muted-foreground" />
              {t("session.systemPromptAndTools", "System prompt & tools")}
            </button>
            {isScrollMarkersFeatureEnabled && onToggleScrollMarkers && (
              <button
                onClick={() => {
                  onToggleScrollMarkers();
                  closeMobileMenu();
                }}
                className={mobileSheetItemClass}
              >
                <List className="h-4 w-4 text-muted-foreground" />
                {scrollMarkersToggleLabel}
              </button>
            )}
            <button
              onClick={() => {
                onScrollToTop();
                closeMobileMenu();
              }}
              className={mobileSheetItemClass}
            >
              <ArrowUp className="h-4 w-4 text-muted-foreground" />
              {t("session.scrollToTop", "Scroll to top")}
            </button>
            <button
              onClick={() => {
                onScrollToBottom();
                closeMobileMenu();
              }}
              className={mobileSheetItemClass}
            >
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
              {t("session.scrollToBottom", "Scroll to bottom")}
            </button>
            <div className="border-t border-border my-1" />
            <button
              onClick={() => {
                onRename();
                closeMobileMenu();
              }}
              className={mobileSheetItemClass}
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
              {t("common.rename")}
            </button>
            {onFork && (
              <button
                onClick={() => {
                  onFork();
                  closeMobileMenu();
                }}
                className={mobileSheetItemClass}
              >
                <Copy className="h-4 w-4 text-muted-foreground" />
                {t("session.fork.confirm")}
              </button>
            )}
            <button
              onClick={() => {
                onExport();
                closeMobileMenu();
              }}
              className={mobileSheetItemClass}
            >
              <Download className="h-4 w-4 text-muted-foreground" />
              {t("common.export")}
            </button>
            {onConvert && (
              <button
                onClick={() => {
                  onConvert();
                  closeMobileMenu();
                }}
                className={mobileSheetItemClass}
              >
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                {t("session.convert.title")}
              </button>
            )}
            {onResume && (
              <button
                onClick={() => {
                  onResume();
                  closeMobileMenu();
                }}
                className={mobileSheetItemClass}
              >
                <Play className="h-4 w-4 text-muted-foreground" />
                {t("session.resume", "Resume")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
