// Staging-only annual course verification. Creates an archived QA course and reconciles its direct refunds.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
const env = dotenv.parse(fs.readFileSync('.env.staging'));
const project = 'vfit-app-staging';
assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, project);
const evidence = { project, startedAt: new Date().toISOString(), checks: [] };
const mark = name => { evidence.checks.push(name); console.log('PASS', name); };
async function login(email) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: process.env.VFIT_SMOKE_PASSWORD ?? 'VfitDemo!2026', returnSecureToken: true }) });
  const data = await response.json(); assert(response.ok, data.error?.message); return { token: data.idToken, uid: data.localId };
}
async function call(name, actor, data) {
  const response = await fetch(`https://europe-west1-${project}.cloudfunctions.net/${name}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` }, body: JSON.stringify({ data }) });
  const body = await response.json(); assert(response.ok && !body.error, `${name}: ${body.error?.message ?? response.status}`); return body.result;
}
async function read(path, actor) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${actor.token}` } });
  assert(response.ok, `Read ${path}: ${response.status}`); return (await response.json()).fields;
}
try {
  const provider = await login(process.env.VFIT_SMOKE_PROVIDER_EMAIL ?? 'demo.provider@vitfitdemo.dev');
  const customer = await login(process.env.VFIT_SMOKE_CUSTOMER_EMAIL ?? 'demo.customer@vitfitdemo.dev');
  const admin = await login(process.env.VFIT_SMOKE_ADMIN_EMAIL ?? 'demo.admin@vitfitdemo.dev');
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/serviceCategories?pageSize=300`, { headers: { Authorization: `Bearer ${provider.token}` } });
  const categories = (await response.json()).documents;
  const category = categories.find(d => d.fields.isActive?.booleanValue && d.fields.parentId?.stringValue);
  assert(category);
  const course = { name: 'Annual course · Staging smoke', description: 'Annual booking verification.', categoryId: category.name.split('/').at(-1),
    instructor: 'Demo Provider', location: 'Torino · QA studio', city: 'Torino', capacity: 1, durationMinutes: 60,
    startDate: '2026-10-08', endDate: '2027-10-07', startTime: '18:00', timezone: 'Europe/Rome', recurrence: 'weekly',
    interval: 1, weekdays: [1, 3], lessonPriceCents: 2500, seriesPriceCents: 60000, state: 'published' };
  assert.equal((await call('previewCourse', provider, { course })).sessions.length, 104); mark('Reported annual weekly schedule previews 104 lessons');
  const daily = { ...course, recurrence: 'daily', weekdays: [] };
  const preview = await call('previewCourse', provider, { course: daily }); assert.equal(preview.sessions.length, 365); mark('Annual daily schedule previews 365 lessons');
  const { courseId } = await call('saveCourse', provider, { course: daily }); evidence.courseId = courseId; mark('Provider publishes 365-lesson course');
  const competing = await Promise.allSettled([customer, admin].map(actor => call('enrollInCourse', actor, { courseId, scope: 'series', requestId: randomUUID() })));
  assert.equal(competing.filter(r => r.status === 'fulfilled').length, 1);
  const index = competing.findIndex(r => r.status === 'fulfilled'); const winner = [customer, admin][index]; const booking = competing[index].value;
  mark('Concurrent annual last-seat reservation admits exactly one customer');
  const enrollment = await read(`courseEnrollments/${booking.enrollmentId}`, winner);
  assert.equal(enrollment.activeSessionIds.arrayValue.values.length, 365); assert.equal(booking.totalCents, 60000); mark('Series reserves all 365 lessons for the full price');
  await call('recordCoursePayment', provider, { enrollmentId: booking.enrollmentId, method: 'cash' }); mark('Provider records annual direct payment');
  await call('cancelCourseEnrollment', winner, { enrollmentId: booking.enrollmentId, sessionIds: preview.sessions.map(s => s.id) });
  const cancelled = await read(`courseEnrollments/${booking.enrollmentId}`, winner);
  assert.equal(cancelled.state.stringValue, 'cancelled'); assert.equal(Number(cancelled.refundCents.integerValue), 60000);
  assert.equal(Number((await read(`courses/${courseId}/sessions/${preview.sessions.at(-1).id}`, provider)).occupied.integerValue), 0);
  mark('Full annual cancellation releases the last lesson and owes exactly 60000 cents');
  for (let offset = 0; offset < preview.sessions.length; offset += 10) await Promise.all(preview.sessions.slice(offset, offset + 10).map(s =>
    call('confirmCourseRefund', provider, { refundId: `${booking.enrollmentId}_${s.id}` })));
  mark('QA direct refunds reconciled');
  await call('saveCourse', provider, { courseId, course: { ...daily, state: 'archived' } }); mark('QA course archived after verification');
  evidence.passed = true; evidence.completedAt = new Date().toISOString();
} catch (error) { evidence.passed = false; evidence.error = error.message; console.error(error.message); process.exitCode = 1; }
finally { fs.mkdirSync('output/playwright', { recursive: true }); fs.writeFileSync('output/playwright/course-year-staging-smoke.json', JSON.stringify(evidence, null, 2)); }
