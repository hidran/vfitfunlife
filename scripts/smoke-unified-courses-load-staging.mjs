// Staging-only load checks for the unified group courses (P2, task F6 extras requested by the Group D/E review).
//
//   node scripts/smoke-unified-courses-load-staging.mjs                 # both checks, then clean up
//   node scripts/smoke-unified-courses-load-staging.mjs --only-cancel   # check 1 only
//   node scripts/smoke-unified-courses-load-staging.mjs --only-cancel --heavy   # check 1 with ~90 booked lessons
//   ... --measure   # idle 75 s before and 80 s after the cancel, so Cloud Monitoring's per-minute Firestore counters isolate it
//   node scripts/smoke-unified-courses-load-staging.mjs --only-burst    # check 2 only
//   node scripts/smoke-unified-courses-load-staging.mjs --cleanup       # remove a leftover fixture only
//
// Check 1: a venue-linked course with 400 daily lessons (room + instructor day locks), customers enrolled in a few
// lessons and waitlisted in others, then `cancelRemainingCourse` as the owner: duration, outcome, and how long the
// `cancellationReconciled` flags take to settle (the callable's own loop, then the maintainCourseEnrollments job).
// Check 2: 20 concurrent `joinCourseWaitlist` calls from 20 different customers on one full lesson, then a counter
// check through the Admin SDK, then one seat release (promotion) behind the 20-entry waitlist.
//
// Fixture customers: 20 throwaway Auth users (smoke-load-NN@vitfitdemo.dev) with users/{uid} documents. Staging admits
// only allowlisted emails at sign-in, so each gets a temporary `stagingAllowlist/{email}` entry. Everything is removed
// at the end (also after a failure). Staging only: the project is hard-asserted. Evidence:
// output/playwright/unified-courses-load-staging.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

const args = process.argv.slice(2);
const ONLY_CANCEL = args.includes('--only-cancel');
const ONLY_BURST = args.includes('--only-burst');
const CLEANUP_ONLY = args.includes('--cleanup');
const HEAVY = args.includes('--heavy'); // check 1 with many more booked lessons (default 90) to exercise the callable's time budget
const MEASURE = args.includes('--measure'); // idle padding around the cancel so project-wide Monitoring counters isolate it
const HEAVY_LESSONS = Number(process.env.LOAD_HEAVY_LESSONS ?? 90);
const BURST = Number(process.env.LOAD_BURST ?? 20);

const env = dotenv.parse(fs.readFileSync('.env.staging'));
assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'vfit-app-staging', '.env.staging must point at vfit-app-staging');
const project = 'vfit-app-staging';
const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
const base = `https://europe-west1-${project}.cloudfunctions.net`;
delete process.env.FIRESTORE_EMULATOR_HOST;
admin.initializeApp({ projectId: project });
assert.equal(admin.app().options.projectId, 'vfit-app-staging');
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const VENUE = 'smoke_load_venue';
const output = 'output/playwright/unified-courses-load-staging.json';
const fixtureFile = 'output/playwright/unified-courses-load-fixture.json';
const evidence = { project, startedAt: new Date().toISOString(), burst: BURST, checks: [], notes: [] };
const log = (name, detail = {}) => { evidence.checks.push({ name, ...detail }); console.log(name, JSON.stringify(detail)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VFIT = process.env.VFIT_SMOKE_PASSWORD ?? 'VfitDemo!2026';
const JOURNEY = process.env.VFIT_SMOKE_JOURNEY_PASSWORD ?? 'JourneyDemo!2026';
const ACCOUNTS = { owner: ['demo.provider@vitfitdemo.dev', VFIT], instrB: ['journey.en.provider@vitfitdemo.dev', JOURNEY],
  c1: ['demo.customer@vitfitdemo.dev', VFIT], c2: ['journey.en.customer@vitfitdemo.dev', JOURNEY],
  c3: ['journey.it.customer@vitfitdemo.dev', JOURNEY] };
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

async function signIn(email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${email}: ${data.error?.message}`);
  return { email, uid: data.localId, token: data.idToken };
}
const login = (key) => signIn(...ACCOUNTS[key]);

/** Never throws on a callable error: returns {ok, result|error, ms, status}, so the burst can count outcomes. */
async function callRaw(name, actor, data) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}/${name}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` }, body: JSON.stringify({ data }) });
    let body = null; try { body = await response.json(); } catch { /* non-JSON gateway error */ }
    const ms = Date.now() - started;
    if (body?.result !== undefined && response.ok) return { ok: true, result: body.result, ms, status: response.status };
    return { ok: false, error: body?.error ?? { message: `HTTP ${response.status}` }, ms, status: response.status };
  } catch (error) {
    return { ok: false, error: { message: `fetch failed: ${error.message}` }, ms: Date.now() - started, status: 0 };
  }
}
async function call(name, actor, data) {
  const r = await callRaw(name, actor, data);
  if (!r.ok) throw new Error(`${name}: ${JSON.stringify(r.error)}`);
  return r.result;
}

