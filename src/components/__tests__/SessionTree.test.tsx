// @vitest-environment jsdom
import { type ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';

import SessionTree from '../session-tree/SessionTree';
import i18n from '../../i18n';
import type { SessionEntry } from '@/types';

vi.mock('@/utils/settingsApi', () => ({
  getCachedSettings: () => ({
    session: {
      colorizeToolCalls: false,
    },
  }),
}));

const BASE_ENTRIES: SessionEntry[] = [
  {
    type: 'message',
    id: 'user-1',
    timestamp: '2026-04-09T10:00:00Z',
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'Original user message' }],
    },
  },
  {
    type: 'label',
    id: 'label-1',
    parentId: 'user-1',
    targetId: 'user-1',
    label: 'Raw label',
    timestamp: '2026-04-09T10:01:00Z',
  },
  {
    type: 'message',
    id: 'assistant-1',
    parentId: 'label-1',
    timestamp: '2026-04-09T10:02:00Z',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Assistant reply' }],
    },
  },
];

function renderSessionTree(props?: Partial<ComponentProps<typeof SessionTree>>) {
  const onNodeClick = vi.fn();
  const renderResult = render(
    <I18nextProvider i18n={i18n}>
      <SessionTree
        entries={BASE_ENTRIES}
        onNodeClick={onNodeClick}
        resolvedLabelsByTargetId={{ 'user-1': 'Pinned node' }}
        {...props}
      />
    </I18nextProvider>,
  );

  return { onNodeClick, ...renderResult };
}

afterEach(() => {
  cleanup();
});

