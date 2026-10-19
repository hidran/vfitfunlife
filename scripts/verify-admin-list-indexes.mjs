// Read-only check that every query shape the admin users/providers/bookings/system-logs lists
// issue is served by an index (P2-5). Runs each shape once — the page query (orderBy <field>
// desc, limit 1) and its count — and prints OK, or the composite index Firestore asks for
// (decoded from the create-index link in the FAILED_PRECONDITION error), so it can be compared
// with firestore.indexes.json before/after `firebase deploy --only firestore:indexes`.
//
// The shapes mirror userListConstraints / providerListConstraints / bookingListConstraints /
// logListConstraints in src/lib/firebase/admin.ts.
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
const bookings = db.collection("bookings");
const systemLogs = db.collection("systemLogs");

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
        shapes.push({ list: "users", order: "createdAt", label: label.join(" & "), q });
      }
    }
  }
}
for (const verification of ["all", "pending"]) {
  // null = no account-type filter; "business" stands for both values of providerKind.
  for (const kind of [null, "business"]) {
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
        if (kind) (q = q.where("providerKind", "==", kind)), label.push("providerKind==");
        if (suspended !== null) (q = q.where("isSuspended", "==", suspended)), label.push("isSuspended==");
        if (token) (q = q.where("searchTokens", "array-contains", token)), label.push("searchTokens contains");
        shapes.push({ list: "providers", order: "createdAt", label: label.join(" & "), q });
      }
    }
  }
}

/** Every subset of `filters` ([label, apply] pairs), each with and without a date range. */
function combos(list, collection, order, filters, maxFilters) {
  const from = admin.firestore.Timestamp.fromDate(new Date("2026-01-01"));
  const to = admin.firestore.Timestamp.fromDate(new Date("2026-12-31"));
  for (let mask = 0; mask < 1 << filters.length; mask++) {
    const picked = filters.filter((_, i) => mask & (1 << i));
    if (picked.length > maxFilters) continue;
    // Two filters on the same field (status and disputed share the status dropdown) never combine.
    if (new Set(picked.map(([, field]) => field)).size !== picked.length) continue;
    for (const ranged of [false, true]) {
      let q = collection;
      const label = [];
      for (const [name, , apply] of picked) (q = apply(q)), label.push(name);
      if (ranged) (q = q.where(order, ">=", from).where(order, "<=", to)), label.push(`${order} range`);
      shapes.push({ list, order, label: label.join(" & ") || "(no filter)", q });
    }
  }
}

// Bookings: the status dropdown (a status, or "disputed"), the uid deep links / id search
// (customer = userId, provider = instructorId) and the email search, plus the date range.
combos("bookings", bookings, "scheduledAt", [
  ["status==", "status", (q) => q.where("status", "==", "completed")],
  ["disputed", "status", (q) => q.where("paymentConfirmation.clientResponse", "==", "disputed")],
  ["userId==", "userId", (q) => q.where("userId", "==", "x")],
  ["instructorId==", "instructorId", (q) => q.where("instructorId", "==", "x")],
  ["userEmail==", "userEmail", (q) => q.where("userEmail", "==", "x@example.com")],
], 3);

// System logs: severity, action and actor (`by`) filters, plus the date range.
combos("logs", systemLogs, "timestamp", [
  ["severity==", "severity", (q) => q.where("severity", "==", "info")],
  ["action==", "action", (q) => q.where("action", "==", "VERIFY_PROVIDER")],
  ["by==", "by", (q) => q.where("by", "==", "x")],
], 3);

console.log(`Checking ${shapes.length} admin list query shapes (page + count) on ${project}\n`);
const missing = new Map();
let failures = 0;
for (const { list, order, label, q } of shapes) {
  for (const [kind, run] of [
    ["page ", () => q.orderBy(order, "desc").limit(1).get()],
    ["count", () => q.orderBy(order, "desc").count().get()],
  ]) {
    try {
      await run();
      console.log(`OK       ${list.padEnd(9)} ${kind} ${label}`);
    } catch (err) {
      const link = /create_composite=([A-Za-z0-9_\-=+/]+)/.exec(String(err.message));
      if (err.code === 9 && link) {
        const fields = describeFields(decodeIndex(link[1]));
        const key = `${list === "providers" ? "users" : list === "logs" ? "systemLogs" : list}: ${fields}`;
        missing.set(key, (missing.get(key) ?? 0) + 1);
        console.log(`NO INDEX ${list.padEnd(9)} ${kind} ${label}\n           needs: ${fields}`);
      } else {
        failures++;
        console.log(`ERROR    ${list.padEnd(9)} ${kind} ${label}: ${err.code ?? ""} ${err.message}`);
      }
    }
  }
}

console.log(`\n${missing.size} distinct missing composite index(es), ${failures} other error(s).`);
for (const key of missing.keys()) console.log(`  ${key}`);
process.exit(failures ? 1 : 0);
