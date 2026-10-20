// Data-shape repair: `venues/{id}.address` must be a STRING (the street line) with a top-level `city`
// (src/types/venue.ts, seeds, businessVenue.ts, the /venue page, maps and search all read that). The old
// admin venue create/edit form wrote an OBJECT `{ street, city, zipCode, country }` instead, so an edited
// venue printed "[object Object]" and had no top-level `city`.
//
// For every venue whose `address` is an object this sets
//   address  = "street, zip city"   (street, then "zip city" when present; see scripts/lib/venueAddress.mjs)
//   city / zipCode / country        copied from the object ONLY where the document has no top-level value
//   lat / lng                       from the object's latitude/longitude, only when the doc has no pair
// and never overwrites an existing top-level value. Each write is guarded by the document's updateTime, so a
// venue edited between read and write is skipped, not clobbered. Idempotent: a second run reports 0 to update.
//
//   node scripts/migrate-venue-address.mjs --project vfit-app-staging           # dry run
//   node scripts/migrate-venue-address.mjs --project vfit-app-staging --apply
//   node scripts/migrate-venue-address.mjs --project vfit-funlife               # PRODUCTION: dry run first, then --apply
//
// --project is required (no emulator / default-project fallback) and must be vfit-app-staging or vfit-funlife.
// Uses Application Default Credentials, like backfill-search-tokens.mjs.

import admin from "firebase-admin";
import { venueAddressPatch } from "./lib/venueAddress.mjs";

const PROJECTS = ["vfit-app-staging", "vfit-funlife"];
const SAMPLE = 10;

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");

if (!project || !PROJECTS.includes(project)) {
  console.error(`--project is required and must be one of: ${PROJECTS.join(", ")} (got ${project ?? "nothing"}).`);
  process.exit(2);
}

// Never let a leaked emulator env redirect this run into a local emulator.
delete process.env.FIRESTORE_EMULATOR_HOST;

admin.initializeApp({ projectId: project });
const db = admin.firestore();

console.log(`${apply ? "APPLY" : "DRY RUN"} - normalizing venues.address (object -> string) on ${project}\n`);

const snap = await db.collection("venues").get();
const plan = []; // { id, ref, updateTime, patch }
const filledCounts = {};

for (const doc of snap.docs) {
  const result = venueAddressPatch(doc.data());
  if (!result) continue;
  plan.push({ id: doc.id, ref: doc.ref, updateTime: doc.updateTime, patch: result.patch });
  for (const f of result.filled) filledCounts[f] = (filledCounts[f] ?? 0) + 1;
}

const sample = (ids) => (ids.length ? ids.slice(0, SAMPLE).join(", ") + (ids.length > SAMPLE ? ", ..." : "") : "-");
console.log(`venues scanned:                 ${snap.size}`);
console.log(`venues with an object address:  ${plan.length}   [${sample(plan.map((p) => p.id))}]`);
for (const [field, n] of Object.entries(filledCounts)) console.log(`  top-level ${field.padEnd(13)} set on:  ${n}`);
console.log(`documents to update:            ${plan.length}`);

if (!apply) {
  console.log(`\nDry run: nothing written. Re-run with --apply to write.`);
  process.exit(0);
}

let written = 0;
let failed = 0;
const failures = [];
const writer = db.bulkWriter();
writer.onWriteError((err) => {
  // FAILED_PRECONDITION: the venue changed after we read it. Skip it; a re-run picks it up with fresh data.
  if (err.code === 9) return false;
  return err.failedAttempts < 5;
});

for (const { ref, updateTime, patch } of plan) {
  writer
    .update(ref, patch, { lastUpdateTime: updateTime })
    .then(() => written++)
    .catch((err) => {
      failed++;
      failures.push(`${ref.path}: ${err.code ?? ""} ${err.message}`);
    });
}
await writer.close();

console.log(`\nSummary: ${written} updated, ${failed} failed (of ${plan.length} planned).`);
for (const f of failures.slice(0, 20)) console.log(`  ! ${f}`);
process.exit(failed ? 1 : 0);
