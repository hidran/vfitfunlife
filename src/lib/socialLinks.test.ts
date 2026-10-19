import { describe, it, expect } from 'vitest';
import { socialLinkForStorage, socialLinkHref } from './socialLinks';

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

    it('never links a bare word, on a platform key or on website (legacy handle "anna" stays plain text)', () => {
      expect(socialLinkHref('rossi', 'website')).toBeNull();
      expect(socialLinkHref('https://rossi', 'website')).toBeNull();
      expect(socialLinkHref('anna', 'instagram')).toBeNull();
      expect(socialLinkHref('localhost', undefined)).toBeNull();
      expect(socialLinkHref('rossi.fit', 'website')).toBe('https://rossi.fit/');
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

describe('socialLinkForStorage', () => {
  it('stores placeholder-style input as https URLs', () => {
    expect(socialLinkForStorage('yourwebsite.com', 'website')).toBe('https://yourwebsite.com/');
    expect(socialLinkForStorage('linkedin.com/in/x', 'linkedin')).toBe('https://linkedin.com/in/x');
    expect(socialLinkForStorage('facebook.com/username', 'facebook')).toBe('https://facebook.com/username');
    expect(socialLinkForStorage('  https://example.com/me ', 'website')).toBe('https://example.com/me');
  });

  it('keeps an @handle for instagram and twitter only', () => {
    expect(socialLinkForStorage('@anna.verdi', 'instagram')).toBe('@anna.verdi');
    expect(socialLinkForStorage('@anna_v', 'twitter')).toBe('@anna_v');
    expect(socialLinkForStorage('@anna', 'linkedin')).toBeNull();
    expect(socialLinkForStorage('@a/b', 'instagram')).toBeNull();
    expect(socialLinkForStorage('@', 'instagram')).toBeNull();
  });

  it('returns an empty string for blank input', () => {
    expect(socialLinkForStorage('   ', 'website')).toBe('');
    expect(socialLinkForStorage(undefined, 'website')).toBe('');
  });

  it('refuses scripts, bare words, foreign hosts on a platform and over-long values', () => {
    expect(socialLinkForStorage('javascript:alert(1)', 'website')).toBeNull();
    expect(socialLinkForStorage('rossi', 'website')).toBeNull();
    expect(socialLinkForStorage('anna', 'instagram')).toBeNull();
    expect(socialLinkForStorage('https://evil.example/instagram.com', 'instagram')).toBeNull();
    expect(socialLinkForStorage(`https://example.com/${'a'.repeat(200)}`, 'website')).toBeNull();
  });
});
