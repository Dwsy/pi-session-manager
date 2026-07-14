import { isFoldableNode } from "./session-tree";

export const TREE_FILTER_MODES = [
  "default",
  "no-tools",
  "user-only",
  "labeled-only",
  "all",
] as const;

export type TreeFilterMode = (typeof TREE_FILTER_MODES)[number];

export interface SessionTreeControllerState {
  filterMode: TreeFilterMode;
  searchQuery: string;
  foldedIds: ReadonlySet<string>;
  focusedId: string | null;
  selectedId: string | null;
  searchMatchIndex: number;
}

export type TreeAction =
  | { type: "MOVE_PREVIOUS" }
  | { type: "MOVE_NEXT" }
  | { type: "FOLD_OR_PARENT" }
  | { type: "UNFOLD_OR_CHILD" }
  | { type: "PAGE_PREVIOUS"; pageSize: number }
  | { type: "PAGE_NEXT"; pageSize: number }
  | { type: "HOME" }
  | { type: "END" }
  | { type: "SET_QUERY"; query: string }
  | { type: "CYCLE_FILTER"; direction?: 1 | -1 }
  | { type: "SET_FILTER"; filter: TreeFilterMode }
  | { type: "TOGGLE_FOLD"; id: string }
  | { type: "SET_FOCUSED"; id: string | null }
  | { type: "SET_SELECTED"; id: string | null }
  | { type: "SEARCH_NEXT" }
  | { type: "SEARCH_PREV" }
  | { type: "ESCAPE" }
  | { type: "SYNC_VISIBLE"; preferredId?: string | null };

export interface TreeControllerContext {
  visibleIds: readonly string[];
  searchMatchIds: readonly string[];
  visibleParentById: ReadonlyMap<string, string | null>;
  visibleChildrenById: ReadonlyMap<string, string[]>;
}

export type TreeControllerEffect =
  | { type: "none" }
  | { type: "open"; id: string }
  | { type: "clear-search-done" }
  | { type: "request-close" };