const loadUser = (n) => ({ uid: `smokeload${String(n).padStart(2, '0')}`, email: `smoke-load-${String(n).padStart(2, '0')}@vitfitdemo.dev` });

async function assertCounters(courseId, sessionId) {
  const ref = db.doc(`courses/${courseId}/sessions/${sessionId}`);
  const [session, participants, waitlist] = await Promise.all([ref.get(), ref.collection('participants').get(),
    ref.collection('waitlist').orderBy('position').get()]);
  const s = session.data();
  const out = { occupied: s.occupied, held: s.held, waitlisted: s.waitlisted ?? 0, capacity: s.capacity, participants: participants.size,
    entries: waitlist.size, positions: waitlist.docs.map((d) => d.data().position) };
  const problems = [];
  if (s.occupied !== participants.docs.filter((d) => d.data().state === 'confirmed').length) problems.push('occupied != confirmed participants');
  if (s.held !== participants.docs.filter((d) => d.data().state === 'held').length) problems.push('held != held participants');
  if ((s.waitlisted ?? 0) !== waitlist.size) problems.push('waitlisted != entries');
  if (!out.positions.every((p, i) => p === i + 1)) problems.push('positions are not 1..n');
  if (s.occupied + s.held > s.capacity) problems.push('over capacity');
  return { ...out, problems };
}

async function cleanup() {
  const state = fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : {};
  const courseIds = new Set(state.courseIds ?? []);
  for (const d of (await db.collection('courses').where('venueId', '==', VENUE).get()).docs) courseIds.add(d.id);
  for (const courseId of courseIds) {
    for (const col of ['courseEnrollments', 'courseRefunds', 'courseNotifications']) {
      const docs = await db.collection(col).where('courseId', '==', courseId).get();
      await Promise.all(docs.docs.map((d) => d.ref.delete()));
    }
    await db.recursiveDelete(db.doc(`courses/${courseId}`));
  }
  // Lock documents of the fixture: slots are keyed `${courseId}_${sessionId}`.
  const locks = await db.collection('courseScheduleLocks').get();
  let lockDocs = 0;
  for (const lock of locks.docs) {
    const keys = Object.keys(lock.data().slots ?? {});
    if (keys.length && keys.every((k) => courseIds.has(k.split('_')[0]))) { await lock.ref.delete(); lockDocs++; }
  }
  await db.recursiveDelete(db.doc(`venues/${VENUE}`));
  for (let n = 1; n <= 40; n++) {
    const { uid, email } = loadUser(n);
    await admin.auth().deleteUser(uid).catch(() => {});
    await db.doc(`users/${uid}`).delete().catch(() => {});
    await db.doc(`stagingAllowlist/${email}`).delete().catch(() => {});
    await db.doc(`rateLimits/quoteCourse_${uid}`).delete().catch(() => {});
  }
  if (fs.existsSync(fixtureFile)) fs.rmSync(fixtureFile);
  return { courses: courseIds.size, lockDocsDeleted: lockDocs };
}

