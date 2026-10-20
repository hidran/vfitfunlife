// Staging-only API smoke. Uses existing demo accounts; leaves one published course for browser QA.
// Credentials come from environment variables (or the documented staging demo accounts).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
const env = dotenv.parse(fs.readFileSync('.env.staging'));
assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'vfit-app-staging');
const project = 'vfit-app-staging';
const base = `https://europe-west1-${project}.cloudfunctions.net`;
const evidence = { project, startedAt: new Date().toISOString(), checks: [], courses: [] };
const output = 'output/playwright/group-courses-staging-smoke.json';
const mark = (name, detail = {}) => { evidence.checks.push({ name, passed: true, ...detail }); console.log('PASS', name); };
async function login(email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await response.json();
  assert(response.ok, `${email}: ${data.error?.message}`);
  return { uid: data.localId, token: data.idToken };
}
async function call(name, actor, data, expectedError) {
  const response = await fetch(`${base}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` }, body: JSON.stringify({ data }) });
  let body; try { body = await response.json(); } catch { throw new Error(`${name}: HTTP ${response.status}`); }
  if (expectedError) { assert(body.error, `${name} unexpectedly succeeded`); assert.match(body.error.message, expectedError); return body.error; }
  if (body.error || !response.ok) throw new Error(`${name}: ${body.error?.message ?? response.status}`);
  return body.result;
}
async function document(path, actor) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${actor.token}` } });
  assert(response.ok, `Read ${path}: HTTP ${response.status}`);
  return (await response.json()).fields;
}
const value = f => f?.stringValue ?? (f?.integerValue !== undefined ? Number(f.integerValue) : f?.booleanValue ?? f?.timestampValue);
try {
  const provider = await login(process.env.VFIT_SMOKE_PROVIDER_EMAIL ?? 'demo.provider@vitfitdemo.dev', process.env.VFIT_SMOKE_PASSWORD ?? 'VfitDemo!2026');
  const customer = await login(process.env.VFIT_SMOKE_CUSTOMER_EMAIL ?? 'demo.customer@vitfitdemo.dev', process.env.VFIT_SMOKE_PASSWORD ?? 'VfitDemo!2026');
  const admin = await login(process.env.VFIT_SMOKE_ADMIN_EMAIL ?? 'demo.admin@vitfitdemo.dev', process.env.VFIT_SMOKE_PASSWORD ?? 'VfitDemo!2026');
  mark('Existing demo accounts sign in');
  const categoriesResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/serviceCategories?pageSize=300`, { headers: { Authorization: `Bearer ${admin.token}` } });
  const categories = (await categoriesResponse.json()).documents;
  const category = categories.find(d => d.fields.isActive?.booleanValue && d.fields.parentId?.stringValue && /martial|karate|combat/.test(d.name)) ??
    categories.find(d => d.fields.isActive?.booleanValue && d.fields.parentId?.stringValue);
  assert(category, 'An active leaf category is required');
  const startDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const course = { name: 'Karate beginners · Staging smoke', description: 'Course booking verification on staging.', categoryId: category.name.split('/').at(-1),
    location: 'Torino · Staging training room', city: 'Torino', instructor: 'Demo Provider', capacity: 1, durationMinutes: 60,
    startDate, startTime: '18:00', timezone: 'Europe/Rome', recurrence: 'daily', interval: 1, weekdays: [], endDate,
    lessonPriceCents: 1500, seriesPriceCents: 4000, bookingNoticeHours: 2, cancellationHours: 24, level: 'Beginner', equipment: 'Sportswear', state: 'published', enrollmentClosed: false };
  const preview = await call('previewCourse', provider, { course });
  assert.equal(preview.sessions.length, 3); mark('Timezone-aware provider preview');
  const saved = await call('saveCourse', provider, { course }); const courseId = saved.courseId;
  evidence.courses.push(courseId); mark('Provider publishes a linked group service', { courseId });
  const publicResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/courses/${courseId}?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`);
  assert.equal(publicResponse.status, 200); mark('Published eligible course is publicly readable');
  const requestId = randomUUID();
  const lesson = await call('enrollInCourse', customer, { courseId, scope: 'lesson', sessionId: preview.sessions[0].id, requestId });
  assert.equal(lesson.state, 'confirmed'); assert.equal(lesson.totalCents, 1500); mark('Customer reserves one lesson');
  const replay = await call('enrollInCourse', customer, { courseId, scope: 'lesson', sessionId: preview.sessions[0].id, requestId });
  assert.equal(replay.enrollmentId, lesson.enrollmentId); mark('Reservation replay is idempotent');
  await call('enrollInCourse', admin, { courseId, scope: 'series', requestId: randomUUID() }, /lesson_full/);
  const emptyLesson = await document(`courses/${courseId}/sessions/${preview.sessions[1].id}`, customer);
  assert.equal(value(emptyLesson.occupied), 0); mark('Full lesson rejects series without partial occupancy');
  await call('recordCoursePayment', provider, { enrollmentId: lesson.enrollmentId, method: 'cash' });
  assert.equal(value((await document(`courseEnrollments/${lesson.enrollmentId}`, customer)).paymentStatus), 'paid'); mark('Provider records advance direct payment');
  const privateRoster = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/courses/${courseId}/sessions/${preview.sessions[0].id}/participants/${customer.uid}?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`);
  assert.equal(privateRoster.status, 403); mark('Public roster access is denied');
  await call('cancelCourseEnrollment', customer, { enrollmentId: lesson.enrollmentId, sessionIds: [preview.sessions[0].id, preview.sessions[0].id] });
  await call('cancelCourseEnrollment', customer, { enrollmentId: lesson.enrollmentId });
  const cancelled = await document(`courseEnrollments/${lesson.enrollmentId}`, customer);
  assert.equal(value(cancelled.refundCents), 1500);
  assert.equal(value((await document(`courses/${courseId}/sessions/${preview.sessions[0].id}`, customer)).occupied), 0);
  mark('Duplicate cancellation IDs and request replay release/refund once');
  await call('confirmCourseRefund', provider, { refundId: `${lesson.enrollmentId}_${preview.sessions[0].id}` }); mark('Provider confirms direct refund');
  const competing = await Promise.allSettled([call('enrollInCourse', customer, { courseId, scope: 'series', requestId: randomUUID() }),
    call('enrollInCourse', admin, { courseId, scope: 'series', requestId: randomUUID() })]);
  assert.equal(competing.filter(r => r.status === 'fulfilled').length, 1);
  const winnerIndex = competing.findIndex(r => r.status === 'fulfilled'); const winner = competing[winnerIndex].value;
  const winnerActor = winnerIndex === 0 ? customer : admin;
  mark('Concurrent last-seat series booking admits exactly one customer');
  for (const s of preview.sessions) assert.equal(value((await document(`courses/${courseId}/sessions/${s.id}`, provider)).occupied), 1);
  mark('Series reservation occupies every lesson');
  await call('enrollInCourse', winnerActor, { courseId, scope: 'lesson', sessionId: preview.sessions[0].id, requestId: randomUUID() }, /already_enrolled/);
  mark('Lesson/series duplicate membership is denied');
  await call('cancelCourseEnrollment', winnerActor, { enrollmentId: winner.enrollmentId });
  const settings = await document('systemSettings/payments', admin);
  assert.notEqual(value(settings.courseCheckoutEnabled), true); assert.notEqual(value(settings.stripePaymentsEnabled), true);
  await call('createCourseCheckout', customer, { enrollmentId: lesson.enrollmentId }, /not enabled/);
  await call('enrollInCourse', customer, { courseId, scope: 'series', paymentMode: 'stripe', requestId: randomUUID() }, /not enabled/);
  mark('Stripe checkout hidden/off and rejected server-side');
  await call('enrollInCourse', customer, { courseId, scope: 'series', paymentMode: 'vfit_escrow', requestId: randomUUID() }, /invalid_booking_option/);
  mark('Unreleased escrow option rejected');
  await call('manageCourseSession', provider, { courseId, sessionId: preview.sessions[0].id, action: 'reschedule', reason: 'Staging timetable verification', startsAt: new Date(new Date(preview.sessions[0].startsAt).getTime() + 3600000).toISOString() });
  mark('Provider reschedules a lesson');
  await call('manageCourseSession', provider, { courseId, sessionId: preview.sessions[1].id, action: 'cancel', reason: 'Staging cancellation verification' });
  assert.equal(value((await document(`courses/${courseId}/sessions/${preview.sessions[1].id}`, provider)).state), 'cancelled'); mark('Provider cancels one lesson');
  await call('cancelRemainingCourse', provider, { courseId, reason: 'Staging test complete' });
  assert.equal(value((await document(`courses/${courseId}`, provider)).state), 'archived');
  mark('Provider cancels remaining lessons and archives discovery entry');
  const browserCourse = await call('saveCourse', provider, { course: { ...course, name: 'Group fitness · Staging demo', description: 'A small-group fitness course. Reserve one lesson or the entire course.', capacity: 4 } });
  evidence.courses.push(browserCourse.courseId); evidence.browserCourseId = browserCourse.courseId;
  mark('Fresh published demo available for browser smoke', { courseId: browserCourse.courseId });
  evidence.completedAt = new Date().toISOString(); evidence.passed = true;
} catch (error) { evidence.passed = false; evidence.error = error.message; console.error(error.message); process.exitCode = 1; }
finally { fs.mkdirSync('output/playwright', { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2)); console.log('Evidence:', output); }
