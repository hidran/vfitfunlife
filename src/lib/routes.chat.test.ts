import { describe, expect, it } from 'vitest';
import { chatHref, conversationHref } from './routes';

describe('chatHref', () => {
  it('addresses the thread by the other uid in the query string', () => {
    expect(chatHref('trainer-1')).toBe('/chat/detail?with=trainer-1');
  });

  it('carries optional name/photo/booking hints, encoded', () => {
    const href = chatHref('t1', { name: 'Anna Rossi', photoUrl: 'https://x/y.png?a=1&b=2', bookingId: 'b 1' });
    const url = new URL(href, 'https://app.test');
    expect(url.pathname).toBe('/chat/detail');
    expect(url.searchParams.get('with')).toBe('t1');
    expect(url.searchParams.get('name')).toBe('Anna Rossi');
    expect(url.searchParams.get('photo')).toBe('https://x/y.png?a=1&b=2');
    expect(url.searchParams.get('booking')).toBe('b 1');
  });

  it('omits empty hints', () => {
    expect(chatHref('t1', { name: null, photoUrl: '', bookingId: undefined })).toBe('/chat/detail?with=t1');
  });
});

describe('conversationHref', () => {
  it('addresses an existing conversation by id', () => {
    expect(conversationHref('a_b')).toBe('/chat/detail?id=a_b');
  });
});
