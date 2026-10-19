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

  describe('platform keys only link to their own platform', () => {
    const cases: Array<[string, string]> = [
      ['instagram', 'https://instagram.com/anna'],
      ['instagram', 'https://www.instagram.com/anna.verdi/'],
      ['twitter', 'https://twitter.com/anna'],
      ['twitter', 'https://x.com/anna'],
      ['twitter', 'https://www.x.com/anna'],
      ['linkedin', 'https://linkedin.com/in/anna'],
      ['linkedin', 'https://www.linkedin.com/in/anna'],
      ['linkedin', 'https://it.linkedin.com/in/anna'],
      ['facebook', 'https://facebook.com/anna'],
      ['facebook', 'https://www.facebook.com/anna'],
      ['facebook', 'https://fb.com/anna'],
      ['youtube', 'https://www.youtube.com/@anna'],
      ['youtube', 'https://youtu.be/abc123'],
      ['tiktok', 'https://www.tiktok.com/@anna'],
    ];
    it.each(cases)('%s accepts %s', (key, url) => {
      expect(socialLinkHref(url, key)).toBe(new URL(url).href);
    });

    it('is case-insensitive about the host', () => {
      expect(socialLinkHref('HTTPS://WWW.Instagram.COM/anna', 'instagram')).toBe('https://www.instagram.com/anna');
    });

    it.each([
      ['instagram', 'https://evil.example'],
      ['instagram', 'https://instagram.com.evil.example/anna'],
      ['instagram', 'https://evilinstagram.com/anna'],
      ['instagram', 'https://evil.example/instagram.com/anna'],
      ['instagram', 'https://evil.example/?u=instagram.com'],
      ['instagram', 'https://instagram.com@evil.example/anna'],
      ['instagram', 'https://instagram.com.evil.example'],
      ['twitter', 'https://twitter.com.evil.example/anna'],
      ['twitter', 'https://notx.com/anna'],
      ['linkedin', 'https://linkedin.com.evil.example/in/anna'],
      ['linkedin', 'https://fakelinkedin.com/in/anna'],
      ['facebook', 'https://facebook.com.evil.example'],
      ['facebook', 'https://instagram.com/anna'],
      ['youtube', 'https://youtu.be.evil.example/abc'],
      ['tiktok', 'https://tiktok.com.evil.example/@anna'],
      ['tiktok', 'https://evil.example/tiktok.com'],
    ])('%s rejects the lookalike or foreign host %s', (key, url) => {
      expect(socialLinkHref(url, key)).toBeNull();
    });

    it('rejects javascript: and data: values on platform keys', () => {
      for (const key of ['instagram', 'twitter', 'linkedin', 'facebook', 'youtube', 'tiktok']) {
        expect(socialLinkHref('javascript:alert(1)', key)).toBeNull();
        expect(socialLinkHref('data:text/html,<script>alert(1)</script>', key)).toBeNull();
      }
    });

    it('turns a bare platform host into an https URL', () => {
      expect(socialLinkHref('instagram.com/foo', 'instagram')).toBe('https://instagram.com/foo');
      expect(socialLinkHref('www.linkedin.com/in/foo', 'linkedin')).toBe('https://www.linkedin.com/in/foo');
      expect(socialLinkHref('x.com/foo', 'twitter')).toBe('https://x.com/foo');
    });

    it('does not treat a bare word as a handle: only @handle is', () => {
      expect(socialLinkHref('rossi', 'instagram')).toBeNull();
      expect(socialLinkHref('rossi.fit', 'instagram')).toBeNull();
      expect(socialLinkHref('@rossi', 'instagram')).toBe('https://instagram.com/rossi');
    });
  });

  it('website and unknown keys keep any http(s) host', () => {
    expect(socialLinkHref('https://anything.example/page', 'website')).toBe('https://anything.example/page');
    expect(socialLinkHref('shop.example.it', 'website')).toBe('https://shop.example.it/');
    expect(socialLinkHref('https://anything.example', 'somethingelse')).toBe('https://anything.example/');
    expect(socialLinkHref('https://anything.example')).toBe('https://anything.example/');
    expect(socialLinkHref('javascript:alert(1)', 'website')).toBeNull();
  });
});
