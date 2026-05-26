# Streaming — Live & Contenuti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let trainers attach a Twitch/YouTube channel + a visibility toggle, surface them on a "Live & Contenuti" page with embedded players, add a "Guarda il canale live" button on the trainer detail, and hide not-visible trainers from public lists.

**Architecture:** A pure `streaming.ts` URL parser + embed-URL builder feeds a `StreamEmbed` component (YouTube always; Twitch with runtime `parent` host + external-link fallback). Provider docs gain `streamingUrl` + `isPublic`; a `/live` page (grid + `?providerId=` embed view) consumes a `useLiveProviders` hook. Demo trainers seeded with real public channels.

**Tech Stack:** Next.js 16 (static export) · React 19 · TanStack Query v5 · Firebase v12 · Vitest

**Spec:** `docs/superpowers/specs/2026-05-26-streaming-live-design.md`

---

## File Structure

### New
| Path | Responsibility |
|---|---|
| `src/lib/streaming.ts` | `parseStreamUrl`, `buildEmbedUrl`, types |
| `src/lib/streaming.test.ts` | Vitest tests |
| `src/components/streaming/StreamEmbed.tsx` | Responsive iframe / external-link fallback |
| `src/components/streaming/StreamLinkEditor.tsx` | Paste-URL + validate + preview + isPublic toggle + save |
| `src/hooks/useStreaming.ts` | `useLiveProviders`, `useUpdateProviderStreaming` |
| `src/app/(main)/live/page.tsx` | Suspense wrapper |
| `src/app/(main)/live/LiveClient.tsx` | Grid + `?providerId=` embed view |
| `functions/scripts/run-seed-streams.mjs` | Local seed runner |

### Modified
| Path | Change |
|---|---|
| `src/types/instructor.ts` | Add `streamingUrl?`, `isPublic?` to `Provider` |
| `src/lib/firebase/providers.ts` | Map both in `flattenProvider`; `updateProviderStreaming`; `fetchLiveProviders`; `isPublic` filter in `fetchProviders` |
| `src/lib/firebookings.ts` | `isPublic` filter in `searchProviders` |
| `src/hooks/index.ts` | Re-export streaming hooks |
| `src/app/book/BookingClient.tsx` | "Guarda il canale live" button |
| `src/app/(main)/provider/services/page.tsx` | "Live" tab with `StreamLinkEditor` |
| (nav file) | One entry point → `/live` |
| `functions/src/seed/seedData.ts` | `generateDemoStreams()` |

---

## Task 1: streaming.ts parser + embed builder (TDD)

