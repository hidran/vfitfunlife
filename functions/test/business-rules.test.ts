import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
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
const EDITABLE = ['displayName', 'description', 'website', 'logoUrl', 'city'] as const;
const FROZEN = ['legalName', 'vatNumber', 'venueType', 'address', 'venueId'] as const;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // Per-file project id: the emulator namespaces data by project, and every rules
    // file calls clearFirestore() in beforeEach, so sharing an id lets files wipe each
    // other's seed data when vitest runs them in parallel.
    projectId: 'demo-vfit-business-rules',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080,
    },
  });
});
afterAll(async () => { await env?.cleanup(); });

async function seed() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await db.doc('users/admin').set({ role: 'admin', isActive: true });
    await db.doc('users/owner').set({ role: 'provider', providerStatus: 'verified', providerType: 'business', fullName: 'Owner' });
    await db.doc('users/solo').set({ role: 'provider', providerStatus: 'verified', providerType: 'individual', fullName: 'Solo' });
    await db.doc('users/legacy').set({ role: 'provider', providerStatus: 'verified', fullName: 'Legacy' });
    await db.doc('users/other').set({ role: 'customer', fullName: 'Other' });
    await db.doc('instructors/owner').set({
      uid: 'owner', providerType: 'business', business, applicationStatus: 'approved',
      partnerStatus: 'approved', providerProfile: { isVerified: true }, bio: 'b',
    });
    await db.doc('instructors/solo').set({
      uid: 'solo', providerType: 'individual', applicationStatus: 'approved',
      partnerStatus: 'approved', providerProfile: { isVerified: true }, bio: 'b',
    });
    // Pre-business-accounts doc: no providerType at all.
    await db.doc('instructors/legacy').set({
      uid: 'legacy', applicationStatus: 'approved', partnerStatus: 'approved',
      providerProfile: { isVerified: true }, bio: 'b',
    });
    await db.doc('businessVat/12345678901').set({ uid: 'owner', createdAt: new Date() });
    // A company whose stored website predates the rule (or was written by an admin): odd, but
    // the owner must still be able to edit everything else.
    await db.doc('users/legacyweb').set({ role: 'provider', providerStatus: 'verified', providerType: 'business', fullName: 'Legacy web' });
    await db.doc('instructors/legacyweb').set({
      uid: 'legacyweb', providerType: 'business', business: { ...business, website: 'javascript:alert(1)' },
      applicationStatus: 'approved', partnerStatus: 'approved', providerProfile: { isVerified: true }, bio: 'b',
    });
  });
}
beforeEach(async () => { await env.clearFirestore(); await seed(); });

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('instructors/{uid}.business owner edits', () => {
  it.each(EDITABLE)('lets the owner edit business.%s', async field => {
    const value = field === 'website' ? 'https://changed.example' : 'changed';
    await assertSucceeds(as('owner').doc('instructors/owner').update({ [`business.${field}`]: value }));
  });
  it('only accepts an http(s) website from the owner (it becomes a clickable href)', async () => {
    const doc = as('owner').doc('instructors/owner');
    await assertFails(doc.update({ 'business.website': 'javascript:alert(1)' }));
    await assertFails(doc.update({ 'business.website': 'data:text/html,hi' }));
    await assertFails(doc.update({ 'business.website': 'palestra.example' }));
    await assertFails(doc.update({ 'business.website': 42 }));
    await assertFails(doc.update({ 'business.website': `https://${'a'.repeat(300)}.example` }));
    await assertSucceeds(doc.update({ 'business.website': 'https://example.com' }));
    await assertSucceeds(doc.update({ 'business.website': 'http://example.com/path' }));
    await assertSucceeds(doc.update({ 'business.website': '' }));
    await assertSucceeds(doc.update({ 'business.website': null }));
    await assertFails(doc.update({ business: { ...business, website: 'javascript:alert(1)' } }));
  });
  it('accepts an upper- or mixed-case scheme (no regex flags in rules, so spelled out)', async () => {
    const doc = as('owner').doc('instructors/owner');
    await assertSucceeds(doc.update({ 'business.website': 'HTTPS://Example.com' }));
    await assertSucceeds(doc.update({ 'business.website': 'hTTp://example.com' }));
    await assertFails(doc.update({ 'business.website': 'HTTPS://' }));
    await assertFails(doc.update({ 'business.website': 'JAVASCRIPT:alert(1)' }));
  });
  it('does not lock the owner out of other edits when the stored website is legacy/invalid', async () => {
    const doc = as('legacyweb').doc('instructors/legacyweb');
    await assertSucceeds(doc.update({ 'business.city': 'Torino' }));
    await assertSucceeds(doc.update({ bio: 'new bio' }));
    await assertSucceeds(doc.update({ business: { ...business, website: 'javascript:alert(1)', city: 'Roma' } }));
    // Changing it is still checked: to another bad value fails, to a good one or none works.
    await assertFails(doc.update({ 'business.website': 'data:text/html,hi' }));
    await assertSucceeds(doc.update({ 'business.website': 'https://fixed.example' }));
  });
  it('lets the owner rewrite the whole map when only editable fields differ', async () => {
    await assertSucceeds(as('owner').doc('instructors/owner').update({ business: { ...business, displayName: 'New', city: 'Torino' } }));
  });
  it.each(FROZEN)('freezes business.%s for the owner', async field => {
    const doc = as('owner').doc('instructors/owner');
    await assertFails(doc.update({ [`business.${field}`]: 'changed' }));
    await assertFails(doc.update({ business: { ...business, [field]: 'changed' } }));
    await assertFails(doc.update({ business: { ...business, [field]: null } }));
  });
  it('denies an unknown business key (allowlist, fail-closed)', async () => {
    await assertFails(as('owner').doc('instructors/owner').update({ 'business.unknownKey': 'x' }));
  });
  it('does not let the owner remove or add the business map', async () => {
    await assertFails(as('owner').doc('instructors/owner').update({ business: null }));
    await assertFails(as('solo').doc('instructors/solo').update({ business }));
    await assertFails(as('legacy').doc('instructors/legacy').update({ business }));
  });
  it('does not let the owner change providerType on instructors or users', async () => {
    await assertFails(as('owner').doc('instructors/owner').update({ providerType: 'individual' }));
    await assertFails(as('solo').doc('instructors/solo').update({ providerType: 'business' }));
    await assertFails(as('legacy').doc('instructors/legacy').update({ providerType: 'business' }));
    await assertFails(as('owner').doc('users/owner').update({ providerType: 'individual' }));
    await assertFails(as('solo').doc('users/solo').update({ providerType: 'business' }));
    await assertFails(as('legacy').doc('users/legacy').update({ providerType: 'business' }));
  });
  it('still lets individual and legacy owners edit ordinary profile fields', async () => {
    await assertSucceeds(as('solo').doc('instructors/solo').update({ bio: 'new bio' }));
    await assertSucceeds(as('legacy').doc('instructors/legacy').update({ bio: 'new bio' }));
    await assertSucceeds(as('owner').doc('instructors/owner').update({ bio: 'new bio' }));
  });
  it('denies every business edit by another user', async () => {
    const doc = as('other').doc('instructors/owner');
    await assertFails(doc.update({ 'business.displayName': 'Hijacked' }));
    await assertFails(doc.update({ 'business.legalName': 'Hijacked S.r.l.' }));
    await assertFails(doc.update({ providerType: 'individual' }));
  });
  it('keeps admin unrestricted', async () => {
    const doc = as('admin').doc('instructors/owner');
    await assertSucceeds(doc.update({ 'business.legalName': 'Corrected S.r.l.' }));
    await assertSucceeds(doc.update({ 'business.vatNumber': '09876543210' }));
    await assertSucceeds(doc.update({ providerType: 'individual' }));
  });
});

