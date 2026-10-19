import { safeHttpUrl } from '@/lib/businessDetails';

/**
 * The href for a stored social link, or null when it cannot be linked safely.
 *
 * Users write `socialLinks` straight to Firestore, so what is rendered as an `<a>` must be
 * re-checked here: only http(s) URLs with a host come out, so a `javascript:` or `data:`
 * value is shown as text instead. A bare host gets `https://`, and an `@handle` becomes a
 * profile URL on the platforms that have one.
 */
export function socialLinkHref(value: string | null | undefined, key?: string): string | null {
  const text = value?.trim();
  if (!text) return null;

  if (text.startsWith('@')) {
    const handle = encodeURIComponent(text.slice(1));
    if (!handle) return null;
    if (key === 'instagram') return `https://instagram.com/${handle}`;
    if (key === 'twitter') return `https://twitter.com/${handle}`;
    return null;
  }

  // Anything that is not already http(s) is treated as a bare host: "javascript:alert(1)"
  // becomes "https://javascript:alert(1)", which does not parse, rather than a script URL.
  return safeHttpUrl(/^https?:/i.test(text) ? text : `https://${text}`);
}
