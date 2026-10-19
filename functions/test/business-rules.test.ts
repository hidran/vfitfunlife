import { describe, it, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Business accounts (plan task B4): the `business` map and `providerType` are written by
// applyAsProvider (Admin SDK). The owner may edit the presentational business fields
// only; the fields an admin verified (legal name, P.IVA) and the venue binding are frozen.
let env: RulesTestEnvironment;
const business = {
  legalName: 'Palestra Roma S.r.l.', vatNumber: '12345678901', displayName: 'Palestra Roma',
  description: 'Gym', website: 'https://palestra.example', logoUrl: 'https://x/logo.png',
  city: 'Roma', venueType: 'gym', address: 'Via Roma 1', venueId: 'venue1',
};
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-vfit-business-rules', firestore: {
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await db.doc('users/admin').set({ role: 'admin', isActive: true });
    await db.doc('users/owner').set({ role: 'provider', providerStatus: 'verified', providerType: 'business', fullName: 'Owner' });
    await db.doc('users/solo').set({ role: 'provider', providerStatus: 'verified', providerType: 'individual', fullName: 'Solo' });
    await db.doc('users/other').set({ role: 'customer', fullName: 'Other' });
    await db.doc('instructors/owner').set({
      uid: 'owner', providerType: 'business', business, applicationStatus: 'approved',
      partnerStatus: 'approved', providerProfile: { isVerified: true },
    });
    await db.doc('instructors/solo').set({
      uid: 'solo', providerType: 'individual', applicationStatus: 'approved',
      partnerStatus: 'approved', providerProfile: { isVerified: true },
    });
    await db.doc('businessVat/12345678901').set({ uid: 'owner', createdAt: new Date() });
  });
});
afterAll(async () => { await env?.cleanup(); });

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('instructors/{uid}.business owner edits', () => {
  it('lets the owner edit the presentational business fields', async () => {
    const doc = as('owner').doc('instructors/owner');
    await assertSucceeds(doc.update({ 'business.displayName': 'Palestra Roma Centro' }));
    await assertSucceeds(doc.update({ 'business.description': 'Updated' }));
    await assertSucceeds(doc.update({ 'business.website': 'https://new.example' }));
    await assertSucceeds(doc.update({ 'business.logoUrl': 'https://x/new.png' }));
    await assertSucceeds(doc.update({ 'business.city': 'Milano' }));
    await assertSucceeds(doc.update({ business: { ...business, displayName: 'Whole map rewrite', city: 'Torino' } }));
  });
  it('freezes the fields the admin verified and the venue binding', async () => {
    const doc = as('owner').doc('instructors/owner');
    await assertFails(doc.update({ 'business.legalName': 'Altro S.r.l.' }));
    await assertFails(doc.update({ 'business.vatNumber': '09876543210' }));
    await assertFails(doc.update({ 'business.venueType': 'studio' }));
    await assertFails(doc.update({ 'business.address': 'Via Milano 2' }));
    await assertFails(doc.update({ 'business.venueId': 'venue2' }));
    await assertFails(doc.update({ business: { ...business, legalName: 'Altro S.r.l.' } }));
    await assertFails(doc.update({ business: { ...business, venueId: null } }));
  });
  it('does not let the owner remove or add the business map', async () => {
    await assertFails(as('owner').doc('instructors/owner').update({ business: null }));
    await assertFails(as('solo').doc('instructors/solo').update({ business }));
  });
  it('does not let the owner change providerType', async () => {
    await assertFails(as('owner').doc('instructors/owner').update({ providerType: 'individual' }));
    await assertFails(as('solo').doc('instructors/solo').update({ providerType: 'business' }));
    await assertFails(as('owner').doc('users/owner').update({ providerType: 'individual' }));
    await assertFails(as('solo').doc('users/solo').update({ providerType: 'business' }));
  });
  it('denies every business edit by another user', async () => {
    const doc = as('other').doc('instructors/owner');
    await assertFails(doc.update({ 'business.displayName': 'Hijacked' }));
    await assertFails(doc.update({ 'business.legalName': 'Hijacked S.r.l.' }));
    await assertFails(doc.update({ providerType: 'individual' }));
  });
  it('keeps admin unrestricted', async () => {
    await assertSucceeds(as('admin').doc('instructors/owner').update({ 'business.legalName': 'Corrected S.r.l.' }));
    await assertSucceeds(as('admin').doc('instructors/owner').update({ providerType: 'business' }));
  });
});

describe('businessVat/{vat}', () => {
  it('is Admin SDK only: no client read or write', async () => {
    await assertFails(env.unauthenticatedContext().firestore().doc('businessVat/12345678901').get());
    await assertFails(as('owner').doc('businessVat/12345678901').get());
    await assertFails(as('admin').doc('businessVat/12345678901').get());
    await assertFails(as('owner').doc('businessVat/x').set({ uid: 'owner' }));
    await assertFails(as('admin').doc('businessVat/12345678901').delete());
  });
});
