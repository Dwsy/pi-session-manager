// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSessionViewerSidebarController } from './useSessionViewerSidebarController';

describe('useSessionViewerSidebarController', () => {
  it('navigates tree clicks without mutating the active entry id', () => {
    const setShowMobileMenu = vi.fn();
    const setActiveEntryId = vi.fn();
    const setScrollTargetId = vi.fn();

    const { result } = renderHook(() =>
      useSessionViewerSidebarController({
        isMobile: false,
        previewMode: false,
        mainViewOpen: false,
        setShowMobileMenu,
        setActiveEntryId,
        setScrollTargetId,
      }),
    );

    act(() => {
      result.current.handleTreeNodeClick('leaf-5', 'target-5');
    });

    expect(setActiveEntryId).not.toHaveBeenCalled();
    expect(setScrollTargetId).toHaveBeenCalledWith('target-5');
  });
});
