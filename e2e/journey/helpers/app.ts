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

/**
 * The signed-in user's ID token, read out of the SDK's own IndexedDB store.
 *
 * The app never puts the Firebase instance on `window`, and importing a second copy of the
 * SDK into the page gets you a module with no registered app — so the token is fetched from
 * where the SDK persists it.
 */
export async function idTokenOf(page: Page, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  // Sign-in resolves before the SDK has finished persisting the session, so a single read
  // straight after submitting the login form finds nothing.
  for (;;) {
    const token = await readStoredToken(page);
    if (token) return token;
    if (Date.now() > deadline) {
      throw new Error('no signed-in user: the page holds no Firebase ID token');
    }
    await page.waitForTimeout(250);
  }
}

async function readStoredToken(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('firebaseLocalStorageDb');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ value?: { stsTokenManager?: { accessToken?: string } } }[]>(
      (resolve, reject) => {
        const req = db.transaction('firebaseLocalStorage', 'readonly')
          .objectStore('firebaseLocalStorage')
          .getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }
    );
    return rows.find((r) => r.value?.stsTokenManager?.accessToken)?.value?.stsTokenManager
      ?.accessToken ?? null;
  });
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

  // What happens next depends on whether the account ended up with a profile. When
  // `initializeUserProfile` creates one, the app treats the account as complete and goes
  // straight to /home; when there is no profile it asks the user to finish signing up on
  // "Completa il profilo". Both are legitimate, so wait for either rather than assuming.
  const completion = page.getByRole('button', { name: /completa registrazione/i });
  await Promise.race([
    completion.waitFor({ state: 'visible' }).catch(() => undefined),
    page.waitForURL(/\/home|\/profile/, { timeout: 30_000 }).catch(() => undefined),
  ]);

  if (await completion.isVisible().catch(() => false)) {
    // These inputs carry no ids, unlike the email form.
    await page.locator('input[placeholder="Mario Rossi"]').fill(opts.fullName);
    if (opts.email) await page.locator('input[type=email]').fill(opts.email);
    if (opts.dateOfBirth) await page.locator('input[type=date]').fill(opts.dateOfBirth);
    if (opts.interest) await page.getByRole('button', { name: opts.interest, exact: true }).click();
    await checkHiddenBox(page, '#terms');
    await completion.click();
  }
}

/**
 * Fill in the profile from /profile/edit — the route a customer takes when their account was
 * created with defaults (a phone signup gets the placeholder name "Utente VFit").
 *
 * "Salva modifiche" is the page's real submit. The bare "Salva" belongs to the unsaved-changes
 * dialog, so matching on /salva/ alone picks up a button that is usually not even on screen.
 */
export async function fillProfileDetails(
  page: Page,
  details: { fullName: string; bio?: string; phone?: string; dateOfBirth?: string }
): Promise<void> {
  await page.goto('/profile/edit');

  const name = page.locator('input[placeholder="Inserisci il tuo nome completo"]');
  await name.waitFor();
  await name.fill(details.fullName);
  if (details.bio) await page.locator('textarea[placeholder="Parlaci di te..."]').first().fill(details.bio);
  if (details.dateOfBirth) await page.locator('input[type=date]').first().fill(details.dateOfBirth);

  await page.getByRole('button', { name: /salva modifiche/i }).click();
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
