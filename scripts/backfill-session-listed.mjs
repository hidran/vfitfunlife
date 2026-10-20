// P2 (unified courses, task F5): give every lesson of a venue-linked course the `listed` flag the public
// venue timetable query filters on (collectionGroup sessions: venueId == v, listed == true, state == scheduled, ...).
//
//   listed = (course.state === "published" && course.providerEligible === true)
//
// This is exactly what saveCourse writes and what the onCourseProviderEligibility trigger keeps in step
// (functions/src/courses/providerEligibility.ts), so the script only repairs sessions written before that code
// existed. Only courses with a venueId are visited: unlinked (individual) courses never use the group rule.
// Each session write is guarded by the session's updateTime, so a lesson changed between read and write is
// skipped, not clobbered. Idempotent: a second run reports 0 documents to update.
//
//   node scripts/backfill-session-listed.mjs                               # emulator, dry run
//   node scripts/backfill-session-listed.mjs --project vfit-app-staging    # dry run
//   node scripts/backfill-session-listed.mjs --project vfit-app-staging --apply
//
// Optional `--names` also copies the course name and time zone onto each lesson (`courseName`, `timezone`: what
// saveCourse now writes), so the venue page labels and times lessons without reading course documents:
//
//   node scripts/backfill-session-listed.mjs --project vfit-app-staging --names --apply
//
// Against a real project it uses Application Default Credentials, like backfill-search-tokens.mjs.

import admin from "firebase-admin";

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");
const names = args.includes("--names");
const useEmulator = !project;
const SAMPLE = 10;

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
} else {
  // Never let a leaked emulator env redirect a "real" run into a local emulator (or vice versa).
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const projectId = project ?? "vfit-funlife";
admin.initializeApp({ projectId });
const db = admin.firestore();

const target = useEmulator ? `the emulator (${projectId})` : projectId;
console.log(`${apply ? "APPLY" : "DRY RUN"} - backfilling sessions.listed${names ? ", courseName and timezone" : ""} of venue-linked courses on ${target}\n`);

const courses = await db.collection("courses").where("venueId", "!=", null).get();
const plan = []; // { ref, updateTime, patch }
const touchedCourses = new Set();
let sessionsScanned = 0;

for (const course of courses.docs) {
  const data = course.data();
  const listed = data.state === "published" && data.providerEligible === true;
  const sessions = await course.ref.collection("sessions").get();
  for (const session of sessions.docs) {
    sessionsScanned++;
    const patch = {};
    if (session.get("listed") !== listed) patch.listed = listed;
    if (names && typeof data.name === "string" && session.get("courseName") !== data.name) patch.courseName = data.name;
    if (names && typeof data.timezone === "string" && session.get("timezone") !== data.timezone) patch.timezone = data.timezone;
    if (Object.keys(patch).length) {
      plan.push({ ref: session.ref, updateTime: session.updateTime, patch });
      touchedCourses.add(course.id);
    }
  }
}

const sample = (ids) => (ids.length ? ids.slice(0, SAMPLE).join(", ") + (ids.length > SAMPLE ? ", ..." : "") : "-");
console.log(`venue-linked courses scanned:   ${courses.size}`);
console.log(`sessions scanned:               ${sessionsScanned}`);
console.log(`courses with stale sessions:    ${touchedCourses.size}   [${sample([...touchedCourses])}]`);
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
  // FAILED_PRECONDITION: the lesson changed after we read it. Skip it; a re-run picks it up with fresh data.
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
