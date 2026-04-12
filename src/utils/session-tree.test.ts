import { describe, expect, it } from 'vitest';

import type { SessionEntry } from '@/types';

import { getEntryDisplayText } from './session-tree';

describe('session tree display text', () => {
  it('keeps assistant text when there is no label or tool call', () => {
    const entry: SessionEntry = {
      type: 'message',
      id: 'assistant-1',
      timestamp: '2026-04-11T10:00:00Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Assistant reply with useful context',
          },
        ],
      },
    };

    expect(getEntryDisplayText(entry)).toBe('Assistant reply with useful context');
  });
});
