/**
 * Firestore rules for client ↔ trainer chat (conversations/{minUid_maxUid} + messages).
 *
 * Requires the emulator: `firebase emulators:exec --only firestore "npx vitest run test/chat-rules.test.ts"`
 * (from functions/). Honors FIRESTORE_EMULATOR_HOST, defaulting to 127.0.0.1:8080.
 *
 * Plan: docs/plans/2026-09-29-communication-booking-plan.md, task C1.
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
  client: string;
  trainer: string;
  otherClient: string;
  outsider: string;
  convId: string;
}

function convIdOf(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

async function fixture(): Promise<Fixture> {
  n += 1;
  const f: Fixture = {
    client: `client${n}`,
    trainer: `trainer${n}`,
    otherClient: `zclient${n}`,
    outsider: `outsider${n}`,
    convId: '',
  };
  f.convId = convIdOf(f.client, f.trainer);
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${f.client}`).set({ uid: f.client, role: 'customer' });
    await db.doc(`users/${f.otherClient}`).set({ uid: f.otherClient, role: 'customer' });
    await db.doc(`users/${f.outsider}`).set({ uid: f.outsider, role: 'customer' });
    await db.doc(`users/${f.trainer}`).set({ uid: f.trainer, role: 'provider', providerStatus: 'verified' });
  });
  return f;
}

function newConversation(f: Fixture, extra: Record<string, unknown> = {}) {
  const ids = [f.client, f.trainer].sort();
  return {
    participantIds: ids,
    participants: {
      [f.client]: { name: 'Client', photoUrl: null },
      [f.trainer]: { name: 'Trainer', photoUrl: null },
    },
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...extra,
  };
}

function newMessage(senderId: string, text = 'Ciao!') {
  return { senderId, text, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
}

/** Seeds an existing conversation (as the trigger would leave it) with one message. */
async function seedConversation(f: Fixture) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`conversations/${f.convId}`).set({
      participantIds: [f.client, f.trainer].sort(),
      participants: { [f.client]: { name: 'Client' }, [f.trainer]: { name: 'Trainer' } },
      createdAt: new Date(),
      lastMessageAt: new Date(),
      lastMessage: 'Ciao!',
      lastSenderId: f.client,
      unread: { [f.client]: 0, [f.trainer]: 3 },
      lastPushAt: {},
    });
    await db.doc(`conversations/${f.convId}/messages/m1`).set({
      senderId: f.client, text: 'Ciao!', createdAt: new Date(),
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-vfit-chat-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: emuHost,
      port: Number(emuPort),
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

describe('conversations — create', () => {
  it('a customer with no prior conversation can open one with a trainer, with the first message in the same batch', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.client).firestore();
    const batch = db.batch();
    batch.set(db.doc(`conversations/${f.convId}`), newConversation(f));
    batch.set(db.doc(`conversations/${f.convId}/messages/first`), newMessage(f.client));
    await assertSucceeds(batch.commit());
  });

  it('a trainer can open a conversation with a customer', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertSucceeds(db.doc(`conversations/${f.convId}`).set(newConversation(f, { bookingId: 'b1' })));
  });

  it('a customer cannot open a conversation with another customer', async () => {
    const f = await fixture();
    const id = convIdOf(f.client, f.otherClient);
    const ids = [f.client, f.otherClient].sort();
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertFails(db.doc(`conversations/${id}`).set({
      participantIds: ids,
      participants: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    }));
  });

  it('a non-participant cannot create a conversation between two others', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.outsider).firestore();
    await assertFails(db.doc(`conversations/${f.convId}`).set(newConversation(f)));
  });

  it('rejects a non-deterministic id', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertFails(db.doc(`conversations/random-id`).set(newConversation(f)));
  });

  it('rejects unsorted participantIds', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.client).firestore();
    const conv = newConversation(f);
    conv.participantIds = [...conv.participantIds].reverse();
    await assertFails(db.doc(`conversations/${f.convId}`).set(conv));
  });

  it('rejects a client-seeded unread counter or lastMessage', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertFails(db.doc(`conversations/${f.convId}`).set(newConversation(f, { unread: { [f.trainer]: 99 } })));
    await assertFails(db.doc(`conversations/${f.convId}`).set(newConversation(f, { lastMessage: 'x' })));
  });

  it('unauthenticated users cannot create', async () => {
    const f = await fixture();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc(`conversations/${f.convId}`).set(newConversation(f)));
  });
});

describe('conversations — read', () => {
  it('a participant can get a conversation that does not exist yet', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertSucceeds(db.doc(`conversations/${f.convId}`).get());
  });

  it('an outsider cannot get a not-yet-existing conversation of others', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.outsider).firestore();
    await assertFails(db.doc(`conversations/${f.convId}`).get());
  });

  it('participants can get and list; outsiders cannot', async () => {
    const f = await fixture();
    await seedConversation(f);
    const clientDb = testEnv.authenticatedContext(f.client).firestore();
    await assertSucceeds(clientDb.doc(`conversations/${f.convId}`).get());
    await assertSucceeds(
      clientDb.collection('conversations')
        .where('participantIds', 'array-contains', f.client)
        .orderBy('lastMessageAt', 'desc')
        .get(),
    );

    const outsiderDb = testEnv.authenticatedContext(f.outsider).firestore();
    await assertFails(outsiderDb.doc(`conversations/${f.convId}`).get());
    await assertFails(outsiderDb.collection('conversations').get());
    await assertFails(
      outsiderDb.collection('conversations').where('participantIds', 'array-contains', f.client).get(),
    );
  });
});

