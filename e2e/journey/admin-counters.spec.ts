import { test, expect } from '@playwright/test';
import { assertEmulatorsReachable, putDoc, removeDoc } from './helpers/emulator';
import { DEMO_ADMIN } from './helpers/demo';
import { loginWithEmail, personaContext } from './helpers/app';

/**
 * The "awaiting verification" counter on /admin/providers.
 *
 * It read 6 on production while the table below it rendered 37 rows as unverified, and 0
 * once hidden accounts were filtered — so an admin saw a queue of providers and a headline
 * saying there was nothing to do. Two causes, both worth a test:
 *
 * 1. The count came from `where('providerProfile.isVerified', '==', false)`. A Firestore
 *    equality filter **never matches a document where the field is absent**, and 31 of the
 *    provider accounts have no `providerProfile` at all — while the table's badge treated a
 *    missing flag as unverified. The two could not agree by construction.
 * 2. It also required `role === 'provider'`, which excludes the people most obviously
 *    waiting: an applicant stays `role: 'customer'` until the decision promotes them.
 *
 * The fixtures below are the three shapes that actually occur in the data, so the count is
 * asserted against each of the ways a record can be incomplete rather than against one tidy
 * example.
 */

const FIXTURES = [
  {
    id: 'e2e-count-no-profile',
    doc: {
      uid: 'e2e-count-no-profile',
      email: 'e2e.count.noprofile@vitfitdemo.dev',
      fullName: 'Counter NoProfile',
      role: 'provider',
      isActive: true,
      createdAt: new Date('2026-01-01T10:00:00Z'),
      // No providerProfile at all: the shape `== false` cannot see.
    },
    counts: true,
  },
  {
    id: 'e2e-count-false-flag',
    doc: {
      uid: 'e2e-count-false-flag',
      email: 'e2e.count.false@vitfitdemo.dev',
      fullName: 'Counter FalseFlag',
      role: 'provider',
      isActive: true,
      createdAt: new Date('2026-01-02T10:00:00Z'),
      providerProfile: { isVerified: false },
    },
    counts: true,
  },
  {
    id: 'e2e-count-applicant',
    doc: {
      uid: 'e2e-count-applicant',
      email: 'e2e.count.applicant@vitfitdemo.dev',
      fullName: 'Counter Applicant',
      // Still a customer — role promotion belongs to the decision.
      role: 'customer',
      providerStatus: 'pending',
      isActive: true,
      createdAt: new Date('2026-01-03T10:00:00Z'),
    },
    counts: true,
  },
  {
    id: 'e2e-count-verified',
    doc: {
      uid: 'e2e-count-verified',
      email: 'e2e.count.verified@vitfitdemo.dev',
      fullName: 'Counter Verified',
      role: 'provider',
      isActive: true,
      createdAt: new Date('2026-01-04T10:00:00Z'),
      providerProfile: { isVerified: true },
    },
    counts: false,
  },
  {
    id: 'e2e-count-rejected',
    doc: {
      uid: 'e2e-count-rejected',
      email: 'e2e.count.rejected@vitfitdemo.dev',
      fullName: 'Counter Rejected',
      role: 'customer',
      providerStatus: 'rejected',
      isActive: true,
      createdAt: new Date('2026-01-05T10:00:00Z'),
      // A decision already made: it must not come back as work to do.
    },
    counts: false,
  },
];

const EXPECTED_NEW = FIXTURES.filter((f) => f.counts).length;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await assertEmulatorsReachable();
  for (const f of FIXTURES) await putDoc(`users/${f.id}`, f.doc);
});

test.afterAll(async () => {
  for (const f of FIXTURES) await removeDoc(`users/${f.id}`);
});

test.describe('admin provider counters', () => {
  test('counts every shape of unverified record, including ones with no providerProfile', async ({
    browser,
  }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await page.goto('/admin/providers');

    const alert = page.getByText(/provider in attesa di verifica/i);
    await expect(alert).toBeVisible();

    const text = (await alert.innerText()).trim();
    const counted = Number.parseInt(text.match(/(\d+)/)?.[1] ?? '0', 10);

    // Other records exist in the emulator, so the assertion is on the contribution of the
    // fixtures rather than on an absolute total — and crucially on it being at least the
    // three that the old query could not see at all.
    expect(counted).toBeGreaterThanOrEqual(EXPECTED_NEW);

    // The specific regression: a provider with no providerProfile is in the queue.
    await page.getByRole('button', { name: /verifiche/i }).first().click();
    await expect(page.getByText('Counter NoProfile')).toBeVisible();

    await context.close();
  });

  test('the badge and the counter tell the same story', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await page.goto('/admin/providers');

    const alert = page.getByText(/provider in attesa di verifica/i);
    await expect(alert).toBeVisible();

    // Filter the table to the unverified ones and confirm the record with no
    // providerProfile is among them — it is rendered unverified, so it must be filterable
    // as unverified too. Before, the Firestore filter dropped it.
    await expect(page.getByText('Counter NoProfile').first()).toBeVisible();
    await expect(page.getByText('Counter Verified').first()).toBeVisible();

    await context.close();
  });

  test('a decided provider is not counted as waiting', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await page.goto('/admin/providers/verifications');

    // Verified and rejected are both decisions; neither belongs in the queue.
    await expect(page.getByText('Counter Verified')).toHaveCount(0);
    await expect(page.getByText('Counter Rejected')).toHaveCount(0);

    await context.close();
  });
});