describe('instructors/{uid} owner create', () => {
  const pending = { uid: 'newbie', applicationStatus: 'pending', partnerStatus: 'pending', providerProfile: { isVerified: false } };
  it('allows a plain pending create', async () => {
    await assertSucceeds(as('newbie').doc('instructors/newbie').set(pending));
  });
  it('rejects a create that carries a business map', async () => {
    await assertFails(as('newbie').doc('instructors/newbie').set({ ...pending, business }));
  });
  it('rejects a create with providerType business', async () => {
    await assertFails(as('newbie').doc('instructors/newbie').set({ ...pending, providerType: 'business' }));
  });
});

describe('businessVat/{vat}', () => {
  it('denies client reads, authenticated or not', async () => {
    await assertFails(env.unauthenticatedContext().firestore().doc('businessVat/12345678901').get());
    await assertFails(as('owner').doc('businessVat/12345678901').get());
    await assertFails(as('admin').doc('businessVat/12345678901').get());
  });
  it('denies client writes', async () => {
    await assertFails(as('owner').doc('businessVat/x').set({ uid: 'owner' }));
    await assertFails(as('admin').doc('businessVat/12345678901').update({ uid: 'admin' }));
    await assertFails(as('admin').doc('businessVat/12345678901').delete());
  });
});
