/**
 * Driving the app's own screens.
 *
 * Two things shape every selector here:
 *
 * 1. There is essentially no `data-testid` in the tree, so these helpers select by the ids
 *    that do exist (`#register-email`, `#terms`, `#email`), then by role/placeholder, and
 *    only fall back to visible text where nothing else identifies the control.
 * 2. Visible text is locale-dependent. The locale comes from `localStorage['vfit.locale']`
 *    and falls back to `navigator.language`, so a suite that relies on text would pass on an
 *    Italian machine and fail on an English one. `pinLocale` removes that variable by
 *    setting the key before the first script runs on the page.
 */

import type { Browser, BrowserContext, Page } from '@playwright/test';

/** Italian: the source locale, and the only one guaranteed complete by the i18n tests. */
export const LOCALE = 'it';

/**
 * A fresh context with the locale pinned before any app code runs. Each persona gets its own
 * context rather than sharing one and logging in and out: the journey has the provider, the
 * customer and the superadmin acting in turn, and separate contexts keep their Firebase auth
 * state (IndexedDB) from overwriting each other's.
 */
export async function personaContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private mode / blocked storage: the app falls back to its default locale */
      }
    },
    ['vfit.locale', LOCALE] as const
  );
  return context;
}

/** A run-unique identity, so re-running the suite never collides with earlier accounts. */
export function uniqueIdentity(tag: string) {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  return {
    email: `e2e.${tag}.${stamp}@vitfitdemo.dev`,
    password: 'E2eJourney!2026x', // 12+ chars, upper, lower, digit, symbol — the form enforces all five
    fullName: `${tag === 'provider' ? 'Elia' : 'Giulia'} E2E ${stamp.slice(-4)}`,
    // Fictional Italian mobile: a leading 3 plus nine digits. The length matters — the form
    // validates it before sending, so a short number silently never requests a code, and the
    // spec then waits for an SMS the app never asked for. The Auth emulator accepts any
    // well-formed number and simply records the code it would have texted.
    phoneLocal: `3${Math.floor(100_000_000 + Math.random() * 899_999_999)}`,
  };
}

/**
 * Tick a checkbox that is `sr-only` behind a styled box. The visible square and its check
 * icon sit on top of the real input, so an ordinary click hits the decoration and Playwright
 * reports the overlay as intercepting pointer events. `check({ force: true })` targets the
 * input itself, which is what the label would have toggled anyway.
 */
export async function checkHiddenBox(page: Page, selector: string): Promise<void> {
  await page.locator(selector).check({ force: true });
}

/** Dismiss the post-registration permissions interstitial (geolocation / notifications). */
export async function skipPermissions(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /salta per ora/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
}

/** Email + password sign-in. The method picker comes first, then the credentials form. */
export async function loginWithEmail(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: /accedi con email e password/i }).click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type=submit]').click();
}

/**
 * Registration with email and password. `providerCategories` opts the account in as a
 * professional and picks the taxonomy leaves it is applying to offer — which is what
 * `submitProviderApplication` stores as `requestedCategoryIds` for an admin to review.
 */
export async function registerWithEmail(
  page: Page,
  identity: { email: string; password: string; fullName: string },
  opts: { dateOfBirth?: string; interest?: string; providerCategories?: string[] } = {}
): Promise<void> {
  await page.goto('/auth/register');
  await page.getByRole('button', { name: /email e password/i }).click();

  await page.locator('#register-full-name').fill(identity.fullName);
  await page.locator('#register-email').fill(identity.email);
  await page.locator('#register-password').fill(identity.password);
  await page.locator('#register-confirm-password').fill(identity.password);
  if (opts.dateOfBirth) await page.locator('#register-date-of-birth').fill(opts.dateOfBirth);
  if (opts.interest) await page.getByRole('button', { name: opts.interest, exact: true }).click();

  if (opts.providerCategories?.length) {
    // The opt-in reveals the category picker; the form refuses to submit with none selected.
    await page.getByRole('checkbox', { name: /offrire servizi come professionista/i }).check({ force: true });
    for (const category of opts.providerCategories) {
      await page.getByRole('button', { name: category, exact: true }).click();
    }
  }

  await checkHiddenBox(page, '#terms');
  await page.getByRole('button', { name: /^crea account$/i }).click();
}

/**
 * Registration with a phone number. The register screen's "Telefono" option routes to the
 * login screen — phone sign-in and phone sign-up are the same flow — and a number with no
 * account lands back on the register screen to complete a profile.
 *
 * `readCode` is injected rather than imported so the caller owns the emulator dependency;
 * pointed at a real backend this is the only piece that would need replacing.
 */
export async function registerWithPhone(
  page: Page,
  opts: {
    phoneLocal: string;
    e164: string;
    fullName: string;
    email?: string;
    dateOfBirth?: string;
    interest?: string;
    readCode: (e164: string) => Promise<string>;
  }
): Promise<void> {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: /accedi con sms/i }).click();
  await page.locator('input[type=tel]').fill(opts.phoneLocal);

  // The invisible reCAPTCHA verifier is created in an effect that waits for the auth store
  // to finish initializing and then for a 100ms timer. Until it exists, sendPhoneOtp hits its
  // `!recaptchaVerifier` guard and returns false *without* surfacing anything in the UI — the
  // button simply appears to do nothing. So send, then wait for the code step, and try again
  // if the screen has not advanced rather than assuming the first click took.
  const otpBoxes = page.locator('input[inputmode=numeric]');
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole('button', { name: /invia codice/i }).click();
    try {
      await otpBoxes.first().waitFor({ state: 'visible', timeout: 5_000 });
      break;
    } catch {
      if (attempt === 3) throw new Error('the app never advanced to the SMS code step');
    }
  }

  const code = await opts.readCode(opts.e164);
  for (const [i, digit] of [...code].entries()) {
    await otpBoxes.nth(i).fill(digit);
  }
  await page.getByRole('button', { name: /verifica codice/i }).click();

  // New number -> "Completa il profilo". These inputs carry no ids, unlike the email form.
  await page.getByRole('button', { name: /completa registrazione/i }).waitFor();
  await page.locator('input[placeholder="Mario Rossi"]').fill(opts.fullName);
  if (opts.email) await page.locator('input[type=email]').fill(opts.email);
  if (opts.dateOfBirth) await page.locator('input[type=date]').fill(opts.dateOfBirth);
  if (opts.interest) await page.getByRole('button', { name: opts.interest, exact: true }).click();
  await checkHiddenBox(page, '#terms');
  await page.getByRole('button', { name: /completa registrazione/i }).click();
}

/**
 * The first weekday at least `minNoticeHours` away.
 *
 * The slot engine's default booking rules impose a 24-hour minimum advance notice
 * (`DEFAULT_BOOKING_RULES.minAdvanceNoticeHours`), so "tomorrow" yields an empty slot list
 * whenever the suite runs in the afternoon — a test that picked tomorrow would pass in the
 * morning and fail after lunch. Two clear days keeps it deterministic, and approval seeds
 * Mon–Fri hours, so weekends are skipped.
 */
export function firstBookableWeekday(from: Date = new Date(), minNoticeHours = 48): Date {
  const date = new Date(from.getTime() + minNoticeHours * 60 * 60 * 1000);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}
