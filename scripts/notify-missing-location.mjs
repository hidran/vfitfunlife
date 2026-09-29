// D4: one-time in-app notification to providers whose instructor doc has no coordinates
// (they are invisible in "near me" search), linking to /provider/location where they set it.
//
// Writes users/{uid}/notifications/d4-missing-location in the same shape as
// functions/src/bookings/notify.ts (title/body/type 'system'/data.link/isRead false/createdAt),
// localized by users/{uid}.preferredLanguage (it fallback). The fixed doc id makes it
// one-time: create() fails for a user who already has it, and a re-run skips them.
// In-app only: no push, no email.
//
//   node scripts/notify-missing-location.mjs                               # emulator, dry run
//   node scripts/notify-missing-location.mjs --project vfit-app-staging    # dry run
//   node scripts/notify-missing-location.mjs --project vfit-app-staging --apply
//
// Against a real project it uses Application Default Credentials, like backfill-geohash.mjs.

import admin from "firebase-admin";
import { NOTIFICATION_ID, buildNotification, shouldNotify } from "./lib/missingLocation.mjs";

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");
const useEmulator = !project;

if (projectFlag !== -1 && !project) {
  console.error("--project needs a project id");
  process.exit(1);
}

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const projectId = project ?? "vfit-funlife";
admin.initializeApp({ projectId });
const db = admin.firestore();

const target = useEmulator ? `the emulator (${projectId})` : projectId;
console.log(`${apply ? "APPLY" : "DRY RUN"} — missing-location notification on ${target}\n`);

const instructors = await db.collection("instructors").get();
const candidates = instructors.docs.filter((d) => !d.data().activityKind);

const users = new Map();
const refs = candidates.map((d) => db.collection("users").doc(d.id));
for (let i = 0; i < refs.length; i += 300) {
  const snaps = await db.getAll(...refs.slice(i, i + 300));
  for (const s of snaps) if (s.exists) users.set(s.id, s.data());
}

const recipients = candidates.filter((d) => shouldNotify(d.data(), users.get(d.id)));
const byLang = {};
for (const d of recipients) {
  const lang = users.get(d.id)?.preferredLanguage ?? "it";
  byLang[lang] = (byLang[lang] ?? 0) + 1;
}

console.log(`instructors: ${instructors.size}, provider accounts without coordinates: ${recipients.length}`);
console.log(`by language: ${JSON.stringify(byLang)}`);
console.log(`sample: ${recipients.slice(0, 10).map((d) => d.id).join(", ") || "-"}\n`);

if (!apply) {
  console.log("Dry run: nothing written. Re-run with --apply to send.");
  process.exit(0);
}

let sent = 0;
let already = 0;
for (const d of recipients) {
  const user = users.get(d.id);
  const ref = db.collection("users").doc(d.id).collection("notifications").doc(NOTIFICATION_ID);
  try {
    await ref.create(buildNotification(user?.preferredLanguage, admin.firestore.FieldValue.serverTimestamp()));
    sent++;
  } catch (err) {
    if (err?.code === 6 /* ALREADY_EXISTS */) already++;
    else throw err;
  }
}
console.log(`sent: ${sent}, already notified: ${already}`);
process.exit(0);
