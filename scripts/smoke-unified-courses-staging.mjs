// Staging-only backend smoke for the unified group courses (P2, task F6).
//
//   node scripts/smoke-unified-courses-staging.mjs            # seed, run, clean up
//   node scripts/smoke-unified-courses-staging.mjs --keep     # leave the fixture venue/courses for UI work
//   node scripts/smoke-unified-courses-staging.mjs --cleanup  # remove a kept fixture only
//
// Callables are exercised the way the web client does (identity-toolkit login, HTTPS callable POST, REST reads for
// the rules checks). Seeding and cleanup use firebase-admin with Application Default Credentials, hard-asserted to
// `vfit-app-staging`. Evidence: output/playwright/unified-courses-staging-smoke.json
//
// Accounts (staging): owner demo.provider, instructor B journey.en.provider, staff journey.it.provider (made
// venueStaff), customers demo.customer / journey.en.customer / journey.it.customer, admin demo.admin. Passwords come
// from the memory notes (demo group VfitDemo!2026, journey group JourneyDemo!2026); override with
// VFIT_SMOKE_PASSWORD, VFIT_SMOKE_JOURNEY_PASSWORD or per actor VFIT_SMOKE_<KEY>_EMAIL / VFIT_SMOKE_<KEY>_PASSWORD.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const CLEANUP_ONLY = args.includes('--cleanup');

const env = dotenv.parse(fs.readFileSync('.env.staging'));
assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'vfit-app-staging', '.env.staging must point at vfit-app-staging');
const project = 'vfit-app-staging';
const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
const base = `https://europe-west1-${project}.cloudfunctions.net`;
const docsBase = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

delete process.env.FIRESTORE_EMULATOR_HOST;
admin.initializeApp({ projectId: project });
assert.equal(admin.app().options.projectId, 'vfit-app-staging');
const db = admin.firestore();
const { FieldValue, FieldPath, Timestamp } = admin.firestore;

const VENUE = 'smoke_unified_venue';
const output = 'output/playwright/unified-courses-staging-smoke.json';
const fixtureFile = 'output/playwright/unified-courses-staging-fixture.json';
const evidence = { project, startedAt: new Date().toISOString(), keep: KEEP, checks: [], notes: [], courses: {} };
const mark = (name, detail = {}) => { evidence.checks.push({ name, passed: true, ...detail }); console.log('PASS', name); };
const note = (text) => { evidence.notes.push(text); console.log('NOTE', text); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VFIT = process.env.VFIT_SMOKE_PASSWORD ?? 'VfitDemo!2026';
const JOURNEY = process.env.VFIT_SMOKE_JOURNEY_PASSWORD ?? 'JourneyDemo!2026';
const ACCOUNTS = {
  owner: ['demo.provider@vitfitdemo.dev', VFIT], instrB: ['journey.en.provider@vitfitdemo.dev', JOURNEY],
  staff: ['journey.it.provider@vitfitdemo.dev', JOURNEY], c1: ['demo.customer@vitfitdemo.dev', VFIT],
  c2: ['journey.en.customer@vitfitdemo.dev', JOURNEY], c3: ['journey.it.customer@vitfitdemo.dev', JOURNEY],
  admin: ['demo.admin@vitfitdemo.dev', VFIT],
};

async function login(key) {
  const [email, password] = ACCOUNTS[key];
  const e = process.env[`VFIT_SMOKE_${key.toUpperCase()}_EMAIL`] ?? email;
  const p = process.env[`VFIT_SMOKE_${key.toUpperCase()}_PASSWORD`] ?? password;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: e, password: p, returnSecureToken: true }) });
  const data = await response.json();
  assert(response.ok, `${e}: ${data.error?.message}`);
  return { key, email: e, uid: data.localId, token: data.idToken };
}

/** Callable POST. `expected` (RegExp) means the call must fail with a matching message; the error is returned. */
async function call(name, actor, data, expected) {
  let response, body;
  for (let attempt = 0; attempt < 24; attempt++) {
    response = await fetch(`${base}/${name}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` }, body: JSON.stringify({ data }) });
    // A gen-2 callable answers 401 for a few minutes after its first deploy.
    if (response.status === 401 && attempt < 23) { await sleep(15000); continue; }
    break;
  }
  try { body = await response.json(); } catch { throw new Error(`${name}: HTTP ${response.status}`); }
  if (expected) {
    assert(body.error, `${name} unexpectedly succeeded: ${JSON.stringify(body.result)}`);
    assert.match(body.error.message, expected, `${name}: ${JSON.stringify(body.error)}`);
    return body.error;
  }
  if (body.error || !response.ok) throw new Error(`${name}: ${JSON.stringify(body.error ?? response.status)}`);
  return body.result;
}