**Files:** Create `src/lib/streaming.ts`, `src/lib/streaming.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/streaming.test.ts
import { describe, it, expect } from 'vitest';
import { parseStreamUrl, buildEmbedUrl } from './streaming';

describe('parseStreamUrl', () => {
  it('parses youtube watch URL → video', () => {
    expect(parseStreamUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      platform: 'youtube', kind: 'video', id: 'dQw4w9WgXcQ',
    });
  });
  it('parses youtu.be short URL → video', () => {
    expect(parseStreamUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      platform: 'youtube', kind: 'video', id: 'dQw4w9WgXcQ',
    });
  });
  it('parses youtube channel UC id → channel', () => {
    expect(parseStreamUrl('https://www.youtube.com/channel/UCabc123DEF')).toEqual({
      platform: 'youtube', kind: 'channel', id: 'UCabc123DEF',
    });
  });
  it('parses youtube @handle → channel', () => {
    expect(parseStreamUrl('https://www.youtube.com/@fitchannel')).toEqual({
      platform: 'youtube', kind: 'channel', id: '@fitchannel',
    });
  });
  it('parses twitch channel', () => {
    expect(parseStreamUrl('https://twitch.tv/somechannel')).toEqual({
      platform: 'twitch', kind: 'channel', id: 'somechannel',
    });
  });
  it('returns null for unrecognized / empty', () => {
    expect(parseStreamUrl('https://example.com/foo')).toBeNull();
    expect(parseStreamUrl('')).toBeNull();
    expect(parseStreamUrl('not a url')).toBeNull();
  });
});

describe('buildEmbedUrl', () => {
  it('youtube video → /embed/<id>', () => {
    expect(buildEmbedUrl({ platform: 'youtube', kind: 'video', id: 'abc123' }, 'localhost'))
      .toBe('https://www.youtube.com/embed/abc123');
  });
  it('youtube UC channel → live_stream embed', () => {
    expect(buildEmbedUrl({ platform: 'youtube', kind: 'channel', id: 'UCxyz' }, 'localhost'))
      .toBe('https://www.youtube.com/embed/live_stream?channel=UCxyz');
  });
  it('youtube @handle channel → null (not embeddable, use fallback)', () => {
    expect(buildEmbedUrl({ platform: 'youtube', kind: 'channel', id: '@handle' }, 'localhost'))
      .toBeNull();
  });
  it('twitch → player.twitch.tv with parent host', () => {
    expect(buildEmbedUrl({ platform: 'twitch', kind: 'channel', id: 'foo' }, 'vfit-funlife.web.app'))
      .toBe('https://player.twitch.tv/?channel=foo&parent=vfit-funlife.web.app');
  });
  it('twitch with empty parent host → null', () => {
    expect(buildEmbedUrl({ platform: 'twitch', kind: 'channel', id: 'foo' }, ''))
      .toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/lib/streaming.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// src/lib/streaming.ts
export type StreamPlatform = 'youtube' | 'twitch';

export interface ParsedStream {
  platform: StreamPlatform;
  kind: 'channel' | 'video';
  id: string;
}

const YT_RESERVED = new Set(['watch', 'embed', 'channel', 'c', 'user', 'live_stream']);
const TWITCH_RESERVED = new Set(['videos', 'directory', 'p', 'settings', 'subscriptions']);

/** Parse a pasted Twitch/YouTube URL. Returns null if unrecognized. */
export function parseStreamUrl(url: string): ParsedStream | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // YouTube watch?v= / youtu.be/<id>
  const watch = trimmed.match(/[?&]v=([\w-]{11})/);
  if (watch) return { platform: 'youtube', kind: 'video', id: watch[1] };
  const short = trimmed.match(/youtu\.be\/([\w-]{11})/);
  if (short) return { platform: 'youtube', kind: 'video', id: short[1] };

  // YouTube channel by UC id
  const ch = trimmed.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (ch) return { platform: 'youtube', kind: 'channel', id: ch[1] };

  // YouTube @handle
  const handle = trimmed.match(/youtube\.com\/(@[\w.-]+)/);
  if (handle) return { platform: 'youtube', kind: 'channel', id: handle[1] };

  // YouTube /c/<name> or /user/<name>
  const named = trimmed.match(/youtube\.com\/(?:c|user)\/([\w.-]+)/);
  if (named && !YT_RESERVED.has(named[1])) {
    return { platform: 'youtube', kind: 'channel', id: named[1] };
  }

  // Twitch channel
  const tw = trimmed.match(/twitch\.tv\/([A-Za-z0-9_]{2,25})/);
  if (tw && !TWITCH_RESERVED.has(tw[1].toLowerCase())) {
    return { platform: 'twitch', kind: 'channel', id: tw[1] };
  }

  return null;
}

/**
 * Build an iframe src for a parsed stream. `parentHost` should be
 * window.location.hostname at call time (required by Twitch).
 * Returns null when not embeddable (YouTube non-UC channel handle, or
 * Twitch with no usable parent) — callers fall back to an external link.
 */
export function buildEmbedUrl(parsed: ParsedStream, parentHost: string): string | null {
  if (parsed.platform === 'youtube') {
    if (parsed.kind === 'video') {
      return `https://www.youtube.com/embed/${parsed.id}`;
    }
    // channel: only UC ids embed via live_stream
    if (parsed.id.startsWith('UC')) {
      return `https://www.youtube.com/embed/live_stream?channel=${parsed.id}`;
    }
    return null;
  }
  // twitch
  if (!parentHost) return null;
  return `https://player.twitch.tv/?channel=${parsed.id}&parent=${parentHost}`;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/lib/streaming.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/streaming.ts src/lib/streaming.test.ts
