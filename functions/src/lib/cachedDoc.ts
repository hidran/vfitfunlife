import { getFirestore, type DocumentData } from "firebase-admin/firestore";

/**
 * Module-scope TTL cache for a single Firestore document read.
 *
 * Built for rarely-changing config docs (feature flags, admin-tunable settings) that would
 * otherwise be read from Firestore on every invocation of a hot request path. A cache hit
 * costs nothing, and concurrent callers that land while a read is already in flight share
 * that one read (`inflight` below) instead of each issuing their own — the case that matters
 * right after a cold start or a TTL expiry, when a burst of requests would otherwise all miss
 * at once.
 *
 * Scope and staleness — read this before reusing it for something new:
 *
 * Cloud Functions v2 deploys each exported function as its own Cloud Run service with its own
 * pool of instances, and this module's cache lives in one instance's process memory. There is
 * no cache shared across instances, and none at all across two different exported functions
 * (they are different processes even when compiled from the same `lib/index.js`). Concretely:
 *
 *   - `invalidateCachedDoc(path)` right after a write clears the value for THIS instance only.
 *     That is enough to stop a function from reading back its own stale write later in the
 *     same invocation, or on the next request this same warm instance happens to serve.
 *   - It does nothing for any OTHER instance, including instances of a different exported
 *     function reading the same document on a hot path (an admin callable writing a setting
 *     and a customer-facing callable reading it are almost always different functions). Each
 *     of those keeps whatever it cached until its own `ttlMs` elapses.
 *
 * Net effect: after a write, expect up to `ttlMs` (default 60s) of staleness on instances that
 * didn't perform the write, not just "until they happen to restart." Only use this for reads
 * where that window is acceptable; if a setting needs to take effect immediately everywhere
 * (a hard security boundary, a legally-required kill switch, etc.), read it uncached instead.
 */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Read the Firestore document at `path`, cached in-process for `ttlMs` (default 60s).
 *
 * Resolves to the document's data, or `undefined` if it does not exist — a missing doc is
 * cached too, so a config doc that was never written doesn't re-hit Firestore on every call.
 */
export async function cachedDocRead<T = DocumentData>(
  path: string,
  ttlMs = 60_000,
): Promise<T | undefined> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expiresAt > now) {
    return hit.value as T | undefined;
  }

  const pending = inflight.get(path);
  if (pending) {
    return pending as Promise<T | undefined>;
  }

  const read = getFirestore()
    .doc(path)
    .get()
    .then((snap) => (snap.exists ? (snap.data() as T) : undefined));

  const tracked = read
    .then((value) => {
      cache.set(path, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      // Whether it resolved or rejected, this read is no longer in flight. On rejection
      // nothing was cached, so the next caller retries against Firestore rather than being
      // stuck replaying a failure for the rest of the TTL window.
      inflight.delete(path);
    });

  inflight.set(path, tracked);
  return tracked;
}

/** Drop a cached value immediately. Call right after writing the same document. */
export function invalidateCachedDoc(path: string): void {
  cache.delete(path);
  inflight.delete(path);
}

/** Test-only: reset all cached entries between specs. */
export function clearCachedDocCacheForTests(): void {
  cache.clear();
  inflight.clear();
}
