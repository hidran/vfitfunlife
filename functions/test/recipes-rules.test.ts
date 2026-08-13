/**
 * Firestore rules for the top-level `recipes` collection — P2-6.
 *
 * Requires the emulator:
 *   firebase emulators:exec --only firestore "cd functions && npx vitest run test/recipes-rules.test.ts"
 *
 * A recipe is owned by whoever generated it (`ownerUid`) and read by anyone listed in
 * `sharedWithUserIds`. There is deliberately no `clientId` — a recipe is not addressed to
 * anyone, which is what keeps it a generic suggestion rather than a personalised diet.
 *
 * The `list` cases at the bottom are the point of this file. Firestore evaluates list rules
 * against the QUERY, not the documents it would return, so the query shape is part of the
 * security design (spec §6.4): a trainer listing what they shared with one client must ALSO
 * constrain `ownerUid == their own uid`, because `sharedWithUserIds array-contains
 * <clientUid>` alone is denied for everyone — including the recipe's owner.
 *
 * API note: this file mixes the compat chaining style used by booking-rules.test.ts with the
 * modular free functions, which the list queries need. The modular helpers unwrap the compat
 * instance, so both work against the same `ctx.firestore()`.
 */

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { collection, query, where, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

// Each test uses its own uids: authenticatedContext() caches an app per uid, and reusing
// one across tests re-triggers Firestore settings on an already-started instance.
let n = 0;
interface Fixture { trainer: string; client: string; outsider: string; recipe: string }

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // Per-file project id: the emulator namespaces data by project, and every rules
    // file calls clearFirestore() in beforeEach. Sharing one id let a file wipe
    // another's seed data mid-test whenever vitest ran them in parallel.
    projectId: 'demo-vfit-recipes-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

/**
 * Seeds one recipe owned by the trainer and shared with the client. The `users` docs matter:
 * isAdmin() resolves the caller's role through a get(), so every caller needs one.
 */
async function seed(): Promise<Fixture> {
  n += 1;
  const f: Fixture = {
    trainer: `r-trainer-${n}`, client: `r-client-${n}`,
    outsider: `r-outsider-${n}`, recipe: `r-recipe-${n}`,
  };
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // ctx.firestore() must be called ONCE per context: each call re-applies settings to an
    // already-started Firestore instance and throws failed-precondition.
    const adminDb = ctx.firestore();
    await adminDb.collection('users').doc(f.trainer).set({ uid: f.trainer, role: 'provider' });
    await adminDb.collection('users').doc(f.client).set({ uid: f.client, role: 'customer' });
    await adminDb.collection('users').doc(f.outsider).set({ uid: f.outsider, role: 'customer' });
    await adminDb.collection('recipes').doc(f.recipe).set({
      title: 'Pasta e ceci',
      servings: 2,
      prepMinutes: 15,
      ingredients: [{ item: 'ceci', quantity: '200 g' }, { item: 'pasta', quantity: '160 g' }],
      steps: ['Scalda l’olio.', 'Aggiungi i ceci.'],
      source: 'ai',
      ownerUid: f.trainer,
      ownerRole: 'provider',
      sharedWithUserIds: [f.client],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
  return f;
}

describe('recipes — read', () => {
  it('allows the owner to read their own recipe', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertSucceeds(db.collection('recipes').doc(f.recipe).get());
  });

  it('allows a uid present in sharedWithUserIds to read it', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertSucceeds(db.collection('recipes').doc(f.recipe).get());
  });

  it('denies an unrelated uid', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.outsider).firestore();
    await assertFails(db.collection('recipes').doc(f.recipe).get());
  });
});