git commit -m "feat(streaming): parseStreamUrl + buildEmbedUrl (YouTube + Twitch)"
```

---

## Task 2: Provider type + flattenProvider mapping

**Files:** Modify `src/types/instructor.ts`, `src/lib/firebase/providers.ts`

- [ ] **Step 1: Add fields to Provider**

In `src/types/instructor.ts`, in `Provider`, add after `lng?: number;`:

```ts
  streamingUrl?: string;
  isPublic?: boolean;
```

- [ ] **Step 2: Map in flattenProvider**

In `src/lib/firebase/providers.ts`, in `flattenProvider`'s return object, add after the `lng:` line:

```ts
    streamingUrl: (data.streamingUrl as string) ?? undefined,
    isPublic: typeof data.isPublic === 'boolean' ? (data.isPublic as boolean) : undefined,
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` (zero errors).

```bash
git add src/types/instructor.ts src/lib/firebase/providers.ts
git commit -m "feat(types): Provider streamingUrl + isPublic + flattenProvider mapping"
```

---

## Task 3: Write helper, fetchLiveProviders, hooks, isPublic filters

**Files:** Modify `src/lib/firebase/providers.ts`, `src/lib/firebookings.ts`; Create `src/hooks/useStreaming.ts`; Modify `src/hooks/index.ts`

- [ ] **Step 1: Add updateProviderStreaming + fetchLiveProviders to providers.ts**

Ensure `updateDoc` is imported (it already is, from Task in prior work). Append:

```ts
export async function updateProviderStreaming(
  providerId: string,
  data: { streamingUrl: string; isPublic: boolean }
): Promise<void> {
  await updateDoc(doc(db, 'instructors', providerId), {
    streamingUrl: data.streamingUrl,
    isPublic: data.isPublic,
  });
}

export async function fetchLiveProviders(opts: { limit?: number } = {}): Promise<Provider[]> {
  try {
    const q = query(
      collection(db, 'instructors'),
      where('providerProfile.isVerified', '==', true)
    );
    const snap = await getDocs(q);
    let providers = snap.docs
      .map((d) => flattenProvider(d.id, d.data() as Record<string, unknown>))
      .filter((p) => !!p.streamingUrl && p.isPublic !== false);
    if (opts.limit) providers = providers.slice(0, opts.limit);
    return providers;
  } catch (error) {
    console.error('[fetchLiveProviders]', opts, error);
    return [];
  }
}
```

- [ ] **Step 2: Add isPublic filter to fetchProviders**

In `fetchProviders`'s filter chain (currently `.filter((p) => p.isActive && (!opts.onlyVerified || p.isVerified))`), add `&& p.isPublic !== false`:

```ts
      .filter((p) => p.isActive && p.isPublic !== false && (!opts.onlyVerified || p.isVerified))
```

- [ ] **Step 3: Add isPublic filter to searchProviders**

In `src/lib/firebookings.ts`, after the providers are mapped and before/within the existing filter chain, add a filter dropping `isPublic === false`. Find the mapped `providers` array; add right after the `.map(...)`:

```ts
  providers = providers.filter((p) => (p as { isPublic?: boolean }).isPublic !== false);
```

Note: `searchProviders` maps to `ProviderSearchResult` which doesn't include `isPublic`. Add `isPublic` to the mapped object first (near `lowestPrice`/`location`):

```ts
      isPublic: typeof data.isPublic === 'boolean' ? data.isPublic : undefined,