const adminDoc = async (path) => (await db.doc(path).get()).data();
const hash = (uid, requestId) => createHash('sha256').update(`${uid}:${requestId}`).digest('hex');
const rome = (ts, fmt) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', ...fmt }).format(ts.toDate());
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

/** occupied/held/waitlisted agree with the sub-collections; positions are 1..n; never over capacity. */
async function assertCounters(courseId, sessionId) {
  const ref = db.doc(`courses/${courseId}/sessions/${sessionId}`);
  const [session, participants, waitlist] = await Promise.all([ref.get(), ref.collection('participants').get(),
    ref.collection('waitlist').orderBy('position').get()]);
  const s = session.data();
  const confirmed = participants.docs.filter((d) => d.data().state === 'confirmed').length;
  const held = participants.docs.filter((d) => d.data().state === 'held').length;
  assert.equal(s.occupied, confirmed, `${sessionId}: occupied ${s.occupied} vs ${confirmed} confirmed participants`);
  assert.equal(s.held, held, `${sessionId}: held ${s.held} vs ${held} held participants`);
  assert.equal(s.waitlisted ?? 0, waitlist.size, `${sessionId}: waitlisted ${s.waitlisted} vs ${waitlist.size} entries`);
  assert.deepEqual(waitlist.docs.map((d) => d.data().position), waitlist.docs.map((_, i) => i + 1),
    `${sessionId}: waitlist positions are not 1..n`);
  assert(s.occupied + s.held <= s.capacity, `${sessionId}: over capacity`);
  return { occupied: s.occupied, held: s.held, waitlisted: waitlist.size, capacity: s.capacity };
}

// ---------------------------------------------------------------------------------------------------------------
// Lock invariant (spec 4.6): a slot exists iff its course is published and its session is scheduled.
// ---------------------------------------------------------------------------------------------------------------
const utcDays = (start, end) => {
  const out = [];
  const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const lastD = new Date(end.getTime() - 1);
  const last = Date.UTC(lastD.getUTCFullYear(), lastD.getUTCMonth(), lastD.getUTCDate());
  for (let ms = first; ms <= last; ms += 86400000) out.push(new Date(ms).toISOString().slice(0, 10));
  return out;
};
async function checkLocks(courseIds) {
  const ids = new Set(courseIds);
  const locks = await db.collection('courseScheduleLocks').get();
  const held = new Map(); // slot key -> number of lock docs holding it
  for (const lock of locks.docs) {
    for (const key of Object.keys(lock.data().slots ?? {})) {
      if (ids.has(key.split('_')[0])) held.set(key, (held.get(key) ?? 0) + 1);
    }
  }
  const expected = new Map();
  for (const courseId of ids) {
    const course = await adminDoc(`courses/${courseId}`);
    if (!course) continue;
    const sessions = await db.collection(`courses/${courseId}/sessions`).get();
    for (const s of sessions.docs) {
      const d = s.data();
      if (course.state !== 'published' || d.state !== 'scheduled') continue;
      // A slot that has ended is history and may be gone; every fixture lesson is in the future.
      const days = utcDays(d.startsAt.toDate(), d.endsAt.toDate()).length;
      const count = (d.roomId && d.venueId ? days : 0) + (d.instructorId ? days : 0);
      if (count) expected.set(`${courseId}_${s.id}`, count);
    }
  }
  const orphans = [...held.keys()].filter((k) => !expected.has(k));
  const missing = [...expected].filter(([k, n]) => held.get(k) !== n).map(([k, n]) => `${k}:${held.get(k) ?? 0}/${n}`);
  return { slots: held.size, expected: expected.size, orphans, missing };
}