describe('recipes — create', () => {
  it('allows authoring an unshared recipe under your own ownerUid', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertSucceeds(
      db.collection('recipes').doc(`new-${f.recipe}`).set({
        title: 'Insalata di farro',
        ownerUid: f.trainer,
        sharedWithUserIds: [],
        source: 'manual',
        createdAt: new Date(),
      })
    );
  });

  it('denies creating a recipe under someone else’s ownerUid', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.outsider).firestore();
    await assertFails(
      db.collection('recipes').doc(`spoof-${f.recipe}`).set({
        title: 'Insalata di farro',
        ownerUid: f.trainer,
        sharedWithUserIds: [],
        source: 'manual',
        createdAt: new Date(),
      })
    );
  });

  it('denies creating a recipe that is already shared', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertFails(
      db.collection('recipes').doc(`preshared-${f.recipe}`).set({
        title: 'Insalata di farro',
        ownerUid: f.trainer,
        sharedWithUserIds: [f.client],
        source: 'manual',
        createdAt: new Date(),
      })
    );
  });
});

describe('recipes — update (sharing)', () => {
  it('allows the owner to share with 3 uids', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertSucceeds(
      db.collection('recipes').doc(f.recipe).update({
        sharedWithUserIds: [f.client, `${f.client}-b`, `${f.client}-c`],
        updatedAt: new Date(),
      })
    );
  });

  it('denies the owner sharing with 51 uids — the cap stops it being a broadcast channel', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    const fiftyOne = Array.from({ length: 51 }, (_, i) => `${f.client}-${i}`);
    await assertFails(
      db.collection('recipes').doc(f.recipe).update({
        sharedWithUserIds: fiftyOne,
        updatedAt: new Date(),
      })
    );
  });
});

describe('recipes — delete', () => {
  it('allows the owner to delete their own recipe', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertSucceeds(db.collection('recipes').doc(f.recipe).delete());
  });

  it('denies a non-owner deleting it', async () => {
    const f = await seed();
    const db = testEnv.authenticatedContext(f.outsider).firestore();
    await assertFails(db.collection('recipes').doc(f.recipe).delete());
  });
});

/**
 * The four query shapes of spec §6.4. `orderBy('createdAt')` is deliberately omitted: the
 * emulator does not need the composite index, and adding it only introduces a failure mode
 * unrelated to what these assert.
 */
describe('recipes — list (the query shapes the rules authorize)', () => {
  it('allows the owner to query ownerUid == own uid (/provider/recipes, "Le mie ricette")', async () => {
    const f = await seed();
    const trainerDb = testEnv.authenticatedContext(f.trainer).firestore();
    const recipes = collection(trainerDb, 'recipes');
    await assertSucceeds(getDocs(query(recipes, where('ownerUid', '==', f.trainer))));
  });

  it('allows a client to query sharedWithUserIds array-contains own uid ("Consigliate dal tuo trainer")', async () => {
    const f = await seed();
    const clientDb = testEnv.authenticatedContext(f.client).firestore();
    const recipes = collection(clientDb, 'recipes');
    await assertSucceeds(getDocs(query(recipes, where('sharedWithUserIds', 'array-contains', f.client))));
  });

  it('DENIES a trainer querying sharedWithUserIds array-contains the CLIENT uid alone', async () => {
    const f = await seed();
    const trainerDb = testEnv.authenticatedContext(f.trainer).firestore();
    const recipes = collection(trainerDb, 'recipes');
    // DENIED: the array-contains value is the client's uid, but the rule tests the caller's.
    // Denied even though the trainer owns every document the query would return — the rule is
    // evaluated against the query, and this query does not prove that.
    await assertFails(getDocs(query(
      recipes, where('sharedWithUserIds', 'array-contains', f.client),
    )));
  });

  it('allows the same query once ownerUid == own uid is added (client detail RecipesTab)', async () => {
    const f = await seed();
    const trainerDb = testEnv.authenticatedContext(f.trainer).firestore();
    const recipes = collection(trainerDb, 'recipes');
    // ALLOWED: the ownerUid constraint is what makes the query provably safe.
    await assertSucceeds(getDocs(query(
      recipes,
      where('ownerUid', '==', f.trainer),
      where('sharedWithUserIds', 'array-contains', f.client),
    )));
  });
});
