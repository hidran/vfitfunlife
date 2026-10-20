import { describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_KEY,
  installChunkReloadGuard,
  isChunkLoadFailure,
  reloadOnceForChunkFailure,
} from './chunkReload';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('isChunkLoadFailure', () => {
  it('recognises chunk and dynamic-import failures and the HTML-as-script SyntaxError', () => {
    expect(isChunkLoadFailure(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadFailure(new Error('Loading chunk 123 failed.'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Loading CSS chunk 9 failed.'))).toBe(true);
    expect(isChunkLoadFailure(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadFailure(new SyntaxError("Unexpected token '<'"), 'https://x/_next/static/chunks/a.js')).toBe(true);
  });

  it('ignores everything else, including a SyntaxError from elsewhere', () => {
    expect(isChunkLoadFailure(new Error('boom'))).toBe(false);
    expect(isChunkLoadFailure(new SyntaxError("Unexpected token '<'"), 'https://x/other.js')).toBe(false);
    expect(isChunkLoadFailure(new SyntaxError("Unexpected token '<'"))).toBe(false);
    expect(isChunkLoadFailure(undefined)).toBe(false);
  });
});

describe('reloadOnceForChunkFailure', () => {
  it('reloads the first time and records when', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(reloadOnceForChunkFailure({ storage, now: () => 1_000_000, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1000000');
  });

  it('does not reload again within the window (no reload loop), but may after it', () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: '1000000' });
    const reload = vi.fn();
    expect(reloadOnceForChunkFailure({ storage, now: () => 1_010_000, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(reloadOnceForChunkFailure({ storage, now: () => 1_100_000, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when sessionStorage is unavailable or throws', () => {
    const reload = vi.fn();
    expect(reloadOnceForChunkFailure({ storage: null, now: () => 1, reload })).toBe(false);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => undefined };
    expect(reloadOnceForChunkFailure({ storage: broken, now: () => 1, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('installChunkReloadGuard', () => {
  function fakeWindow() {
    const handlers: Record<string, (e: unknown) => void> = {};
    const reload = vi.fn();
    const win = {
      sessionStorage: memoryStorage(),
      location: { reload },
      addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
      removeEventListener: (type: string) => delete handlers[type],
    } as unknown as Window;
    return { win, handlers, reload };
  }

  it('reloads once for a ChunkLoadError rejection and ignores unrelated errors', () => {
    const { win, handlers, reload } = fakeWindow();
    const remove = installChunkReloadGuard(win);
    handlers.error({ error: new Error('boom'), message: 'boom', filename: '' });
    expect(reload).not.toHaveBeenCalled();
    handlers.unhandledrejection({ reason: Object.assign(new Error('x'), { name: 'ChunkLoadError' }) });
    handlers.unhandledrejection({ reason: Object.assign(new Error('x'), { name: 'ChunkLoadError' }) });
    expect(reload).toHaveBeenCalledTimes(1);
    remove();
    expect(Object.keys(handlers)).toEqual([]);
  });

  it('reloads for the HTML-as-script SyntaxError raised by a /_next/static/ file', () => {
    const { win, handlers, reload } = fakeWindow();
    installChunkReloadGuard(win);
    handlers.error({ error: new SyntaxError("Unexpected token '<'"), message: '', filename: 'https://x/_next/static/chunks/a.js' });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
