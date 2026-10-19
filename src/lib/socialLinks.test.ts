import { describe, it, expect } from 'vitest';
import { socialLinkHref } from './socialLinks';

describe('socialLinkHref', () => {
  it('links http(s) URLs and adds https:// to a bare host', () => {
    expect(socialLinkHref('https://example.com/me', 'website')).toBe('https://example.com/me');
    expect(socialLinkHref('HTTP://Example.com', 'website')).toBe('http://example.com/');
    expect(socialLinkHref('example.com/me', 'website')).toBe('https://example.com/me');
  });

  it('turns an @handle into a profile URL on instagram and twitter only', () => {
    expect(socialLinkHref('@anna', 'instagram')).toBe('https://instagram.com/anna');
    expect(socialLinkHref('@anna', 'twitter')).toBe('https://twitter.com/anna');
    expect(socialLinkHref('@anna', 'linkedin')).toBeNull();
    expect(socialLinkHref('@', 'instagram')).toBeNull();
    expect(socialLinkHref('@a/../b', 'instagram')).toBe('https://instagram.com/a%2F..%2Fb');
  });

  it('never produces a script or data URL', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'ftp://example.com',
    ]) {
      const href = socialLinkHref(bad, 'website');
      expect(href === null || /^https?:\/\//.test(href), bad).toBe(true);
      expect(href ?? '').not.toMatch(/^(javascript|data|vbscript):/i);
    }
    expect(socialLinkHref('javascript:alert(1)', 'website')).toBeNull();
  });

  it('returns null for empty values', () => {
    expect(socialLinkHref('', 'website')).toBeNull();
    expect(socialLinkHref('   ', 'website')).toBeNull();
    expect(socialLinkHref(null)).toBeNull();
    expect(socialLinkHref(undefined)).toBeNull();
  });
});
