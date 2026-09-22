import { test, expect, type Page } from '@playwright/test';
import { assertEmulatorsReachable, callAs, getDoc, putDoc, waitFor } from './helpers/emulator';
import { DEMO_ADMIN, DEMO_PROVIDER, SUPERADMIN } from './helpers/demo';
import { idTokenOf, loginWithEmail, personaContext } from './helpers/app';

/**
 * What the back office can do, and what it still cannot.
 *
 * Running the marketplace is an admin's job: verifying providers and moving people between
 * customer, provider and admin. The superadmin role is the one thing held back, in both
 * directions — an admin can neither grant it nor take it away. Without that second half,
 * "admins can change roles" would quietly mean "any admin can demote the real superadmin and
 * promote themselves", which is not a permission model at all.
 *
 * The role changes go through the callable rather than the admin screens: the callable is
 * where the rule lives, and asserting on it directly is what proves a refusal is a refusal
 * rather than a button that happens to be hidden.
 */

/** Invoke a callable as whoever is signed in on `page`. */
async function callFunction(page: Page, name: string, data: unknown) {
  return callAs(await idTokenOf(page), name, data);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await assertEmulatorsReachable();
});

test.describe('admin powers', () => {
  test('an admin can un-verify a provider, which takes them out of the marketplace', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await expect(page).toHaveURL(/\/admin/);

    const result = await callFunction(page, 'decideProviderApplication', {
      providerId: DEMO_PROVIDER.uid,
      decision: 'rejected',
      notes: 'e2e: revoke',
    });
    expect(result.ok, `admin should be allowed to decide: ${JSON.stringify(result)}`).toBe(true);

    const instructor = await waitFor(
      async () => {
        const i = await getDoc(`instructors/${DEMO_PROVIDER.uid}`);
        return (i?.providerProfile as { isVerified?: boolean })?.isVerified === false ? i : null;
      },
      { what: 'the provider to become unverified' }
    );
    expect(instructor.applicationStatus).toBe('rejected');

    // And the public page closes: the read rule is keyed on that nested flag.
    const anon = await personaContext(browser);
    const anonPage = await anon.newPage();
    await anonPage.goto(`/book?providerId=${DEMO_PROVIDER.uid}`);
    await expect(anonPage.getByText(/provider non trovato/i)).toBeVisible();
    await anon.close();

    await context.close();
  });

  test('an admin can verify them again and they come back', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);

    const result = await callFunction(page, 'decideProviderApplication', {
      providerId: DEMO_PROVIDER.uid,
      decision: 'verified',
    });
    expect(result.ok).toBe(true);

    const instructor = await waitFor(
      async () => {
        const i = await getDoc(`instructors/${DEMO_PROVIDER.uid}`);
        return (i?.providerProfile as { isVerified?: boolean })?.isVerified === true ? i : null;
      },
      { what: 'the provider to be verified again' }
    );
    // The dotted-key regression again: verifying through merge must write the nested flag.
    expect(Object.keys(instructor)).not.toContain('providerProfile.isVerified');

    const anon = await personaContext(browser);
    const anonPage = await anon.newPage();
    await anonPage.goto(`/book?providerId=${DEMO_PROVIDER.uid}`);
    await expect(anonPage.getByText(DEMO_PROVIDER.fullName).first()).toBeVisible();
    await anon.close();

    await context.close();
  });

  test('an admin can change a user\'s role', async ({ browser }) => {
    // A throwaway target, so the demo accounts keep their roles.
    const targetUid = `e2e-role-target-${Date.now().toString(36)}`;
    await putDoc(`users/${targetUid}`, {
      uid: targetUid,
      email: `${targetUid}@vitfitdemo.dev`,
      fullName: 'Role Target',
      role: 'customer',
      isActive: true,
      permissions: ['bookings:read'],
    });

    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);

    const result = await callFunction(page, 'setUserRole', {
      userId: targetUid,
      role: 'provider',
      reason: 'e2e: promotion by an admin',
    });
    expect(result.ok, `admin should be allowed to set roles: ${JSON.stringify(result)}`).toBe(true);

    const updated = await waitFor(
      async () => {
        const u = await getDoc(`users/${targetUid}`);
        return u?.role === 'provider' ? u : null;
      },
      { what: 'the promoted user' }
    );
    expect(updated.roleUpdatedBy).toBe(DEMO_ADMIN.uid);

    await context.close();
  });

  test('an admin cannot grant the superadmin role', async ({ browser }) => {
    const targetUid = `e2e-role-target-${Date.now().toString(36)}`;
    await putDoc(`users/${targetUid}`, {
      uid: targetUid,
      email: `${targetUid}@vitfitdemo.dev`,
      fullName: 'Role Target',
      role: 'customer',
      isActive: true,
      permissions: [],
    });

    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);

    const result = await callFunction(page, 'setUserRole', {
      userId: targetUid,
      role: 'superadmin',
      reason: 'e2e: should be refused',
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toMatch(/permission[-_]denied/i);

    const after = await getDoc(`users/${targetUid}`);
    expect(after?.role).toBe('customer');

    await context.close();
  });

  test('an admin cannot demote a superadmin', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);

    const result = await callFunction(page, 'setUserRole', {
      userId: SUPERADMIN.uid,
      role: 'customer',
      reason: 'e2e: should be refused',
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toMatch(/permission[-_]denied/i);

    const after = await getDoc(`users/${SUPERADMIN.uid}`);
    expect(after?.role).toBe('superadmin');

    await context.close();
  });

  test('nobody changes their own role, not even an admin', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);

    const result = await callFunction(page, 'setUserRole', {
      userId: DEMO_ADMIN.uid,
      role: 'customer',
      reason: 'e2e: should be refused',
    });

    expect(result.ok).toBe(false);
    const after = await getDoc(`users/${DEMO_ADMIN.uid}`);
    expect(after?.role).toBe('admin');

    await context.close();
  });
});
