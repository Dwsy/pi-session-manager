import { SessionSearchPlugin } from '../SessionSearchPlugin';
import type { SearchContext, SearchPluginResult } from '../../plugins/types';

function createMockContext(overrides?: Partial<SearchContext>): SearchContext {
  return {
    sessions: [],
    query: '',
    setQuery: () => {},
    isSearching: false,
    setIsSearching: () => {},
    selectedProject: null,
    setSelectedProject: () => {},
    searchCurrentProjectOnly: false,
    setSearchCurrentProjectOnly: () => {},
    selectedSession: null,
    setSelectedSession: () => {},
    closeCommandMenu: () => {},
    t: (key: string, _params?: any) => key,
    ...overrides,
  };
}

describe('SessionSearchPlugin', () => {
  it('returns results with title = directory name and subtitle = shortened path', async () => {
    const plugin = new SessionSearchPlugin();
    const sessions = [
      {
        id: 'sess1',
        path: '/projects/alpha/session1.jsonl',
        cwd: '/projects/alpha',
        name: 'My Session',
        message_count: 10,
        first_message: 'Hello world',
        modified: '2025-01-01T00:00:00Z',
      },
    ];
    const context = createMockContext({ sessions });
    const results: SearchPluginResult[] = await plugin.search('session', context);

    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    // title is directory name from cwd (last part after split)
    expect(result.title).toBe('alpha');
    // subtitle is the shortened path (60 chars default), full path under limit so unchanged
    expect(result.subtitle).toBe('/projects/alpha/session1.jsonl');
    // description should include session name and message count
    expect(result.description).toContain('My Session');
    expect(result.description).toContain('10');
  });

  it('sorts results by score descending', async () => {
    const plugin = new SessionSearchPlugin();
    const sessions = [
      {
        id: 'sess1',
        path: '/a/b/s1.jsonl',
        cwd: '/a/b',
        name: 'A',
        message_count: 1,
        first_message: 'nothing',
        modified: '2025-01-01T00:00:00Z',
      },
      {
        id: 'sess2',
        path: '/c/d/s2.jsonl',
        cwd: '/c/d',
        name: 'B',
        message_count: 1,
        first_message: 'something interesting',
        modified: '2025-01-01T00:00:00Z',
      },
    ];
    const context = createMockContext({ sessions });
    const results = await plugin.search('interesting', context);
    // sess2 has higher score due to first_message match
    if (results.length >= 2) {
      expect(results[0].id).toBe('session-sess2');
      expect(results[1].id).toBe('session-sess1');
    }
  });
});
