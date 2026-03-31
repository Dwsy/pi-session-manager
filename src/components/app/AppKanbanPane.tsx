import {
  Suspense,
  type ComponentProps,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

import type KanbanBoard from "../kanban/KanbanBoard";

type KanbanBoardProps = ComponentProps<typeof KanbanBoard>;

type AppKanbanPaneBaseProps = Pick<
  KanbanBoardProps,
  | "sessions"
  | "tags"
  | "sessionTags"
  | "selectedSession"
  | "onSelectSession"
  | "onMoveSession"
  | "getTagsForSession"
  | "onToggleTag"
  | "onDeleteSession"
  | "favorites"
  | "onToggleFavorite"
  | "terminal"
  | "piPath"
  | "customCommand"
  | "resumeCommand"
  | "onCreateTag"
  | "projectFilter"
  | "filterTagIds"
  | "onFilterChange"
  | "getDescendantIds"
>;

export interface AppKanbanPaneProps extends AppKanbanPaneBaseProps {
  fallback: ReactNode;
  KanbanBoardComponent: LazyExoticComponent<ComponentType<KanbanBoardProps>>;
}

function AppKanbanPane({
  fallback,
  KanbanBoardComponent,
  sessions,
  tags,
  sessionTags,
  selectedSession,
  onSelectSession,
  onMoveSession,
  getTagsForSession,
  onToggleTag,
  onDeleteSession,
  favorites,
  onToggleFavorite,
  terminal,
  piPath,
  customCommand,
  onCreateTag,
  projectFilter,
  filterTagIds,
  onFilterChange,
  getDescendantIds,
}: AppKanbanPaneProps) {
  return (
    <Suspense fallback={fallback}>
      <KanbanBoardComponent
        sessions={sessions}
        tags={tags}
        sessionTags={sessionTags}
        selectedSession={selectedSession}
        onSelectSession={onSelectSession}
        onMoveSession={onMoveSession}
        getTagsForSession={getTagsForSession}
        onToggleTag={onToggleTag}
        onDeleteSession={onDeleteSession}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        terminal={terminal}
        piPath={piPath}
        customCommand={customCommand}
        onCreateTag={onCreateTag}
        projectFilter={projectFilter}
        filterTagIds={filterTagIds}
        onFilterChange={onFilterChange}
        getDescendantIds={getDescendantIds}
      />
    </Suspense>
  );
}

export default AppKanbanPane;
