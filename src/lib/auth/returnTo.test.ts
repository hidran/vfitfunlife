import { describe, expect, it } from 'vitest';
import { loginHref, safeReturnTo } from './returnTo';

describe('safeReturnTo', () => {
  it('keeps a same-origin path with its query', () => {
    expect(safeReturnTo('/courses?id=c1&lesson=2099-01-05')).toBe('/courses?id=c1&lesson=2099-01-05');
  });
  it.each([null, undefined, '', 'https://evil.example/', '//evil.example', '/\\evil.example', 'courses', 'javascript:alert(1)',
    '/a\nb', '/auth/login', '/auth', '/auth?x=1', `/${'a'.repeat(600)}`])('rejects %s', (value) => {
    expect(safeReturnTo(value as string)).toBeNull();
  });
  it('round-trips through loginHref', () => {
    const href = loginHref('/courses?id=c1&lesson=s 1');
    expect(safeReturnTo(new URL(href, 'http://x').searchParams.get('next'))).toBe('/courses?id=c1&lesson=s 1');
  });
});
