import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  assertEmulatorsReachable,
  getDoc,
  latestSmsCode,
  listDocs,
  waitFor,
} from './helpers/emulator';
import {
  firstBookableWeekday,
  loginWithEmail,
  personaContext,
  registerWithEmail,
  registerWithPhone,
  skipPermissions,
  uniqueIdentity,
} from './helpers/app';

/**
 * The marketplace's two-sided journey, end to end, in the order it really happens:
 *
 *   provider signs up (email) -> superadmin approves -> provider publishes a service
 *     -> customer signs up (phone/SMS) -> customer searches, finds them, books
 *     -> provider sees the booking and accepts -> customer sees it accepted
 *
 * It is one `describe.serial`: each step is the previous step's output. Splitting it into
 * independent tests would mean seeding the state the previous step was supposed to produce,
 * which is precisely the integration this suite exists to check.
 *
 * Both halves of "registration with email and phone" are covered: the provider takes the
 * email path (it is the one that carries the professional opt-in), the customer takes the
 * SMS path.
 *
 * Every UI step is followed by an assertion against Firestore, because several defects in
 * this flow were invisible in the UI — an approval that reported success while leaving the
 * provider unverified, for one.
 */

const SUPERADMIN = { email: 'admin@vfit.dev', password: 'test1234' }; // from scripts/seed-emulator.mjs

const provider = uniqueIdentity('provider');
const customer = uniqueIdentity('customer');
const customerE164 = `+39${customer.phoneLocal}`;

const SERVICE = {
  name: `Personal Training E2E ${Date.now().toString(36).slice(-4)}`,
  description: 'Sessione 1:1 creata dal test end-to-end.',
  categoryId: 'personal_training',
  categoryLabel: 'Personal Training',
  price: '55',
  durationMinutes: '60',
};

/** Filled in as the journey proceeds; later steps address the accounts the earlier ones made. */
const state = {
  providerUid: '',
  customerUid: '',
  serviceId: '',
  bookingDate: firstBookableWeekday(),
};

let providerCtx: BrowserContext;
let customerCtx: BrowserContext;
let adminCtx: BrowserContext;
let providerPage: Page;
let customerPage: Page;
let adminPage: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  await assertEmulatorsReachable();
  providerCtx = await personaContext(browser);
  customerCtx = await personaContext(browser);
  adminCtx = await personaContext(browser);
  providerPage = await providerCtx.newPage();
  customerPage = await customerCtx.newPage();
  adminPage = await adminCtx.newPage();
});

test.afterAll(async () => {
  await Promise.all([providerCtx?.close(), customerCtx?.close(), adminCtx?.close()]);
});

