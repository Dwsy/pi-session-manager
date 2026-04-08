import {
  Suspense,
  type ComponentProps,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

import type KanbanBoard from "@/components/kanban/KanbanBoard";

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
  | "onConvertSession"
  | "onResumeSession"
  | "onCopyResumeSession"
  | "favorites"
  | "onToggleFavorite"
  | "terminal"
  | "piPath"
  | "customCommand"
  | "resumeCommand"
  | "onCreateTag"
  | "projectFilter"
  | "filterTagIds"
  | "sourceFilterSlugs"
  | "onFilterChange"
  | "getDescendantIds"
  | "liveSessionIds"
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
  onConvertSession,
  onResumeSession,
  onCopyResumeSession,
  favorites,
  onToggleFavorite,
  terminal,
  piPath,
  customCommand,
  onCreateTag,
  projectFilter,
  filterTagIds,
  sourceFilterSlugs,
  onFilterChange,
  getDescendantIds,
  liveSessionIds,
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
        onConvertSession={onConvertSession}
        onResumeSession={onResumeSession}
        onCopyResumeSession={onCopyResumeSession}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        terminal={terminal}
        piPath={piPath}
        customCommand={customCommand}
        onCreateTag={onCreateTag}
        projectFilter={projectFilter}
        filterTagIds={filterTagIds}
        sourceFilterSlugs={sourceFilterSlugs}
        onFilterChange={onFilterChange}
        getDescendantIds={getDescendantIds}
        liveSessionIds={liveSessionIds}
      />
    </Suspense>
  );
}

export default AppKanbanPane;