// ---------------------------------------------------------------------------------------------------------------
// Cleanup: cancelRemainingCourse for every fixture course, then delete the fixture venue, staff link, enrollments,
// courses and reset the instructors' partnerStatus. Also used (idempotently) before a fresh run.
// ---------------------------------------------------------------------------------------------------------------
async function cleanup(owner, ownerUid) {
  const state = fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : {};
  const found = new Set(state.courseIds ?? []);
  for (const q of [db.collection('courses').where('venueId', '==', VENUE),
    db.collection('courses').where('providerId', '==', ownerUid)]) {
    for (const d of (await q.get()).docs) if (d.id && (d.data().venueId === VENUE || /^Smoke Unified/.test(d.data().name ?? ''))) found.add(d.id);
  }
  const courseIds = [...found];
  for (const courseId of courseIds) {
    const course = await adminDoc(`courses/${courseId}`);
    if (!course) continue;
    if (course.state !== 'archived') await call('cancelRemainingCourse', owner, { courseId, reason: 'Smoke cleanup' });
  }
  const locks = await checkLocks(courseIds);
  assert.deepEqual(locks.orphans, [], `lock slots remain after cleanup: ${locks.orphans.join(', ')}`);
  assert.equal(locks.slots, 0);
  for (const courseId of courseIds) {
    for (const col of ['courseEnrollments', 'courseRefunds', 'courseNotifications']) {
      const docs = await db.collection(col).where('courseId', '==', courseId).get();
      await Promise.all(docs.docs.map((d) => d.ref.delete()));
    }
    await db.recursiveDelete(db.doc(`courses/${courseId}`));
  }
  await db.recursiveDelete(db.doc(`venues/${VENUE}`));
  await db.doc(`venueStaff/${state.staffUid ?? (await login('staff')).uid}`).delete();
  for (const [key, uid] of [['instrB', state.instrBUid], ['owner', ownerUid]]) {
    if (!uid) continue;
    const prior = state.priorPartnerStatus?.[key];
    await db.doc(`instructors/${uid}`).update({ partnerStatus: prior ?? FieldValue.delete() }).catch(() => {});
  }
  if (fs.existsSync(fixtureFile)) fs.rmSync(fixtureFile);
  return { courses: courseIds.length, lockSlotsLeft: locks.slots };
}

function courseInput(over) {
  const day = (offset) => ymd(Date.now() + offset * 86400000);
  return {
    name: 'Smoke Unified A', description: 'Unified courses staging smoke.', categoryId: over.categoryId,
    location: 'placeholder', city: '', instructor: 'placeholder', venueId: VENUE, locationId: over.locationId,
    roomId: over.room1, instructorId: over.instrB, capacity: 1, durationMinutes: 60,
    startDate: day(7), startTime: '18:00', timezone: 'Asia/Tokyo', recurrence: 'daily', interval: 1, weekdays: [],
    endDate: day(9), lessonPriceCents: 1500, seriesPriceCents: 4000, bookingNoticeHours: 2, cancellationHours: 24,
    level: 'Beginner', equipment: 'Sportswear', state: 'published', enrollmentClosed: false, waitlistEnabled: true,
    ...over.patch,
  };
}

