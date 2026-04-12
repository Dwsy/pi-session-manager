import { describe, it, expect } from 'vitest';

import {
  applyLeadingSourceFilterToken,
  parseLeadingSourceFilterToken,
} from './search';

describe('search source filter tokens', () => {
  it('parses a recognized leading token and strips it from the normalized query', () => {
    expect(parseLeadingSourceFilterToken('#labels important node')).toEqual({
      sourceFilter: 'labels_only',
      normalizedQuery: 'important node',
      token: '#labels',
    });
  });

  it('leaves unknown leading tokens untouched', () => {
    expect(parseLeadingSourceFilterToken('#unknown important')).toEqual({
      sourceFilter: null,
      normalizedQuery: '#unknown important',
      token: null,
    });
  });

  it('replaces or removes recognized source filter tokens', () => {
    expect(
      applyLeadingSourceFilterToken('#labels important node', 'content_only'),
    ).toBe('#content important node');
    expect(applyLeadingSourceFilterToken('#labels important node', 'all')).toBe(
      'important node',
    );
  });
});
