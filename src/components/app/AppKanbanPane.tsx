import {
  Suspense,
  useState,
  type ComponentProps,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

import type KanbanBoard from "@/components/kanban/KanbanBoard";
import { useWorkspaces, type KanbanWorkspace } from "@/hooks/useWorkspaces";
import WorkspaceSwitcher from "@/components/kanban/WorkspaceSwitcher";
import WorkspaceEditor from "@/components/kanban/WorkspaceEditor";

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
  filterTagIds,
  sourceFilterSlugs,
  onFilterChange,
  getDescendantIds,
  liveSessionIds,
  loading = false,
}: AppKanbanPaneProps) {
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    saveWorkspace,
    deleteWorkspace,
    selectWorkspace,
  } = useWorkspaces();

  const [showEditor, setShowEditor] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<KanbanWorkspace | null>(null);

  const handleCreate = () => {
    setEditingWorkspace(null);
    setShowEditor(true);
  };

  const handleEdit = (workspace: KanbanWorkspace) => {
    setEditingWorkspace(workspace);
    setShowEditor(true);
  };

  const handleSave = async (workspace: Omit<KanbanWorkspace, 'createdAt' | 'updatedAt'>) => {
    await saveWorkspace(workspace);
    setShowEditor(false);
    setEditingWorkspace(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this workspace?')) {
      await deleteWorkspace(id);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border/40 flex-shrink-0">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelect={selectWorkspace}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

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
            projectFilter={activeWorkspace.config.projectFilter}
            filterTagIds={activeWorkspace.config.filterTagIds.length > 0 ? activeWorkspace.config.filterTagIds : filterTagIds}
            sourceFilterSlugs={activeWorkspace.config.sourceFilterSlugs.length > 0 ? activeWorkspace.config.sourceFilterSlugs : sourceFilterSlugs}
            onFilterChange={onFilterChange}
            getDescendantIds={getDescendantIds}
            liveSessionIds={liveSessionIds}
            loading={loading}
          />
        </Suspense>
      </div>

      {showEditor && (
        <WorkspaceEditor
          workspace={editingWorkspace}
          sessions={sessions}
          tags={tags}
          onSave={handleSave}
          onClose={() => {
            setShowEditor(false);
            setEditingWorkspace(null);
          }}
        />
      )}
    </div>
  );
}

export default AppKanbanPane;
