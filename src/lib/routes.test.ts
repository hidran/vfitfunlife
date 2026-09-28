import { afterEach, describe, expect, it } from 'vitest';
import {
  legacyProviderPathToHref,
  providerProfileHref,
  providerReviewsHref,
  readIdParam,
} from './routes';

describe('provider routes', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('builds query-string profile and reviews URLs outside the /provider dashboard', () => {
    expect(providerProfileHref('abc123')).toBe('/providers/detail?id=abc123');
    expect(providerReviewsHref('abc123')).toBe('/providers/reviews?id=abc123');
  });

  it('encodes ids', () => {
    expect(providerProfileHref('a b/c')).toBe('/providers/detail?id=a%20b%2Fc');
  });

  it('maps legacy /provider/<id> links, with and without trailing slash', () => {
    expect(legacyProviderPathToHref('/provider/abc')).toBe('/providers/detail?id=abc');
    expect(legacyProviderPathToHref('/provider/abc/')).toBe('/providers/detail?id=abc');
    expect(legacyProviderPathToHref('/provider/abc/reviews/')).toBe('/providers/reviews?id=abc');
  });

  it('leaves dashboard routes and deeper paths alone', () => {
    expect(legacyProviderPathToHref('/provider/dashboard/')).toBeNull();
    expect(legacyProviderPathToHref('/provider/bookings/detail/')).toBeNull();
    expect(legacyProviderPathToHref('/provider/clients')).toBeNull();
    expect(legacyProviderPathToHref('/provider/')).toBeNull();
    expect(legacyProviderPathToHref('/providers/detail/')).toBeNull();
  });

  it('reads id from search params, falling back to the raw URL', () => {
    expect(readIdParam(new URLSearchParams('id=x1'))).toBe('x1');
    window.history.replaceState(null, '', '/providers/detail/?id=fromUrl');
    expect(readIdParam(new URLSearchParams())).toBe('fromUrl');
    window.history.replaceState(null, '', '/providers/detail/');
    expect(readIdParam(null)).toBeNull();
  });
});
