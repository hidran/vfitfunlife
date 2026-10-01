import { describe, expect, it } from 'vitest';
import { markerInfoContent } from './markerInfoContent';

describe('markerInfoContent', () => {
  it('uses theme tokens, not a hard-coded dark card', () => {
    const root = markerInfoContent({ name: 'Elena', city: 'Milano', rating: '4,8', reviewsLabel: '12 reviews' });
    expect(root.className).toContain('bg-surface');
    expect(root.className).toContain('text-content');
    expect(root.getAttribute('style')).toBeNull();
    expect(root.textContent).toContain('Elena');
    expect(root.textContent).toContain('4,8');
    expect(root.textContent).toContain('(12 reviews)');
  });

  it('shows the partner badge only for partners', () => {
    const base = { name: 'A', city: 'B', rating: '5,0', reviewsLabel: '1' };
    expect(markerInfoContent(base).textContent).not.toContain('Partner');
    expect(markerInfoContent({ ...base, partnerLabel: 'Partner' }).textContent).toContain('Partner');
  });

  it('treats names as text, never as markup', () => {
    const root = markerInfoContent({
      name: '<img src=x onerror=alert(1)>',
      city: '<b>x</b>',
      rating: '4,0',
      reviewsLabel: '0',
    });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('h3')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