test.describe('provider and customer journey', () => {
  test('a professional signs up with email and lands as a pending applicant', async () => {
    await registerWithEmail(providerPage, provider, {
      dateOfBirth: '1990-05-15',
      interest: 'VFit',
      providerCategories: [SERVICE.categoryLabel],
    });
    await skipPermissions(providerPage);

    const users = await waitFor(
      async () => {
        const all = await listDocs('users');
        const match = Object.entries(all).find(([, u]) => u.email === provider.email);
        return match ?? null;
      },
      { what: `a users document for ${provider.email}` }
    );
    const [uid, userDoc] = users;
    state.providerUid = uid;

    expect(userDoc.fullName).toBe(provider.fullName);
    // Opting in does not grant the role. It records an application for an admin to decide.
    expect(userDoc.providerStatus).toBe('pending');
    expect(userDoc.role).toBe('customer');

    const instructor = await waitFor(() => getDoc(`instructors/${uid}`), {
      what: 'the pending instructor application',
    });
    expect(instructor.applicationStatus).toBe('pending');
    expect(instructor.requestedCategoryIds).toEqual([SERVICE.categoryId]);
    expect((instructor.providerProfile as Record<string, unknown>).isVerified).toBe(false);
  });

  test('a superadmin approves the application, which verifies and equips the provider', async () => {
    await loginWithEmail(adminPage, SUPERADMIN.email, SUPERADMIN.password);
    await adminPage.goto('/admin/providers');

    const row = adminPage.locator('div', { hasText: provider.fullName });
    await expect(row.first()).toBeVisible();
    await adminPage.getByRole('button', { name: /^verifica$/i }).first().click();

    const user = await waitFor(
      async () => {
        const u = await getDoc(`users/${state.providerUid}`);
        return u?.providerStatus === 'verified' ? u : null;
      },
      { what: 'the approved provider user document' }
    );
    expect(user.role).toBe('provider');

    const instructor = await getDoc(`instructors/${state.providerUid}`);
    expect(instructor?.applicationStatus).toBe('verified');

    // The regression that made every approved provider invisible: this flag is written
    // through set(..., { merge: true }), where a dotted key would land as a *literal* field
    // named "providerProfile.isVerified" and leave the nested one false. firestore.rules
    // gates the public read of instructors/{id} on the nested value, so a customer could
    // neither find nor open the provider. Assert both the value and the absence of the
    // literal key, since only the pair distinguishes a real fix from the bug.
    expect((instructor?.providerProfile as Record<string, unknown>)?.isVerified).toBe(true);
    expect(Object.keys(instructor ?? {})).not.toContain('providerProfile.isVerified');

    // Approval also makes them immediately bookable: default Mon–Fri hours, and one draft
    // service per category they applied for.
    expect(instructor?.availabilitySchedule).toBeTruthy();
    const drafts = await listDocs(`instructors/${state.providerUid}/services`);
    expect(Object.keys(drafts)).toContain(`requested-${SERVICE.categoryId}`);
  });

  test('the provider publishes a priced, active service', async () => {
    await providerPage.goto('/provider/services');
    await providerPage.getByRole('button', { name: /aggiungi servizio/i }).first().click();

    await providerPage.locator('input[placeholder="es. Personal Training"]').fill(SERVICE.name);
    await providerPage.locator('textarea').first().fill(SERVICE.description);
    await providerPage.locator('select').first().selectOption(SERVICE.categoryId);
    await providerPage.locator('input[type=number]').fill(SERVICE.price);
    await providerPage.locator('select').nth(1).selectOption(SERVICE.durationMinutes);
    // The dialog's own submit, not the page-level button that opened it.
    await providerPage.getByRole('button', { name: /aggiungi servizio/i }).last().click();

    const created = await waitFor(
      async () => {
        const services = await listDocs(`instructors/${state.providerUid}/services`);
        const match = Object.entries(services).find(([, s]) => s.name === SERVICE.name);
        return match ?? null;
      },
      { what: 'the published service' }
    );
    const [serviceId, service] = created;
    state.serviceId = serviceId;

    expect(service.price).toBe(Number(SERVICE.price));
    expect(service.isActive).toBe(true);
    expect(service.categoryId).toBe(SERVICE.categoryId);

    // onProviderServiceWrite denormalizes the searchable fields onto the instructor.
    const instructor = await waitFor(
      async () => {
        const i = await getDoc(`instructors/${state.providerUid}`);
        return i?.lowestPrice === Number(SERVICE.price) ? i : null;
      },
      { what: 'the denormalized lowestPrice' }
    );
    expect(instructor.categoryIds).toContain(SERVICE.categoryId);
  });

  test('a customer signs up with a phone number and an SMS code', async () => {
    await registerWithPhone(customerPage, {
      phoneLocal: customer.phoneLocal,
      e164: customerE164,
      fullName: customer.fullName,
      email: customer.email,
      dateOfBirth: '1995-03-22',
      interest: 'VFit',
      readCode: latestSmsCode,
    });
    await skipPermissions(customerPage);

    const found = await waitFor(
      async () => {
        const all = await listDocs('users');
        const match = Object.entries(all).find(([, u]) => u.fullName === customer.fullName);
        return match ?? null;
      },
      { what: `a users document for ${customer.fullName}` }
    );
    const [uid, userDoc] = found;
    state.customerUid = uid;

    expect(userDoc.role).toBe('customer');
    expect(userDoc.email).toBe(customer.email);
  });

  test('the customer finds the provider by searching and opens their booking page', async () => {
    // /booking is the search surface. (/search is still a placeholder screen: it renders
    // "searching for…" and never queries anything, so it cannot reach a provider.)
    await customerPage.goto('/booking');
    await customerPage.locator('input[placeholder="Cerca trainer, servizi..."]').fill(provider.fullName);

    const card = customerPage.getByText(provider.fullName, { exact: false });
    await expect(card.first()).toBeVisible();
    await expect(customerPage.getByText(`Da ${SERVICE.price},00 €`).first()).toBeVisible();

    // The result card is a clickable div rather than a button or link, so the click has to
    // bubble up from its text.
    await customerPage.getByText(/controlla disponibilità/i).first().click();
    await expect(customerPage).toHaveURL(new RegExp(`/book/\\?providerId=${state.providerUid}`));
    await expect(customerPage.getByText(SERVICE.name)).toBeVisible();
  });

  test('the customer picks the service and a bookable slot', async () => {
    await customerPage.getByRole('button', { name: /^seleziona$/i }).first().click();

    const day = String(state.bookingDate.getDate());
    await customerPage.locator(`button:not([disabled]):text-is("${day}")`).first().click();

    // Slots exist only outside the 24h minimum-notice window; firstBookableWeekday accounts
    // for that, so an empty list here is a real regression, not a timing artefact.
    const slot = customerPage.locator('button:text-is("10:00")');
    await expect(slot).toBeVisible();
    await slot.click();

    await customerPage.getByRole('button', { name: /^continua$/i }).click();
    await expect(customerPage).toHaveURL(/\/booking\/confirm/);

    // Arriving here at all is the assertion: the confirm screen requires selectedProvider,
    // which only the /booking search sets. Deep-linking to /book?providerId=… leaves it null
    // and dead-ends on "Nessuna prenotazione in corso".
    await expect(customerPage.getByText(SERVICE.name)).toBeVisible();
    await expect(customerPage.getByText(`${SERVICE.price},00 €`).first()).toBeVisible();
  });

  /**
   * The remaining three steps — create the booking, have the provider accept it, and show the
   * customer the acceptance — are written but not run under the emulator.
   *
   * `createBooking` throws there: the Functions emulator's firebase-admin shim does not carry
   * the namespace statics, so `admin.firestore.Timestamp` is undefined at
   * functions/src/bookings/index.ts:317 and the callable fails before writing anything. The
   * same module works deployed (staging booking ruMYVkykNs3BV4TJx5ml was created by it), and
   * the emulator log shows the same shape of failure for every module that reaches for
   * `admin.firestore.*` rather than importing from "firebase-admin/firestore".
   *
   * Two ways to turn this on, whichever you prefer:
   *   - migrate those modules to `import { Timestamp } from "firebase-admin/firestore"`, the
   *     style the newer functions already use and which works under the emulator today; or
   *   - point this spec at a real backend, where the callable already works.
   */
  test.fixme('the customer confirms and the booking is created as requested', async () => {
    await customerPage
      .locator('div.flex.items-start.gap-3', { hasText: /accetto i/i })
      .locator('button')
      .first()
      .click();
    await customerPage.getByRole('button', { name: /^conferma$/i }).click();

    const booking = await waitFor(
      async () => {
        const all = await listDocs('bookings');
        const match = Object.entries(all).find(([, b]) => b.instructorId === state.providerUid);
        return match ?? null;
      },
      { what: 'the created booking' }
    );
    const [, doc] = booking;
    expect(doc.status).toBe('requested');
    expect(doc.serviceId).toBe(state.serviceId);
    await expect(customerPage).toHaveURL(/\/bookings\/detail/);
  });

  test.fixme('the provider sees the request and accepts it', async () => {
    await providerPage.goto('/provider/bookings');
    await expect(providerPage.getByText(customer.fullName)).toBeVisible();
    await providerPage.getByRole('button', { name: /accetta/i }).first().click();

    await waitFor(
      async () => {
        const all = await listDocs('bookings');
        return Object.values(all).find((b) => b.instructorId === state.providerUid && b.status === 'accepted');
      },
      { what: 'the booking to become accepted' }
    );
  });

  test.fixme('the customer sees the booking confirmed', async () => {
    await customerPage.goto('/bookings');
    await expect(customerPage.getByText(SERVICE.name)).toBeVisible();
    await expect(customerPage.getByText(/accettat|confermat/i).first()).toBeVisible();
  });
});
