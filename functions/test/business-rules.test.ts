/**
 * Firestore rules for business (company) accounts: the instructors/{uid}.business map, the
 * businessVat/{vat} uniqueness claims and users/{uid}.providerType.
 *
 * Requires the emulator (from functions/):
 *   `npx firebase emulators:exec --only firestore --project demo-vfit-rules "npx vitest run test/business-rules.test.ts"`
 * Honors FIRESTORE_EMULATOR_HOST, defaulting to 127.0.0.1:8080.
 *
 * applyAsProvider writes all of these with the Admin SDK, which bypasses rules; these tests
 * only cover what a CLIENT may write. Plan: docs/plans/2026-10-04-business-accounts-plan.md,
 * task B4.
 */

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

const [emuHost, emuPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');

// Unique uids per test: authenticatedContext() caches an app per uid.
let n = 0;
interface Fixture {
  owner: string;
  individual: string;
  other: string;
  admin: string;
}

const VAT = '01234567897';

function businessMap(extra: Record<string, unknown> = {}) {
  return {
    legalName: 'Karate Club SRL',
    vatNumber: VAT,
    legalForm: 'company',
    affiliationNumber: 'CONI-123',
    displayName: 'Karate Club',
    description: 'Karate e animazione',
    website: 'https://karate.example.it',
    city: 'Milano',
    ...extra,
  };
}

/**
 * Seeds an owner with a business instructors doc (as applyAsProvider leaves it), an
 * individual provider, an unrelated provider and an admin.
 */
async function fixture(opts: {
  applicationStatus?: 'pending' | 'verified';
  business?: Record<string, unknown>;
} = {}): Promise<Fixture> {
  n += 1;
  const f: Fixture = {
    owner: `owner${n}`,
    individual: `individual${n}`,
    other: `other${n}`,
    admin: `admin${n}`,
  };
  const status = opts.applicationStatus ?? 'verified';
  const verified = status === 'verified';
  const business = opts.business ?? businessMap();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${f.owner}`).set({
      uid: f.owner, role: 'provider', providerStatus: status, providerType: 'business',
    });
    await db.doc(`users/${f.individual}`).set({ uid: f.individual, role: 'provider', providerStatus: 'verified' });
    await db.doc(`users/${f.other}`).set({ uid: f.other, role: 'provider', providerStatus: 'verified' });
    await db.doc(`users/${f.admin}`).set({ uid: f.admin, role: 'admin' });
    await db.doc(`instructors/${f.owner}`).set({
      uid: f.owner,
      name: business.displayName ?? 'Karate Club',
      fullName: business.displayName ?? 'Karate Club',
      applicationStatus: status,
      providerProfile: { isVerified: verified },
      business,
    });
    await db.doc(`instructors/${f.individual}`).set({
      uid: f.individual,
      name: 'Mario Rossi',
      fullName: 'Mario Rossi',
      bio: 'Personal trainer',
      city: 'Roma',
      applicationStatus: 'verified',
      providerProfile: { isVerified: true },
    });
  });
  return f;
}

function instructorsAs(uid: string) {
  return testEnv.authenticatedContext(uid).firestore().collection('instructors');
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // Per-file project id: the emulator namespaces data by project, and every rules
    // file calls clearFirestore() in beforeEach.
    projectId: 'demo-vfit-business-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: emuHost,
      port: Number(emuPort),
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

describe('instructors/{uid}.business — owner edits display fields', () => {
  it('the owner can change the public name (mirrored to name/fullName, as B6 will)', async () => {
    const f = await fixture();
    await assertSucceeds(instructorsAs(f.owner).doc(f.owner).update({
      'business.displayName': 'Karate & Fun',
      'name': 'Karate & Fun',
      'fullName': 'Karate & Fun',
    }));
  });

  it('the owner can change description, website, logoUrl and city', async () => {
    const f = await fixture();
    const ref = instructorsAs(f.owner).doc(f.owner);
    await assertSucceeds(ref.update({
      'business.description': 'Karate, judo e feste per bambini',
      'business.website': 'http://karate-fun.example.it/chi-siamo',
      'business.logoUrl': 'https://firebasestorage.googleapis.com/v0/b/x/o/logo.png?alt=media',
      'business.city': 'Monza',
    }));
    // And can clear the optional ones again.
    await assertSucceeds(ref.update({
      'business.description': '',
      'business.website': null,
      'business.logoUrl': null,
      'business.city': '',
    }));
  });

  it('a public name of exactly 120 characters and a website of exactly 200 are accepted', async () => {
    const f = await fixture();
    const website = 'https://' + 'a'.repeat(192);
    await assertSucceeds(instructorsAs(f.owner).doc(f.owner).update({
      'business.displayName': 'x'.repeat(120),
      'business.website': website,
    }));
  });

  it('works on an older business doc without legalForm / affiliationNumber (absent stays absent)', async () => {
    const legacy: Record<string, unknown> = businessMap();
    delete legacy.legalForm;
    delete legacy.affiliationNumber;
    const f = await fixture({ business: legacy });
    await assertSucceeds(instructorsAs(f.owner).doc(f.owner).update({ 'business.displayName': 'Nuovo nome' }));
  });

  it('the owner can still edit non-business fields of a business doc', async () => {
    const f = await fixture();
    await assertSucceeds(instructorsAs(f.owner).doc(f.owner).update({
      requestedCategoryIds: ['karate'],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }));
  });
});

describe('instructors/{uid}.business — reviewed fields are locked for the owner', () => {
  it.each(['pending', 'verified'] as const)('the owner cannot change the tax id while %s', async (status) => {
    const f = await fixture({ applicationStatus: status });
    await assertFails(instructorsAs(f.owner).doc(f.owner).update({ 'business.vatNumber': '12345678903' }));
  });

  it.each(['pending', 'verified'] as const)('the owner cannot change the legal name while %s', async (status) => {
    const f = await fixture({ applicationStatus: status });
    await assertFails(instructorsAs(f.owner).doc(f.owner).update({ 'business.legalName': 'Altra SRL' }));
  });

  it.each(['pending', 'verified'] as const)('the owner cannot change the legal form while %s', async (status) => {
    const f = await fixture({ applicationStatus: status });
    await assertFails(instructorsAs(f.owner).doc(f.owner).update({ 'business.legalForm': 'association' }));
  });

  it('the owner cannot change or remove the affiliation number', async () => {
    const f = await fixture();
    const ref = instructorsAs(f.owner).doc(f.owner);
    await assertFails(ref.update({ 'business.affiliationNumber': 'RASD-999' }));
    await assertFails(ref.update({ 'business.affiliationNumber': firebase.firestore.FieldValue.delete() }));
  });

  it('the owner cannot add a legal form or affiliation number to an older doc that lacks them', async () => {
    const legacy: Record<string, unknown> = businessMap();
    delete legacy.legalForm;
    delete legacy.affiliationNumber;
    const f = await fixture({ business: legacy });
    const ref = instructorsAs(f.owner).doc(f.owner);
    await assertFails(ref.update({ 'business.legalForm': 'association' }));
    await assertFails(ref.update({ 'business.affiliationNumber': 'CONI-1' }));
  });

  it('the owner cannot remove the tax id', async () => {
    const f = await fixture();
    await assertFails(instructorsAs(f.owner).doc(f.owner).update({
      'business.vatNumber': firebase.firestore.FieldValue.delete(),
    }));
  });

  it('the owner cannot swap the tax id by rewriting the whole business map', async () => {
    const f = await fixture();
    await assertFails(instructorsAs(f.owner).doc(f.owner).update({
      business: businessMap({ vatNumber: '12345678903' }),
    }));
  });
});

describe('instructors/{uid}.business — presence of the map', () => {
  it('an individual owner cannot add a business map to their instructors doc', async () => {
    const f = await fixture();
    await assertFails(instructorsAs(f.individual).doc(f.individual).update({ business: businessMap() }));
  });

  it('a business owner cannot remove their business map', async () => {
    const f = await fixture();
    const ref = instructorsAs(f.owner).doc(f.owner);
    await assertFails(ref.update({ business: firebase.firestore.FieldValue.delete() }));
    await assertFails(ref.update({ business: null }));
  });

  it('a business owner cannot drop the map by overwriting the whole doc', async () => {
    const f = await fixture();
    await assertFails(instructorsAs(f.owner).doc(f.owner).set({
      uid: f.owner,
      name: 'Karate Club',
      applicationStatus: 'verified',
      providerProfile: { isVerified: true },
    }));
  });

  it('nobody can create their own instructors doc with a business key', async () => {
    const uid = `newcomer${++n}`;
    await assertFails(instructorsAs(uid).doc(uid).set({
      uid,
      name: 'Karate Club',
      applicationStatus: 'pending',
      providerProfile: { isVerified: false },
      business: businessMap(),
    }));
  });

  it('creating an own pending instructors doc without a business key still works', async () => {
    const uid = `newcomer${++n}`;
    await assertSucceeds(instructorsAs(uid).doc(uid).set({
      uid,
      name: 'Mario Rossi',
      applicationStatus: 'pending',
      providerProfile: { isVerified: false },
    }));
  });
});

describe('instructors/{uid}.business — value checks on owner edits', () => {
  it('rejects a javascript: website', async () => {
    const f = await fixture();
    await assertFails(instructorsAs(f.owner).doc(f.owner).update({ 'business.website': 'javascript:alert(1)' }));
  });

  it('rejects other non-http(s) or malformed websites', async () => {
    const f = await fixture();
    const ref = instructorsAs(f.owner).doc(f.owner);
    await assertFails(ref.update({ 'business.website': 'data:text/html,<script>alert(1)</script>' }));
    await assertFails(ref.update({ 'business.website': 'www.karate.example.it' }));
    await assertFails(ref.update({ 'business.website': 'https://karate.example.it javascript:x' }));
    await assertFails(ref.update({ 'business.website': 42 }));
  });

  it('rejects a website over 200 characters', async () => {
    const f = await fixture();
    await assertFails(instructorsAs(f.owner).doc(f.owner).update({
      'business.website': 'https://' + 'a'.repeat(193),
    }));
  });

  it('rejects an empty, blank or over-120-character public name, or removing it', async () => {
    const f = await fixture();
    const ref = instructorsAs(f.owner).doc(f.owner);
    await assertFails(ref.update({ 'business.displayName': '' }));
    await assertFails(ref.update({ 'business.displayName': '   ' }));
    await assertFails(ref.update({ 'business.displayName': 'x'.repeat(121) }));
    await assertFails(ref.update({ 'business.displayName': firebase.firestore.FieldValue.delete() }));
  });

  it('rejects an over-long description or city', async () => {
    const f = await fixture();
    const ref = instructorsAs(f.owner).doc(f.owner);
    await assertFails(ref.update({ 'business.description': 'x'.repeat(1001) }));
    await assertFails(ref.update({ 'business.city': 'x'.repeat(81) }));
    await assertSucceeds(ref.update({ 'business.description': 'x'.repeat(1000), 'business.city': 'x'.repeat(80) }));
  });

  it('rejects a non-https or over-long logoUrl', async () => {
    const f = await fixture();
    const ref = instructorsAs(f.owner).doc(f.owner);
    await assertFails(ref.update({ 'business.logoUrl': 'http://cdn.example.it/logo.png' }));
    await assertFails(ref.update({ 'business.logoUrl': 'javascript:alert(1)' }));
    await assertFails(ref.update({ 'business.logoUrl': 'https://' + 'a'.repeat(493) }));
  });

  it('rejects an unknown extra key inside business', async () => {
    const f = await fixture();
    await assertFails(instructorsAs(f.owner).doc(f.owner).update({ 'business.isVerified': true }));
  });
});

describe('instructors/{uid}.business — other callers', () => {
  it('another user cannot edit a business map', async () => {
    const f = await fixture();
    await assertFails(instructorsAs(f.other).doc(f.owner).update({ 'business.displayName': 'Hijacked' }));
  });

  it('an admin can change the tax id (and anything else)', async () => {
    const f = await fixture({ applicationStatus: 'pending' });
    const ref = instructorsAs(f.admin).doc(f.owner);
    await assertSucceeds(ref.update({ 'business.vatNumber': '12345678903' }));
    await assertSucceeds(ref.update({ 'business.legalName': 'Karate Club ASD', 'business.legalForm': 'association' }));
  });

  it('an individual owner can still update their own instructors doc as before', async () => {
    const f = await fixture();
    await assertSucceeds(instructorsAs(f.individual).doc(f.individual).update({
      bio: 'Personal trainer certificato',
      city: 'Napoli',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }));
  });

  it('an individual owner still cannot verify themselves', async () => {
    const f = await fixture();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`instructors/${f.individual}`).update({
        applicationStatus: 'pending', providerProfile: { isVerified: false },
      });
    });
    await assertFails(instructorsAs(f.individual).doc(f.individual).update({ 'providerProfile.isVerified': true }));
  });
});

describe('businessVat/{vat} — uniqueness claims are server-only', () => {
  async function seedClaim(f: Fixture) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`businessVat/${VAT}`).set({ uid: f.owner, createdAt: new Date() });
    });
  }

  it('no client can read a claim — not the owner, another user, an admin or a guest', async () => {
    const f = await fixture();
    await seedClaim(f);
    for (const uid of [f.owner, f.other, f.admin]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertFails(db.doc(`businessVat/${VAT}`).get());
      await assertFails(db.collection('businessVat').where('uid', '==', f.owner).get());
    }
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(`businessVat/${VAT}`).get());
  });

  it('no client can create, change or delete a claim — admin included', async () => {
    const f = await fixture();
    await seedClaim(f);
    for (const uid of [f.owner, f.other, f.admin]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertFails(db.doc('businessVat/12345678903').set({ uid, createdAt: new Date() }));
      await assertFails(db.doc(`businessVat/${VAT}`).update({ uid }));
      await assertFails(db.doc(`businessVat/${VAT}`).delete());
    }
  });
});

describe('users/{uid}.providerType — not client-writable by the owner', () => {
  const validUser = (uid: string) => ({
    uid,
    email: `${uid}@example.com`,
    fullName: 'Karate Club',
    role: 'provider',
    providerStatus: 'pending',
  });

  it('the owner can create their users doc without providerType (control)', async () => {
    const uid = `selfmade${++n}`;
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(db.doc(`users/${uid}`).set(validUser(uid)));
  });

  it.each(['business', 'individual'])('the owner cannot create their users doc with providerType %s', async (type) => {
    const uid = `selfmade${++n}`;
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertFails(db.doc(`users/${uid}`).set({ ...validUser(uid), providerType: type }));
  });

  it('a business owner cannot clear or change providerType on update', async () => {
    const f = await fixture();
    const ref = testEnv.authenticatedContext(f.owner).firestore().doc(`users/${f.owner}`);
    await assertFails(ref.update({ providerType: 'individual' }));
    await assertFails(ref.update({ providerType: firebase.firestore.FieldValue.delete() }));
    // ...while an ordinary profile edit still works.
    await assertSucceeds(ref.update({ fullName: 'Karate Club Milano' }));
  });

  it('an individual cannot make themselves a business on update', async () => {
    const f = await fixture();
    const ref = testEnv.authenticatedContext(f.individual).firestore().doc(`users/${f.individual}`);
    await assertFails(ref.update({ providerType: 'business' }));
  });
});
