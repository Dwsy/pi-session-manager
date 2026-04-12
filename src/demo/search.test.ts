import { describe, expect, it } from 'vitest';

import type { DemoStore } from './types';
import { fullTextSearchDemoInStore } from './search';

const SESSION_PATH = '/tmp/demo-session.jsonl';

function createStore(): DemoStore {
  return {
    sessions: [
      {
        path: SESSION_PATH,
        id: 'demo-1',
        cwd: '/repo/demo',
        name: 'Demo session',
        created: '2026-04-11T10:00:00Z',
        modified: '2026-04-11T10:05:00Z',
        message_count: 1,
        first_message: 'alpha content',
        last_message: 'alpha content',
        last_message_role: 'user',
      },
    ],
    favorites: [],
    tags: [],
    sessionTags: [],
    entriesByPath: new Map([
      [
        SESSION_PATH,
        [
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
      ],
    ]),
    sizeBytesByPath: new Map(),
    seedByPath: new Map(),
    nextUserTagId: 1,
  };
}

describe('fullTextSearchDemoInStore', () => {
  it('dedupes label and content matches in favor of the label hit and uses label timestamps', () => {
    const store = createStore();

    const results = fullTextSearchDemoInStore(store, {
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

    const browse = fullTextSearchDemoInStore(store, {
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
