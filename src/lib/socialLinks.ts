import { safeHttpUrl } from '@/lib/publicBusiness';

/**
 * The domains a platform's link may point at, per `socialLinks` key. A stored value is
 * user-written, so a pill labelled "Instagram" must not be able to open any other site
 * (link spoofing on a public profile). `website` and unknown keys are deliberately absent:
 * they may point anywhere on http(s).
 */
const PLATFORM_HOSTS: Record<string, readonly string[]> = {
  instagram: ['instagram.com'],
  twitter: ['twitter.com', 'x.com'],
  linkedin: ['linkedin.com'],
  facebook: ['facebook.com', 'fb.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
};

/** True when `hostname` is `domain` or a subdomain of it (`www.`, `it.`, ...), never a lookalike. */
function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * The href for a stored social link, or null when it cannot be linked safely.
 *
 * Users write `socialLinks` straight to Firestore, so what is rendered as an `<a>` must be
 * re-checked here: only http(s) URLs with a host come out, so a `javascript:` or `data:`
 * value is shown as text instead. A bare host gets `https://`, and an `@handle` becomes a
 * profile URL on the platforms that have one.
 *
 * For a platform key (instagram, twitter, linkedin, facebook, youtube, tiktok) the parsed
 * hostname must also belong to that platform: `instagram.com` and its subdomains match,
 * `instagram.com.evil.example` and `evil.example/instagram.com` do not. The comparison is on
 * the URL's parsed hostname, so userinfo tricks (`https://instagram.com@evil.example`) resolve
 * to the real host. The host must contain a dot, so a bare word (`rossi`) never becomes
 * `https://rossi/`, whatever the key.
 *
 * Legacy bare Instagram/Twitter handles without the `@` (`anna`) are NOT linked: they have no dot,
 * so they come out null and the profile shows them as plain text. Guessing a profile URL from a bare
 * word would turn any junk into a link on someone's page; the editor stores `@anna` instead.
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
  const href = safeHttpUrl(/^https?:/i.test(text) ? text : `https://${text}`);
  if (!href) return null;
  // `https://rossi/` is a bare word, not a site: require a dot in the host.
  if (!new URL(href).hostname.includes('.')) return null;

  const domains = key ? PLATFORM_HOSTS[key] : undefined;
  if (domains) {
    const hostname = new URL(href).hostname.toLowerCase();
    if (!domains.some((domain) => hostMatches(hostname, domain))) return null;
  }
  return href;
}

/** Longest stored link; mirrors firestore.rules (socialLinks.*). */
export const SOCIAL_LINK_MAX_LENGTH = 200;

/**
 * What to store for a social link typed into an editor, so the value always satisfies the
 * firestore.rules for `socialLinks.*` (http(s) URL or `@handle`, at most 200 characters):
 *
 * - blank ⇒ `''` (the caller leaves the key out);
 * - an `@handle` on instagram/twitter ⇒ kept as typed (letters, digits, `.` and `_` only);
 * - anything else ⇒ the normalised https href from `socialLinkHref(value, key)`, so
 *   `yourwebsite.com` is stored as `https://yourwebsite.com/` and `linkedin.com/in/x` as
 *   `https://linkedin.com/in/x`, and a foreign host on a platform key is refused;
 * - everything invalid (`javascript:`, a bare word, too long, a handle on a platform with no
 *   handle URLs) ⇒ `null`: the editor shows an inline error and writes nothing.
 */
export function socialLinkForStorage(value: string | null | undefined, key: string): string | null {
  const text = value?.trim() ?? '';
  if (!text) return '';
  if (text.startsWith('@')) {
    const ok = (key === 'instagram' || key === 'twitter') && /^@[A-Za-z0-9._]+$/.test(text);
    return ok && text.length <= SOCIAL_LINK_MAX_LENGTH ? text : null;
  }
  const href = socialLinkHref(text, key);
  return href && href.length <= SOCIAL_LINK_MAX_LENGTH ? href : null;
}

/** The platforms the profile editor has a field for, in display order. */
export const SOCIAL_LINK_KEYS = ['instagram', 'linkedin', 'website', 'facebook', 'twitter', 'tiktok'] as const;
export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];

/**
 * The whole social-links form, checked in one go: every field through `socialLinkForStorage`.
 *
 * - `links`: what to store — normalised values of the filled fields, plus every key in `current`
 *   that the form has no field for (carried over untouched);
 * - `invalid`: the field keys that cannot be stored, in field order (empty ⇒ safe to save). The
 *   caller shows an error per key, focuses the first and writes nothing.
 */
export function normalizeSocialLinks(
  current: Record<string, string | null | undefined>
): { links: Record<string, string>; invalid: SocialLinkKey[] } {
  const known = new Set<string>(SOCIAL_LINK_KEYS);
  const links: Record<string, string> = {};
  for (const [key, value] of Object.entries(current)) {
    if (!known.has(key) && value) links[key] = value;
  }
  const invalid: SocialLinkKey[] = [];
  for (const key of SOCIAL_LINK_KEYS) {
    const stored = socialLinkForStorage(current[key], key);
    if (stored === null) invalid.push(key);
    else if (stored) links[key] = stored;
  }
  return { links, invalid };
}

/** The id of a social field's input, so a caller can move focus to the first invalid one. */
export const socialFieldId = (key: string) => `social-${key}`;
