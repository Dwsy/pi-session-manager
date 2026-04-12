import { createRef, forwardRef, type ComponentProps } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import SessionViewerSidebar from './SessionViewerSidebar';

const mockGetRuntimeSessionLabels = vi.fn();

vi.mock('@/runtime-data/sessionSource', () => ({
  getRuntimeSessionLabels: (...args: unknown[]) => mockGetRuntimeSessionLabels(...args),
}));

vi.mock('@/components/session-tree/SessionTree', () => {
  const MockSessionTree = forwardRef((props: any, _ref) => (
    <div data-testid="session-tree-labels">{JSON.stringify(props.resolvedLabelsByTargetId)}</div>
  ));

  return {
    __esModule: true,
    default: MockSessionTree,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderSidebar(overrides: Partial<ComponentProps<typeof SessionViewerSidebar>> = {}) {
  return render(
    <SessionViewerSidebar
      showSidebar
      isMobile={false}
      sidebarWidth={320}
      isResizing={false}
      entries={[]}
      sessionPath="/tmp/session-a.jsonl"
      activeEntryId={null}
      onCloseSidebar={vi.fn()}
      onNodeClick={vi.fn()}
      onResizeMouseDown={vi.fn()}
      treeRef={createRef()}
      sidebarRef={createRef()}
      resizeHandleRef={createRef()}
      outlineTitle="Outline"
      hideSidebarTitle="Hide sidebar"
      {...overrides}
    />,
  );
}

describe('SessionViewerSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads resolved labels from the runtime label API', async () => {
    mockGetRuntimeSessionLabels.mockResolvedValue({ 'msg-1': 'Pinned node' });

    renderSidebar();

    await waitFor(() => {
      expect(mockGetRuntimeSessionLabels).toHaveBeenCalledWith('/tmp/session-a.jsonl');
      expect(screen.getByTestId('session-tree-labels').textContent).toContain('Pinned node');
    });
  });

  it('does not fetch while hidden and fetches when opened', async () => {
    mockGetRuntimeSessionLabels.mockResolvedValue({ 'msg-1': 'Pinned node' });

    const rendered = renderSidebar({ showSidebar: false });
    expect(mockGetRuntimeSessionLabels).not.toHaveBeenCalled();

    rendered.rerender(
      <SessionViewerSidebar
        showSidebar
        isMobile={false}
        sidebarWidth={320}
        isResizing={false}
        entries={[]}
        sessionPath="/tmp/session-a.jsonl"
        activeEntryId={null}
        onCloseSidebar={vi.fn()}
        onNodeClick={vi.fn()}
        onResizeMouseDown={vi.fn()}
        treeRef={createRef()}
        sidebarRef={createRef()}
        resizeHandleRef={createRef()}
        outlineTitle="Outline"
        hideSidebarTitle="Hide sidebar"
      />,
    );

    await waitFor(() => {
      expect(mockGetRuntimeSessionLabels).toHaveBeenCalledWith('/tmp/session-a.jsonl');
      expect(screen.getByTestId('session-tree-labels').textContent).toContain('Pinned node');
    });
  });

  it('clears labels when the current session label fetch fails', async () => {
    mockGetRuntimeSessionLabels
      .mockResolvedValueOnce({ 'msg-1': 'Pinned node' })
      .mockRejectedValueOnce(new Error('boom'));

    const rendered = renderSidebar();

    await waitFor(() => {
      expect(screen.getByTestId('session-tree-labels').textContent).toContain('Pinned node');
    });

    rendered.rerender(
      <SessionViewerSidebar
        showSidebar
        isMobile={false}
        sidebarWidth={320}
        isResizing={false}
        entries={[]}
        sessionPath="/tmp/session-b.jsonl"
        activeEntryId={null}
        onCloseSidebar={vi.fn()}
        onNodeClick={vi.fn()}
        onResizeMouseDown={vi.fn()}
        treeRef={createRef()}
        sidebarRef={createRef()}
        resizeHandleRef={createRef()}
        outlineTitle="Outline"
        hideSidebarTitle="Hide sidebar"
      />,
    );

    await waitFor(() => {
      expect(mockGetRuntimeSessionLabels).toHaveBeenCalledWith('/tmp/session-b.jsonl');
      expect(screen.getByTestId('session-tree-labels').textContent).toBe('{}');
    });
  });

  it('does not reuse labels from the previous session while switching paths', async () => {
    const firstFetch = deferred<Record<string, string>>();
    const secondFetch = deferred<Record<string, string>>();
    mockGetRuntimeSessionLabels
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise);

    const rendered = renderSidebar();

    firstFetch.resolve({ 'msg-1': 'Pinned node' });
    await waitFor(() => {
      expect(screen.getByTestId('session-tree-labels').textContent).toContain('Pinned node');
    });

    rendered.rerender(
      <SessionViewerSidebar
        showSidebar
        isMobile={false}
        sidebarWidth={320}
        isResizing={false}
        entries={[]}
        sessionPath="/tmp/session-b.jsonl"
        activeEntryId={null}
        onCloseSidebar={vi.fn()}
        onNodeClick={vi.fn()}
        onResizeMouseDown={vi.fn()}
        treeRef={createRef()}
        sidebarRef={createRef()}
        resizeHandleRef={createRef()}
        outlineTitle="Outline"
        hideSidebarTitle="Hide sidebar"
      />,
    );

    await waitFor(() => {
      expect(mockGetRuntimeSessionLabels).toHaveBeenCalledWith('/tmp/session-b.jsonl');
    });
    expect(screen.getByTestId('session-tree-labels').textContent).toBe('{}');

    secondFetch.resolve({ 'msg-2': 'Second node' });
    await waitFor(() => {
      expect(screen.getByTestId('session-tree-labels').textContent).toContain('Second node');
    });
  });
});
