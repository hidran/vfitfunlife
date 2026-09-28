# Performance baseline (P3-3)

Recorded **2026-09-28** from commit `fb637d5` (+ P0-9 changes, which do not affect bundles).
The purpose is a fixed point to measure later improvements against. Numbers are copied
from the measurements below; nothing is estimated. Metrics that could not be collected are
marked **UNAVAILABLE**.

## 1. Frontend: first-load JS per route

Source: `npm run build:staging` (Next.js 16.1.6, `output: 'export'`). For each route, the
sizes of every `<script src="….js">` referenced by `out/<route>/index.html` are summed.
"gzip" is each file compressed at level 9 (same as `gzip -9 -c file | wc -c`), then summed.
These are the bytes a cold visit downloads before the page is interactive; they exclude
lazily loaded chunks.

| Route       | Scripts | Raw JS    | gzip     |
|-------------|--------:|----------:|---------:|
| `/`         | 17      | 1373.5 KB | 408.6 KB |
| `/terms`    | 16      | 1321.0 KB | 391.4 KB |
| `/home`     | 19      | 1466.3 KB | 433.8 KB |
| `/admin`    | 20      | 1467.7 KB | 430.9 KB |
| `/fit/gyms` | 19      | 1442.9 KB | 430.1 KB |
| `/booking`  | 21      | 1593.9 KB | 479.4 KB |

- Union of all scripts across these 6 routes: 31 files, 1925.8 KB raw / 576.9 KB gzip.
- All JS under `out/_next/static`: 144 files, 5153.3 KB raw.
- `/terms` is a static legal page, yet it loads 1.3 MB raw / 391 KB gzip. That is roughly
  the shared floor every route pays. Its largest chunks:

| Chunk (build-hash name)  | Raw      | gzip     | Identified contents |
|--------------------------|---------:|---------:|---------------------|
| `4eaa4276bff4ab21.js`    | 351.8 KB | 105.8 KB | Firestore SDK (contains `firestore.googleapis.com`) |
| `16bdec62c5fd1562.js`    | 219.2 KB | 68.3 KB  | React DOM |
| `88a326f52dfbc74f.js`    | 177.4 KB | 45.8 KB  | not identified |
| `a6dad97d9634a72d.js`    | 110.0 KB | 38.5 KB  | not identified |
| `0d816c22e417b8ce.js`    | 107.4 KB | 29.7 KB  | not identified |
| `dab05c12a0f4d0fc.js`    | 96.3 KB  | 27.4 KB  | not identified |

Chunk names change with each build. Re-measure by running the same procedure; the script
is below.

<details><summary>Measurement script</summary>

```js
// node measure.mjs out
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const out = process.argv[2];
for (const r of ["/", "/terms", "/home", "/admin", "/fit/gyms", "/booking"]) {
  const html = fs.readFileSync(path.join(out, r, "index.html"), "utf8");
  const srcs = new Set([...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)].map((m) => m[1]));
  let raw = 0, gz = 0;
  for (const s of srcs) { const b = fs.readFileSync(path.join(out, s)); raw += b.length; gz += zlib.gzipSync(b, { level: 9 }).length; }
  console.log(r, srcs.size, (raw / 1024).toFixed(1), (gz / 1024).toFixed(1));
}
```
</details>

## 2. Cloud Functions latency and cold starts

Source: Cloud Run request logs (`log_id("run.googleapis.com/requests")`, field
`httpRequest.latency`). The window is the last 7 days (2026-09-21 → 2026-09-28), and the
logs were read-only. CORS preflights (`OPTIONS`) and 4xx responses are excluded. Latency is
end-to-end at the Cloud Run front end, so a request that hit a cold instance includes the
cold-start time.

### Requested hot callables

| Function            | Staging (n / p50 / p95) | Prod (n / p50 / p95) |
|---------------------|-------------------------|----------------------|
| `getProviderSlots`  | 0 requests              | 0 requests           |
| `createBooking`     | 0 successful (1 × 401)  | 0 successful (1 × 401) |
| `chatWithAssistant` | 0 successful (1 × 401)  | 5 / 5738 ms / 51858 ms (min 3794 ms) |

**UNAVAILABLE:** meaningful p50/p95 for `getProviderSlots` and `createBooking`. They had
no successful traffic in the window. Re-measure after real booking traffic exists.

### Functions that did have traffic (prod, `vfit-funlife`)

| Function                      | n   | p50     | p95     | max     |
|-------------------------------|----:|--------:|--------:|--------:|
| processcompletedbookings (sched) | 336 | 3923 ms | 5024 ms | 9358 ms |
| sendbookingreminders (sched)  | 168 | 3948 ms | 4998 ms | 9382 ms |
| remindtrainertocomplete (sched) | 168 | 3787 ms | 4372 ms | 5120 ms |
| autoconfirmpayments (sched)   | 168 | 4056 ms | 4929 ms | 5310 ms |
| decideproviderapplication     | 38  | 2068 ms | 2743 ms | 3376 ms |
| seeddefaultseason0progress    | 20  | 1314 ms | 1838 ms | 1838 ms |
| getuserstats                  | 19  | 3071 ms | 4420 ms | 4420 ms |
| getprovideronboardingsettings | 15  | 1332 ms | 1906 ms | 1906 ms |
| aggregatemetricsdaily (sched) | 7   | 6546 ms | 6944 ms | 6944 ms |
| initializeuserprofile         | 4   | 2551 ms | 2692 ms | 2692 ms |

