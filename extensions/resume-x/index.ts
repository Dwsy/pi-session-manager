/**
 * resume-x — Enhanced resume command using PSM SQLite
 *
 * Features:
 * - SQLite fast path (no disk scan)
 * - cwd filtering for current project
 * - Detail pane: model, tokens, cost per session (monkey-patches SessionList.render)
 * - Message preview: press ← to browse full conversation history, → to return
 *
 * Data source: ~/.pi/agent/sessions/sessions.db (PSM)
 * Usage: /resume-x
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { matchesKey, getKeybindings } from "@mariozechner/pi-tui";

// ── Module imports ───────────────────────────────────────────────────
import { loadSessionsFromSqlite, loadSessionMessages } from "./lib/db.js";
import { searchSessions, buildSearchLines, buildSearchDetailLines } from "./lib/search.js";
import { patchSessionListRender, buildPreviewLines } from "./lib/render.js";
import { clampScroll, getTermHeight, getMaxVisible } from "./lib/utils.js";
import type { SessionMessage, SearchResult } from "./lib/types.js";
import { SCROLL } from "./lib/types.js";

// ── Host module resolution ───────────────────────────────────────────

function getHostDistDir(): string {
  return path.dirname(realpathSync(process.argv[1]));
}

function hostUrl(relativePath: string): string {
  return new URL(relativePath, pathToFileURL(getHostDistDir()).href + "/").href;
}

// ── Extension entry ──────────────────────────────────────────────────

export default async function resumeXExtension(pi: ExtensionAPI) {
  // Global crash catcher — log any unhandled exception to file
  const { _crash } = await import("./lib/db.js");

  function _globalCatch(err: Error) {
    _crash("UNCAUGHT", err);
  }
  process.on("uncaughtException", _globalCatch);
  process.on("unhandledRejection", (reason) => {
    _crash("UNHANDLED-REJ", reason);
  });

  const [{ SessionSelectorComponent }] = await Promise.all([
    import(hostUrl("modes/interactive/components/session-selector.js")),
  ]);

  pi.registerFlag("resume-x", {
    description: "Resume from PSM SQLite (fast, no disk scan)",
    type: "boolean",
    default: false,
  });

  // Toggle state for shortcut
  let isOpen = false;
  let closeFn: (() => void) | null = null;

  const runResumeX = async (ctx: ExtensionCommandContext) => {
    if (isOpen && closeFn) {
      closeFn();
      return;
    }
    isOpen = true;
    try {
      const cwd = process.cwd();

      const currentSessions = loadSessionsFromSqlite(cwd);
      const allSessions = loadSessionsFromSqlite();

      if (allSessions.length === 0) {
        ctx.ui.notify("No sessions found in SQLite.", "warning");
        return;
      }

      const currentLoader = async (onProgress?: (loaded: number, total: number) => void) => {
        onProgress?.(currentSessions.length, currentSessions.length);
        return currentSessions;
      };
      const allLoader = async (onProgress?: (loaded: number, total: number) => void) => {
        onProgress?.(allSessions.length, allSessions.length);
        return allSessions;
      };

      // Save reference before ctx.ui.custom() — ctx may become stale after
      const switchSessionFn = ctx.switchSession?.bind(ctx);
      const sessionManager = ctx.sessionManager;
      let sessionSwitched = false;

      // Use ctx.ui.custom() — patch SessionList.render inside the factory
      const selectedPath = await ctx.ui.custom<string | null>((tui, _theme, keybindings, done) => {
        closeFn = () => done(null);
        const selector = new SessionSelectorComponent(
          currentLoader,
          allLoader,
          (p: string) => done(p),
          () => done(null),
          () => { done(null); ctx.shutdown(); },
          () => tui.requestRender(),
          { showRenameHint: false, keybindings },
        );

        // Patch SessionList.render for detail pane
        try {
          const sl = selector.getSessionList?.();
          if (sl) patchSessionListRender(sl);
        } catch { /* silent */ }

        // Preview mode state
        let mode: "list" | "preview" | "search" = "list";
        let previewMessages: SessionMessage[] = [];
        let previewScrollOffset = 0;
        let previewTotalLines = 0;
        let previewSessionPath = "";
        let toolExpanded = false;

        // Search mode state
        let searchQuery = "";
        let searchResults: SearchResult[] = [];
        let searchSelectedIdx = 0;
        let searchScrollOffset = 0;
        let searchCwdOnly = false;
        const searchCwd = process.cwd();
        let escBuffer = "";
        let escTimer: ReturnType<typeof setTimeout> | null = null;
        let searchSelectedSession: { sessionId?: string; sessionPath?: string; created?: string; modified?: string; messageCount?: number; lastMessage?: string; lastMessageRole?: string } | null = null;

        return {
          render(width: number) {
            if (mode === "search") {
              const baseLines = buildSearchLines(width, searchQuery, searchResults, searchSelectedIdx, searchScrollOffset, searchCwdOnly, searchCwd);
              // Append detail pane for selected search result
              if (searchResults.length > 0 && searchSelectedIdx < searchResults.length) {
                const sel = searchResults[searchSelectedIdx];
                if (sel?.sessionPath) {
                  const detailData = searchSelectedSession?.sessionPath === sel.sessionPath ? searchSelectedSession : null;
                  const detailLines = buildSearchDetailLines(sel.sessionPath, width, detailData || { sessionId: sel.sessionId, created: sel.created, modified: sel.modified, messageCount: sel.messageCount, lastMessage: "", lastMessageRole: "" });
                  return [...baseLines, ...detailLines];
                }
              }
              return baseLines;
            }

            let baseLines: string[];
            try {
              baseLines = selector.render(width);
            } catch (e) {
              return ["(render error)"];
            }
            if (mode !== "preview" || previewMessages.length === 0) {
              return baseLines;
            }
            try {
              const result = buildPreviewLines(width, previewMessages, previewScrollOffset, previewSessionPath, toolExpanded);
              previewTotalLines = result.totalLines;
              return [...baseLines, ...result.lines];
            } catch (e) {
              // Don't reset mode — keep preview state, just show base lines
              return baseLines;
            }
          },
          invalidate() {
            selector.invalidate?.();
          },
          handleInput(data: string) {
            const hex = Buffer.from(data).toString("hex");

            // ── List mode ──
            if (mode === "list") {
              // ⌥Q — enter search mode
              if (matchesKey(data, "alt+q")) {
                mode = "search";
                searchQuery = "";
                searchResults = [];
                searchSelectedIdx = 0;
                searchScrollOffset = 0;
                searchCwdOnly = true;
                searchSelectedSession = null;
                tui.requestRender();
                return;
              }

              // → — enter preview mode
              if (keybindings.matches(data, "tui.editor.cursorRight")) {
                try {
                  const sl = selector.getSessionList?.();
                  if (sl) {
                    const selected = sl.filteredSessions?.[sl.selectedIndex];
                    const session = selected?.session;
                    if (session?.path) {
                      const msgs = loadSessionMessages(session.path);
                      if (msgs.length > 0) {
                        previewMessages = msgs;
                        previewSessionPath = session.path;
                        previewScrollOffset = 0;
                        previewTotalLines = 0;
                        toolExpanded = false;
                        mode = "preview";
                        tui.requestRender();
                        return;
                      }
                    }
                  }
                } catch (e) { /* silent */ }
              }

              // Delegate to selector
              try { selector.handleInput(data); } catch (e) { /* silent */ }
              tui.requestRender();
              return;
            }

            // ── Preview mode ──
            if (mode === "preview") {
              try {
                const isLeft = keybindings.matches(data, "tui.editor.cursorLeft");
                const isCancel = keybindings.matches(data, "tui.select.cancel");
                const isInterrupt = keybindings.matches(data, "app.interrupt");
                const isConfirm = keybindings.matches(data, "tui.select.confirm");

                if (isLeft || isCancel || isInterrupt) {
                  mode = "list";
                  previewMessages = [];
                  toolExpanded = false;
                  tui.requestRender();
                  return;
                }
                if (isConfirm && previewSessionPath) {
                  // Switch session BEFORE done() to keep ctx valid
                  sessionSwitched = true;
                  if (typeof switchSessionFn === "function") {
                    switchSessionFn(previewSessionPath);
                  } else if (sessionManager) {
                    sessionManager.setSessionFile(previewSessionPath);
                  }
                  done(previewSessionPath);
                  return;
                }

                // ctrl+o — toggle tool expand/collapse
                const kb2 = getKeybindings();
                const isToggleExpand = kb2.matches(data, "app.tools.expand") || data === "\x0f";
                if (isToggleExpand) {
                  toolExpanded = !toolExpanded;
                  previewScrollOffset = 0;
                  tui.requestRender();
                  return;
                }

                const maxVisible = getMaxVisible();
                const maxOffset = Math.max(0, previewTotalLines - maxVisible);

                const isShiftUp = keybindings.matches(data, "tui.select.pageUp") || keybindings.matches(data, "tui.editor.pageUp");
                const isShiftDown = keybindings.matches(data, "tui.select.pageDown") || keybindings.matches(data, "tui.editor.pageDown");
                if (isShiftUp) { previewScrollOffset = clampScroll(previewScrollOffset - SCROLL.HALF_PAGE, previewTotalLines, maxVisible); tui.requestRender(); return; }
                if (isShiftDown) { previewScrollOffset = clampScroll(previewScrollOffset + SCROLL.HALF_PAGE, previewTotalLines, maxVisible); tui.requestRender(); return; }

                const isUp = keybindings.matches(data, "tui.select.up") || keybindings.matches(data, "tui.editor.cursorUp");
                const isDown = keybindings.matches(data, "tui.select.down") || keybindings.matches(data, "tui.editor.cursorDown");
                if (isUp) { previewScrollOffset = clampScroll(previewScrollOffset - SCROLL.FAST_LINE, previewTotalLines, maxVisible); tui.requestRender(); return; }
                if (isDown) { previewScrollOffset = clampScroll(previewScrollOffset + SCROLL.FAST_LINE, previewTotalLines, maxVisible); tui.requestRender(); return; }

                const isPgUp = hex === "1b5b313b3241" || hex === "1b4f41";
                const isPgDn = hex === "1b5b313b3242" || hex === "1b4f42";
                if (isPgUp) { previewScrollOffset = clampScroll(previewScrollOffset - SCROLL.PAGE, previewTotalLines, maxVisible); tui.requestRender(); return; }
                if (isPgDn) { previewScrollOffset = clampScroll(previewScrollOffset + SCROLL.PAGE, previewTotalLines, maxVisible); tui.requestRender(); return; }
              } catch (e) {
                mode = "list";
                previewMessages = [];
                tui.requestRender();
              }
            }

            // ── Search mode ──
            if (mode === "search") {
              const kb = getKeybindings();
              const isCancel = kb.matches(data, "tui.select.cancel") || keybindings.matches(data, "tui.select.cancel");
              const isInterrupt = kb.matches(data, "app.interrupt") || keybindings.matches(data, "app.interrupt");

              if (isCancel || isInterrupt) {
                mode = "list";
                searchQuery = "";
                searchResults = [];
                searchSelectedSession = null;
                if (escTimer) { clearTimeout(escTimer); escTimer = null; }
                escBuffer = "";
                tui.requestRender();
                return;
              }

              // Tab — toggle CWD / global
              const isTab = kb.matches(data, "tui.input.tab") || keybindings.matches(data, "tui.input.tab") || data === "\t";
              if (isTab) {
                searchCwdOnly = !searchCwdOnly;
                searchResults = searchSessions(searchQuery, searchCwdOnly ? searchCwd : undefined);
                searchSelectedIdx = 0;
                searchScrollOffset = 0;
                // Load first result detail
                if (searchResults.length > 0) {
                  const sel = searchResults[0];
                  searchSelectedSession = { sessionId: sel.sessionId, sessionPath: sel.sessionPath, created: sel.created, modified: sel.modified, messageCount: sel.messageCount, lastMessage: "", lastMessageRole: "" };
                } else {
                  searchSelectedSession = null;
                }
                tui.requestRender();
                return;
              }

              const isConfirm = kb.matches(data, "tui.select.confirm") || keybindings.matches(data, "tui.select.confirm") || data === "\n";
              const maxResults = Math.min(searchResults.length, 10);

              if (isConfirm && maxResults > 0) {
                const selected = searchResults[searchSelectedIdx];
                if (selected) {
                  // Switch session BEFORE done() to keep ctx valid
                  sessionSwitched = true;
                  if (typeof switchSessionFn === "function") {
                    switchSessionFn(selected.sessionPath);
                  } else if (sessionManager) {
                    sessionManager.setSessionFile(selected.sessionPath);
                  }
                  done(selected.sessionPath);
                }
                return;
              }

              // → — preview selected search result
              const isRight = kb.matches(data, "tui.editor.cursorRight") || keybindings.matches(data, "tui.editor.cursorRight");
              if (isRight && maxResults > 0) {
                const selected = searchResults[searchSelectedIdx];
                if (selected?.sessionPath) {
                  try {
                    const msgs = loadSessionMessages(selected.sessionPath);
                    if (msgs.length > 0) {
                      previewMessages = msgs;
                      previewSessionPath = selected.sessionPath;
                      previewScrollOffset = 0;
                      previewTotalLines = 0;
                      toolExpanded = false;
                      mode = "preview";
                      tui.requestRender();
                      return;
                    }
                  } catch { /* silent */ }
                }
              }

              // Arrow navigation
              const isUp = kb.matches(data, "tui.select.up") || keybindings.matches(data, "tui.select.up") || data === "k";
              const isDown = kb.matches(data, "tui.select.down") || keybindings.matches(data, "tui.select.down") || data === "j";

              if (isUp && maxResults > 0) {
                searchSelectedIdx = Math.max(0, searchSelectedIdx - 1);
                if (searchSelectedIdx < searchScrollOffset) searchScrollOffset = searchSelectedIdx;
                // Load detail for newly selected
                const sel = searchResults[searchSelectedIdx];
                if (sel?.sessionPath) {
                  searchSelectedSession = { sessionId: sel.sessionId, sessionPath: sel.sessionPath, created: sel.created, modified: sel.modified, messageCount: sel.messageCount, lastMessage: "", lastMessageRole: "" };
                }
                tui.requestRender();
                return;
              }
              if (isDown && maxResults > 0) {
                searchSelectedIdx = Math.min(maxResults - 1, searchSelectedIdx + 1);
                const termHeight = getTermHeight();
                const mvr = Math.max(2, termHeight - 10);
                if (searchSelectedIdx >= searchScrollOffset + mvr) searchScrollOffset = searchSelectedIdx - mvr + 1;
                // Load detail for newly selected
                const sel = searchResults[searchSelectedIdx];
                if (sel?.sessionPath) {
                  searchSelectedSession = { sessionId: sel.sessionId, sessionPath: sel.sessionPath, created: sel.created, modified: sel.modified, messageCount: sel.messageCount, lastMessage: "", lastMessageRole: "" };
                }
                tui.requestRender();
                return;
              }

              // Backspace
              if (hex === "7f" || hex === "08") {
                if (searchQuery.length > 0) {
                  searchQuery = searchQuery.slice(0, -1);
                  searchResults = searchSessions(searchQuery, searchCwdOnly ? searchCwd : undefined);
                  searchSelectedIdx = 0;
                  searchScrollOffset = 0;
                }
                tui.requestRender();
                return;
              }

              // ESC buffer for split escape sequences
              const code = data.charCodeAt(0);
              if (code === 0x1b) {
                if (escTimer) { clearTimeout(escTimer); escTimer = null; }
                escBuffer = data;
                escTimer = setTimeout(() => {
                  escBuffer = "";
                  escTimer = null;
                  mode = "list";
                  searchQuery = "";
                  searchResults = [];
                  tui.requestRender();
                }, 80);
                return;
              }

              // If buffering ESC sequence, append and check
              if (escBuffer) {
                if (escTimer) { clearTimeout(escTimer); escTimer = null; }
                escBuffer += data;
                const seq = Buffer.from(escBuffer).toString("hex");
                if (seq === "1b5b41" || seq === "1b4f41") {
                  searchSelectedIdx = Math.max(0, searchSelectedIdx - 1);
                  if (searchSelectedIdx < searchScrollOffset) searchScrollOffset = searchSelectedIdx;
                  const sel = searchResults[searchSelectedIdx];
                  if (sel?.sessionPath) searchSelectedSession = { sessionId: sel.sessionId, sessionPath: sel.sessionPath, created: sel.created, modified: sel.modified, messageCount: sel.messageCount, lastMessage: "", lastMessageRole: "" };
                  escBuffer = "";
                  tui.requestRender();
                  return;
                }
                if (seq === "1b5b42" || seq === "1b4f42") {
                  searchSelectedIdx = Math.min(maxResults - 1, searchSelectedIdx + 1);
                  const termHeight = getTermHeight();
                  const mvr = Math.max(2, termHeight - 10);
                  if (searchSelectedIdx >= searchScrollOffset + mvr) searchScrollOffset = searchSelectedIdx - mvr + 1;
                  const sel = searchResults[searchSelectedIdx];
                  if (sel?.sessionPath) searchSelectedSession = { sessionId: sel.sessionId, sessionPath: sel.sessionPath, created: sel.created, modified: sel.modified, messageCount: sel.messageCount, lastMessage: "", lastMessageRole: "" };
                  escBuffer = "";
                  tui.requestRender();
                  return;
                }
                // Left arrow — back to list mode
                if (seq === "1b5b44" || seq === "1b4f44") {
                  mode = "list";
                  searchQuery = "";
                  searchResults = [];
                  searchSelectedSession = null;
                  escBuffer = "";
                  tui.requestRender();
                  return;
                }
                escBuffer = "";
                return;
              }

              // Skip control chars
              if ((code < 0x20 && code !== 0x08) || code === 0x7f) return;

              // Printable input
              searchQuery += data;
              searchResults = searchSessions(searchQuery, searchCwdOnly ? searchCwd : undefined);
              searchSelectedIdx = 0;
              searchScrollOffset = 0;
              // Load first result detail
              if (searchResults.length > 0) {
                const sel = searchResults[0];
                searchSelectedSession = { sessionId: sel.sessionId, sessionPath: sel.sessionPath, created: sel.created, modified: sel.modified, messageCount: sel.messageCount, lastMessage: "", lastMessageRole: "" };
              } else {
                searchSelectedSession = null;
              }
              tui.requestRender();
              return;
            }
          },
        };
      });

      closeFn = null;
      isOpen = false;

      if (!selectedPath) { return; }

      // Skip if already switched inside factory (search/preview modes)
      if (sessionSwitched) return;

      try {
        if (typeof switchSessionFn === "function") {
          await switchSessionFn(selectedPath);
          return;
        }

        if (sessionManager && typeof sessionManager.setSessionFile === "function") {
          sessionManager.setSessionFile(selectedPath);
          // Don't use ctx.ui.notify — ctx may be stale
          return;
        }
      } catch (err) {
        // ctx may be stale, log instead of notify
        _crash("SWITCH-FAIL", err);
      }
    } catch (e) {
      isOpen = false;
      closeFn = null;
      _crash("HANDLER-TOP", e);
      ctx.ui.notify(`resume-x crashed: ${e instanceof Error ? e.message : e}`, "error");
    }
  };

  pi.registerCommand("resume-x", {
    description: "Resume session from SQLite (fast, no disk scan)",
    handler: async (_args: string, ctx: ExtensionContext) => {
      await runResumeX(ctx);
    },
  });

  pi.registerShortcut("alt+x", {
    description: "Open/close resume-x session picker",
    handler: async (ctx: ExtensionContext) => {
      await runResumeX(ctx);
    },
  });

  pi.on("session_shutdown", () => {
    process.removeListener("uncaughtException", _globalCatch);
    process.removeListener("unhandledRejection", (reason) => {
      _crash("UNHANDLED-REJ", reason);
    });
  });
}
