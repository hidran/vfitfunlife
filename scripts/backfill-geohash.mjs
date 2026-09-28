// P2-6: give every venue and provider a `geohash`, the key the client's radius search
// (src/lib/firebase/geoQuery.ts) orders by.
//
//   - venues/*, instructors/* with coordinates -> geohash = geofire-common
//     geohashForLocation([lat, lng], 10), the same string the syncVenueGeohash /
//     syncInstructorGeohash triggers write (functions/src/geo/geohashPatch.ts).
//   - legacy docs with only address.latitude/longitude also get the flat lat/lng pair.
//   - docs with a geohash but no coordinates have it removed.
//
// Mirrors geohashPatch() exactly, so once the triggers are deployed they find nothing to do
// on backfilled docs. Each write is guarded by the doc's updateTime (lastUpdateTime
// precondition): a doc changed between read and write is skipped, not clobbered. Re-running
// is safe; a second run reports 0.
//
//   node scripts/backfill-geohash.mjs                               # emulator, dry run
//   node scripts/backfill-geohash.mjs --project vfit-app-staging    # dry run
//   node scripts/backfill-geohash.mjs --project vfit-app-staging --apply
//
// Against a real project it uses Application Default Credentials, like
// seed-demo-accounts.mjs. Side effects: each write fires the geohash triggers once (no-op,
// the patch already matches) and nothing else — onProviderServiceWrite listens to the
// services subcollection, not the instructor doc.

import admin from "firebase-admin";
import { geohashForLocation } from "geofire-common";

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");
const useEmulator = !project;
const SAMPLE = 10;
const PRECISION = 10;
const COLLECTIONS = ["venues", "instructors"];

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const projectId = project ?? "vfit-funlife";
admin.initializeApp({ projectId });
const db = admin.firestore();

const target = useEmulator ? `the emulator (${projectId})` : projectId;
console.log(`${apply ? "APPLY" : "DRY RUN"} — backfilling geohash on ${COLLECTIONS.join(", ")} of ${target}\n`);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function coordsOf(data) {
  if (isNum(data.lat) && isNum(data.lng)) return { lat: data.lat, lng: data.lng };
  const a = data.address;
  if (a && typeof a === "object" && isNum(a.latitude) && isNum(a.longitude)) {
    return { lat: a.latitude, lng: a.longitude };
  }
  return null;
}

/** Same contract as functions/src/geo/geohashPatch.ts; null geohash = delete. */
function geohashPatch(data) {
  const coords = coordsOf(data);
  if (!coords) return data.geohash !== undefined ? { geohash: null } : null;
  const patch = {};
  if (!isNum(data.lat) || !isNum(data.lng)) {
    patch.lat = coords.lat;
    patch.lng = coords.lng;
  }
  const geohash = geohashForLocation([coords.lat, coords.lng], PRECISION);
  if (data.geohash !== geohash) patch.geohash = geohash;
  return Object.keys(patch).length ? patch : null;
}

const sample = (ids) => (ids.length ? ids.slice(0, SAMPLE).join(", ") + (ids.length > SAMPLE ? ", …" : "") : "-");
const plan = []; // { ref, updateTime, patch }

for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get();
  const add = [];
  const fix = [];
  const flatten = [];
  const remove = [];
  const noCoords = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!coordsOf(data)) noCoords.push(doc.id);
    const patch = geohashPatch(data);
    if (!patch) continue;
    if (patch.geohash === null) remove.push(doc.id);
    else if (patch.geohash && data.geohash === undefined) add.push(doc.id);
    else if (patch.geohash) fix.push(doc.id);
    if ("lat" in patch) flatten.push(doc.id);
    const write = { ...patch };
    if (write.geohash === null) write.geohash = admin.firestore.FieldValue.delete();
    plan.push({ ref: doc.ref, updateTime: doc.updateTime, patch: write });
  }
  console.log(`${name}: scanned ${snap.size}`);
  console.log(`  geohash missing -> add:      ${add.length}   [${sample(add)}]`);
  console.log(`  geohash stale -> recompute:  ${fix.length}   [${sample(fix)}]`);
  console.log(`  legacy address coords -> flat lat/lng: ${flatten.length}   [${sample(flatten)}]`);
  console.log(`  no coordinates (left unsearchable): ${noCoords.length}   [${sample(noCoords)}]`);
  console.log(`  geohash without coords -> remove: ${remove.length}   [${sample(remove)}]`);
}
console.log(`\ndocuments to update: ${plan.length}`);

if (!apply) {
  console.log(`\nDry run: nothing written. Re-run with --apply to write.`);
  process.exit(0);
}

let written = 0;
let failed = 0;
const failures = [];
const writer = db.bulkWriter();
writer.onWriteError((err) => {
  // A failed precondition means the doc changed after we read it: skip it; a re-run
  // (or the trigger, once deployed) picks it up with fresh data.
  if (err.code === 9 /* FAILED_PRECONDITION */) return false;
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
