import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fullTextSearchBrowserDataset } from './search';

const mockLoadDatasetCache = vi.fn();

vi.mock('./core', async () => {
  const actual = await vi.importActual<typeof import('./core')>('./core');
  return {
    ...actual,
    loadDatasetCache: (...args: unknown[]) => mockLoadDatasetCache(...args),
  };
});

vi.mock('@/utils/settingsApi', () => ({
  getCachedSettings: () => ({
    search: {
      includeThinkingInSearch: false,
    },
  }),
}));

describe('fullTextSearchBrowserDataset', () => {
  beforeEach(() => {
    mockLoadDatasetCache.mockResolvedValue({
      datasetId: 'demo',
      sessions: [
        {
          info: {
            path: '/datasets/demo/session.jsonl',
            id: 'dataset-1',
            cwd: '/repo/demo',
            name: 'Dataset session',
            created: '2026-04-11T10:00:00Z',
            modified: '2026-04-11T10:05:00Z',
            message_count: 1,
            first_message: 'alpha content',
            last_message: 'alpha content',
            last_message_role: 'user',
          },
          content: '',
          path: '/datasets/demo/session.jsonl',
          relativePath: 'session.jsonl',
          fileSize: 1,
          entries: [
            {
              type: 'message',
              id: 'msg-1',
              timestamp: '2026-04-11T10:00:00Z',
              message: {
                role: 'user',
                content: [{ type: 'text', text: 'alpha content' }],
              },
            },
            {
              type: 'label',
              id: 'label-1',
              parentId: 'msg-1',
              targetId: 'msg-1',
              label: 'alpha label',
              timestamp: '2026-04-11T10:05:00Z',
            },
          ],
        },
      ],
      sessionByPath: new Map(),
    });
  });

  it('dedupes label and content matches in favor of the label hit and uses label timestamps', async () => {
    const results = await fullTextSearchBrowserDataset({
      query: 'alpha',
      sourceFilter: 'all',
      roleFilter: 'all',
      page: 0,
      pageSize: 20,
      matchMode: 'all',
      sortOrder: 'score',
    });

    expect(results.total_hits).toBe(1);
    expect(results.hits[0]?.source_type).toBe('label');
    expect(results.hits[0]?.match_reason).toBe('label');
    expect(results.hits[0]?.timestamp).toBe('2026-04-11T10:05:00Z');

    const browse = await fullTextSearchBrowserDataset({
      query: '',
      sourceFilter: 'labels_only',
      roleFilter: 'all',
      page: 0,
      pageSize: 20,
      matchMode: 'all',
      sortOrder: 'newest',
    });

    expect(browse.total_hits).toBe(1);
    expect(browse.hits[0]?.timestamp).toBe('2026-04-11T10:05:00Z');
  });
});
