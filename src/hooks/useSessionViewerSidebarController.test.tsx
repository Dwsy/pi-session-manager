// @vitest-environment jsdom

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSessionViewerSidebarController } from "./useSessionViewerSidebarController";

describe("useSessionViewerSidebarController", () => {
  it("activates the selected branch while revealing its target entry", () => {
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
      result.current.handleTreeNodeClick("leaf-5", "target-5");
    });

    expect(setActiveEntryId).toHaveBeenCalledWith("leaf-5");
    expect(setScrollTargetId).toHaveBeenCalledWith("target-5");
  });
});