describe('SessionTree', () => {
  it('does not expose Flow or Hierarchy modes while those views are disabled', () => {
    renderSessionTree({ activeLeafId: 'assistant-1' });

    expect(screen.queryByRole('button', { name: 'Flow' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hierarchy' })).toBeNull();
  });

  it('opens contributed Flow and Hierarchy tree views in a large modal with session context', () => {
    const renderFlow = vi.fn((props: any) => (
      <div data-testid="plugin-flow-view">{props.entries.length} entries · {props.filter}</div>
    ));
    const renderHierarchy = vi.fn((props: any) => (
      <div data-testid="plugin-hierarchy-view">{props.activeEntryId} · {props.labelsByTargetId['user-1']}</div>
    ));

    renderSessionTree({
      activeLeafId: 'assistant-1',
      sessionPath: '/tmp/session.jsonl',
      pluginViews: [
        {
          id: 'builtin.graph.flow',
          title: 'Flow',
          icon: 'Network',
          pluginId: 'builtin.graph',
          render: renderFlow,
        },
        {
          id: 'builtin.graph.hierarchy',
          title: 'Hierarchy',
          icon: 'GitBranch',
          pluginId: 'builtin.graph',
          render: renderHierarchy,
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));

    const flowDialog = screen.getByRole('dialog');
    expect(flowDialog).not.toBeNull();
    expect(flowDialog.parentElement).toBe(document.body);
    expect(screen.getByTestId('plugin-flow-view').textContent).toContain('3 entries · no-tools');
    expect(renderFlow).toHaveBeenCalledWith(expect.objectContaining({
      activeEntryId: 'assistant-1',
      labelsByTargetId: { 'user-1': 'Pinned node' },
      session: { path: '/tmp/session.jsonl' },
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hierarchy' }));

    expect(screen.getByTestId('plugin-hierarchy-view').textContent).toContain('assistant-1 · Pinned node');
    expect(renderHierarchy).toHaveBeenCalledWith(expect.objectContaining({
      entries: BASE_ENTRIES,
      filter: 'no-tools',
    }));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the base tree usable when a contributed tree view fails to render', () => {
    const renderBrokenView = vi.fn(() => {
      throw new Error('broken graph');
    });

    renderSessionTree({
      activeLeafId: 'assistant-1',
      pluginViews: [
        {
          id: 'builtin.graph.broken',
          title: 'Broken Graph',
          pluginId: 'builtin.graph',
          render: renderBrokenView,
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Broken Graph' }));

    expect(screen.getByText('Plugin UI failed')).not.toBeNull();
    expect(screen.getAllByText('Assistant reply').length).toBeGreaterThan(0);
    expect(screen.getByText('Thread context')).not.toBeNull();
  });

  it('shows sticky user context and rich selected-node preview', () => {
    renderSessionTree({ activeLeafId: 'assistant-1' });

    expect(screen.getByText('Thread context')).not.toBeNull();
    expect(screen.getAllByText('Original user message').length).toBeGreaterThan(0);
    expect(screen.getByText('JSONL')).not.toBeNull();
    expect(screen.getByText('row 2 of 2')).not.toBeNull();
    expect(screen.getByText('source 3 of 3')).not.toBeNull();
    expect(screen.getByText('current')).not.toBeNull();
    expect(screen.getAllByText('Assistant reply').length).toBeGreaterThan(0);
  });

  it('renders a single thread context bar for multi-turn trees', () => {
    const multiTurnEntries: SessionEntry[] = [
      ...BASE_ENTRIES,
      {
        type: 'message',
        id: 'user-2',
        parentId: 'assistant-1',
        timestamp: '2026-04-09T10:03:00Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Second user message' }],
        },
      },
      {
        type: 'message',
        id: 'assistant-2',
        parentId: 'user-2',
        timestamp: '2026-04-09T10:04:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Second assistant reply' }],
        },
      },
    ];

    renderSessionTree({ entries: multiTurnEntries, activeLeafId: 'assistant-2' });

    expect(screen.getAllByText('Thread context')).toHaveLength(1);
    expect(screen.getAllByText('Second user message').length).toBeGreaterThan(0);
  });

  it('uses resolved labels on target nodes and includes them in tree search', () => {
    renderSessionTree();

    expect(screen.getAllByText('Pinned node').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText(/search in session/i), {
      target: { value: 'Pinned' },
    });

    expect(screen.getByText('1 / 1')).not.toBeNull();
  });

  it('recomputes the tree when resolved labels change after render', () => {
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <SessionTree entries={BASE_ENTRIES} resolvedLabelsByTargetId={{}} />
      </I18nextProvider>,
    );

    expect(screen.queryByText('Pinned node')).toBeNull();

    rerender(
      <I18nextProvider i18n={i18n}>
        <SessionTree
          entries={BASE_ENTRIES}
          resolvedLabelsByTargetId={{ 'user-1': 'Pinned node' }}
        />
      </I18nextProvider>,
    );

    expect(screen.getAllByText('Pinned node').length).toBeGreaterThan(0);
  });

  it('shows only labeled target nodes when the labeled-only filter is active', () => {
    renderSessionTree();

    fireEvent.click(screen.getAllByRole('button', { name: 'Labeled' })[0]);

    expect(screen.getAllByText('Pinned node').length).toBeGreaterThan(0);
    expect(screen.queryByText('Label: Raw label')).toBeNull();
  });

  it('navigates raw label entries through the target node', () => {
    const { onNodeClick } = renderSessionTree({ filter: 'all' });

    fireEvent.click(screen.getByText('Label: Raw label'));

    expect(onNodeClick).toHaveBeenCalledWith('assistant-1', 'user-1');
  });

  it('does not jump to the newest descendant when clicking an earlier branch node', () => {
    const branchedEntries: SessionEntry[] = [
      {
        type: 'message',
        id: 'root-user',
        timestamp: '2026-04-09T10:00:00Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Root prompt' }],
        },
      },
      {
        type: 'message',
        id: 'branch-a-assistant',
        parentId: 'root-user',
        timestamp: '2026-04-09T10:01:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Original branch reply' }],
        },
      },
      {
        type: 'message',
        id: 'branch-b-assistant',
        parentId: 'root-user',
        timestamp: '2026-04-09T10:02:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Newer branch reply' }],
        },
      },
    ];
    const { onNodeClick } = renderSessionTree({
      entries: branchedEntries,
      activeLeafId: 'branch-a-assistant',
      resolvedLabelsByTargetId: {},
    });

    const rootTreeText = screen
      .getAllByText('Root prompt')
      .find((element) => element.classList.contains('tree-node-text'));

    expect(rootTreeText).toBeTruthy();
    fireEvent.click(rootTreeText!.closest('.tree-node')!);

    expect(onNodeClick).toHaveBeenCalledWith('root-user', 'root-user');
  });

  it('preserves nodes that depend on raw label entries in the tree topology', () => {
    renderSessionTree({ filter: 'all' });

    expect(screen.getAllByText('Label: Raw label').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Assistant').length).toBeGreaterThan(0);
  });
});
