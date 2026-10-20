import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildPrecacheManifest,
  extractStaticRefs,
  htmlFileToUrl,
  renderServiceWorker,
  TEMPLATE_PATH,
} from '../generate-sw.mjs';

const ORIGIN = 'https://vfit-funlife.web.app';

/** The bits of Request the worker reads: url and cache mode (init wins over an existing request). */
class FakeRequest {
  url: string;
  cache: string;
  constructor(input: string | { url: string; cache?: string }, init: { cache?: string } = {}) {
    this.url = typeof input === 'string' ? new URL(input, ORIGIN).href : input.url;
    this.cache = init.cache ?? (typeof input === 'string' ? 'default' : input.cache ?? 'default');
  }
}

/** Evaluates the rendered worker with a stub `self` and returns its pure helpers. */
function loadWorker(
  urls: string[] = ['/', '/offline.html', '/manifest.json'],
  globals: Record<string, unknown> = {}
) {
  const code = renderServiceWorker(fs.readFileSync(TEMPLATE_PATH, 'utf8'), { version: 'test', urls });
  const listeners: Record<string, unknown> = {};
  const context = vm.createContext({
    self: { addEventListener: (type: string, fn: unknown) => (listeners[type] = fn), location: { origin: ORIGIN } },
    URL,
    console,
    Request: FakeRequest,
    ...globals,
  });
  vm.runInContext(code, context);
  return {
    context,
    listeners,
    routeFor: context.routeFor as (m: string, u: string, mode: string, o: string) => string | null,
    pageKey: context.pageKey as (u: string) => string,
  };
}

describe('app-shell service worker routing', () => {
  const { routeFor, pageKey, listeners } = loadWorker();
  const route = (url: string, mode = 'cors', method = 'GET') => routeFor(method, url, mode, ORIGIN);

  it('registers install/activate/fetch handlers and no push handlers', () => {
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install', 'message']);
  });

  it('never intercepts cross-origin requests (Firestore, Functions, Google APIs, Stripe)', () => {
    for (const url of [
      'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8',
      'https://europe-west1-vfit-funlife.cloudfunctions.net/registerFcmToken',
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
      'https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js',
      'https://js.stripe.com/v3/',
      'https://maps.googleapis.com/maps/api/js',
    ]) {
      expect(route(url)).toBeNull();
      expect(route(url, 'navigate')).toBeNull();
    }
  });

  it('never intercepts non-GET, Firebase reserved URLs or the worker scripts', () => {
    expect(route(`${ORIGIN}/home/`, 'navigate', 'POST')).toBeNull();
    expect(route(`${ORIGIN}/__/auth/handler?apiKey=x`, 'navigate')).toBeNull();
    expect(route(`${ORIGIN}/__/firebase/init.json`)).toBeNull();
    expect(route(`${ORIGIN}/sw.js`)).toBeNull();
    expect(route(`${ORIGIN}/firebase-messaging-sw.js?apiKey=x`)).toBeNull();
  });

  it('classifies navigations, RSC payloads, static assets and shell files', () => {
    expect(route(`${ORIGIN}/bookings/detail/?id=abc`, 'navigate')).toBe('navigate');
    expect(route(`${ORIGIN}/home/index.txt?_rsc=1x2y`)).toBe('rsc');
    expect(route(`${ORIGIN}/home/__next._tree.txt?_rsc=1`)).toBe('rsc');
    expect(route(`${ORIGIN}/_next/static/chunks/abc123.js`)).toBe('static');
    expect(route(`${ORIGIN}/_next/static/media/font.woff2`)).toBe('static');
    expect(route(`${ORIGIN}/icons/app-icon-192.png`)).toBe('static');
    expect(route(`${ORIGIN}/favicon.ico`)).toBe('static');
    expect(route(`${ORIGIN}/manifest.json`)).toBe('shell');
    expect(route(`${ORIGIN}/sitemap.xml`)).toBeNull();
  });

  it('keys pages by path with a trailing slash, ignoring the query string', () => {
    expect(pageKey(`${ORIGIN}/bookings/detail?id=abc`)).toBe(`${ORIGIN}/bookings/detail/`);
    expect(pageKey(`${ORIGIN}/bookings/detail/?id=xyz`)).toBe(`${ORIGIN}/bookings/detail/`);
    expect(pageKey(`${ORIGIN}/home/index.html`)).toBe(`${ORIGIN}/home/`);
    expect(pageKey(`${ORIGIN}/`)).toBe(`${ORIGIN}/`);
    expect(pageKey(`${ORIGIN}/offline.html`)).toBe(`${ORIGIN}/offline.html`);
  });
});