export function createTreeControllerState(
  partial?: Partial<SessionTreeControllerState>,
): SessionTreeControllerState {
  return {
    filterMode: partial?.filterMode ?? "no-tools",
    searchQuery: partial?.searchQuery ?? "",
    foldedIds: partial?.foldedIds ?? new Set<string>(),
    focusedId: partial?.focusedId ?? null,
    selectedId: partial?.selectedId ?? null,
    searchMatchIndex: partial?.searchMatchIndex ?? 0,
  };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function indexOfId(ids: readonly string[], id: string | null): number {
  if (!id) return -1;
  return ids.indexOf(id);
}

function moveBy(
  ids: readonly string[],
  focusedId: string | null,
  delta: number,
): string | null {
  if (ids.length === 0) return null;
  const current = indexOfId(ids, focusedId);
  if (current < 0) {
    return delta >= 0 ? ids[0] : ids[ids.length - 1];
  }
  return ids[clampIndex(current + delta, ids.length)] ?? null;
}

function withFoldToggle(
  foldedIds: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(foldedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function nearestVisibleId(
  preferredId: string | null | undefined,
  visibleIds: readonly string[],
  visibleParentById: ReadonlyMap<string, string | null>,
): string | null {
  if (visibleIds.length === 0) return null;
  if (preferredId && visibleIds.includes(preferredId)) return preferredId;

  let current = preferredId ?? null;
  while (current) {
    const parent = visibleParentById.get(current) ?? null;
    if (parent && visibleIds.includes(parent)) return parent;
    current = parent;
  }

  return visibleIds[0] ?? null;
}

export function reduceTreeAction(
  state: SessionTreeControllerState,
  action: TreeAction,
  ctx: TreeControllerContext,
): { state: SessionTreeControllerState; effect: TreeControllerEffect } {
  const { visibleIds, searchMatchIds, visibleParentById, visibleChildrenById } = ctx;

  switch (action.type) {
    case "MOVE_PREVIOUS":
      return {
        state: {
          ...state,
          focusedId: moveBy(visibleIds, state.focusedId, -1),
        },
        effect: { type: "none" },
      };

    case "MOVE_NEXT":
      return {
        state: {
          ...state,
          focusedId: moveBy(visibleIds, state.focusedId, 1),
        },
        effect: { type: "none" },
      };

    case "PAGE_PREVIOUS":
      return {
        state: {
          ...state,
          focusedId: moveBy(visibleIds, state.focusedId, -Math.max(1, action.pageSize)),
        },
        effect: { type: "none" },
      };

    case "PAGE_NEXT":
      return {
        state: {
          ...state,
          focusedId: moveBy(visibleIds, state.focusedId, Math.max(1, action.pageSize)),
        },
        effect: { type: "none" },
      };

    case "HOME":
      return {
        state: { ...state, focusedId: visibleIds[0] ?? null },
        effect: { type: "none" },
      };

    case "END":
      return {
        state: { ...state, focusedId: visibleIds[visibleIds.length - 1] ?? null },
        effect: { type: "none" },
      };

    case "FOLD_OR_PARENT": {
      const focusedId = state.focusedId;
      if (!focusedId) return { state, effect: { type: "none" } };

      const foldable = isFoldableNode(focusedId, visibleParentById, visibleChildrenById);
      if (foldable && !state.foldedIds.has(focusedId)) {
        return {
          state: {
            ...state,
            foldedIds: withFoldToggle(state.foldedIds, focusedId),
          },
          effect: { type: "none" },
        };
      }

      const parentId = visibleParentById.get(focusedId) ?? null;
      return {
        state: {
          ...state,
          focusedId: parentId && visibleIds.includes(parentId) ? parentId : focusedId,
        },
        effect: { type: "none" },
      };
    }

    case "UNFOLD_OR_CHILD": {
      const focusedId = state.focusedId;
      if (!focusedId) return { state, effect: { type: "none" } };

      if (state.foldedIds.has(focusedId)) {
        const next = new Set(state.foldedIds);
        next.delete(focusedId);
        return {
          state: { ...state, foldedIds: next },
          effect: { type: "none" },
        };
      }

      const children = visibleChildrenById.get(focusedId) ?? [];
      if (children.length > 0 && visibleIds.includes(children[0])) {
        return {
          state: { ...state, focusedId: children[0] },
          effect: { type: "none" },
        };
      }

      return { state, effect: { type: "none" } };
    }

    case "SET_QUERY":
      return {
        state: {
          ...state,
          searchQuery: action.query,
          searchMatchIndex: 0,
          // Search temporarily clears folds like Pi TUI.
          foldedIds: action.query ? new Set<string>() : state.foldedIds,
        },
        effect: { type: "none" },
      };

    case "CYCLE_FILTER": {
      const direction = action.direction ?? 1;
      const currentIndex = TREE_FILTER_MODES.indexOf(state.filterMode);
      const nextIndex =
        (currentIndex + direction + TREE_FILTER_MODES.length) % TREE_FILTER_MODES.length;
      return {
        state: {
          ...state,
          filterMode: TREE_FILTER_MODES[nextIndex],
          foldedIds: new Set<string>(),
        },
        effect: { type: "none" },
      };
    }

    case "SET_FILTER":
      return {
        state: {
          ...state,
          filterMode: action.filter,
          foldedIds: new Set<string>(),
        },
        effect: { type: "none" },
      };

    case "TOGGLE_FOLD":
      return {
        state: {
          ...state,
          focusedId: action.id,
          foldedIds: withFoldToggle(state.foldedIds, action.id),
        },
        effect: { type: "none" },
      };

    case "SET_FOCUSED":
      return {
        state: { ...state, focusedId: action.id },
        effect: { type: "none" },
      };

    case "SET_SELECTED":
      return {
        state: {
          ...state,
          selectedId: action.id,
          focusedId: action.id ?? state.focusedId,
        },
        effect: { type: "none" },
      };

    case "SEARCH_NEXT": {
      if (searchMatchIds.length === 0) return { state, effect: { type: "none" } };
      const nextIndex = (state.searchMatchIndex + 1) % searchMatchIds.length;
      return {
        state: {
          ...state,
          searchMatchIndex: nextIndex,
          focusedId: searchMatchIds[nextIndex] ?? state.focusedId,
        },
        effect: { type: "none" },
      };
    }

    case "SEARCH_PREV": {
      if (searchMatchIds.length === 0) return { state, effect: { type: "none" } };
      const nextIndex =
        (state.searchMatchIndex - 1 + searchMatchIds.length) % searchMatchIds.length;
      return {
        state: {
          ...state,
          searchMatchIndex: nextIndex,
          focusedId: searchMatchIds[nextIndex] ?? state.focusedId,
        },
        effect: { type: "none" },
      };
    }

    case "ESCAPE":
      if (state.searchQuery) {
        return {
          state: {
            ...state,
            searchQuery: "",
            searchMatchIndex: 0,
          },
          effect: { type: "clear-search-done" },
        };
      }
      return { state, effect: { type: "request-close" } };

    case "SYNC_VISIBLE": {
      const preferred =
        action.preferredId ?? state.focusedId ?? state.selectedId ?? null;
      const focusedId = nearestVisibleId(preferred, visibleIds, visibleParentById);
      const selectedId =
        state.selectedId && visibleIds.includes(state.selectedId)
          ? state.selectedId
          : focusedId;
      const searchMatchIndex = clampIndex(
        state.searchMatchIndex,
        searchMatchIds.length,
      );
      return {
        state: {
          ...state,
          focusedId,
          selectedId,
          searchMatchIndex,
        },
        effect: { type: "none" },
      };
    }

    default:
      return { state, effect: { type: "none" } };
  }
}

export function treeKeyToAction(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  options: { pageSize?: number } = {},
): TreeAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  const pageSize = options.pageSize ?? 10;

  switch (event.key) {
    case "ArrowUp":
      return { type: "MOVE_PREVIOUS" };
    case "ArrowDown":
      return { type: "MOVE_NEXT" };
    case "ArrowLeft":
      return { type: "FOLD_OR_PARENT" };
    case "ArrowRight":
      return { type: "UNFOLD_OR_CHILD" };
    case "PageUp":
      return { type: "PAGE_PREVIOUS", pageSize };
    case "PageDown":
      return { type: "PAGE_NEXT", pageSize };
    case "Home":
      return { type: "HOME" };
    case "End":
      return { type: "END" };
    case "Escape":
      return { type: "ESCAPE" };
    default:
      return null;
  }
}
