import { describe, expect, it } from 'vitest';
import { deepLinkUrlToRoute } from './useDeepLink';

describe('deepLinkUrlToRoute', () => {
  it('parses session links where route segment is the URL host', () => {
    expect(deepLinkUrlToRoute('pi-session://sessions/019e4dd7-6c90-7a36-9768-e61515510cb3')).toBe(
      '/sessions/019e4dd7-6c90-7a36-9768-e61515510cb3',
    );
  });

  it('parses feature links', () => {
    expect(deepLinkUrlToRoute('pi-session://kanban')).toBe('/kanban');
  });

  it('falls back to home for unsupported links', () => {
    expect(deepLinkUrlToRoute('pi-session://unknown/path')).toBe('/');
  });
});