let owner;
const accounts = {};
let restoreVenue = false;
const createdCourses = [];
try {
  for (const key of Object.keys(ACCOUNTS)) accounts[key] = await login(key);
  owner = accounts.owner;
  mark('Staging accounts sign in', Object.fromEntries(Object.entries(accounts).map(([k, a]) => [k, a.uid])));

  if (CLEANUP_ONLY) {
    evidence.cleanup = await cleanup(owner, owner.uid);
    mark('Kept fixture removed', evidence.cleanup);
    evidence.passed = true;
    process.exitCode = 0;
  } else {
    const staleVenue = await adminDoc(`venues/${VENUE}`);
    if (staleVenue || fs.existsSync(fixtureFile)) {
      const result = await cleanup(owner, owner.uid);
      note(`Removed a leftover fixture before starting: ${JSON.stringify(result)}`);
    }
    const { instrB, staff, c1, c2, c3, admin: adminActor } = accounts;
    const mkSettings = await adminDoc('systemSettings/payments');
    evidence.paymentSettings = { stripePaymentsEnabled: mkSettings?.stripePaymentsEnabled === true,
      courseCheckoutEnabled: mkSettings?.courseCheckoutEnabled === true };

    // ---- 1. Seed the venue, staff link, spaces and the partner instructor link --------------------------------
    const [bBefore, ownerBefore] = await Promise.all([adminDoc(`instructors/${instrB.uid}`), adminDoc(`instructors/${owner.uid}`)]);
    assert.equal(bBefore?.providerProfile?.isVerified, true, 'instructor B must be a verified provider');
    assert.equal(ownerBefore?.providerProfile?.isVerified, true, 'owner must be a verified provider');
    fs.mkdirSync('output/playwright', { recursive: true });
    fs.writeFileSync(fixtureFile, JSON.stringify({ courseIds: [], staffUid: staff.uid, instrBUid: instrB.uid,
      priorPartnerStatus: { instrB: bBefore.partnerStatus ?? null, owner: ownerBefore.partnerStatus ?? null } }, null, 2));
    await db.doc(`venues/${VENUE}`).set({
      name: 'Smoke Unified Gym', slug: 'smoke-unified-gym', type: 'gym', city: 'Torino', address: 'Via Smoke 1',
      ownerId: owner.uid, partnerStatus: 'active', isPartner: true, isActive: true, memberDiscountPercent: 10,
      partnerInstructorExtraPercent: 5, rating: 0, reviewCount: 0, description: 'Staging smoke fixture', heroGradients: [],
      amenities: [], hours: [], photoUrls: [], lat: 45.07, lng: 7.68, createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.doc(`venueStaff/${staff.uid}`).set({ venueId: VENUE, isActive: true, createdAt: FieldValue.serverTimestamp() });
    const { id: locationId } = await call('saveGymSpace', owner, { kind: 'location', venueId: VENUE, name: 'Smoke Location',
      address: 'Via Smoke 1', city: 'Torino', timezone: 'Europe/Rome', isActive: true });
    const { id: room1 } = await call('saveGymSpace', owner, { kind: 'room', venueId: VENUE, locationId, name: 'Smoke Room 1', isActive: true });
    const { id: room2 } = await call('saveGymSpace', owner, { kind: 'room', venueId: VENUE, locationId, name: 'Smoke Room 2', isActive: true });
    await call('configureGymInstructor', adminActor, { venueId: VENUE, instructorId: instrB.uid, partnerStatus: 'active', isActive: true });
    await call('configureGymInstructor', adminActor, { venueId: VENUE, instructorId: owner.uid, partnerStatus: 'pending', isActive: true });
    assert.equal((await adminDoc(`venues/${VENUE}/instructors/${instrB.uid}`)).isActive, true);
    assert.equal((await adminDoc(`instructors/${instrB.uid}`)).partnerStatus, 'active');
    await call('saveGymSpace', staff, { kind: 'room', venueId: VENUE, locationId, name: 'Smoke Room X', isActive: true });
    mark('Venue, staff link, one location, two rooms and partner instructors seeded', { locationId, room1, room2 });
    const stranger = await call('saveGymSpace', c2, { kind: 'room', venueId: VENUE, locationId, name: 'No', isActive: true }, /venue_authorization_required/);
    assert(stranger);

    const categories = (await db.collection('serviceCategories').get()).docs.filter((d) => d.data().isActive && d.data().parentId);
    assert(categories.length, 'An active leaf category is required');
    const categoryId = (categories.find((d) => /martial|karate|combat|fitness/.test(d.id)) ?? categories[0]).id;
    const ctx = { categoryId, locationId, room1, room2, instrB: instrB.uid };
    const remember = (id) => {
      createdCourses.push(id);
      const state = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
      state.courseIds = createdCourses; fs.writeFileSync(fixtureFile, JSON.stringify(state, null, 2));
    };

    // ---- 2. Course A ------------------------------------------------------------------------------------------
    const saveA = await call('saveCourse', owner, { course: courseInput({ ...ctx, patch: {} }) });
    const A = saveA.courseId; remember(A); evidence.courses.A = A;
    const courseA = await adminDoc(`courses/${A}`);
    assert.equal(courseA.venueId, VENUE); assert.equal(courseA.timezone, 'Europe/Rome', 'timezone must be forced to the location\'s');
    assert.equal(courseA.sessionIds.length, 3);
    assert.equal(courseA.state, 'published');
    const sessionsA = courseA.sessionIds;
    const first = await adminDoc(`courses/${A}/sessions/${sessionsA[0]}`);
    assert.equal(rome(first.startsAt, { hour: '2-digit', minute: '2-digit', hour12: false }), '18:00');
    assert.equal(first.listed, true); assert.equal(first.revision, 1); assert.equal(first.roomId, room1);
    assert.equal(first.instructorId, instrB.uid);
    mark('Owner publishes course A (room 1, instructor B, capacity 1, 3 lessons); timezone forced to Europe/Rome', { courseId: A });

    // ---- 3. Overlaps ------------------------------------------------------------------------------------------
    const roomClash = await call('saveCourse', owner, { course: courseInput({ ...ctx, patch: { name: 'Smoke Unified B', instructorId: null } }) }, /room_overlap/);
    assert(JSON.stringify(roomClash.details ?? roomClash).includes('Smoke Unified A'), `room_overlap must name course A: ${JSON.stringify(roomClash)}`);
    mark('Same room and time is rejected with room_overlap naming course A');
    const instructorClash = await call('saveCourse', owner, { course: courseInput({ ...ctx, patch: { name: 'Smoke Unified C', roomId: room2 } }) }, /instructor_overlap/);
    assert(JSON.stringify(instructorClash.details ?? instructorClash).includes('Smoke Unified A'));
    mark('Other room, same instructor and time is rejected with instructor_overlap');
    const saveC = await call('saveCourse', owner, { course: courseInput({ ...ctx, patch: { name: 'Smoke Unified C', roomId: room2, instructorId: null, capacity: 5 } }) });
    remember(saveC.courseId); evidence.courses.C = saveC.courseId;
    mark('Room 2 with no instructor saves', { courseId: saveC.courseId });
    // D: the owner's own unlinked course holds the owner's instructor lock at lesson 1, so a substitution to the owner there must clash.
    const saveD = await call('saveCourse', owner, { course: { ...courseInput({ ...ctx, patch: {} }), name: 'Smoke Unified D',
      venueId: null, locationId: null, roomId: null, instructorId: owner.uid, timezone: 'Europe/Rome', location: 'Smoke D place',
      city: 'Torino', recurrence: 'none', endDate: '', capacity: 3 } });
    remember(saveD.courseId); evidence.courses.D = saveD.courseId;
    mark('Unlinked course D holds the owner instructor lock at lesson 1', { courseId: saveD.courseId });

    // ---- 4. Quote and discounted booking ---------------------------------------------------------------------
    const quote = await call('quoteCourse', c1, { courseId: A, sessionIds: [sessionsA[0]] });
    const q0 = quote.sessions[0];
    assert.equal(q0.finalCents, 1275); assert.equal(q0.discountPercent, 15); assert.equal(q0.regularCents, 1500);
    assert(quote.series && Math.abs(quote.series.finalCents - 3400) <= 3, `series quote ${JSON.stringify(quote.series)}`);
    mark('quoteCourse: lesson 1275 cents, 15% discount (10 venue + 5 partner instructor)', { series: quote.series.finalCents });
    const staleErr = await call('enrollInCourse', c1, { courseId: A, scope: 'lesson', sessionId: sessionsA[0], requestId: randomUUID(),
      expectedFinalCents: 1500, expectedRevisions: { [sessionsA[0]]: q0.revision } }, /price_changed/);
    assert.equal(staleErr.details?.reason, 'price');
    const req1 = randomUUID();
    const enrol1 = await call('enrollInCourse', c1, { courseId: A, scope: 'lesson', sessionId: sessionsA[0], requestId: req1,
      expectedFinalCents: 1275, expectedRevisions: { [sessionsA[0]]: q0.revision } });
    assert.equal(enrol1.totalCents, 1275); assert.equal(enrol1.state, 'confirmed');
    const e1 = await adminDoc(`courseEnrollments/${enrol1.enrollmentId}`);
    assert.equal(e1.discountCents, 225); assert.equal(e1.totalCents, 1275); assert.equal(e1.regularCents, 1500);
    assert.equal(e1.venueId, VENUE);
    mark('Stale expected price gives price_changed; the correct quote enrolls with total 1275 and discount 225');
    const replay = await call('enrollInCourse', c1, { courseId: A, scope: 'lesson', sessionId: sessionsA[0], requestId: req1,
      expectedFinalCents: 1275, expectedRevisions: { [sessionsA[0]]: q0.revision } });
    assert.equal(replay.enrollmentId, enrol1.enrollmentId);

    // ---- 5. Last seat, waitlist, promotion -------------------------------------------------------------------
    const full = await call('enrollInCourse', c2, { courseId: A, scope: 'lesson', sessionId: sessionsA[0], requestId: randomUUID(),
      expectedFinalCents: 1275, expectedRevisions: { [sessionsA[0]]: q0.revision } }, /lesson_full/);
    assert.equal(full.details?.waitlistAvailable, true);
    mark('Last seat taken: second customer gets lesson_full (waitlistAvailable)');
    const r2 = randomUUID(); const r3 = randomUUID();
    const j2 = await call('joinCourseWaitlist', c2, { courseId: A, sessionId: sessionsA[0], paymentMode: 'direct', requestId: r2 });
    assert.equal(j2.position, 1);
    const j3 = await call('joinCourseWaitlist', c3, { courseId: A, sessionId: sessionsA[0], paymentMode: 'direct', requestId: r3 });
    assert.equal(j3.position, 2);
    assert.equal((await call('joinCourseWaitlist', c3, { courseId: A, sessionId: sessionsA[0], paymentMode: 'direct', requestId: r3 })).replay, true);
    await call('joinCourseWaitlist', c3, { courseId: A, sessionId: sessionsA[0], paymentMode: 'direct', requestId: randomUUID() }, /already_waitlisted|request_id_reused|already/);
    mark('Waitlist joins: customer 2 at position 1, customer 3 at position 2 (replay is inert, a second join is refused)');
    // 8b. waitlist privacy (REST)
    const waitlistPath = `courses/${A}/sessions/${sessionsA[0]}/waitlist/${c3.uid}`;
    const anon = await fetch(`${docsBase}/${waitlistPath}?key=${apiKey}`);
    assert.equal(anon.status, 403);
    const other = await fetch(`${docsBase}/${waitlistPath}`, { headers: { Authorization: `Bearer ${c2.token}` } });
    assert.equal(other.status, 403);
    const own = await fetch(`${docsBase}/${waitlistPath}`, { headers: { Authorization: `Bearer ${c3.token}` } });
    assert.equal(own.status, 200);
    const staffRead = await fetch(`${docsBase}/${waitlistPath}`, { headers: { Authorization: `Bearer ${staff.token}` } });
    assert.equal(staffRead.status, 200);
    mark('Waitlist entry: public 403, another customer 403, owner of the entry and venue staff 200');
    assert.deepEqual(await assertCounters(A, sessionsA[0]), { occupied: 1, held: 0, waitlisted: 2, capacity: 1 });
    await call('cancelCourseEnrollment', c1, { enrollmentId: enrol1.enrollmentId });
    const promotedId = hash(c2.uid, r2);
    const e2 = await adminDoc(`courseEnrollments/${promotedId}`);
    assert.equal(e2?.state, 'confirmed'); assert.equal(e2.promotedFromWaitlist, true); assert.equal(e2.totalCents, 1275);
    assert.equal((await adminDoc(`courses/${A}/sessions/${sessionsA[0]}/waitlist/${c3.uid}`)).position, 1);
    assert.equal((await adminDoc(`courses/${A}/sessions/${sessionsA[0]}/waitlist/${c2.uid}`)), undefined);
    assert.deepEqual(await assertCounters(A, sessionsA[0]), { occupied: 1, held: 0, waitlisted: 1, capacity: 1 });
    mark('Customer 1 cancels: customer 2 is confirmed (promotedFromWaitlist), customer 3 is renumbered to position 1');
    await call('cancelCourseEnrollment', c1, { enrollmentId: enrol1.enrollmentId }).catch((e) => note(`replayed cancel answered: ${e.message}`));
    assert.deepEqual(await assertCounters(A, sessionsA[0]), { occupied: 1, held: 0, waitlisted: 1, capacity: 1 });
    assert.equal((await adminDoc(`courseEnrollments/${promotedId}`)).state, 'confirmed');
    mark('Replayed cancel is inert; lesson counters stay consistent');

    // ---- 6. Staff actions -------------------------------------------------------------------------------------
    await call('manageCourseSession', staff, { courseId: A, sessionId: sessionsA[1], action: 'substitute', instructorId: owner.uid, reason: 'Smoke substitution' });
    const subbed = await adminDoc(`courses/${A}/sessions/${sessionsA[1]}`);
    assert.equal(subbed.revision, 2); assert.equal(subbed.instructorId, owner.uid);
    mark('Staff (not the owner) substitutes lesson 2 to another linked instructor: revision 2');
    const clash = await call('manageCourseSession', staff, { courseId: A, sessionId: sessionsA[0], action: 'substitute', instructorId: owner.uid, reason: 'Clash' }, /instructor_overlap/);
    assert(clash);
    assert.equal((await adminDoc(`courses/${A}/sessions/${sessionsA[0]}`)).instructorId, instrB.uid);
    mark('Substitute onto a busy instructor is rejected with instructor_overlap and changes nothing');
    await call('manageCourseSession', staff, { courseId: A, sessionId: sessionsA[0], action: 'capacity', capacity: 2 });
    const promoted3 = await adminDoc(`courseEnrollments/${hash(c3.uid, r3)}`);
    assert.equal(promoted3?.state, 'confirmed'); assert.equal(promoted3.promotedFromWaitlist, true);
    assert.deepEqual(await assertCounters(A, sessionsA[0]), { occupied: 2, held: 0, waitlisted: 0, capacity: 2 });
    mark('Staff raises capacity to 2: customer 3 is promoted, waitlist empty');
    await call('recordCoursePayment', staff, { enrollmentId: promotedId, method: 'cash' });
    assert.equal((await adminDoc(`courseEnrollments/${promotedId}`)).paymentStatus, 'paid');
    mark('Staff records a cash payment');
    await call('manageCourseSession', staff, { courseId: A, sessionId: sessionsA[0], action: 'removeParticipant', userId: c3.uid, reason: 'Smoke removal' });
    assert.equal((await adminDoc(`courses/${A}/sessions/${sessionsA[0]}/participants/${c3.uid}`)), undefined);
    assert.equal((await adminDoc(`courseEnrollments/${hash(c3.uid, r3)}`)).state, 'cancelled');
    assert.deepEqual(await assertCounters(A, sessionsA[0]), { occupied: 1, held: 0, waitlisted: 0, capacity: 2 });
    mark('Staff removes a participant: seat released, enrollment cancelled, counters consistent');

    // ---- 7. Free lesson ---------------------------------------------------------------------------------------
    const saveFree = await call('saveCourse', owner, { course: courseInput({ ...ctx, patch: { name: 'Smoke Unified Free', instructorId: null,
      lessonPriceCents: 0, seriesPriceCents: 0, recurrence: 'none', endDate: '', startTime: '20:00', capacity: 5 } }) });
    const FREE = saveFree.courseId; remember(FREE); evidence.courses.free = FREE;
    const freeSession = (await adminDoc(`courses/${FREE}`)).sessionIds[0];
    const freeQuote = await call('quoteCourse', c1, { courseId: FREE, sessionIds: [freeSession] });
    assert.equal(freeQuote.sessions[0].finalCents, 0);
    const freeRev = { [freeSession]: freeQuote.sessions[0].revision };
    if (evidence.paymentSettings.courseCheckoutEnabled || evidence.paymentSettings.stripePaymentsEnabled) {
      const f = await call('enrollInCourse', c1, { courseId: FREE, scope: 'lesson', sessionId: freeSession, paymentMode: 'stripe',
        requestId: randomUUID(), expectedFinalCents: 0, expectedRevisions: freeRev });
      assert.equal(f.state, 'confirmed');
    } else {
      // Checkout is off on staging: the callable refuses a stripe request up front (before it knows the price is 0).
      const refused = await call('enrollInCourse', c1, { courseId: FREE, scope: 'lesson', sessionId: freeSession, paymentMode: 'stripe',
        requestId: randomUUID(), expectedFinalCents: 0, expectedRevisions: freeRev }).then(() => null, (e) => e);
      if (refused) note(`free lesson + paymentMode stripe with checkout off: ${refused.message} (client must send direct for a 0 price)`);
    }
    const reqFree = randomUUID();
    const free = await call('enrollInCourse', c1, { courseId: FREE, scope: 'lesson', sessionId: freeSession, paymentMode: 'direct',
      requestId: reqFree, expectedFinalCents: 0, expectedRevisions: freeRev }).catch(async (e) => {
      if (/already_enrolled/.test(e.message)) return { already: true };
      throw e;
    });
    const freeEnrolment = free.already ? (await db.collection('courseEnrollments').where('courseId', '==', FREE).where('userId', '==', c1.uid).get()).docs[0].data() :
      await adminDoc(`courseEnrollments/${free.enrollmentId}`);
    assert.equal(freeEnrolment.paymentMode, 'direct'); assert.equal(freeEnrolment.paymentStatus, 'paid');
    assert.equal(freeEnrolment.state, 'confirmed'); assert.equal(freeEnrolment.totalCents, 0);
    mark('Free lesson (price 0) enrolls as direct / paid / confirmed', { courseId: FREE });

    // ---- 8. Authority -----------------------------------------------------------------------------------------
    await call('manageCourseSession', c2, { courseId: A, sessionId: sessionsA[0], action: 'capacity', capacity: 3 }, /course_owner_required/);
    await call('recordCoursePayment', c2, { enrollmentId: promotedId, method: 'cash' }, /course_owner_required/);
    assert.equal((await adminDoc(`courses/${A}/sessions/${sessionsA[0]}`)).capacity, 2);
    mark('A stranger cannot manageCourseSession or recordCoursePayment (course_owner_required)');

    // ---- 9. Public timetable query ----------------------------------------------------------------------------
    const timetable = async (headers = {}) => {
      const response = await fetch(`${docsBase}:runQuery?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'sessions', allDescendants: true }],
          where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'venueId' }, op: 'EQUAL', value: { stringValue: VENUE } } },
            { fieldFilter: { field: { fieldPath: 'listed' }, op: 'EQUAL', value: { booleanValue: true } } },
            { fieldFilter: { field: { fieldPath: 'state' }, op: 'EQUAL', value: { stringValue: 'scheduled' } } },
            { fieldFilter: { field: { fieldPath: 'startsAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: new Date().toISOString() } } },
          ] } }, orderBy: [{ field: { fieldPath: 'startsAt' }, direction: 'ASCENDING' }] } }) });
      return { status: response.status, body: await response.json() };
    };
    const open = await timetable();
    assert.equal(open.status, 200, JSON.stringify(open.body).slice(0, 400));
    const rows = open.body.filter((r) => r.document).map((r) => r.document.name);
    for (const id of sessionsA) assert(rows.some((n) => n.includes(`/courses/${A}/sessions/${id}`)), `timetable misses lesson ${id}`);
    mark('Anonymous venue timetable query returns course A\'s 3 lessons', { rows: rows.length });
    restoreVenue = true;
    await db.doc(`venues/${VENUE}`).update({ partnerStatus: 'suspended' });
    await sleep(2000);
    const closed = await timetable();
    assert.equal(closed.status, 403, `suspended venue must hide its timetable: ${closed.status}`);
    await db.doc(`venues/${VENUE}`).update({ partnerStatus: 'active' }); restoreVenue = false;
    await sleep(2000);
    assert.equal((await timetable()).status, 200);
    mark('Suspending the venue turns the timetable query into 403; restored afterwards');

    // ---- 10. Lock invariant and cleanup ----------------------------------------------------------------------
    const fixture = [A, saveC.courseId, saveD.courseId, FREE];
    const locks = await checkLocks(fixture);
    assert.deepEqual(locks.orphans, [], `orphan slots: ${locks.orphans}`); assert.deepEqual(locks.missing, [], `missing slots: ${locks.missing}`);
    mark('Lock invariant holds for the fixture (every slot belongs to a scheduled lesson of a published course and vice versa)', locks);
    if (KEEP) {
      evidence.fixture = { venueId: VENUE, locationId, room1, room2, courses: evidence.courses, staffUid: staff.uid, instrB: instrB.uid };
      mark('Fixture kept for UI work (--keep)', evidence.fixture);
    } else {
      evidence.cleanup = await cleanup(owner, owner.uid);
      mark('Cleanup: courses cancelled and removed, no lock slot of the fixture remains, venue/staff/instructor links reset', evidence.cleanup);
    }
    evidence.completedAt = new Date().toISOString(); evidence.passed = true;
  }
} catch (error) {
  evidence.passed = false; evidence.error = error.stack ?? error.message; console.error(error.stack ?? error.message); process.exitCode = 1;
  if (restoreVenue) await db.doc(`venues/${VENUE}`).update({ partnerStatus: 'active' }).catch(() => {});
  if (!KEEP && !CLEANUP_ONLY && owner) {
    try { evidence.cleanupAfterFailure = await cleanup(owner, owner.uid); } catch (e) { console.error('cleanup after failure failed:', e.message); }
  }
} finally {
  fs.mkdirSync('output/playwright', { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
  console.log('Evidence:', output);
  process.exit(process.exitCode ?? 0);
}
