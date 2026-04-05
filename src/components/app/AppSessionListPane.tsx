import type { ComponentProps, ReactNode } from "react";

import PullToRefresh from "@/components/ui/PullToRefresh";
import SessionList from "@/components/session-list/SessionList";
import type {
  AppDesktopSidebarContentProps,
  AppDesktopSidebarSessionListCommonProps,
} from "./AppDesktopSidebarContent";

type PullToRefreshProps = ComponentProps<typeof PullToRefresh>;
type AppSessionListPaneBaseProps = Pick<
  AppDesktopSidebarContentProps,
  | "listScrollRef"
  | "sidebarSessions"
  | "sidebarLoading"
  | "sidebarHasMore"
  | "sidebarLoadingMore"
  | "onLoadMoreSidebarSessions"
>;

export interface AppSessionListPaneProps extends AppSessionListPaneBaseProps {
  isMobile: boolean;
  mobileFilterBar?: ReactNode;
  sessionListCommonProps: AppDesktopSidebarSessionListCommonProps;
  onRefreshMobile: PullToRefreshProps["onRefresh"];
}

function AppSessionListPane({
  isMobile,
  mobileFilterBar,
  listScrollRef,
  sessionListCommonProps,
  sidebarSessions,
  sidebarLoading,
  sidebarHasMore,
  sidebarLoadingMore,
  onLoadMoreSidebarSessions,
  onRefreshMobile,
}: AppSessionListPaneProps) {
  const listElement = (
    <SessionList
      {...sessionListCommonProps}
      sessions={sidebarSessions}
      loading={sidebarLoading}
      hasMore={sidebarHasMore}
      loadingMore={sidebarLoadingMore}
      onLoadMore={onLoadMoreSidebarSessions}
      scrollParentRef={listScrollRef}
    />
  );

  return (
    <>
      {isMobile && mobileFilterBar}
      {isMobile ? (
        <div className="flex-1 overflow-hidden relative">
          <PullToRefresh onRefresh={onRefreshMobile} scrollRef={listScrollRef}>
            {listElement}
          </PullToRefresh>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto" ref={listScrollRef}>
          {listElement}
        </div>
      )}
    </>
  );
}

export default AppSessionListPane;
