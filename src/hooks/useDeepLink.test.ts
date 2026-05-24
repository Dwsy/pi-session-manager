import { describe, expect, it } from 'vitest';
import { deepLinkUrlToRoute } from './useDeepLink';

describe('deepLinkUrlToRoute', () => {
  it('parses session links where route segment is the URL host', () => {
    expect(deepLinkUrlToRoute('pi-session://sessions/019e4dd7-6c90-7a36-9768-e61515510cb3')).toBe(
      '/sessions/019e4dd7-6c90-7a36-9768-e61515510cb3',
    );
  });

  it('parses feature links', () => {
    expect(deepLinkUrlToRoute('pi-session://dashboard')).toBe('/dashboard');
  });

  it('keeps plugin routes routable', () => {
    expect(deepLinkUrlToRoute('pi-session://boards/work')).toBe('/boards/work');
  });
});