describe('generate-sw precache manifest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfit-sw-'));
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  };
  write('index.html', '<script src="/_next/static/chunks/main.js"></script>');
  write('home/index.html', '<link rel="preload" href="/_next/static/media/font.woff2" as="font"/><link rel="stylesheet" href="/_next/static/chunks/app.css"/><script>self.__next_f.push([1,"\\"/_next/static/chunks/home.js\\""])</script>');
  write('home/index.txt', 'rsc');
  write('404.html', '<script src="/_next/static/chunks/nf.js"></script>');
  write('404/index.html', 'x');
  write('_not-found/index.html', 'x');
  write('provider-legacy-redirect.html', 'x');
  write('offline.html', 'offline');
  write('manifest.json', '{}');
  write('icons/app-icon-192.png', 'png');
  write('_next/static/chunks/main.js', 'main');
  write('_next/static/chunks/home.js', 'home');
  write('_next/static/chunks/app.css', 'css');
  write('_next/static/chunks/lazy.js', 'lazy');
  write('_next/static/chunks/nf.js', 'nf');
  write('_next/static/media/font.woff2', 'font');
  write('_next/static/media/greek.woff2', 'greek');
  write('admin/index.html', '<script src="/_next/static/chunks/admin.js"></script>');
  write('_next/static/chunks/admin.js', 'admin');

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('maps HTML files to route URLs', () => {
    expect(htmlFileToUrl('index.html')).toBe('/');
    expect(htmlFileToUrl('fit/gyms/index.html')).toBe('/fit/gyms/');
    expect(htmlFileToUrl('offline.html')).toBe('/offline.html');
  });

  it('extracts static refs from tags and inline flight data', () => {
    const refs = extractStaticRefs('<script src="/_next/static/chunks/a.js"></script>"\\"/_next/static/chunks/b.js\\""');
    expect([...refs].sort()).toEqual(['/_next/static/chunks/a.js', '/_next/static/chunks/b.js']);
  });

  it('precaches routes and their first-load assets, not 404/legacy/admin pages, lazy chunks or unused fonts', () => {
    const { urls, version } = buildPrecacheManifest(dir);
    expect(urls).toEqual([
      '/',
      '/_next/static/chunks/app.css',
      '/_next/static/chunks/home.js',
      '/_next/static/chunks/main.js',
      '/_next/static/media/font.woff2',
      '/home/',
      '/icons/app-icon-192.png',
      '/manifest.json',
      '/offline.html',
    ]);
    expect(version).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes the version when any precached file changes, and only then', () => {
    const before = buildPrecacheManifest(dir).version;
    expect(buildPrecacheManifest(dir).version).toBe(before);
    write('_next/static/chunks/lazy.js', 'lazy v2');
    expect(buildPrecacheManifest(dir).version).toBe(before);
    write('home/index.html', '<script src="/_next/static/chunks/main.js"></script><link href="/_next/static/media/font.woff2"/><link href="/_next/static/chunks/app.css"/>');
    expect(buildPrecacheManifest(dir).version).not.toBe(before);
  });

  it('injects version and manifest into the template', () => {
    const sw = renderServiceWorker(fs.readFileSync(TEMPLATE_PATH, 'utf8'), { version: 'abc', urls: ['/', '/offline.html'] });
    expect(sw).toMatch(/const SW_VERSION = "[0-9a-f]{16}";/);
    expect(sw).toContain(`const PRECACHE_URLS = ["/","/offline.html"];`);
    expect(() => renderServiceWorker('nothing', { version: 'x', urls: [] })).toThrow(/markers/);
  });

  it("folds the worker template's own hash into the version: new caching rules mean a new shell cache", () => {
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const input = { version: 'abc', urls: ['/'] };
    const version = (t: string) => /const SW_VERSION = "([0-9a-f]{16})"/.exec(renderServiceWorker(t, input))?.[1];
    expect(version(template)).toBe(version(template));
    expect(version(template + '\n// a changed rule')).not.toBe(version(template));
    expect(version(template)).not.toBe(
      /const SW_VERSION = "([0-9a-f]{16})"/.exec(renderServiceWorker(template, { ...input, version: 'other' }))?.[1]
    );
  });
});

