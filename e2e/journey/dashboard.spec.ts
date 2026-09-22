import { test, expect, type Page } from '@playwright/test';
import { assertEmulatorsReachable, listDocs, putDoc, removeDoc, waitFor } from './helpers/emulator';
import { DEMO_PROVIDER, bookingFixture } from './helpers/demo';
import { loginWithEmail, personaContext } from './helpers/app';

/**
 * The provider dashboard's counters.
 *
 * This screen has been wrong twice in ways nobody could see, and both failures looked the
 * same from the outside — every tile reading zero while the bookings sat in Firestore:
 *
 * 1. The queries filtered on `confirmed` / `in_progress` / `pending`, a status vocabulary
 *    that `accepted`, `payment_confirmed` and `requested` had replaced.
 * 2. `getProviderDashboardStats` looked the provider up in `providers`, a collection that
 *    holds no documents in any environment, and returned an all-zero object before running
 *    a single one of those queries.
 *
 * So the bookings here are arranged directly in Firestore with deliberately chosen statuses
 * and dates, and the test asserts the rendered numbers. A tile showing 0 when a booking
 * exists is the bug; a tile showing 0 because nothing matches is the point of the
 * "ignores" cases below.
 */

const ids: string[] = [];

/** Today at a fixed hour, so "today" never straddles midnight mid-run. */
function todayAt(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

function daysFromNow(days: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function seedBooking(id: string, opts: Parameters<typeof bookingFixture>[0]) {
  await putDoc(`bookings/${id}`, bookingFixture(opts));
  ids.push(id);
}

/** The number rendered inside the tile whose label matches. */
async function tileValue(page: Page, label: RegExp): Promise<string> {
  const tile = page.locator('p', { hasText: label }).first();
  await expect(tile).toBeVisible();
  const value = tile.locator('xpath=following-sibling::p[1]');
  return (await value.innerText()).trim();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await assertEmulatorsReachable();

  // Clear anything a previous run left, so counts are exact rather than "at least".
  const existing = await listDocs('bookings');
  for (const [id, b] of Object.entries(existing)) {
    if (b.instructorId === DEMO_PROVIDER.uid) await removeDoc(`bookings/${id}`);
  }

  const P = DEMO_PROVIDER.uid;
  const C = 'demo-customer-vfit';

  // Counted by "today": a session today in a status that means the client is coming.
  await seedBooking('dash-today-accepted', {
    instructorId: P, userId: C, scheduledAt: todayAt(11), status: 'accepted',
  });
  // Counted by "today" too — payment_confirmed is equally a booked session, and was one of
  // the statuses the old vocabulary missed entirely.
  await seedBooking('dash-today-paid', {
    instructorId: P, userId: C, scheduledAt: todayAt(15), status: 'payment_confirmed',
  });
  // NOT counted by "today": still only a request, and cancelled sessions never count.
  await seedBooking('dash-today-requested', {
    instructorId: P, userId: C, scheduledAt: todayAt(17), status: 'requested',
  });
  await seedBooking('dash-today-cancelled', {
    instructorId: P, userId: C, scheduledAt: todayAt(18), status: 'cancelled_by_client',
  });
  // Earlier this month and already delivered: earnings, and a completed session for the
  // completion rate.
  await seedBooking('dash-earned-completed', {
    instructorId: P, userId: C, scheduledAt: daysFromNow(-3), status: 'completed', finalPrice: 80,
  });
  // Delivered as far as money is concerned: payment confirmed but not yet marked complete.
  // Counting only `completed` is how a provider's earnings used to read 0 all month.
  await seedBooking('dash-earned-paid', {
    instructorId: P, userId: C, scheduledAt: daysFromNow(-2), status: 'payment_confirmed', finalPrice: 40,
  });
  // A no-show counts against the completion rate without earning anything.
  await seedBooking('dash-noshow', {
    instructorId: P, userId: C, scheduledAt: daysFromNow(-1), status: 'no_show', finalPrice: 30,
  });
});

test.afterAll(async () => {
  for (const id of ids) await removeDoc(`bookings/${id}`);
});

test.describe('provider dashboard counters', () => {
  test('counts today\'s booked sessions and ignores requests and cancellations', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_PROVIDER.email, DEMO_PROVIDER.password);
    await page.goto('/provider/dashboard');

    // Four sessions today; only the accepted and the payment-confirmed ones are real.
    await expect
      .poll(async () => tileValue(page, /appuntamenti oggi/i), {
        message: 'today\'s counter should see both booked statuses',
        timeout: 30_000,
      })
      .toBe('2');

    await context.close();
  });

  test('sums the month\'s earnings from every delivered session, not just completed ones', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_PROVIDER.email, DEMO_PROVIDER.password);
    await page.goto('/provider/dashboard');

    // Delivered means completed OR payment_confirmed, anywhere in the current month — so
    // that is 80 (completed, three days ago) + 40 (payment confirmed, two days ago) + 50
    // (the payment-confirmed session later today). The no-show, the bare request and the
    // cancellation earn nothing, and the merely `accepted` session has not been paid yet.
    await expect
      .poll(async () => tileValue(page, /guadagni mese/i), { timeout: 30_000 })
      .toMatch(/170/);

    await context.close();
  });

  test('derives the completion rate from delivered versus every session with an outcome', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_PROVIDER.email, DEMO_PROVIDER.password);
    await page.goto('/provider/dashboard');

    // Outcomes in the last 30 days: completed, payment_confirmed, no_show, and the
    // cancellation. Two of those count as delivered.
    const rate = await waitFor(
      async () => {
        const value = await tileValue(page, /tasso completamento/i);
        return value === '0%' ? null : value;
      },
      { what: 'a non-zero completion rate', timeoutMs: 30_000 }
    );
    expect(rate).toMatch(/^\d+%$/);
    expect(Number.parseInt(rate, 10)).toBeGreaterThan(0);

    await context.close();
  });

  test('lists an upcoming session for the provider', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, DEMO_PROVIDER.email, DEMO_PROVIDER.password);
    await page.goto('/provider/dashboard');

    await expect(page.getByText(/prossimi appuntamenti/i)).toBeVisible();
    await expect(page.getByText(DEMO_PROVIDER.serviceName).first()).toBeVisible();

    await context.close();
  });
});
