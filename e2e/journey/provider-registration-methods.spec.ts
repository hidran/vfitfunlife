import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { assertEmulatorsReachable, getDoc, latestSmsCode, listDocs, waitFor } from './helpers/emulator';
import {
  personaContext,
  registerWithEmail,
  registerWithPhone,
  skipPermissions,
  uniqueIdentity,
} from './helpers/app';

const CATEGORY = {
  id: 'personal_training',
  label: 'Personal Training',
};

async function expectProviderApplication(
  uid: string,
  userDoc: Record<string, unknown>
): Promise<void> {
  expect(userDoc.providerStatus).toBe('verified');
  expect(userDoc.role).toBe('provider');

  const instructor = await waitFor(() => getDoc(`instructors/${uid}`), {
    what: `provider instructor profile ${uid}`,
  });
  expect(instructor.applicationStatus).toBe('verified');
  expect(instructor.requestedCategoryIds).toEqual([CATEGORY.id]);
  expect((instructor.providerProfile as Record<string, unknown>).isVerified).toBe(true);

  const drafts = await listDocs(`instructors/${uid}/services`);
  expect(Object.keys(drafts)).toContain(`requested-${CATEGORY.id}`);
}

test.describe('provider registration methods', () => {
  test.beforeAll(async () => {
    await assertEmulatorsReachable();
  });

  test('email signup can opt in as a provider and pick categories', async ({ browser }) => {
    const identity = uniqueIdentity('provider-email');
    const context = await personaContext(browser);
    const page = await context.newPage();

    try {
      await registerWithEmail(page, identity, {
        dateOfBirth: '1990-05-15',
        providerCategories: [CATEGORY.label],
      });
      await skipPermissions(page);

      const [uid, userDoc] = await waitFor(
        async () => {
          const all = await listDocs('users');
          const match = Object.entries(all).find(([, u]) => u.email === identity.email);
          return match && match[1].providerStatus !== undefined ? match : null;
        },
        { what: `provider user ${identity.email} carrying a provider decision` }
      );

      expect(userDoc.fullName).toBe(identity.fullName);
      await expectProviderApplication(uid, userDoc);
    } finally {
      await context.close();
    }
  });

  test('phone signup can opt in as a provider and pick categories', async ({ browser }) => {
    const identity = uniqueIdentity('provider-phone');
    const e164 = `+39${identity.phoneLocal}`;
    const context = await personaContext(browser);
    const page = await context.newPage();

    try {
      await registerWithPhone(page, {
        phoneLocal: identity.phoneLocal,
        e164,
        fullName: identity.fullName,
        email: identity.email,
        dateOfBirth: '1992-07-20',
        providerCategories: [CATEGORY.label],
        readCode: latestSmsCode,
      });
      await skipPermissions(page);

      const [uid, userDoc] = await waitFor(
        async () => {
          const all = await listDocs('users');
          const match = Object.entries(all).find(([, u]) => u.phone === e164);
          return match && match[1].providerStatus !== undefined ? match : null;
        },
        { what: `provider user ${e164} carrying a provider decision` }
      );

      expect(userDoc.fullName).toBe(identity.fullName);
      expect(userDoc.email).toBe(identity.email);
      await expectProviderApplication(uid, userDoc);
    } finally {
      await context.close();
    }
  });
});
