#!/usr/bin/env node
// Refuses a Hosting deploy whose static export was compiled against a different
// Firebase project than the one being deployed to.
//
// NEXT_PUBLIC_FIREBASE_* values are inlined at build time, and a plain
// `next build` lets .env.local override .env — so a production deploy can
// silently ship staging config, breaking Google sign-in (auth/unauthorized-domain)
// and pointing the live site at the staging backend.
//
// Usage: node scripts/assert-build-project.mjs <expected-project-id>
// Runs as the hosting predeploy hook with $GCLOUD_PROJECT.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const expected = process.argv[2];
if (!expected) {
  console.error('assert-build-project: missing expected project id argument');
  process.exit(1);
}

const staticDir = fileURLToPath(new URL('../out/_next/static', import.meta.url));

function* jsFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsFiles(path);
    else if (entry.name.endsWith('.js')) yield path;
  }
}

let files;
try {
  files = [...jsFiles(staticDir)];
} catch {
  console.error(`assert-build-project: ${staticDir} not found — run the build first`);
  process.exit(1);
}

const found = new Set();
for (const file of files) {
  for (const match of readFileSync(file, 'utf8').matchAll(/projectId:"([a-z0-9-]+)"/g)) {
    found.add(match[1]);
  }
}

if (found.size === 1 && found.has(expected)) {
  console.log(`assert-build-project: out/ is built for ${expected}`);
  process.exit(0);
}

console.error(
  `assert-build-project: deploying to "${expected}" but out/ was built for ` +
    `[${[...found].join(', ') || 'no Firebase projectId found'}].\n` +
    'Rebuild with the matching env file (npm run build:prod / npm run build:staging).'
);
process.exit(1);
