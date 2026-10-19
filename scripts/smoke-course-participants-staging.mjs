// Staging-only provider participant/relationship verification. Never sends email to a real recipient.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
const env = dotenv.parse(fs.readFileSync('.env.staging'));
const project = 'vfit-app-staging';
assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, project);
const evidence = { project, startedAt: new Date().toISOString(), checks: [] };
const mark = name => { evidence.checks.push(name); console.log('PASS', name); };
async function login(email, password = 'VfitDemo!2026') {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await response.json(); assert(response.ok, data.error?.message); return { token: data.idToken, uid: data.localId };
}
async function call(name, actor, data) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(`https://europe-west1-${project}.cloudfunctions.net/${name}`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` }, body: JSON.stringify({ data }) });
    const raw = await response.text();
    if ([401, 503].includes(response.status) && raw.trim().startsWith('<') && attempt < 7) {
      await new Promise(resolve => setTimeout(resolve, 5000)); continue;
    }
    let body; try { body = JSON.parse(raw); } catch { throw new Error(`${name}: HTTP ${response.status}, non-JSON response`); }
    assert(response.ok && !body.error, `${name}: ${body.error?.message ?? response.status}`); return body.result;
  }
}
async function read(path, actor) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${actor.token}` } });
  assert(response.ok, `Read ${path}: ${response.status}`); return (await response.json()).fields;
}
async function claim(email) {
  // Admin generates a test-only setup link in memory. Never write/log the credential or password.
  const accessToken = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:sendOobCode`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'x-goog-user-project': project },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email, returnOobLink: true }) });
  const data = await response.json(); assert(response.ok, data.error?.message);
  const code = new URL(data.oobLink).searchParams.get('oobCode'); assert(code);
  const password = `Qa!${randomUUID()}`;
  const applied = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oobCode: code, newPassword: password }) });
  assert(applied.ok, 'QA setup link must set the password');
  return login(email, password);
}
let providerActor;
try {
  const provider = await login('demo.provider@vitfitdemo.dev');
  providerActor = provider;
  const second = await login('demo.trainer@vitfitdemo.dev');
  const customer = await login('demo.customer@vitfitdemo.dev');
  const admin = await login('demo.admin@vitfitdemo.dev');
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/serviceCategories?pageSize=300`, { headers: { Authorization: `Bearer ${provider.token}` } });
  const category = (await response.json()).documents.find(d => d.fields.isActive?.booleanValue && d.fields.parentId?.stringValue);
  assert(category);
  const course = { name: 'Participant management · Staging QA', categoryId: category.name.split('/').at(-1), instructor: 'Demo Provider',
    location: 'Torino · QA', city: 'Torino', capacity: 4, durationMinutes: 60, startDate: '2099-10-12', endDate: '2099-10-14',
    startTime: '18:00', timezone: 'Europe/Rome', recurrence: 'daily', interval: 1, lessonPriceCents: 2500, seriesPriceCents: 6000, state: 'published' };
  const { courseId } = await call('saveCourse', provider, { course }); evidence.courseId = courseId;
  const existing = await call('createClientAccount', provider, { fullName: 'Demo Customer', email: 'demo.customer@vitfitdemo.dev', notifyByEmail: false });
  assert.equal(existing.client.userId, customer.uid); mark('Existing account is reused and linked to provider');
  const existingBooking = await call('enrollCourseParticipant', provider, { courseId, userId: customer.uid, scope: 'lesson', sessionId: '2099-10-12', requestId: randomUUID() });
  const existingDoc = await read(`courseEnrollments/${existingBooking.enrollmentId}`, customer);
  assert.equal(existingDoc.createdBy.stringValue, provider.uid); assert.equal(existingDoc.paymentMode.stringValue, 'direct'); mark('Provider reserves a linked customer lesson with direct payment and creator audit');
  await assert.rejects(call('enrollCourseParticipant', second, { courseId, userId: customer.uid, scope: 'lesson', sessionId: '2099-10-12', requestId: randomUUID() }), /course_owner_required/);
  mark('Other provider cannot enroll into this course');
  const email = `qa.course.${Date.now()}@example.com`; evidence.participantEmail = email;
  const created = await call('createClientAccount', provider, { fullName: 'QA Full Name', email, notifyByEmail: false });
  assert.equal(created.status, 'created'); assert.equal(created.emailSent, false); const userId = created.client.userId; evidence.participantUid = userId;
  assert.equal((await read(`users/${userId}`, admin)).accountStatus.stringValue, 'invited'); mark('Full name and email alone create an invited participant');
  const booking = await call('enrollCourseParticipant', provider, { courseId, userId, scope: 'series', requestId: randomUUID() });
  assert.equal((await read(`courseEnrollments/${booking.enrollmentId}`, provider)).activeSessionIds.arrayValue.values.length, 3); mark('Provider reserves full course for an invited participant');
  const pair2 = await call('createClientAccount', second, { fullName: 'QA Full Name', email, notifyByEmail: false });
  assert.equal(pair2.client.userId, userId); assert.equal(pair2.alreadyExisted, true); mark('Second provider links the same UID without creating a duplicate');
  // Add only a synthetic phone to the pair; no actual SMS is sent by composer preparation.
  const patched = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/clients/${created.client.id}?updateMask.fieldPaths=phone`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.token}` }, body: JSON.stringify({ fields: { phone: { stringValue: '+393330000000' } } }) });
  assert(patched.ok);
  const phone = await call('notifyCourseParticipant', provider, { userId, channel: 'phone' });
  assert.equal(phone.status, 'ready'); assert(phone.url.includes('/auth/participant?email=')); assert(!JSON.stringify(phone).includes('oobCode'));
  assert(phone.smsUrl.startsWith('sms:')); assert(phone.whatsAppUrl.startsWith('https://wa.me/')); mark('Phone invitation provides credential-free SMS and WhatsApp composers');
  const mail = await call('notifyCourseParticipant', provider, { userId, channel: 'email' });
  evidence.emailDelivery = mail.status; assert(['sent', 'failed'].includes(mail.status)); assert(!JSON.stringify(mail).includes('oobCode'));
  mark(`Email notification reports actual delivery result: ${mail.status}`);
  const participant = await claim(email); assert.equal(participant.uid, userId);
  const activated = await call('syncEmailVerification', participant, {}); assert.equal(activated.accountStatus, 'active');
  for (const pair of [created.client.id, pair2.client.id]) assert.equal((await read(`clients/${pair}`, participant)).accountStatus.stringValue, 'active');
  assert.equal((await read(`courseEnrollments/${booking.enrollmentId}`, participant)).userId.stringValue, userId); mark('Email ownership setup activates the same UID, both provider links and existing reservation');
  await call('cancelCourseEnrollment', customer, { enrollmentId: existingBooking.enrollmentId });
  await call('cancelCourseEnrollment', participant, { enrollmentId: booking.enrollmentId });
  await call('saveCourse', provider, { courseId, course: { ...course, state: 'archived' } }); mark('QA bookings cancelled and course archived');
  evidence.passed = true; evidence.completedAt = new Date().toISOString();
} catch (error) {
  evidence.passed = false; evidence.error = error.message; console.error(error.message); process.exitCode = 1;
  if (providerActor && evidence.courseId) {
    try { await call('cancelRemainingCourse', providerActor, { courseId: evidence.courseId, reason: 'Participant smoke-test cleanup' }); evidence.cleanedUp = true; }
    catch (cleanup) { evidence.cleanupError = cleanup.message; }
  }
}
finally { fs.mkdirSync('output/playwright', { recursive: true }); fs.writeFileSync('output/playwright/course-participants-staging-smoke.json', JSON.stringify(evidence, null, 2)); }
