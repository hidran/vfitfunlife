import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { assertEmulatorsReachable, getDoc, latestSmsCode, listDocs, waitFor } from './helpers/emulator';
import {
  fillProfileDetails,
  firstBookableWeekday,
  personaContext,
  registerWithEmail,
  registerWithPhone,
  skipPermissions,
  uniqueIdentity,
} from './helpers/app';

/**
 * The marketplace's two-sided journey, end to end, in the order it really happens:
 *
 *   professional signs up by email and is live immediately -> publishes a priced service
 *     -> customer signs up by phone/SMS -> searches, finds them, books
 *     -> provider accepts -> customer sees it accepted
 *
 * One `describe.serial`: each step is the previous step's output. Splitting it up would mean
 * seeding the state the previous step was supposed to produce, which is the integration this
 * file exists to check.
 *
 * Both halves of "registration with email and phone" are covered — the provider takes the
 * email path (it carries the professional opt-in), the customer takes the SMS path.
 *
 * Every UI step is followed by an assertion against Firestore, because the defects in this
 * flow have been invisible ones: a signup that reported success while writing no profile, an
 * approval that left the provider unreadable to customers.
 */

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

const state = {
  providerUid: '',
  customerUid: '',
  serviceId: '',
  bookingId: '',
  bookingDate: firstBookableWeekday(),
};

let providerCtx: BrowserContext;
let customerCtx: BrowserContext;
let providerPage: Page;
let customerPage: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  await assertEmulatorsReachable();
  providerCtx = await personaContext(browser);
  customerCtx = await personaContext(browser);
  providerPage = await providerCtx.newPage();
  customerPage = await customerCtx.newPage();
});

test.afterAll(async () => {
  await Promise.all([providerCtx?.close(), customerCtx?.close()]);
});