```

…and add `isPublic?: boolean;` to the `ProviderSearchResult` interface in `src/types/booking.ts`. Then the filter above works on the typed field:

```ts
  providers = providers.filter((p) => p.isPublic !== false);
```

- [ ] **Step 4: Create useStreaming.ts**

```ts
// src/hooks/useStreaming.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchLiveProviders, updateProviderStreaming } from '@/lib/firebase/providers';

export function useLiveProviders(opts: { limit?: number } = {}) {
  return useQuery({
    queryKey: ['live-providers', opts],
    queryFn: () => fetchLiveProviders(opts),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProviderStreaming(uid: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { streamingUrl: string; isPublic: boolean }) => {
      if (!uid) throw new Error('uid required');
      await updateProviderStreaming(uid, data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['provider', uid] });
      void qc.invalidateQueries({ queryKey: ['live-providers'] });
      void qc.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}
```

- [ ] **Step 5: Re-export from hooks/index.ts**

Append to `src/hooks/index.ts`:

```ts
export { useLiveProviders, useUpdateProviderStreaming } from './useStreaming';
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit` (zero errors).

```bash
git add src/lib/firebase/providers.ts src/lib/firebookings.ts src/types/booking.ts src/hooks/useStreaming.ts src/hooks/index.ts
git commit -m "feat(streaming): updateProviderStreaming, fetchLiveProviders, hooks; isPublic filters on public lists"
```

---

## Task 4: StreamEmbed + StreamLinkEditor components

**Files:** Create `src/components/streaming/StreamEmbed.tsx`, `src/components/streaming/StreamLinkEditor.tsx`

- [ ] **Step 1: StreamEmbed**

```tsx
// src/components/streaming/StreamEmbed.tsx
'use client';
import { ExternalLink } from 'lucide-react';
import { parseStreamUrl, buildEmbedUrl } from '@/lib/streaming';

interface StreamEmbedProps {
  streamingUrl: string;
  title?: string;
  className?: string;
}

export function StreamEmbed({ streamingUrl, title, className }: StreamEmbedProps) {
  const parsed = parseStreamUrl(streamingUrl);
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const embedUrl = parsed ? buildEmbedUrl(parsed, host) : null;

  if (!embedUrl) {
    return (
      <a
        href={streamingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-text-inverse ${className ?? ''}`}
      >
        <ExternalLink className="h-4 w-4" />
        Apri il canale
      </a>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl bg-black ${className ?? ''}`} style={{ aspectRatio: '16 / 9' }}>
      <iframe
        src={embedUrl}
        title={title ?? 'Live stream'}
        className="absolute inset-0 h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
```

- [ ] **Step 2: StreamLinkEditor**

```tsx
// src/components/streaming/StreamLinkEditor.tsx
'use client';
import { useState } from 'react';
import { parseStreamUrl } from '@/lib/streaming';
import { StreamEmbed } from './StreamEmbed';
import { Button } from '@/components/ui/button';

interface StreamLinkEditorProps {
  streamingUrl: string;
  isPublic: boolean;
  onSave: (data: { streamingUrl: string; isPublic: boolean }) => void;
  saving?: boolean;
}

export function StreamLinkEditor({ streamingUrl, isPublic, onSave, saving = false }: StreamLinkEditorProps) {
  const [url, setUrl] = useState(streamingUrl);
  const [pub, setPub] = useState(isPublic);

  const trimmed = url.trim();
  const parsed = trimmed ? parseStreamUrl(trimmed) : null;
  const invalid = trimmed.length > 0 && !parsed;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-text-inverse">Canale streaming (Twitch o YouTube)</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://twitch.tv/iltuocanale  o  https://youtube.com/watch?v=…"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-inverse placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--section-primary)]"
        />
        {invalid && (
          <p className="text-xs text-red-400">Link non riconosciuto (usa Twitch o YouTube)</p>
        )}
      </div>

      {parsed && (
        <div className="space-y-1">
          <p className="text-xs text-text-tertiary">Anteprima ({parsed.platform})</p>
          <StreamEmbed streamingUrl={trimmed} />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-text-inverse">
        <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} className="h-4 w-4" />
        Visibile nella lista pubblica
      </label>

      <Button
        type="button"
        onClick={() => onSave({ streamingUrl: trimmed, isPublic: pub })}
        disabled={saving || invalid}
      >
        {saving ? 'Salvataggio…' : 'Salva'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` (zero errors).

```bash
git add src/components/streaming/StreamEmbed.tsx src/components/streaming/StreamLinkEditor.tsx
git commit -m "feat(streaming): StreamEmbed + StreamLinkEditor components"
```

---

## Task 5: /live page (grid + embed view)

**Files:** Create `src/app/(main)/live/page.tsx`, `src/app/(main)/live/LiveClient.tsx`

- [ ] **Step 1: page.tsx (Suspense wrapper)**

```tsx
// src/app/(main)/live/page.tsx
import { Suspense } from 'react';
import LiveClient from './LiveClient';
import { Spinner } from '@/components/ui/Spinner';

export default function LivePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <LiveClient />
    </Suspense>
  );
}
```

- [ ] **Step 2: LiveClient.tsx**

```tsx
// src/app/(main)/live/LiveClient.tsx
'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Radio, Star } from 'lucide-react';
import { useLiveProviders } from '@/hooks/useStreaming';
import { useProvider } from '@/hooks/useProviders';
import { StreamEmbed } from '@/components/streaming/StreamEmbed';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { VenueNotFound } from '@/components/venue/VenueNotFound';

function LiveDetail({ providerId }: { providerId: string }) {
  const { data: provider, isLoading } = useProvider(providerId);
  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner size="md" /></div>;
  }
  if (!provider || !provider.streamingUrl) {
    return <VenueNotFound message="Canale non disponibile" />;
  }
  return (
    <div className="container-mobile py-6 pb-24 space-y-4">
      <Link href="/live" className="inline-flex items-center gap-1 text-sm text-text-secondary">
        <ChevronLeft className="h-4 w-4" /> Live & Contenuti
      </Link>
      <StreamEmbed streamingUrl={provider.streamingUrl} title={provider.fullName} />
      <div className="flex items-center gap-3">
        <Avatar src={provider.avatarUrl} name={provider.fullName} size="lg" />
        <div>
          <h1 className="text-lg font-bold text-text-inverse">{provider.fullName}</h1>
          <p className="text-sm text-text-tertiary">{provider.specialties.join(', ')}</p>
        </div>
      </div>
      <Link
        href={`/book?providerId=${provider.id}`}
        className="inline-flex h-11 items-center justify-center rounded-full bg-section-primary px-5 text-sm font-semibold text-background-dark"
      >
        Richiedi sessione
      </Link>
    </div>
  );
}

function LiveGrid() {
  const { data: providers = [], isLoading } = useLiveProviders();
  return (
    <div className="container-mobile py-6 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text-inverse">Live & Contenuti</h1>
        <p className="text-sm text-text-tertiary">Trainer in diretta e contenuti on-demand.</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center p-8"><Spinner size="md" /></div>
      ) : providers.length === 0 ? (
        <p className="text-sm text-text-tertiary">Nessun canale live al momento.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {providers.map((p) => (
            <Link
              key={p.id}
              href={`/live?providerId=${p.id}`}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition-colors"
            >
              <Avatar src={p.avatarUrl} name={p.fullName} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-inverse">{p.fullName}</p>
                <p className="truncate text-xs text-text-tertiary">{p.specialties.join(', ')}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/80 px-2 py-1 text-[10px] font-semibold uppercase text-white">
                <Radio className="h-3 w-3" /> Live
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LiveClient() {
  const searchParams = useSearchParams();
  const providerId = searchParams?.get('providerId') ?? undefined;
  return providerId ? <LiveDetail providerId={providerId} /> : <LiveGrid />;
}
```

(If `<Avatar>`'s prop names differ — verify `src/components/ui/Avatar.tsx`: it takes `src`, `name`, `size`. Match exactly.)

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` (zero errors).

```bash
git add 'src/app/(main)/live/page.tsx' 'src/app/(main)/live/LiveClient.tsx'
git commit -m "feat(live): /live page — streaming trainer grid + embed view"
```

---

## Task 6: "Guarda il canale live" button on trainer detail

**Files:** Modify `src/app/book/BookingClient.tsx`

- [ ] **Step 1: Add the button**

Add `import Link from 'next/link';` if not present, and `Radio` to the lucide import.

In the "Action Buttons" block:

```tsx
        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <Button variant="outline" size="sm" className="flex-1">
            <MessageCircle className="w-4 h-4 mr-2" />
            Messaggio
          </Button>
          <Button variant="secondary" size="sm" className="flex-1">
            <Calendar className="w-4 h-4 mr-2" />
            Verifica disponibilità
          </Button>
        </div>
```

…immediately after that closing `</div>`, add a conditional full-width button:

```tsx
        {provider.streamingUrl && (
          <Link
            href={`/live?providerId=${provider.id}`}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-text-inverse"
          >
            <Radio className="h-4 w-4 text-red-400" />
            Guarda il canale live
          </Link>
        )}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` (zero errors).

```bash
git add src/app/book/BookingClient.tsx
git commit -m "feat(book): 'Guarda il canale live' button when provider has a stream"
```

---

## Task 7: "Live" tab in trainer editor

**Files:** Modify `src/app/(main)/provider/services/page.tsx`

- [ ] **Step 1: Extend tab state + imports**

Add imports:

```ts
import { useUpdateProviderStreaming } from '@/hooks/useStreaming';
import { StreamLinkEditor } from '@/components/streaming/StreamLinkEditor';
```

(The file already imports `useProvider`, `useAuthStore`, `cn` from the Galleria work — verify; add any missing.)

Change the tab state union (currently `'services' | 'gallery'`):

```ts
const [activeTab, setActiveTab] = useState<'services' | 'gallery' | 'live'>('services');
```

Add the streaming mutation near the existing `useProvider(uid)` / photos hooks:

```ts
const updateStreaming = useUpdateProviderStreaming(uid);
```

- [ ] **Step 2: Add the tab button**

In the tab bar (after the "Galleria" button), add:

```tsx
<button
  type="button"
  onClick={() => setActiveTab('live')}
  className={cn(
    'border-b-2 px-3 py-2 text-sm font-medium',
    activeTab === 'live'
      ? 'border-section-primary text-text-inverse'
      : 'border-transparent text-text-secondary'
  )}
>
  Live
</button>
```

- [ ] **Step 3: Add the tab panel**

As a sibling to the existing `{activeTab === 'gallery' && (…)}` block:

```tsx
{activeTab === 'live' && (
  <div>
    {!uid ? (
      <p className="text-sm text-text-secondary">Accedi per gestire il tuo canale.</p>
    ) : (
      <StreamLinkEditor
        streamingUrl={provider?.streamingUrl ?? ''}
        isPublic={provider?.isPublic ?? true}
        saving={updateStreaming.isPending}
        onSave={(data) => updateStreaming.mutate(data)}
      />
    )}
  </div>
)}
```

(Reuse the existing `provider` from `useProvider(uid)` already in the component from the Galleria work. If it's named differently, match it.)

- [ ] **Step 4: Type-check + commit**

Run: `npx tsc --noEmit` (zero errors).

```bash
git add 'src/app/(main)/provider/services/page.tsx'
git commit -m "feat(provider): Live tab — set streaming channel + public visibility"
```

---

## Task 8: Nav entry point to /live

**Files:** Modify the VFun nav source (likely `src/lib/featureRouteContent.ts` `tv` slug target, or `src/components/layout/SideDrawer.tsx`)

- [ ] **Step 1: Find the streaming/tv nav entry**

Run: `grep -rn "fun/tv\|/fun/tv\|'tv'\|Live\|streaming" src/components/layout/SideDrawer.tsx src/lib/featureRouteContent.ts src/components/screens/FunRouteScreen.tsx | head`

- [ ] **Step 2: Point one entry to /live**

The cleanest entry: the `tv` Fun route's `primaryAction` (in `FUN_ROUTE_CONTENT.tv` within `src/lib/featureRouteContent.ts`) — set/point its action href to `/live`. If `FUN_ROUTE_CONTENT.tv` has a `primaryAction: { href, labelKey }`, set `href: '/live'`. If there's no such action, add one:

```ts
  primaryAction: { href: '/live', labelKey: 'route.fun.tv.title' },
```

(Use an existing MessageKey that reads sensibly, e.g. the tv route title. Verify the key exists in `src/i18n/messages/*`.)

If the SideDrawer has a direct VFun/streaming link instead, add a "Live" item there pointing to `/live`. Pick ONE discoverable entry point; don't add multiple.

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit` (zero errors).

```bash
git add src/lib/featureRouteContent.ts
git commit -m "feat(nav): route the VFun streaming entry to /live"
```

(Adjust `git add` to whichever file you edited.)

---

## Task 9: Seed demo streams

**Files:** Modify `functions/src/seed/seedData.ts`; Create `functions/scripts/run-seed-streams.mjs`

Functions package enforces DOUBLE QUOTES — use them in added code.

- [ ] **Step 1: Add generateDemoStreams**

Find `generateDemoProviderCoords` (`grep -n "export async function generateDemoProviderCoords" functions/src/seed/seedData.ts`), insert AFTER its closing brace:

```ts
// Real public YouTube workout VIDEO URLs (always embeddable) + a couple Twitch
// channels to exercise the Twitch path. Assigned to deterministic demo trainers.
const DEMO_STREAM_URLS: string[] = [
  "https://www.youtube.com/watch?v=UItWltVZZmE",
  "https://www.youtube.com/watch?v=ml6cT4AZdqI",
  "https://www.youtube.com/watch?v=gC_L9qAHVJ8",
  "https://www.youtube.com/watch?v=enYITYwvPAQ",
  "https://www.youtube.com/watch?v=2pLT-olgUJs",
  "https://www.youtube.com/watch?v=oAPCPjnU1wA",
  "https://www.twitch.tv/gymshark",
  "https://www.youtube.com/watch?v=cZnsLVArIt8",
];

// Deterministic demo trainer ids that get a stream (verified, public).
const DEMO_STREAM_TRAINER_IDS: string[] = [
  "provider-1",
  "demo-trainer-yoga-01",
  "demo-trainer-yoga-02",
  "demo-trainer-personal-training-01",
  "demo-trainer-pilates-01",
  "demo-trainer-hiit-01",
  "demo-trainer-cardio-01",
  "demo-trainer-functional-training-01",
];

export async function generateDemoStreams(): Promise<SeedingResult[]> {
  const results: SeedingResult[] = [];
  try {
    const batch = db.batch();
    let count = 0;
    for (let i = 0; i < DEMO_STREAM_TRAINER_IDS.length; i++) {
      const id = DEMO_STREAM_TRAINER_IDS[i];
      const streamingUrl = DEMO_STREAM_URLS[i % DEMO_STREAM_URLS.length];
      batch.set(
        db.collection("instructors").doc(id),
        { streamingUrl, isPublic: true },
        { merge: true }
      );
      count++;
    }
    await batch.commit();
    results.push({ success: true, collection: "instructors (streams)", count });
  } catch (error) {
    results.push({
      success: false,
      collection: "instructors (streams)",
      count: 0,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }
  return results;
}
```

NOTE: `provider-1` and the `demo-trainer-*-01/02` ids were created by earlier seeds (`seedSampleInstructors` + `generateDemoData`). If any id doesn't exist, `set(..., { merge: true })` still creates a thin doc — but to be safe these ids match the deterministic naming from `generateDemoData` (`demo-trainer-{slug}-NN`, zero-padded). Confirm the slug forms by checking one: the yoga trainers are `demo-trainer-yoga-01`. If the padding differs, adjust ids.

- [ ] **Step 2: Build + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: both pass.

- [ ] **Step 3: Local-run script**

```js
// functions/scripts/run-seed-streams.mjs
import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });
const mod = await import('../lib/seed/seedData.js');

console.log('[seed-streams] Starting generateDemoStreams...');
const start = Date.now();
const results = await mod.generateDemoStreams();
console.log(`[seed-streams] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(results, null, 2));
process.exit(0);
```

- [ ] **Step 4: Run the seed**

```bash
cd /Users/hidranarias/projects/vfit/functions
GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase-cli-adc.json GOOGLE_CLOUD_PROJECT=vfit-funlife node scripts/run-seed-streams.mjs
```

Expected: `{ "success": true, "collection": "instructors (streams)", "count": 8 }`.

- [ ] **Step 5: Commit**

```bash
git add functions/src/seed/seedData.ts functions/scripts/run-seed-streams.mjs
git commit -m "feat(seed): generateDemoStreams — public channels on demo trainers"
```

---

## Task 10: Final verification

- [ ] **Step 1: Unit tests** — `npm test -- --run 2>&1 | tail -20`. New `streaming.test.ts` (11) passes; pre-existing failures (home, functions emulator, auth register) unchanged.
- [ ] **Step 2: tsc + build** — `npx tsc --noEmit && npm run build 2>&1 | tail -8`. Zero TS errors; static export succeeds; `/live` appears as a static route.
- [ ] **Step 3: Manual (dev server)**
  1. As a provider, `/provider/services` → "Live" tab → paste `https://www.youtube.com/watch?v=UItWltVZZmE` → preview shows → toggle public → Salva.
  2. `/live` → that trainer appears in the grid → tap → embed plays video + "Richiedi sessione".
  3. `/book?providerId=<seeded streamer>` → "Guarda il canale live" button present → links to `/live?providerId=…`.
  4. Set a trainer `isPublic` false (via editor) → confirm they drop off `/booking` search + `/live`.
- [ ] **Step 4: No commit unless a fix was needed.**

---

## Self-Review Notes

**Spec coverage:** parser/embed → T1; Provider fields → T2; write/fetch/hooks + isPublic filters → T3; StreamEmbed/StreamLinkEditor → T4; /live page → T5; detail button → T6; trainer editor tab → T7; nav entry → T8; seed → T9; verify → T10. All spec sections covered.

**Placeholder scan:** No TBD/TODO. Task 8 says "find the nav entry then point one to /live" with a concrete grep + concrete edit shapes — bounded, not a placeholder. Avatar prop names flagged for verification in T5 (props are `src`/`name`/`size` per the component).

**Type consistency:** `ParsedStream {platform,kind,id}` consistent T1↔T4. `Provider.streamingUrl?/isPublic?` consistent T2↔T3↔T5↔T7. `updateProviderStreaming(id, {streamingUrl, isPublic})` + `useUpdateProviderStreaming` mutation arg shape `{streamingUrl, isPublic}` consistent T3↔T7. `ProviderSearchResult.isPublic?` added in T3 before it's filtered. `fetchLiveProviders` returns `Provider[]`; `useLiveProviders` + LiveClient consume `.streamingUrl`/`.avatarUrl`/`.specialties` which all exist on `Provider`.
