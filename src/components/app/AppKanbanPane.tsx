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
  | "onNewSession"
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
  loading?: boolean;
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
  onNewSession,
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
  loading = false,
}: AppKanbanPaneProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
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
            onNewSession={onNewSession}
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
            loading={loading}
          />
        </Suspense>
      </div>
    </div>
  );
}

export default AppKanbanPane;
