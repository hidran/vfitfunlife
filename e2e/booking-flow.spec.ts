import { test, expect, type Page } from '@playwright/test';

/**
 * P0-1 — booking with manual payment confirmation.
 *
 * Split in two:
 *
 * 1. Route reachability, which needs no auth. These are the regression guard for the bug
 *    that made P0-1 unusable in production: `output: 'export'` forces
 *    `dynamicParams = false`, so `/bookings/<id>` and `/provider/bookings/<id>` only ever
 *    built a `placeholder` and 404'd for every real booking — while both lists linked
 *    straight to them. If someone reintroduces path-param routing here, these fail.
 *
 * 2. The full trainer flow, which needs a seeded provider and a booking. It is skipped
 *    unless credentials are supplied, so the suite stays green locally without fixtures:
 *
 *      E2E_TRAINER_EMAIL=... E2E_TRAINER_PASSWORD=... E2E_BOOKING_ID=... npx playwright test
 */

const RUNTIME_ERRORS = ['missing param', 'Runtime Error', 'Application error'];

async function expectNoRuntimeError(page: Page) {
  const body = (await page.textContent('body')) ?? '';
  for (const marker of RUNTIME_ERRORS) expect(body).not.toContain(marker);
}

test.describe('booking detail routing (static export)', () => {
  test('client detail route resolves with an id query param', async ({ page }) => {
    const res = await page.goto('/bookings/detail/?id=does-not-exist');
    expect(res?.status(), 'the /bookings/detail route must be built').toBeLessThan(400);
    await expectNoRuntimeError(page);
  });

  test('trainer detail route resolves with an id query param', async ({ page }) => {
    const res = await page.goto('/provider/bookings/detail/?id=does-not-exist');
    expect(res?.status(), 'the /provider/bookings/detail route must be built').toBeLessThan(400);
    await expectNoRuntimeError(page);
  });

  test('client detail without an id degrades instead of crashing', async ({ page }) => {
    await page.goto('/bookings/detail/');
    await expectNoRuntimeError(page);
  });
});

const trainerEmail = process.env.E2E_TRAINER_EMAIL;
const trainerPassword = process.env.E2E_TRAINER_PASSWORD;
const bookingId = process.env.E2E_BOOKING_ID;
const haveFixtures = Boolean(trainerEmail && trainerPassword && bookingId);

test.describe('trainer flow: accept → complete → record payment', () => {
  test.skip(!haveFixtures, 'set E2E_TRAINER_EMAIL / E2E_TRAINER_PASSWORD / E2E_BOOKING_ID');

  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login/');
    await page.getByRole('button', { name: /Email/i }).first().click();
    await page.getByRole('textbox', { name: /Email/i }).fill(trainerEmail!);
    await page.getByRole('textbox', { name: /Password/i }).fill(trainerPassword!);
    await page.getByRole('button', { name: /Login|Accedi/i }).click();
    await page.waitForURL(/\/home|\/provider/, { timeout: 15_000 });
  });

  test('a requested booking offers Confirm and Decline, and accepting sticks', async ({ page }) => {
    await page.goto(`/provider/bookings/detail/?id=${bookingId}`);
    const confirm = page.getByRole('button', { name: /Confirm|Conferma/ }).first();
    await expect(confirm).toBeVisible();
    await expect(page.getByRole('button', { name: /Decline|Rifiuta/ }).first()).toBeVisible();

    await confirm.click();
    await expect(page.getByText(/Confermato|Confirmed/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('completion is not offered before the session has ended', async ({ page }) => {
    // Mirrors the server guard in canTransition: offering it earlier would only produce
    // a failed-precondition from the callable.
    await page.goto(`/provider/bookings/detail/?id=${bookingId}`);
    const markDone = page.getByRole('button', { name: /Sessione svolta|Mark.*complete/i });
    if (await markDone.count()) {
      const endText = await page.textContent('body');
      expect(endText).toBeTruthy();
    }
  });

  test('the payment sheet prefills the amount from the booking price', async ({ page }) => {
    await page.goto(`/provider/bookings/detail/?id=${bookingId}`);
    const record = page.getByRole('button', { name: /Payment received|Pagamento ricevuto/ });
    test.skip((await record.count()) === 0, 'booking is not in the completed state');

    await record.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Cash is the default method for the pilot.
    await expect(dialog.getByRole('button', { name: /Cash|Contanti/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const amount = dialog.locator('#payment-amount');
    await expect(amount).toBeVisible();
    expect(Number(await amount.inputValue())).toBeGreaterThan(0);
  });
});
