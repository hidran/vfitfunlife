#!/usr/bin/env node
/**
 * First-load JS budget check (P3-2).
 *
 * For each key route of the static export, sums every `<script src="….js">` referenced by
 * out/<route>/index.html (raw bytes and gzip -9 bytes, the same procedure as
 * docs/performance/baseline.md) and fails if any route is over budget.
 *
 * Usage: npm run build:staging && npm run check:bundle
 *        node scripts/check-bundle-budget.mjs [outDir] [--json]
 *
 * Budgets are ~5% above the sizes measured when they were set (see baseline.md). When a
 * change legitimately grows a route, re-measure and raise the budget in the same PR, with
 * the reason in the commit message.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// KB = 1024 bytes. Measured 2026-09-28 after P2-10/P3-1/P3-5 (see baseline.md).
const BUDGETS = {
  '/': { raw: 1446, gzip: 431 },
  '/terms': { raw: 1391, gzip: 412 },
  '/home': { raw: 1545, gzip: 457 },
  '/admin': { raw: 1546, gzip: 454 },
  '/fit/gyms': { raw: 1510, gzip: 450 },
  '/booking': { raw: 1668, gzip: 501 },
};

const args = process.argv.slice(2);
const json = args.includes('--json');
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'out');

if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  console.error(`check-bundle-budget: ${outDir}/index.html not found. Run a build first (npm run build:staging).`);
  process.exit(2);
}

const kb = (n) => n / 1024;
const fmt = (n) => `${kb(n).toFixed(1)} KB`;
const gzCache = new Map();

function measure(route) {
  const html = fs.readFileSync(path.join(outDir, route, 'index.html'), 'utf8');
  const srcs = new Set(
    [...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)].map((m) => m[1].split('?')[0])
  );
  let raw = 0;
  let gzip = 0;
  for (const src of srcs) {
    const file = path.join(outDir, src.replace(/^\//, ''));
    const buf = fs.readFileSync(file);
    raw += buf.length;
    if (!gzCache.has(file)) gzCache.set(file, zlib.gzipSync(buf, { level: 9 }).length);
    gzip += gzCache.get(file);
  }
  return { route, scripts: srcs.size, raw, gzip };
}

const results = Object.keys(BUDGETS).map((route) => {
  const m = measure(route);
  const b = BUDGETS[route];
  const overRaw = kb(m.raw) > b.raw;
  const overGzip = kb(m.gzip) > b.gzip;
  return { ...m, budget: b, ok: !overRaw && !overGzip, overRaw, overGzip };
});

if (json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  console.log(
    `${pad('Route', 11)} ${lpad('Scripts', 7)} ${lpad('Raw', 10)} ${lpad('Budget', 10)} ${lpad('gzip', 9)} ${lpad('Budget', 9)}  Status`
  );
  for (const r of results) {
    console.log(
      `${pad(r.route, 11)} ${lpad(r.scripts, 7)} ${lpad(fmt(r.raw), 10)} ${lpad(`${r.budget.raw} KB`, 10)} ${lpad(fmt(r.gzip), 9)} ${lpad(`${r.budget.gzip} KB`, 9)}  ${r.ok ? 'ok' : `OVER (${[r.overRaw && 'raw', r.overGzip && 'gzip'].filter(Boolean).join(', ')})`}`
    );
  }
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(
    `\ncheck-bundle-budget: ${failed.length} route(s) over budget: ${failed.map((r) => r.route).join(', ')}`
  );
  process.exit(1);
}
if (!json) console.log('\ncheck-bundle-budget: all routes within budget.');