const remember = (patch) => {
  const state = fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : { courseIds: [] };
  fs.mkdirSync('output/playwright', { recursive: true });
  fs.writeFileSync(fixtureFile, JSON.stringify({ ...state, ...patch, courseIds: [...new Set([...(state.courseIds ?? []), ...(patch.courseIds ?? [])])] }, null, 2));
};

async function seedVenue(owner, instrB) {
  await db.recursiveDelete(db.doc(`venues/${VENUE}`));
  await db.doc(`venues/${VENUE}`).set({ name: 'Smoke Load Gym', slug: 'smoke-load-gym', type: 'gym', city: 'Torino', address: 'Via Load 1',
    ownerId: owner.uid, partnerStatus: 'active', isPartner: true, isActive: true, memberDiscountPercent: 0,
    partnerInstructorExtraPercent: 0, rating: 0, reviewCount: 0, description: 'Staging load fixture', heroGradients: [],
    amenities: [], hours: [], photoUrls: [], lat: 45.07, lng: 7.68, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const { id: locationId } = await call('saveGymSpace', owner, { kind: 'location', venueId: VENUE, name: 'Load Location', address: 'Via Load 1',
    city: 'Torino', timezone: 'Europe/Rome', isActive: true });
  const { id: room1 } = await call('saveGymSpace', owner, { kind: 'room', venueId: VENUE, locationId, name: 'Load Room 1', isActive: true });
  const { id: room2 } = await call('saveGymSpace', owner, { kind: 'room', venueId: VENUE, locationId, name: 'Load Room 2', isActive: true });
  // The venue-instructor link only (no partnerStatus change on the shared instructor document).
  await db.doc(`venues/${VENUE}/instructors/${instrB.uid}`).set({ isActive: true, name: 'Load instructor', photoUrl: '', updatedAt: FieldValue.serverTimestamp() });
  return { locationId, room1, room2 };
}

const course = (over) => ({
  name: 'Smoke Load', description: 'Load check', location: 'Load place', city: '', instructor: 'Load instructor', venueId: VENUE, instructorId: null,
  capacity: 1, durationMinutes: 60, timezone: 'Europe/Rome', recurrence: 'daily', interval: 1, weekdays: [],
  lessonPriceCents: 1000, seriesPriceCents: null, bookingNoticeHours: 2, cancellationHours: 1, level: '', equipment: '',
  state: 'published', enrollmentClosed: false, waitlistEnabled: true, ...over });

let owner;
try {
  owner = await login('owner');
  if (CLEANUP_ONLY) { evidence.cleanup = await cleanup(); console.log('cleaned', evidence.cleanup); }
  else {
    if (fs.existsSync(fixtureFile) || (await db.doc(`venues/${VENUE}`).get()).exists) evidence.notes.push(`leftover fixture removed: ${JSON.stringify(await cleanup())}`);
    const [instrB, c1, c2, c3] = await Promise.all(['instrB', 'c1', 'c2', 'c3'].map(login));
    const categories = (await db.collection('serviceCategories').get()).docs.filter((d) => d.data().isActive && d.data().parentId);
    const categoryId = (categories.find((d) => /martial|karate|combat|fitness/.test(d.id)) ?? categories[0]).id;
    remember({ courseIds: [] });
    const { locationId, room1, room2 } = await seedVenue(owner, instrB);

    // ================= Check 1: cancelRemainingCourse on 400 lessons =================
    if (!ONLY_BURST) {
      const startDate = ymd(Date.now() + 2 * 86400000); const endDate = ymd(Date.now() + 401 * 86400000);
      const t0 = Date.now();
      const saved = await callRaw('saveCourse', owner, { course: course({ name: 'Smoke Load 400', categoryId, locationId, roomId: room1,
        instructorId: instrB.uid, startDate, endDate, startTime: '07:00' }) });
      log('saveCourse(400 daily lessons, room + instructor locks)', { ok: saved.ok, ms: saved.ms, error: saved.ok ? undefined : saved.error });
      assert(saved.ok, 'saveCourse of 400 lessons failed: ' + JSON.stringify(saved.error));
      const L = saved.result.courseId; remember({ courseIds: [L] });
      const stored = await db.doc(`courses/${L}`).get();
      const ids = stored.data().sessionIds;
      assert.equal(ids.length, 400);
      const lockDocs = (await db.collection('courseScheduleLocks').get()).docs.filter((d) => Object.keys(d.data().slots ?? {}).some((k) => k.startsWith(L + '_')));
      log('locks held after save', { lockDocuments: lockDocs.length, sessions: ids.length });

      // c1 enrolled in lessons 0..2, c2 in 5, c3 in 6; c2 waitlisted on 0 and 1, c3 on 0, c1 on 5.
      const quote = (actor, idsToQuote) => call('quoteCourse', actor, { courseId: L, sessionIds: idsToQuote, includeSeries: false });
      const enroll = async (actor, sid) => {
        const q = (await quote(actor, [sid])).sessions[0];
        return call('enrollInCourse', actor, { courseId: L, scope: 'lesson', sessionId: sid, requestId: randomUUID(),
          expectedFinalCents: q.finalCents, expectedRevisions: { [sid]: q.revision } });
      };
      const enrollments = [];
      for (const [actor, sid] of [[c1, ids[0]], [c1, ids[1]], [c1, ids[2]], [c2, ids[5]], [c3, ids[6]]]) enrollments.push(await enroll(actor, sid));
      const join = (actor, sid) => call('joinCourseWaitlist', actor, { courseId: L, sessionId: sid, paymentMode: 'direct', requestId: randomUUID() });
      for (const [actor, sid] of [[c2, ids[0]], [c3, ids[0]], [c2, ids[1]], [c1, ids[5]]]) await join(actor, sid);
      let bookedLessons = enrollments.length; let waitlistEntries = 4;
      if (HEAVY) {
        // Many booked lessons (capacity 1 each) and a waitlist behind every fifth one: the three customers work in parallel.
        const actors = [c1, c2, c3];
        await Promise.all(actors.map(async (actor, k) => {
          for (let i = 10 + k; i < 10 + HEAVY_LESSONS; i += 3) {
            const sid = ids[i];
            await call('enrollInCourse', actor, { courseId: L, scope: 'lesson', sessionId: sid, requestId: randomUUID(),
              expectedFinalCents: 1000, expectedRevisions: { [sid]: 1 } });
            bookedLessons++;
          }
        }));
        for (let i = 10; i < 10 + HEAVY_LESSONS; i += 5) {
          // the waiting customer is one who does not hold this lesson
          const holder = (i - 10) % 3; const waiter = actors[(holder + 1) % 3];
          await join(waiter, ids[i]); waitlistEntries++;
        }
      }
      log('customers booked', { bookedLessons, waitlistEntries });

      if (MEASURE) await sleep(75000);
      const cancelStarted = Date.now();
      const cancel = await callRaw('cancelRemainingCourse', owner, { courseId: L, reason: 'Load check cancellation' });
      const cancelMs = Date.now() - cancelStarted;
      log('cancelRemainingCourse(400 lessons)', { ok: cancel.ok, ms: cancelMs, status: cancel.status, error: cancel.ok ? undefined : cancel.error });
      evidence.cancel = { ok: cancel.ok, ms: cancelMs, status: cancel.status, error: cancel.ok ? null : cancel.error, startedAt: new Date(cancelStarted).toISOString() };
      if (MEASURE) await sleep(80000);
      // Settling: poll the reconciliation flags (callable's own loop, else the 5-minute maintenance job).
      const series = []; let settledMs = null;
      for (let i = 0; i < 100; i++) {
        const sessions = await db.collection(`courses/${L}/sessions`).get();
        const cancelled = sessions.docs.filter((d) => d.data().state === 'cancelled');
        const reconciled = cancelled.filter((d) => d.data().cancellationReconciled === true).length;
        series.push({ tSec: Math.round((Date.now() - cancelStarted) / 1000), cancelled: cancelled.length, reconciled });
        if (cancelled.length === 400 && reconciled === 400) { settledMs = Date.now() - cancelStarted; break; }
        await sleep(i === 0 ? 1000 : 15000);
      }
      evidence.reconcileSeries = series;
      log('cancellationReconciled settled', { settledMs, last: series.at(-1) });
      const after = await db.doc(`courses/${L}`).get();
      const sessionsAfter = await db.collection(`courses/${L}/sessions`).get();
      const enrollmentDocs = await Promise.all(enrollments.map((e) => db.doc(`courseEnrollments/${e.enrollmentId}`).get()));
      let waitlistLeft = 0;
      for (const d of sessionsAfter.docs) if (d.data().waitlisted !== undefined || HEAVY) waitlistLeft += (await d.ref.collection('waitlist').get()).size;
      const participantsLeft = (await Promise.all(sessionsAfter.docs.map((d) => d.ref.collection('participants').get()))).reduce((n, snap) => n + snap.size, 0);
      const lockLeft = (await db.collection('courseScheduleLocks').get()).docs.filter((d) => Object.keys(d.data().slots ?? {}).some((k) => k.startsWith(L + '_'))).length;
      const verdict = { courseState: after.data().state, cancelledSessions: sessionsAfter.docs.filter((d) => d.data().state === 'cancelled').length,
        unlisted: sessionsAfter.docs.filter((d) => d.data().listed === false).length,
        occupiedLeft: sessionsAfter.docs.reduce((n, d) => n + (d.data().occupied ?? 0), 0),
        waitlistedCounterLeft: sessionsAfter.docs.reduce((n, d) => n + (d.data().waitlisted ?? 0), 0), waitlistEntriesLeft: waitlistLeft, participantsLeft,
        enrollmentStates: enrollmentDocs.map((d) => d.data().state), lockDocumentsLeft: lockLeft,
        enrollmentsAllCancelled: (await db.collection('courseEnrollments').where('courseId', '==', L).get()).docs.every((d) => d.data().state === 'cancelled') };
      evidence.cancelVerdict = verdict; log('after cancelRemainingCourse', verdict);
    }

    // ================= Check 2: burst of concurrent waitlist joins =================
    if (!ONLY_CANCEL) {
      const startDate = ymd(Date.now() + 3 * 86400000);
      const saved = await call('saveCourse', owner, { course: course({ name: 'Smoke Load Burst', categoryId, locationId, roomId: room2,
        startDate, startTime: '06:00', recurrence: 'none', endDate: '' }) });
      const B = saved.courseId; remember({ courseIds: [B] });
      const sid = (await db.doc(`courses/${B}`).get()).data().sessionIds[0];
      const q1 = (await call('quoteCourse', c1, { courseId: B, sessionIds: [sid], includeSeries: false })).sessions[0];
      const seat = await call('enrollInCourse', c1, { courseId: B, scope: 'lesson', sessionId: sid, requestId: randomUUID(),
        expectedFinalCents: q1.finalCents, expectedRevisions: { [sid]: q1.revision } });
      // Fixture customers.
      const users = [];
      for (let n = 1; n <= BURST; n++) {
        const { uid, email } = loadUser(n); const password = randomBytes(12).toString('base64url') + 'aA1!';
        await db.doc(`stagingAllowlist/${email}`).set({ email, note: 'temporary load-check fixture (smoke-unified-courses-load-staging.mjs)', addedBy: 'smoke-load-script', addedAt: FieldValue.serverTimestamp() });
        await admin.auth().deleteUser(uid).catch(() => {});
        await admin.auth().createUser({ uid, email, password, emailVerified: true, displayName: `Load ${n}` });
        await db.doc(`users/${uid}`).set({ uid, email, fullName: `Load Customer ${n}`, displayName: `Load Customer ${n}`, role: 'customer',
          isActive: true, accountStatus: 'active', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        users.push({ ...(await signIn(email, password)), n });
      }
      log('fixture customers ready', { users: users.length });
      const requestIds = users.map(() => randomUUID());
      const burstStarted = Date.now();
      const results = await Promise.all(users.map((u, i) => callRaw('joinCourseWaitlist', u,
        { courseId: B, sessionId: sid, paymentMode: 'direct', requestId: requestIds[i] })));
      const wall = Date.now() - burstStarted;
      const tally = {};
      for (const r of results) {
        const key = r.ok ? `ok(position)` : `${r.error.status ?? r.status}:${r.error.message}`;
        tally[key] = (tally[key] ?? 0) + 1;
      }
      const positions = results.filter((r) => r.ok).map((r) => r.result.position).sort((a, b) => a - b);
      const positionOf = Object.fromEntries(results.map((r, i) => [users[i].uid, r.ok ? r.result.position : null]));
      const ms = results.map((r) => r.ms).sort((a, b) => a - b);
      const counters = await assertCounters(B, sid);
      evidence.burst1 = { wallMs: wall, succeeded: positions.length, failed: results.length - positions.length, tally, positions, positionOf,
        latencyMs: { min: ms[0], median: ms[Math.floor(ms.length / 2)], max: ms.at(-1) }, counters };
      log('burst of concurrent joinCourseWaitlist', evidence.burst1);
      // Retry the failures once (a retryable error is allowed to recover): who needs a second go?
      const failed = results.map((r, i) => ({ r, i })).filter(({ r }) => !r.ok);
      if (failed.length) {
        const retried = await Promise.all(failed.map(({ i }) => callRaw('joinCourseWaitlist', users[i], { courseId: B, sessionId: sid, paymentMode: 'direct', requestId: requestIds[i] })));
        evidence.burstRetry = { retried: retried.length, succeeded: retried.filter((r) => r.ok).length, errors: retried.filter((r) => !r.ok).map((r) => r.error.message) };
        log('retry of the failed joins (same request ids)', evidence.burstRetry);
      }
      const settled = await assertCounters(B, sid);
      evidence.burstSettled = settled; log('counters after the burst', settled);
      // Replay of the whole burst: every call is an inert replay.
      const replay = await Promise.all(users.map((u, i) => callRaw('joinCourseWaitlist', u, { courseId: B, sessionId: sid, paymentMode: 'direct', requestId: requestIds[i] })));
      evidence.burstReplay = { replays: replay.filter((r) => r.ok && r.result.replay === true).length, other: replay.filter((r) => !r.ok || r.result.replay !== true).length };
      log('replay of the burst', evidence.burstReplay);
      // Release the seat behind a 20-entry waitlist: exactly the first entry is promoted.
      const releaseStarted = Date.now();
      await call('cancelCourseEnrollment', c1, { enrollmentId: seat.enrollmentId });
      const afterRelease = await assertCounters(B, sid);
      const promoted = (await db.collection('courseEnrollments').where('courseId', '==', B).where('promotedFromWaitlist', '==', true).get()).docs.map((d) => d.data().userId);
      const position1 = Object.entries(positionOf).find(([, p]) => p === 1)?.[0];
      const position2 = Object.entries(positionOf).find(([, p]) => p === 2)?.[0];
      const nowFirst = (await db.collection(`courses/${B}/sessions/${sid}/waitlist`).orderBy('position').limit(1).get()).docs[0]?.id ?? null;
      evidence.release = { ms: Date.now() - releaseStarted, counters: afterRelease, promotedUserIds: promoted, position1, nowFirstInLine: nowFirst,
        promotedWasFirst: promoted.length === 1 && promoted[0] === position1, renumberedSecondToFirst: nowFirst === position2 };
      log('seat released behind the waitlist', evidence.release);
    }
    evidence.passed = true;
  }
} catch (error) {
  evidence.passed = false; evidence.error = error.stack ?? error.message; console.error(error.stack ?? error.message); process.exitCode = 1;
} finally {
  if (!CLEANUP_ONLY) {
    try { evidence.cleanup = await cleanup(); console.log('cleanup', JSON.stringify(evidence.cleanup)); } catch (e) { console.error('cleanup failed:', e.message); evidence.cleanupError = e.message; }
  }
  evidence.completedAt = new Date().toISOString();
  fs.mkdirSync('output/playwright', { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
  console.log('Evidence:', output);
  process.exit(process.exitCode ?? 0);
}
