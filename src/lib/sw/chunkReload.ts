/**
 * One automatic reload when a build chunk cannot be loaded.
 *
 * A deploy replaces the content-hashed chunks; a tab (or a stale cache) still asking for an old
 * one gets a 404, or, before hosting stopped rewriting missing `/_next/static` files, the app
 * shell as HTML ("Unexpected token '<'"). The page cannot recover by itself, but a reload fetches
 * the new shell and chunk names. Guarded by sessionStorage so a chunk that is really gone cannot
 * cause a reload loop: at most one reload per RELOAD_WINDOW_MS.
 */

export const CHUNK_RELOAD_KEY = 'vfit:chunk-reload-at';
export const RELOAD_WINDOW_MS = 30_000;

/** Whether an error or rejection reason looks like a chunk that failed to load or parse. */
export function isChunkLoadFailure(reason: unknown, filename?: string): boolean {
  const name = (reason as { name?: unknown } | null | undefined)?.name;
  const message = String((reason as { message?: unknown } | null | undefined)?.message ?? reason ?? '');
  if (name === 'ChunkLoadError') return true;
  if (/Loading (CSS )?chunk [^ ]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(message)) {
    return true;
  }
  // The HTML shell served for a script URL: a SyntaxError raised by a /_next/static/ file.
  return name === 'SyntaxError' && !!filename && filename.includes('/_next/static/');
}

interface Env {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
  reload: () => void;
}

/** Reload once per window; returns whether it did. Never throws (sessionStorage may be blocked). */
export function reloadOnceForChunkFailure(env: Env): boolean {
  try {
    const last = Number(env.storage?.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (last && env.now() - last < RELOAD_WINDOW_MS) return false;
    // Without a working storage there is no way to tell a second failure from a first.
    if (!env.storage) return false;
    env.storage.setItem(CHUNK_RELOAD_KEY, String(env.now()));
    env.reload();
    return true;
  } catch {
    return false;
  }
}

/** Installs the window listeners; returns a function that removes them. */
export function installChunkReloadGuard(win: Window = window): () => void {
  const env = (): Env => {
    let storage: Env['storage'] = null;
    try {
      storage = win.sessionStorage;
    } catch {
      storage = null;
    }
    return { storage, now: () => Date.now(), reload: () => win.location.reload() };
  };
  const onError = (event: ErrorEvent) => {
    if (isChunkLoadFailure(event.error ?? event.message, event.filename)) reloadOnceForChunkFailure(env());
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadFailure(event.reason)) reloadOnceForChunkFailure(env());
  };
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  return () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
  };
}
