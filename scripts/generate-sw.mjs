#!/usr/bin/env node
/**
 * Post-build step: writes out/sw.js (the app-shell service worker) from
 * scripts/sw/app-shell-sw.js with the build's precache list and a content-hash version.
 *
 * Usage: next build && node scripts/generate-sw.mjs [outDir]
 *        (wired into the build, build:staging and build:prod npm scripts)
 *
 * Precached: every exported HTML route except 404 / legacy redirect pages and the staff-only
 * /admin area, every /_next/static file those pages reference (first-load JS, CSS,
 * preloaded latin fonts), the manifest, icons and /offline.html. Lazily loaded chunks,
 * other font subsets and admin pages are cached at runtime by the worker on first use. The version is a hash over every precached file's
 * path and bytes, so any deploy that changes the shell installs a new worker and drops
 * the old cache; an identical rebuild yields a byte-identical sw.js (no needless update).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_PATH = path.join(here, 'sw', 'app-shell-sw.js');

/** HTML files that must never be served as an offline copy of a route. */
const EXCLUDED_HTML = [/^404\.html$/, /^404\//, /^_not-found\//, /-legacy-redirect\.html$/, /^admin\//];
const EXTRA_FILES = ['manifest.json', 'favicon.ico', 'icon.svg', 'offline.html'];
const EXTRA_DIRS = ['icons'];

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, base));
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

/** out-relative HTML file → URL path ('home/index.html' → '/home/', 'offline.html' → '/offline.html'). */
export function htmlFileToUrl(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel;
}

/** Every /_next/static/… path referenced by an HTML document (tags and inline flight data). */
export function extractStaticRefs(html) {
  const refs = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9._~\-/@%!]+?\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|avif|ico)/g)) {
    refs.add(m[0]);
  }
  return refs;
}

/** { version, urls } for the build in `outDir`. */
export function buildPrecacheManifest(outDir) {
  const files = walk(outDir);
  const fileSet = new Set(files);
  const urls = new Set();

  for (const rel of files) {
    if (!rel.endsWith('.html') || rel.startsWith('_next/')) continue;
    if (EXCLUDED_HTML.some((re) => re.test(rel))) continue;
    if (rel !== 'index.html' && !rel.endsWith('/index.html') && rel !== 'offline.html') continue;
    urls.add(htmlFileToUrl(rel));
    for (const ref of extractStaticRefs(fs.readFileSync(path.join(outDir, rel), 'utf8'))) {
      if (fileSet.has(ref.slice(1))) urls.add(ref);
    }
  }
  for (const rel of EXTRA_FILES) if (fileSet.has(rel)) urls.add('/' + rel);
  for (const dir of EXTRA_DIRS) {
    for (const rel of walk(path.join(outDir, dir))) urls.add(`/${dir}/${rel}`);
  }

  const sorted = [...urls].sort();
  const hash = crypto.createHash('sha256');
  for (const url of sorted) {
    const rel = url.endsWith('/') ? `${url.slice(1)}index.html` : url.slice(1);
    hash.update(url);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(outDir, rel)));
    hash.update('\0');
  }
  return { version: hash.digest('hex').slice(0, 16), urls: sorted };
}

export function renderServiceWorker(template, { version, urls }) {
  const marker = '/*__PRECACHE_MANIFEST__*/ []';
  if (!template.includes(marker) || !template.includes("'__SW_VERSION__'")) {
    throw new Error('generate-sw: template markers not found in scripts/sw/app-shell-sw.js');
  }
  return template
    .replace("'__SW_VERSION__'", JSON.stringify(version))
    .replace(marker, JSON.stringify(urls, null, 0));
}

function main() {
  const outDir = path.resolve(process.argv[2] ?? 'out');
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    console.error(`generate-sw: ${outDir}/index.html not found. Run next build first.`);
    process.exit(2);
  }
  const manifest = buildPrecacheManifest(outDir);
  const sw = renderServiceWorker(fs.readFileSync(TEMPLATE_PATH, 'utf8'), manifest);
  fs.writeFileSync(path.join(outDir, 'sw.js'), sw);

  const bytes = manifest.urls.reduce((sum, url) => {
    const rel = url.endsWith('/') ? `${url.slice(1)}index.html` : url.slice(1);
    return sum + fs.statSync(path.join(outDir, rel)).size;
  }, 0);
  const pages = manifest.urls.filter((u) => u.endsWith('/') || u.endsWith('.html')).length;
  console.log(
    `generate-sw: out/sw.js version ${manifest.version} — ${manifest.urls.length} files (${pages} pages), ${(bytes / 1024 / 1024).toFixed(2)} MB precached`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
