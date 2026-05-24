import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { FavoriteItem, SessionInfo, SessionTag, Tag } from "@/types";
import type { TerminalType } from "@/components/settings/types";
import type { DeleteSessionRequestOptions } from "@/components/dialogs/deleteSessionTypes";

export interface AppPluginSurfaceData {
  sessions: SessionInfo[];
  tags: Tag[];
  sessionTags: SessionTag[];
  selectedSession: SessionInfo | null;
  onSelectSession: (session: SessionInfo) => void;
  onMoveSession: (sessionId: string, fromTagId: string | null, toTagId: string, position: number) => void;
  getTagsForSession: (sessionId: string) => Tag[];
  onToggleTag: (sessionId: string, tagId: string, assigned: boolean) => void;
  onDeleteSession?: (session: SessionInfo, options?: DeleteSessionRequestOptions) => void;
  onConvertSession?: (session: SessionInfo) => void;
  onResumeSession?: (session: SessionInfo) => void | Promise<void>;
  onCopyResumeSession?: (session: SessionInfo) => void | Promise<void>;
  onNewSession?: (cwd: string) => void | Promise<void>;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: Omit<FavoriteItem, "addedAt">) => void;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  onCreateTag?: (name: string, color: string) => void;
  getDescendantIds: (tagId: string) => string[];
  liveSessionIds?: Set<string>;
  loading?: boolean;
  sourceOptions: Array<{ slug: string; label: string }>;
  onClearSelectedSession: () => void;
}

const AppPluginSurfaceDataContext = createContext<AppPluginSurfaceData | null>(null);

export interface AppPluginSurfaceDataProviderProps {
  value: AppPluginSurfaceData;
  children: ReactNode;
}

export function AppPluginSurfaceDataProvider({
  value,
  children,
}: AppPluginSurfaceDataProviderProps) {
  return (
    <AppPluginSurfaceDataContext.Provider value={value}>
      {children}
    </AppPluginSurfaceDataContext.Provider>
  );
}

export function useAppPluginSurfaceData() {
  const value = useContext(AppPluginSurfaceDataContext);
  if (!value) {
    throw new Error("App plugin surface data is not available");
  }
  return value;
}
