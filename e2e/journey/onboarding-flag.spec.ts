import { test, expect } from '@playwright/test';
import {
  assertEmulatorsReachable,
  callAs,
  getDoc,
  listDocs,
  putDoc,
  removeDoc,
  waitFor,
} from './helpers/emulator';
import { DEMO_ADMIN } from './helpers/demo';
import {
  idTokenOf,
  loginWithEmail,
  personaContext,
  registerWithEmail,
  skipPermissions,
  uniqueIdentity,
} from './helpers/app';

/**
 * The switch that decides whether signing up as a professional lists you.
 *
 * `systemSettings/providerOnboarding.autoApprove`, read server-side by `applyAsProvider` on
 * every application. Both positions are exercised through a real signup, because the whole
 * point of the flag is what happens to the next person who signs up — asserting only on the
 * stored setting would prove nothing about that.
 *
 * The default is deliberately asserted too: an unconfigured project, and any project whose
 * settings document is missing or malformed, must auto-approve rather than quietly queue
 * every applicant behind a review nobody is watching.
 */

const SETTINGS_PATH = 'systemSettings/providerOnboarding';
const CATEGORY = { id: 'personal_training', label: 'Personal Training' };

/** Set the flag as the demo admin, through the callable, and confirm it took. */
async function setAutoApprove(browser: Parameters<typeof personaContext>[0], value: boolean) {
  const context = await personaContext(browser);
  const page = await context.newPage();
  await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
  const result = await callAs(await idTokenOf(page), 'setProviderOnboardingSettings', {
    autoApprove: value,
  });
  await context.close();
  return result;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await assertEmulatorsReachable();
});

test.afterAll(async () => {
  // Leave the project in the shipped default, whatever the run did.
  await putDoc(SETTINGS_PATH, { autoApprove: true });
});

test.describe('provider onboarding flag', () => {
  test('defaults to auto-approval when nothing is configured', async ({ browser }) => {
    await removeDoc(SETTINGS_PATH);

    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    const read = await callAs(await idTokenOf(page), 'getProviderOnboardingSettings', {});
    await context.close();

    expect(read.ok).toBe(true);
    expect(read.ok === true && (read.data as { autoApprove: boolean }).autoApprove).toBe(true);
  });

  test('with the flag on, a signup is listed immediately', async ({ browser }) => {
    const result = await setAutoApprove(browser, true);
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const applicant = uniqueIdentity('provider');
    const context = await personaContext(browser);
    const page = await context.newPage();
    await registerWithEmail(page, applicant, { providerCategories: [CATEGORY.label] });
    await skipPermissions(page);

    const [uid, user] = await waitFor(
      async () => {
        const all = await listDocs('users');
        const match = Object.entries(all).find(([, u]) => u.email === applicant.email);
        return match && match[1].providerStatus !== undefined ? match : null;
      },
      { what: 'the auto-approved applicant' }
    );

    expect(user.providerStatus).toBe('verified');
    expect(user.role).toBe('provider');

    const instructor = await getDoc(`instructors/${uid}`);
    expect((instructor?.providerProfile as Record<string, unknown>).isVerified).toBe(true);
    // Approval is also what makes them bookable and gives them something to price.
    expect(instructor?.availabilitySchedule).toBeTruthy();
    expect(Object.keys(await listDocs(`instructors/${uid}/services`))).toContain(
      `requested-${CATEGORY.id}`
    );

    await context.close();
  });

  test('with the flag off, a signup waits for an admin and is not public', async ({ browser }) => {
    const result = await setAutoApprove(browser, false);
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const applicant = uniqueIdentity('provider');
    const context = await personaContext(browser);
    const page = await context.newPage();
    await registerWithEmail(page, applicant, { providerCategories: [CATEGORY.label] });
    await skipPermissions(page);

    const [uid, user] = await waitFor(
      async () => {
        const all = await listDocs('users');
        const match = Object.entries(all).find(([, u]) => u.email === applicant.email);
        return match && match[1].providerStatus !== undefined ? match : null;
      },
      { what: 'the pending applicant' }
    );

    expect(user.providerStatus).toBe('pending');
    // Still a customer: the role promotion belongs to the decision, not the application.
    expect(user.role).toBe('customer');

    const instructor = await getDoc(`instructors/${uid}`);
    expect(instructor?.applicationStatus).toBe('pending');
    expect((instructor?.providerProfile as Record<string, unknown>).isVerified).toBe(false);
    expect(instructor?.requestedCategoryIds).toEqual([CATEGORY.id]);
    // Nothing that would make them sellable is seeded before someone approves them.
    expect(instructor?.availabilitySchedule).toBeFalsy();
    expect(Object.keys(await listDocs(`instructors/${uid}/services`))).toHaveLength(0);

    // And they are invisible to customers until then.
    const anon = await personaContext(browser);
    const anonPage = await anon.newPage();
    await anonPage.goto(`/book?providerId=${uid}`);
    await expect(anonPage.getByText(/provider non trovato/i)).toBeVisible();
    await anon.close();

    await context.close();
  });

  test('an admin can work the queue from the back office, not just the callable', async ({ browser }) => {
    // The panel used to hide its buttons behind `role === 'superadmin'`, so an admin saw the
    // pending list and a note telling them they were not allowed to act on it — the callable
    // accepting their call was no help when the UI offered no way to make it.
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await page.goto('/admin/providers');

    await expect(page.getByRole('heading', { name: /domande in attesa/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^verifica$/i }).first()).toBeVisible();
    await expect(page.getByText(/solo un superadmin/i)).toHaveCount(0);

    // And the flag's own switch is on this page, since /admin/settings is superadmin-only.
    await expect(page.getByRole('button', { name: /approvazione automatica/i })).toBeVisible();

    await context.close();
  });

  test('an admin can then approve the queued applicant', async ({ browser }) => {
    const pending = await waitFor(
      async () => {
        const all = await listDocs('instructors');
        const match = Object.entries(all).find(([, i]) => i.applicationStatus === 'pending');
        return match ?? null;
      },
      { what: 'a pending application to decide' }
    );
    const [uid] = pending;

    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    const result = await callAs(await idTokenOf(page), 'decideProviderApplication', {
      providerId: uid,
      decision: 'verified',
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const instructor = await waitFor(
      async () => {
        const i = await getDoc(`instructors/${uid}`);
        return (i?.providerProfile as { isVerified?: boolean })?.isVerified === true ? i : null;
      },
      { what: 'the approved provider' }
    );
    // The decision supplies what the application deliberately withheld.
    expect(instructor.availabilitySchedule).toBeTruthy();
    expect((await getDoc(`users/${uid}`))?.role).toBe('provider');

    await context.close();
  });

  test('the flag refuses anything but a boolean', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    const token = await idTokenOf(page);

    const asString = await callAs(token, 'setProviderOnboardingSettings', { autoApprove: 'false' });
    expect(asString.ok).toBe(false);

    const unknownKey = await callAs(token, 'setProviderOnboardingSettings', {
      autoApprove: true,
      role: 'superadmin',
    });
    expect(unknownKey.ok).toBe(false);

    await context.close();
  });
});
