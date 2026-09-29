// Seed the staging login allowlist (stagingAllowlist/{emailLowercase}).
//
// Staging only: the blocking functions that read this collection exist only on
// vfit-app-staging, so the script refuses any other project.
//
//   node scripts/seed-staging-allowlist.mjs --project vfit-app-staging           # dry run
//   node scripts/seed-staging-allowlist.mjs --project vfit-app-staging --apply   # write
//
// Uses Application Default Credentials (`gcloud auth application-default login`). Re-running
// is safe: existing entries are left untouched (their note / addedBy are preserved).
//
// Seed this BEFORE the first staging functions deploy that includes the blocking functions,
// or every sign-in on staging (yours included, unless your profile is superadmin) is refused.

import admin from "firebase-admin";

const STAGING_PROJECT_ID = "vfit-app-staging";

const EMAILS = [
  "hidran@gmail.com",
  "admin@vfit.com",
  "demo.customer@vitfitdemo.dev",
  "demo.customer2@vitfitdemo.dev",
  "demo.provider@vitfitdemo.dev",
  "demo.admin@vitfitdemo.dev",
  "demo.trainer@vitfitdemo.dev",
  "e2e.avail.customer@vitfitdemo.dev",
];

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
const apply = args.includes("--apply");

if (project !== STAGING_PROJECT_ID) {
  console.error(
    `seed-staging-allowlist: refusing to run against ${project ? `"${project}"` : "no project"}. ` +
      `Pass --project ${STAGING_PROJECT_ID}.`
  );
  process.exit(1);
}

// Never let an emulator env from another shell redirect the "staging" write locally.
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

admin.initializeApp({ projectId: STAGING_PROJECT_ID });
const db = admin.firestore();
const { serverTimestamp } = admin.firestore.FieldValue;

console.log(`${apply ? "APPLY" : "DRY RUN"} — ${STAGING_PROJECT_ID}/stagingAllowlist`);

let toAdd = 0;
for (const raw of EMAILS) {
  const email = raw.trim().toLowerCase();
  const ref = db.collection("stagingAllowlist").doc(email);
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`  = ${email} (already present)`);
    continue;
  }
  toAdd++;
  if (apply) {
    await ref.create({ email, note: "seed", addedBy: "seed-staging-allowlist", addedAt: serverTimestamp() });
    console.log(`  + ${email}`);
  } else {
    console.log(`  + ${email} (would add)`);
  }
}

console.log(
  apply ? `Done: ${toAdd} added.` : `Dry run: ${toAdd} would be added. Re-run with --apply to write.`
);
process.exit(0);
