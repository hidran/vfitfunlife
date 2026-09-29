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

/** Evaluates the rendered worker with a stub `self` and returns its pure helpers. */
function loadWorker(urls: string[] = ['/', '/offline.html', '/manifest.json']) {
  const code = renderServiceWorker(fs.readFileSync(TEMPLATE_PATH, 'utf8'), { version: 'test', urls });
  const listeners: Record<string, unknown> = {};
  const context = vm.createContext({
    self: { addEventListener: (type: string, fn: unknown) => (listeners[type] = fn), location: { origin: ORIGIN } },
    URL,
    console,
  });
  vm.runInContext(code, context);
  return {
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
    expect(sw).toContain(`const SW_VERSION = "abc";`);
    expect(sw).toContain(`const PRECACHE_URLS = ["/","/offline.html"];`);
    expect(() => renderServiceWorker('nothing', { version: 'x', urls: [] })).toThrow(/markers/);
  });
});