/** A response as the worker sees it: only the fields its cache rules read. */
function res(contentType: string | null, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    type: 'basic',
    redirected: false,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    clone() {
      return this;
    },
    ...extra,
  };
}

describe('static asset caching (D1: an HTML fallback must never be cached under a chunk URL)', () => {
  const { context } = loadWorker();
  const typeMatches = context.staticTypeMatches as (p: string, ct: string | null) => boolean;
  const cacheable = context.isCacheableStatic as (p: string, r: unknown) => boolean;

  it('accepts the content types real assets are served with', () => {
    expect(typeMatches('/_next/static/chunks/a.js', 'text/javascript; charset=UTF-8')).toBe(true);
    expect(typeMatches('/_next/static/chunks/a.js', 'application/javascript')).toBe(true);
    expect(typeMatches('/_next/static/chunks/a.css', 'text/css')).toBe(true);
    expect(typeMatches('/_next/static/media/f.woff2', 'font/woff2')).toBe(true);
    expect(typeMatches('/_next/static/media/f.woff2', 'application/octet-stream')).toBe(true);
    expect(typeMatches('/icons/i.png', 'image/png')).toBe(true);
    expect(typeMatches('/icon.svg', 'image/svg+xml')).toBe(true);
    expect(typeMatches('/favicon.ico', 'image/x-icon')).toBe(true);
  });

  it('refuses text/html for every static asset, whatever the extension, and a missing type for known ones', () => {
    for (const p of ['/_next/static/chunks/a.js', '/_next/static/chunks/a.css', '/_next/static/media/f.woff2', '/icons/i.png', '/landing/x', '/favicon.ico']) {
      expect(typeMatches(p, 'text/html; charset=utf-8')).toBe(false);
      expect(typeMatches(p, 'application/xhtml+xml')).toBe(false);
    }
    expect(typeMatches('/_next/static/chunks/a.js', null)).toBe(false);
    expect(typeMatches('/_next/static/chunks/a.js', 'text/css')).toBe(false);
    expect(typeMatches('/_next/static/chunks/a.css', 'text/javascript')).toBe(false);
    expect(typeMatches('/icons/i.png', 'text/plain')).toBe(false);
  });

  it('caches only a 200, same-origin, non-redirected response of the right type', () => {
    expect(cacheable('/_next/static/chunks/a.js', res('text/javascript'))).toBe(true);
    expect(cacheable('/_next/static/chunks/a.js', res('text/html'))).toBe(false);
    expect(cacheable('/_next/static/chunks/a.js', res('text/javascript', { status: 404 }))).toBe(false);
    expect(cacheable('/_next/static/chunks/a.js', res('text/javascript', { type: 'opaque' }))).toBe(false);
    expect(cacheable('/_next/static/chunks/a.js', res('text/javascript', { redirected: true }))).toBe(false);
    expect(cacheable('/_next/static/chunks/a.js', null)).toBe(false);
  });

  /** A minimal CacheStorage over Maps, enough for handleStatic. */
  function fakeCaches(initial: Record<string, Record<string, unknown>>) {
    const stores = new Map(Object.entries(initial).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
    const bare = (r: { url?: string } | string) => (typeof r === 'string' ? r : (r.url as string)).split('?')[0];
    const open = async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        put: async (r: { url: string }, response: unknown) => void store.set(bare(r), response),
        delete: async (r: { url: string }) => store.delete(bare(r)),
        keys: async () => [...store.keys()].map((url) => ({ url })),
      };
    };
    return {
      stores,
      keys: async () => [...stores.keys()],
      open,
      match: async (r: { url: string }) => {
        for (const store of stores.values()) if (store.has(bare(r))) return store.get(bare(r));
        return undefined;
      },
    };
  }

  const request = { url: `${ORIGIN}/_next/static/chunks/6b173.js` };
  const key = `${ORIGIN}/_next/static/chunks/6b173`.concat('.js');
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('evicts an HTML response found under a script URL and serves the network copy instead', async () => {
    const html = res('text/html');
    const js = res('text/javascript');
    const caches = fakeCaches({ 'vfit-runtime': { [key]: html } });
    const worker = loadWorker(undefined, { caches, fetch: async () => js });
    const handleStatic = worker.context.handleStatic as (r: unknown) => Promise<unknown>;

    expect(await handleStatic(request)).toBe(js);
    await flush();
    expect(caches.stores.get('vfit-runtime')?.get(key)).toBeUndefined();
    // ...and the good copy was stored, in the current runtime cache.
    expect(caches.stores.get('vfit-runtime-v2')?.get(key)).toBe(js);
  });

  it('serves a good cached copy without touching the network', async () => {
    const js = res('text/javascript');
    const caches = fakeCaches({ 'vfit-runtime-v2': { [key]: js } });
    const fetchSpy = async () => {
      throw new Error('network not expected');
    };
    const worker = loadWorker(undefined, { caches, fetch: fetchSpy });
    expect(await (worker.context.handleStatic as (r: unknown) => Promise<unknown>)(request)).toBe(js);
  });

  it('does not store what the network answers with HTML (the SPA fallback for a missing chunk) or a 404', async () => {
    for (const bad of [res('text/html'), res('text/javascript', { status: 404 }), res('text/javascript', { redirected: true })]) {
      const caches = fakeCaches({});
      const worker = loadWorker(undefined, { caches, fetch: async () => bad });
      expect(await (worker.context.handleStatic as (r: unknown) => Promise<unknown>)(request)).toBe(bad);
      await flush();
      expect(caches.stores.get('vfit-runtime-v2')?.size ?? 0).toBe(0);
    }
  });

  it('activate drops the old runtime cache and shell caches of other versions, keeps the current ones', async () => {
    const shellName = vm.runInContext('SHELL_CACHE', loadWorker().context); // 'vfit-shell-' + the hashed version
    const caches = fakeCaches({
      'vfit-runtime': { a: 1 },
      'vfit-runtime-v2': { b: 1 },
      'vfit-shell-old': { c: 1 },
      [shellName]: { d: 1 },
      'unrelated': { e: 1 },
    });
    let done: Promise<unknown> = Promise.resolve();
    const worker = loadWorker(undefined, {
      caches: { ...caches, delete: async (name: string) => caches.stores.delete(name) },
    });
    (worker.context.self as { registration: unknown; clients: unknown }).registration = {};
    (worker.context.self as { registration: unknown; clients: unknown }).clients = { claim: async () => undefined };
    (worker.listeners.activate as (e: { waitUntil: (p: Promise<unknown>) => void }) => void)({ waitUntil: (p) => (done = p) });
    await done;
    expect([...caches.stores.keys()].sort()).toEqual(['unrelated', 'vfit-runtime-v2', shellName].sort());
  });
});