test.describe('provider and customer journey', () => {
  test('a professional signs up with email and is approved on the spot', async () => {
    await registerWithEmail(providerPage, provider, {
      dateOfBirth: '1990-05-15',
      interest: 'VFit',
      providerCategories: [SERVICE.categoryLabel],
    });
    await skipPermissions(providerPage);

    // Wait for the decision to land, not merely for the document to appear: the profile is
    // written first and `applyAsProvider` patches it a moment later, so reading the fields
    // the instant the document exists is a race that reports "undefined" either way.
    const [uid, userDoc] = await waitFor(
      async () => {
        const all = await listDocs('users');
        const match = Object.entries(all).find(([, u]) => u.email === provider.email);
        return match && match[1].providerStatus !== undefined ? match : null;
      },
      { what: `a users document for ${provider.email} carrying a provider decision` }
    );
    state.providerUid = uid;

    expect(userDoc.fullName).toBe(provider.fullName);
    // No queue: opting in as a professional both applies and approves, so the account is a
    // provider before the signup redirect finishes.
    expect(userDoc.providerStatus).toBe('verified');
    expect(userDoc.role).toBe('provider');

    const instructor = await waitFor(() => getDoc(`instructors/${uid}`), {
      what: 'the instructor profile',
    });
    expect(instructor.applicationStatus).toBe('verified');
    expect(instructor.requestedCategoryIds).toEqual([SERVICE.categoryId]);

    // The flag the public read rule keys on. It is written through set(..., { merge: true }),
    // where a dotted key would land as a *literal* field named "providerProfile.isVerified"
    // and leave the nested one false — approving the provider on paper while leaving them
    // unreadable to customers. Assert both the value and the absence of the literal key,
    // since only the pair tells a real fix from that bug.
    expect((instructor.providerProfile as Record<string, unknown>).isVerified).toBe(true);
    expect(Object.keys(instructor)).not.toContain('providerProfile.isVerified');

    // Bookable immediately: default Mon-Fri hours, and a draft service per chosen category.
    expect(instructor.availabilitySchedule).toBeTruthy();
    const drafts = await listDocs(`instructors/${uid}/services`);
    expect(Object.keys(drafts)).toContain(`requested-${SERVICE.categoryId}`);
  });

  test('the seeded drafts are unpriced and inactive, so nothing is sold for nothing', async () => {
    const drafts = await listDocs(`instructors/${state.providerUid}/services`);
    const draft = drafts[`requested-${SERVICE.categoryId}`];

    expect(draft.isActive).toBe(false);
    expect(draft.price).toBe(0);

    // And a customer is not offered it: the booking page lists active services only.
    await customerPage.goto(`/book?providerId=${state.providerUid}`);
    await expect(customerPage.getByText(/provider non trovato/i)).toHaveCount(0);
    await expect(
      customerPage.getByRole('button', { name: /^seleziona$/i })
    ).toHaveCount(0);
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

    const [serviceId, service] = await waitFor(
      async () => {
        const services = await listDocs(`instructors/${state.providerUid}/services`);
        return Object.entries(services).find(([, s]) => s.name === SERVICE.name) ?? null;
      },
      { what: 'the published service' }
    );
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

    const [uid, userDoc] = await waitFor(
      async () => {
        const all = await listDocs('users');
        // The number is stored as `phone`; there is no `phoneNumber` field.
        return Object.entries(all).find(([, u]) => u.phone === customerE164) ?? null;
      },
      { what: `a users document for ${customerE164}` }
    );
    state.customerUid = uid;

    expect(userDoc.role).toBe('customer');
    // A phone signup starts anonymous: the profile exists but carries no name yet, which is
    // what the next step is for.
    expect(userDoc.fullName ?? '').toBe('');
  });

  test('the customer fills in their profile', async () => {
    // Where a real customer puts their details in — and where the app has to persist them.
    await fillProfileDetails(customerPage, {
      fullName: customer.fullName,
      bio: 'Cliente di prova della suite end-to-end.',
      dateOfBirth: '1995-03-22',
    });

    const saved = await waitFor(
      async () => {
        const u = await getDoc(`users/${state.customerUid}`);
        return u?.fullName === customer.fullName ? u : null;
      },
      { what: 'the saved profile name' }
    );
    expect(saved.fullName).toBe(customer.fullName);
  });

  test('the customer finds the provider by searching and opens their booking page', async () => {
    // /booking is the search surface. (/search is still a placeholder screen: it renders
    // "searching for…" and never queries anything, so it cannot reach a provider.)
    await customerPage.goto('/booking');
    await customerPage.locator('input[placeholder="Cerca trainer, servizi..."]').fill(provider.fullName);

    await expect(customerPage.getByText(provider.fullName).first()).toBeVisible();
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

  test('the customer confirms and the booking is created as a request', async () => {
    // The terms control is an empty <button> with no text, role or aria-checked, so it can
    // only be reached positionally, through the row that holds the wording.
    await customerPage
      .locator('div.flex.items-start.gap-3', { hasText: /accetto i/i })
      .locator('button')
      .first()
      .click();
    await customerPage.getByRole('button', { name: /^conferma$/i }).click();

    const [bookingId, booking] = await waitFor(
      async () => {
        const all = await listDocs('bookings');
        return Object.entries(all).find(([, b]) => b.instructorId === state.providerUid) ?? null;
      },
      { what: 'the created booking' }
    );
    state.bookingId = bookingId;

    // A new booking starts as a request: the provider has not agreed to it yet.
    expect(booking.status).toBe('requested');
    expect(booking.serviceId).toBe(state.serviceId);
    expect(booking.userId).toBe(state.customerUid);
    await expect(customerPage).toHaveURL(/\/bookings\/detail/);
  });

  test('the provider sees the request and accepts it', async () => {
    await providerPage.goto('/provider/bookings');

    await expect(providerPage.getByText(customer.fullName).first()).toBeVisible();
    // "Conferma" in the provider's table is the accept action — it calls acceptBooking and
    // moves the booking to `accepted`. The customer's side of the same transition is worded
    // "Confermato", which is why the next test matches on that.
    await providerPage.getByRole('button', { name: /^conferma$/i }).first().click();

    const booking = await waitFor(
      async () => {
        const b = await getDoc(`bookings/${state.bookingId}`);
        return b?.status === 'accepted' ? b : null;
      },
      { what: 'the booking to become accepted' }
    );
    expect(booking.instructorId).toBe(state.providerUid);
  });

  test('the customer sees the booking confirmed', async () => {
    await customerPage.goto('/bookings');

    await expect(customerPage.getByText(SERVICE.name).first()).toBeVisible();
    await expect(customerPage.getByText(/accettat|confermat/i).first()).toBeVisible();
  });
});
