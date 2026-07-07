// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import type { SessionInfo } from "@/types";

const mockRender = vi.fn(() => <span data-testid="code-review-stub" />);

vi.mock("@/plugins/runtime-host", () => ({
  usePsmPluginSessionUi: () => ({
    toolbarItems: [
      {
        id: "builtin.code-review.toolbar",
        pluginId: "builtin.code-review",
        title: "Code Review",
        render: mockRender,
      },
    ],
  }),
  PluginContributionBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PluginContributionSlot: ({ render }: { render: () => React.ReactNode }) => (
    <>{render()}</>
  ),
}));

import SessionPreviewCodeReviewHost from "./SessionPreviewCodeReviewHost";

const session: SessionInfo = {
  id: "s1",
  path: "/tmp/s.jsonl",
  cwd: "/tmp",
  created: "2026-01-01T00:00:00Z",
  modified: "2026-01-01T00:00:00Z",
  message_count: 1,
};

describe("SessionPreviewCodeReviewHost", () => {
  it("mounts code-review toolbar contribution for preview context", () => {
    render(<SessionPreviewCodeReviewHost session={session} />);
    expect(mockRender).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ path: "/tmp/s.jsonl", id: "s1" }),
      }),
    );
  });
});