describe('HTTP-cache poison: a wrong answer in the browser cache is retried once with cache: "reload" (R11)', () => {
  const HTML = () => res('text/html');
  const JS = () => res('text/javascript');
  const request = new FakeRequest(`${ORIGIN}/_next/static/chunks/6b173.js`);

  /** A network whose `default` mode answers from a poisoned HTTP cache and `reload` tells the truth. */
  function poisonedNetwork(truth: unknown, poisoned: unknown) {
    const seen: string[] = [];
    return {
      seen,
      fetch: async (r: { cache: string }) => {
        seen.push(r.cache);
        return r.cache === 'reload' ? truth : poisoned;
      },
    };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** Same minimal CacheStorage as above, but small enough to stay local. */
  function caches() {
    const stores = new Map<string, Map<string, unknown>>();
    const bare = (r: { url: string } | string) => (typeof r === 'string' ? r : r.url).split('?')[0];
    return {
      stores,
      keys: async () => [...stores.keys()],
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
          put: async (r: { url: string } | string, response: unknown) => void store.set(bare(r), response),
          delete: async (r: { url: string }) => store.delete(bare(r)),
          keys: async () => [...store.keys()].map((url) => ({ url })),
        };
      },
      match: async (r: { url: string }) => {
        for (const store of stores.values()) if (store.has(bare(r))) return store.get(bare(r));
        return undefined;
      },
    };
  }

  it('handleStatic: HTML from the default mode is not served; the reload answer is, and is the one cached', async () => {
    const good = JS();
    const net = poisonedNetwork(good, HTML());
    const c = caches();
    const { context } = loadWorker(undefined, { caches: c, fetch: net.fetch });
    expect(await (context.handleStatic as (r: unknown) => Promise<unknown>)(request)).toBe(good);
    await flush();
    expect(net.seen).toEqual(['default', 'reload']);
    expect(c.stores.get('vfit-runtime-v2')?.get(request.url)).toBe(good);
  });

  it('handleStatic: after evicting a bad cached entry it goes straight to the network with reload', async () => {
    const good = JS();
    const net = poisonedNetwork(good, HTML());
    const c = caches();
    (await c.open('vfit-runtime')).put(request, HTML());
    const { context } = loadWorker(undefined, { caches: c, fetch: net.fetch });
    expect(await (context.handleStatic as (r: unknown) => Promise<unknown>)(request)).toBe(good);
    expect(net.seen).toEqual(['reload']);
  });

  it('handleStatic: a genuine 404 is asked for twice at most and is never stored', async () => {
    const missing = res('text/html', { status: 404 });
    const net = poisonedNetwork(missing, missing);
    const c = caches();
    const { context } = loadWorker(undefined, { caches: c, fetch: net.fetch });
    expect(await (context.handleStatic as (r: unknown) => Promise<unknown>)(request)).toBe(missing);
    await flush();
    expect(net.seen).toEqual(['default', 'reload']);
    expect(c.stores.get('vfit-runtime-v2')?.size ?? 0).toBe(0);
  });

  const URLS = ['/', '/offline.html', '/_next/static/chunks/a.js', '/icons/i.png', '/manifest.json', '/favicon.ico'];
  const good: Record<string, unknown> = {
    '/': res('text/html'),
    '/offline.html': res('text/html'),
    '/_next/static/chunks/a.js': res('text/javascript'),
    '/icons/i.png': res('image/png'),
    '/manifest.json': res('application/manifest+json'),
    '/favicon.ico': res('image/x-icon'),
  };

  /** Runs the install handler over a network described per path: [first answer, answer to reload]. */
  async function install(answers: Record<string, [unknown, unknown?]>) {
    const c = caches();
    const seen: Record<string, string[]> = {};
    const fetchFn = async (r: { url: string; cache: string }) => {
      const path = new URL(r.url).pathname;
      (seen[path] ??= []).push(r.cache);
      const [first, onReload] = answers[path] ?? [good[path]];
      return r.cache === 'reload' && onReload !== undefined ? onReload : first;
    };
    const worker = loadWorker(URLS, { caches: c, fetch: fetchFn });
    let done: Promise<unknown> = Promise.resolve();
    const skipWaiting = () => undefined;
    (worker.context.self as { skipWaiting: () => void }).skipWaiting = skipWaiting;
    (worker.listeners.install as (e: { waitUntil: (p: Promise<unknown>) => void }) => void)({ waitUntil: (p) => (done = p) });
    return { c, seen, done: () => done };
  }

  it('install: a hashed asset that is HTML in the HTTP cache is refetched with reload and precached', async () => {
    const js = res('text/javascript');
    const { c, seen, done } = await install({ '/_next/static/chunks/a.js': [HTML(), js] });
    await done();
    expect(seen['/_next/static/chunks/a.js']).toEqual(['default', 'reload']);
    const shell = [...c.stores.values()][0];
    expect(shell.get('/_next/static/chunks/a.js')).toBe(js);
  });

  it('install: a hashed asset that stays wrong is skipped (a miss, not a failed install)', async () => {
    const { c, done } = await install({ '/_next/static/chunks/a.js': [HTML(), HTML()] });
    await expect(done()).resolves.toBeUndefined();
    const shell = [...c.stores.values()][0];
    expect(shell.has('/_next/static/chunks/a.js')).toBe(false);
    expect(shell.has('/')).toBe(true);
  });

  it('install: icons, the manifest and the favicon must fit their type too', async () => {
    const { c, done } = await install({
      '/icons/i.png': [HTML()],
      '/manifest.json': [HTML()],
      '/favicon.ico': [HTML()],
    });
    await done();
    const shell = [...c.stores.values()][0];
    for (const path of ['/icons/i.png', '/manifest.json', '/favicon.ico']) expect(shell.has(path)).toBe(false);
    expect(shell.has('/_next/static/chunks/a.js')).toBe(true);
  });

  it('install: a required entry (/ or /offline.html) that fails aborts the install', async () => {
    for (const path of ['/', '/offline.html']) {
      const { done } = await install({ [path]: [res('text/html', { status: 500 })] });
      await expect(done()).rejects.toThrow(/required precache entry failed/);
    }
  });
});