describe('conversations — update / delete', () => {
  it('a participant can reset their own unread count to 0', async () => {
    const f = await fixture();
    await seedConversation(f);
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertSucceeds(db.doc(`conversations/${f.convId}`).update({ [`unread.${f.trainer}`]: 0 }));
  });

  it("a participant cannot change the other side's unread count", async () => {
    const f = await fixture();
    await seedConversation(f);
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertFails(db.doc(`conversations/${f.convId}`).update({ [`unread.${f.trainer}`]: 0 }));
  });

  it('a participant cannot set their own unread to a non-zero value', async () => {
    const f = await fixture();
    await seedConversation(f);
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertFails(db.doc(`conversations/${f.convId}`).update({ [`unread.${f.trainer}`]: 5 }));
  });

  it('a participant can refresh only their own participants entry', async () => {
    const f = await fixture();
    await seedConversation(f);
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertSucceeds(db.doc(`conversations/${f.convId}`).update({
      [`participants.${f.client}`]: { name: 'New Name', photoUrl: null },
    }));
    await assertFails(db.doc(`conversations/${f.convId}`).update({
      [`participants.${f.trainer}`]: { name: 'Hacked' },
    }));
  });

  it('clients cannot write lastMessage, participantIds or the push throttle', async () => {
    const f = await fixture();
    await seedConversation(f);
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertFails(db.doc(`conversations/${f.convId}`).update({ lastMessage: 'spoof' }));
    await assertFails(db.doc(`conversations/${f.convId}`).update({ participantIds: [f.client, f.outsider] }));
    await assertFails(db.doc(`conversations/${f.convId}`).update({ [`lastPushAt.${f.trainer}`]: new Date(0) }));
  });

  it('outsiders cannot update and nobody can delete', async () => {
    const f = await fixture();
    await seedConversation(f);
    const outsiderDb = testEnv.authenticatedContext(f.outsider).firestore();
    await assertFails(outsiderDb.doc(`conversations/${f.convId}`).update({ [`unread.${f.outsider}`]: 0 }));
    const clientDb = testEnv.authenticatedContext(f.client).firestore();
    await assertFails(clientDb.doc(`conversations/${f.convId}`).delete());
  });
});

describe('messages', () => {
  it('participants can read messages; outsiders cannot', async () => {
    const f = await fixture();
    await seedConversation(f);
    await assertSucceeds(
      testEnv.authenticatedContext(f.trainer).firestore()
        .collection(`conversations/${f.convId}/messages`).orderBy('createdAt').get(),
    );
    await assertFails(
      testEnv.authenticatedContext(f.outsider).firestore()
        .collection(`conversations/${f.convId}/messages`).get(),
    );
  });

  it('a participant can send a message as themselves', async () => {
    const f = await fixture();
    await seedConversation(f);
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertSucceeds(db.collection(`conversations/${f.convId}/messages`).add(newMessage(f.trainer)));
  });

  it('senderId must be the caller', async () => {
    const f = await fixture();
    await seedConversation(f);
    const db = testEnv.authenticatedContext(f.trainer).firestore();
    await assertFails(db.collection(`conversations/${f.convId}/messages`).add(newMessage(f.client)));
  });

  it('an outsider cannot post into a conversation', async () => {
    const f = await fixture();
    await seedConversation(f);
    const db = testEnv.authenticatedContext(f.outsider).firestore();
    await assertFails(db.collection(`conversations/${f.convId}/messages`).add(newMessage(f.outsider)));
  });

  it('a message cannot be posted into a conversation that does not exist', async () => {
    const f = await fixture();
    const db = testEnv.authenticatedContext(f.client).firestore();
    await assertFails(db.collection(`conversations/${f.convId}/messages`).add(newMessage(f.client)));
  });

  it('rejects empty, whitespace-only and over-2000-char text', async () => {
    const f = await fixture();
    await seedConversation(f);
    const col = testEnv.authenticatedContext(f.client).firestore().collection(`conversations/${f.convId}/messages`);
    await assertFails(col.add(newMessage(f.client, '')));
    await assertFails(col.add(newMessage(f.client, '    ')));
    await assertFails(col.add(newMessage(f.client, 'x'.repeat(2001))));
    await assertSucceeds(col.add(newMessage(f.client, 'x'.repeat(2000))));
  });

  it('rejects extra fields and a client-chosen createdAt', async () => {
    const f = await fixture();
    await seedConversation(f);
    const col = testEnv.authenticatedContext(f.client).firestore().collection(`conversations/${f.convId}/messages`);
    await assertFails(col.add({ ...newMessage(f.client), readBy: [] }));
    await assertFails(col.add({ senderId: f.client, text: 'hi', createdAt: new Date(0) }));
  });

  it('nobody can edit or delete a message — not even the sender', async () => {
    const f = await fixture();
    await seedConversation(f);
    const senderDb = testEnv.authenticatedContext(f.client).firestore();
    await assertFails(senderDb.doc(`conversations/${f.convId}/messages/m1`).update({ text: 'edited' }));
    await assertFails(senderDb.doc(`conversations/${f.convId}/messages/m1`).delete());
    const otherDb = testEnv.authenticatedContext(f.trainer).firestore();
    await assertFails(otherDb.doc(`conversations/${f.convId}/messages/m1`).update({ text: 'edited' }));
  });
});
