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
 * to the real host. A bare word with no `@` and no dot (`rossi`) is not a handle: it parses as
 * the host `rossi`, matches no platform, and comes out null.
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

  const domains = key ? PLATFORM_HOSTS[key] : undefined;
  if (domains) {
    const hostname = new URL(href).hostname.toLowerCase();
    if (!domains.some((domain) => hostMatches(hostname, domain))) return null;
  }
  return href;
}
