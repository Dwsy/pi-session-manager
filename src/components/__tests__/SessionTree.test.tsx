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
  it('uses resolved labels on target nodes and includes them in tree search', () => {
    renderSessionTree();

    expect(screen.getByText('Pinned node')).not.toBeNull();

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

    expect(screen.getByText('Pinned node')).not.toBeNull();
  });

  it('shows only labeled target nodes when the labeled-only filter is active', () => {
    renderSessionTree();

    fireEvent.click(screen.getAllByRole('button', { name: 'Labeled' })[0]);

    expect(screen.getByText('Pinned node')).not.toBeNull();
    expect(screen.queryByText('Label: Raw label')).toBeNull();
  });

  it('navigates raw label entries through the target node', () => {
    const { onNodeClick } = renderSessionTree({ filter: 'all' });

    fireEvent.click(screen.getByText('Label: Raw label'));

    expect(onNodeClick).toHaveBeenCalledWith('assistant-1', 'user-1');
  });

  it('preserves nodes that depend on raw label entries in the tree topology', () => {
    renderSessionTree({ filter: 'all' });

    expect(screen.getAllByText('Label: Raw label').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Assistant').length).toBeGreaterThan(0);
  });
});
