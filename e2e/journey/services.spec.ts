import { test, expect, type Page } from '@playwright/test';
import { assertEmulatorsReachable, getDoc, listDocs, removeDoc, waitFor } from './helpers/emulator';
import { DEMO_PROVIDER } from './helpers/demo';
import { loginWithEmail, personaContext } from './helpers/app';

/**
 * A provider managing their catalogue.
 *
 * The assertions go past the rendered card and into Firestore, because a service is not just
 * a row on a screen: `onProviderServiceWrite` recomputes `categoryIds` and `lowestPrice` on
 * the instructor document from the *active* services, and those two fields are what the
 * customer-facing search reads. A service that saves but leaves the denormalized fields
 * stale is invisible in exactly the place it matters.
 */

const SERVICES_PATH = `instructors/${DEMO_PROVIDER.uid}/services`;
const NEW_SERVICE = {
  name: `Yoga Flow E2E ${Date.now().toString(36).slice(-4)}`,
  description: 'Servizio creato dalla suite e2e.',
  categoryId: 'yoga',
  price: '35',
  durationMinutes: '45',
};

const created: string[] = [];

/** Fills the add/edit dialog. The inputs carry no ids, so they go by placeholder and order. */
async function fillServiceForm(page: Page, values: typeof NEW_SERVICE) {
  await page.locator('input[placeholder="es. Personal Training"]').fill(values.name);
  await page.locator('textarea').first().fill(values.description);
  await page.locator('select').first().selectOption(values.categoryId);
  await page.locator('input[type=number]').fill(values.price);
  await page.locator('select').nth(1).selectOption(values.durationMinutes);
}

async function openProviderServices(page: Page) {
  await loginWithEmail(page, DEMO_PROVIDER.email, DEMO_PROVIDER.password);
  await page.goto('/provider/services');
  await expect(page.getByRole('button', { name: /aggiungi servizio/i }).first()).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await assertEmulatorsReachable();
});

test.afterAll(async () => {
  for (const id of created) await removeDoc(`${SERVICES_PATH}/${id}`);
});

test.describe('provider services', () => {
  test('shows the services the provider already offers', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await openProviderServices(page);

    await expect(page.getByText(DEMO_PROVIDER.serviceName).first()).toBeVisible();
    await expect(page.getByText(`€${DEMO_PROVIDER.servicePrice}`).first()).toBeVisible();

    await context.close();
  });

  test('creates a service and denormalizes it onto the instructor document', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await openProviderServices(page);

    await page.getByRole('button', { name: /aggiungi servizio/i }).first().click();
    await fillServiceForm(page, NEW_SERVICE);
    await page.getByRole('button', { name: /aggiungi servizio/i }).last().click();

    const [id, service] = await waitFor(
      async () => {
        const all = await listDocs(SERVICES_PATH);
        return Object.entries(all).find(([, s]) => s.name === NEW_SERVICE.name) ?? null;
      },
      { what: 'the new service document' }
    );
    created.push(id);

    expect(service.price).toBe(Number(NEW_SERVICE.price));
    expect(service.durationMinutes).toBe(Number(NEW_SERVICE.durationMinutes));
    expect(service.isActive).toBe(true);
    expect(service.categoryId).toBe(NEW_SERVICE.categoryId);

    // The trigger adds the new category to the instructor and drops lowestPrice to the
    // cheapest active service — €35 now undercuts the €50 the demo provider started with.
    const instructor = await waitFor(
      async () => {
        const doc = await getDoc(`instructors/${DEMO_PROVIDER.uid}`);
        return (doc?.categoryIds as string[] | undefined)?.includes(NEW_SERVICE.categoryId) ? doc : null;
      },
      { what: 'the instructor to pick up the new category' }
    );
    expect(instructor.lowestPrice).toBe(Number(NEW_SERVICE.price));

    await expect(page.getByText(NEW_SERVICE.name).first()).toBeVisible();
    await context.close();
  });

  test('the new service is what a customer sees on the public booking page', async ({ browser }) => {
    // Logged out: this is the public read, the one gated on providerProfile.isVerified.
    const context = await personaContext(browser);
    const page = await context.newPage();
    await page.goto(`/book?providerId=${DEMO_PROVIDER.uid}`);

    await expect(page.getByText(DEMO_PROVIDER.fullName).first()).toBeVisible();
    await expect(page.getByText(NEW_SERVICE.name).first()).toBeVisible();
    await expect(page.getByText(/provider non trovato/i)).toHaveCount(0);

    await context.close();
  });

  // The companion case — that an auto-approved provider's unpriced drafts are not offered
  // to customers — lives in journey.spec.ts, where a provider is created through signup and
  // therefore actually has drafts. The demo provider is seeded with a finished service.
});
