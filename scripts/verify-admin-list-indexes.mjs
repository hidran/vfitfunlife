// Read-only check that every query shape the admin users/providers lists issue is served by
// an index (P2-5). Runs each shape once — the page query (orderBy createdAt desc, limit 1) and
// its count — and prints OK, or the composite index Firestore asks for (decoded from the
// create-index link in the FAILED_PRECONDITION error), so it can be compared with
// firestore.indexes.json before/after `firebase deploy --only firestore:indexes`.
//
// The shapes mirror userListConstraints / providerListConstraints in src/lib/firebase/admin.ts.
//
//   node scripts/verify-admin-list-indexes.mjs --project vfit-app-staging
//   node scripts/verify-admin-list-indexes.mjs --project vfit-funlife
//
// Uses Application Default Credentials. Reads at most one document per shape; writes nothing.

import admin from "firebase-admin";

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];
if (!project) {
  console.error("usage: node scripts/verify-admin-list-indexes.mjs --project <projectId>");
  process.exit(2);
}
delete process.env.FIRESTORE_EMULATOR_HOST;
admin.initializeApp({ projectId: project });
const db = admin.firestore();
const users = db.collection("users");

/** Minimal protobuf reader for the google.firestore.admin.v1.Index in a create_composite link. */
function decodeIndex(b64) {
  const buf = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  function readVarint(state) {
    let result = 0, shift = 0, byte;
    do {
      byte = buf[state.pos++];
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  }
  function readMessage(start, end) {
    const state = { pos: start };
    const fields = [];
    while (state.pos < end) {
      const key = readVarint(state);
      const field = Math.floor(key / 8);
      const wire = key & 7;
      if (wire === 0) fields.push([field, readVarint(state)]);
      else if (wire === 2) {
        const len = readVarint(state);
        fields.push([field, { start: state.pos, end: state.pos + len }]);
        state.pos += len;
      } else throw new Error(`unsupported wire type ${wire}`);
    }
    return fields;
  }
  const top = readMessage(0, buf.length);
  const out = [];
  for (const [field, value] of top) {
    if (field !== 3) continue;
    const f = readMessage(value.start, value.end);
    const entry = {};
    for (const [k, v] of f) {
      if (k === 1) entry.fieldPath = buf.subarray(v.start, v.end).toString("utf8");
      if (k === 2) entry.order = v === 1 ? "ASCENDING" : "DESCENDING";
      if (k === 3) entry.arrayConfig = "CONTAINS";
    }
    if (entry.fieldPath !== "__name__") out.push(entry);
  }
  return out;
}

const describeFields = (fields) =>
  fields.map((f) => `${f.fieldPath} ${f.arrayConfig ?? (f.order === "DESCENDING" ? "desc" : "asc")}`).join(", ");

const shapes = [];
for (const hidden of [false, true]) {
  for (const role of [null, "customer"]) {
    for (const suspended of [null, false]) {
      for (const token of [null, "a"]) {
        let q = users.where("adminHidden", "==", hidden);
        const label = [`adminHidden==${hidden}`];
        if (role) (q = q.where("role", "==", role)), label.push("role==");
        if (suspended !== null) (q = q.where("isSuspended", "==", suspended)), label.push("isSuspended==");
        if (token) (q = q.where("searchTokens", "array-contains", token)), label.push("searchTokens contains");
        shapes.push({ list: "users", label: label.join(" & "), q });
      }
    }
  }
}
for (const verification of ["all", "pending"]) {
  for (const suspended of [null, false]) {
    for (const token of [null, "a"]) {
      let q = users.where("adminHidden", "==", false);
      const label = ["adminHidden==false"];
      if (verification === "all") {
        q = q.where("providerVerification", "in", ["verified", "pending", "rejected"]);
        label.push("providerVerification in");
      } else {
        q = q.where("providerVerification", "==", verification);
        label.push("providerVerification==");
      }
      if (suspended !== null) (q = q.where("isSuspended", "==", suspended)), label.push("isSuspended==");
      if (token) (q = q.where("searchTokens", "array-contains", token)), label.push("searchTokens contains");
      shapes.push({ list: "providers", label: label.join(" & "), q });
    }
  }
}

console.log(`Checking ${shapes.length} admin list query shapes (page + count) on ${project}\n`);
const missing = new Map();
let failures = 0;
for (const { list, label, q } of shapes) {
  for (const [kind, run] of [
    ["page ", () => q.orderBy("createdAt", "desc").limit(1).get()],
    ["count", () => q.count().get()],
  ]) {
    try {
      await run();
      console.log(`OK       ${list.padEnd(9)} ${kind} ${label}`);
    } catch (err) {
      const link = /create_composite=([A-Za-z0-9_\-=+/]+)/.exec(String(err.message));
      if (err.code === 9 && link) {
        const fields = describeFields(decodeIndex(link[1]));
        missing.set(fields, (missing.get(fields) ?? 0) + 1);
        console.log(`NO INDEX ${list.padEnd(9)} ${kind} ${label}\n           needs: ${fields}`);
      } else {
        failures++;
        console.log(`ERROR    ${list.padEnd(9)} ${kind} ${label}: ${err.code ?? ""} ${err.message}`);
      }
    }
  }
}

console.log(`\n${missing.size} distinct missing composite index(es), ${failures} other error(s).`);
for (const fields of missing.keys()) console.log(`  users: ${fields}`);
process.exit(failures ? 1 : 0);