Staging (`vfit-app-staging`) has similar numbers for the scheduled jobs: for example
processcompletedbookings has p50 3894 ms and p95 7208 ms. The callables are faster on
staging when warm, e.g. getprovideronboardingsettings has p50 100 ms and getuserstats has
p50 301 ms.

### Cold starts

Cloud Run system logs contain `"Starting new instance"` **1035** times on prod and **1001**
times on staging in 7 days. That is almost one per request. For example, the prod scheduled
jobs have 337 / 169 / 169 / 168 instance starts for 336 / 168 / 168 / 168 invocations. At
this traffic level, almost every invocation is a cold start. A warm callable responds in
roughly 100–300 ms (staging getprovideronboardingsettings / getuserstats p50); a cold one
typically takes 1.3–4 s.

Also observed: `expirepromotions`, `expirevipsubscriptions` and `cleanupoldnotifications`
returned **HTTP 500 on every run** in the window, on both projects. This is not a
performance issue, but it showed up in the same logs.

## 3. Firestore usage

Source: Cloud Monitoring `firestore.googleapis.com/document/{read,write,delete}_count`,
summed per UTC day for 2026-09-21 → 2026-09-27 (7 full days).

| Project            | Reads (7d) | Reads/day avg | Writes (7d) | Deletes (7d) |
|--------------------|-----------:|--------------:|------------:|-------------:|
| `vfit-funlife`     | 9330       | 1333          | 286         | 0            |
| `vfit-app-staging` | 2322       | 332           | 115         | 4            |

Daily prod reads: 1160, 4358, 899, 1270, 621, 412, 610. The source of the 4358 peak on
2026-09-22 was not investigated.
Daily staging reads: 87, 519, 189, 275, 398, 449, 405.

## How to re-collect

```bash
# 1. Bundles
npm run build:staging && npm run check:bundle   # or: node measure.mjs out

# 2. Function latency (repeat with -P vfit-app-staging); parse httpRequest.latency
gcloud logging read 'resource.type=cloud_run_revision AND log_id(run.googleapis.com/requests)' \
  --project vfit-funlife --freshness=7d --limit=20000 --format=json > requests.json
# cold starts
gcloud logging read 'resource.type=cloud_run_revision AND textPayload:"Starting new instance"' \
  --project vfit-funlife --freshness=7d --limit=5000 --format='value(resource.labels.service_name)' | sort | uniq -c

# 3. Firestore reads/day (Monitoring API v3)
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://monitoring.googleapis.com/v3/projects/vfit-funlife/timeSeries?filter=metric.type%3D%22firestore.googleapis.com%2Fdocument%2Fread_count%22&interval.startTime=START&interval.endTime=END&aggregation.alignmentPeriod=86400s&aggregation.perSeriesAligner=ALIGN_SUM&aggregation.crossSeriesReducer=REDUCE_SUM"
```

## Bundle budget (P3-2)

`scripts/check-bundle-budget.mjs` (`npm run check:bundle`) runs the section 1 measurement
against `out/` and exits non-zero if any route is over its budget. Run it after any build:
`npm run build:staging && npm run check:bundle`. There is no CI workflow in the repo yet
(no `.github/workflows`). When one is added, run this right after the build step.

Budgets are about 5% above the sizes measured on 2026-09-28, after P2-10 (thumbnails),
P3-1 (lazy Performance Monitoring) and P3-5 (WebP landing images):

| Route       | Measured raw | Budget raw | Measured gzip | Budget gzip |
|-------------|-------------:|-----------:|--------------:|------------:|
| `/`         | 1377.4 KB    | 1446 KB    | 410.0 KB      | 431 KB      |
| `/terms`    | 1324.8 KB    | 1391 KB    | 392.7 KB      | 412 KB      |
| `/home`     | 1471.1 KB    | 1545 KB    | 435.5 KB      | 457 KB      |
| `/admin`    | 1472.1 KB    | 1546 KB    | 432.6 KB      | 454 KB      |
| `/fit/gyms` | 1437.8 KB    | 1510 KB    | 428.5 KB      | 450 KB      |
| `/booking`  | 1588.3 KB    | 1668 KB    | 477.5 KB      | 501 KB      |

If a change legitimately grows a route, re-measure and raise that budget in the same
commit, and give the reason in the commit message.

## Performance Monitoring (P3-1)

`src/lib/perf.ts` sets up Firebase Performance Monitoring for the web. The SDK
(`firebase/performance`, about 27 KB raw in its own chunk) is loaded with a dynamic import
after the `load` event and `requestIdleCallback`. It is not part of any route's first-load
JS. `/` measured 1376.3 KB without the hook and 1377.4 KB with it: +1.1 KB raw and +0.5 KB
gzip for the scheduling code. It is enabled only in deployed web builds (production
`NODE_ENV`, project and app id set, emulators off) and is skipped in the Capacitor native
shells.

Custom traces are `admin_dashboard_stats` and `provider_dashboard_stats`, with an `outcome`
attribute of `ok` or `error`. To add one, wrap the call in `trace(name, fn)` from
`@/lib/perf`. When monitoring is off, `trace` just runs `fn`. Measurements taken before the
SDK has loaded are buffered and recorded once it is ready.
