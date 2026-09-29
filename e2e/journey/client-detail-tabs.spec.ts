import { test, expect, type Page } from '@playwright/test';
import { assertEmulatorsReachable, putDoc, removeDoc } from './helpers/emulator';
import { DEMO_CUSTOMER, DEMO_PROVIDER } from './helpers/demo';
import { loginWithEmail, personaContext } from './helpers/app';

/**
 * The provider's client detail page: the Goals, Training and Recipes tabs.
 *
 * Each tab loads its own data (goals and training programs from subcollections of the
 * client document, recipes from the provider's library filtered by who they are shared
 * with), so a tab can render its empty state while the data sits in Firestore — a wrong
 * collection name, a missing index or a rules change all look like "nothing yet". The
 * fixtures mirror `scripts/seed-demo-clients.mjs`, so what passes here is what the demo
 * accounts show on staging.
 *
 * The client document uses its own id rather than the demo seed's, so this spec neither
 * depends on that script having run nor disturbs the data it leaves behind.
 */

const CLIENT_ID = 'e2e-client-tabs';
const CLIENT_NAME = 'E2E Tab Client';

const GOALS = [
  {
    id: 'e2e-goal-weight',
    type: 'weight_loss',
    description: 'E2E perdere 5 kg',
    targetValue: 5,
    unit: 'kg',
    status: 'active',
  },
  {
    id: 'e2e-goal-mobility',
    type: 'mobility',
    description: 'E2E toccare le punte dei piedi',
    status: 'achieved',
  },
];

const PROGRAMS = [
  {
    id: 'e2e-program-published',
    title: 'E2E Rimessa in forma',
    status: 'published',
    durationWeeks: 4,
    daysPerWeek: 3,
  },
  {
    id: 'e2e-program-draft',
    title: 'E2E Forza base bozza',
    status: 'draft',
    durationWeeks: 2,
    daysPerWeek: 2,
  },
];

const SHARED_RECIPE = { id: 'e2e-recipe-shared', title: 'E2E Overnight oats condivisi' };
const PRIVATE_RECIPE = { id: 'e2e-recipe-private', title: 'E2E Pollo non condiviso' };

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function recipeDoc(title: string, sharedWith: string[]) {
  return {
    title,
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 0,
    ingredients: [{ item: "Fiocchi d'avena", quantity: '50 g' }],
    steps: ['Mescola tutto.'],
    nutritionPerServing: { kcal: 380, proteinG: 24, carbsG: 52, fatG: 7 },
    tags: ['colazione'],
    source: 'manual',
    ownerUid: DEMO_PROVIDER.uid,
    ownerRole: 'provider',
    sharedWithUserIds: sharedWith,
    createdAt: daysFromNow(-12),
    updatedAt: new Date(),
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await assertEmulatorsReachable();

  await putDoc(`clients/${CLIENT_ID}`, {
    isDemo: true,
    providerId: DEMO_PROVIDER.uid,
    // The demo customer, so the Recipes tab has an account to share with.
    userId: DEMO_CUSTOMER.uid,
    name: CLIENT_NAME,
    email: DEMO_CUSTOMER.email,
    phone: '+39 333 000 0001',
    photoUrl: '',
    tags: ['e2e'],
    notes: '',
    totalBookings: 0,
    totalSpent: 0,
    firstVisit: daysFromNow(-45),
    lastVisit: daysFromNow(-14),
    createdAt: daysFromNow(-45),
    updatedAt: new Date(),
  });

  for (const [i, g] of GOALS.entries()) {
    const { id, ...goal } = g;
    await putDoc(`clients/${CLIENT_ID}/goals/${id}`, {
      ...goal,
      targetDate: daysFromNow(60),
      createdBy: DEMO_PROVIDER.uid,
      createdAt: daysFromNow(-40 + i),
      updatedAt: new Date(),
    });
  }

  for (const [i, p] of PROGRAMS.entries()) {
    const { id, ...program } = p;
    await putDoc(`clients/${CLIENT_ID}/trainingPrograms/${id}`, {
      ...program,
      goal: 'Perdere peso',
      source: 'manual',
      medicalClearanceNote: null,
      weeks: [
        {
          weekNumber: 1,
          days: [
            {
              label: 'Giorno A',
              focus: 'Total body',
              exercises: [{ name: 'Squat a corpo libero', sets: 3, reps: '10', restSec: 60 }],
            },
          ],
        },
      ],
      createdBy: DEMO_PROVIDER.uid,
      createdAt: daysFromNow(-10 + i),
      updatedAt: daysFromNow(-10 + i),
    });
  }

  await putDoc(`recipes/${SHARED_RECIPE.id}`, recipeDoc(SHARED_RECIPE.title, [DEMO_CUSTOMER.uid]));
  // In the provider's library but not shared: it must not appear on the client's tab.
  await putDoc(`recipes/${PRIVATE_RECIPE.id}`, recipeDoc(PRIVATE_RECIPE.title, []));
});

test.afterAll(async () => {
  for (const g of GOALS) await removeDoc(`clients/${CLIENT_ID}/goals/${g.id}`);
  for (const p of PROGRAMS) await removeDoc(`clients/${CLIENT_ID}/trainingPrograms/${p.id}`);
  await removeDoc(`clients/${CLIENT_ID}`);
  await removeDoc(`recipes/${SHARED_RECIPE.id}`);
  await removeDoc(`recipes/${PRIVATE_RECIPE.id}`);
});

async function openClient(page: Page) {
  await loginWithEmail(page, DEMO_PROVIDER.email, DEMO_PROVIDER.password);
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 });
  await page.goto(`/provider/clients/detail?id=${CLIENT_ID}`);
  await expect(page.getByRole('heading', { level: 1, name: CLIENT_NAME })).toBeVisible();
}

function tab(page: Page, name: RegExp) {
  return page.getByRole('button', { name, exact: false });
}

test.describe('provider client detail tabs', () => {
  test('Goals lists every seeded goal with its type, status and target', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await openClient(page);

    await tab(page, /^obiettivi$/i).click();

    await expect(page.getByText(GOALS[0].description)).toBeVisible();
    await expect(page.getByText(GOALS[1].description)).toBeVisible();
    await expect(page.getByText('Perdita di peso', { exact: true })).toBeVisible();
    await expect(page.getByText('Raggiunto', { exact: true })).toBeVisible();
    await expect(page.getByText('Valore obiettivo: 5 kg')).toBeVisible();
    await expect(page.getByText('Nessun obiettivo ancora.')).toHaveCount(0);

    await context.close();
  });

  test('Training lists the published program and the draft awaiting publication', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await openClient(page);

    await tab(page, /^allenamento$/i).click();

    await expect(page.getByText(PROGRAMS[0].title)).toBeVisible();
    await expect(page.getByText(PROGRAMS[1].title)).toBeVisible();
    await expect(page.getByText('Pubblicata', { exact: true })).toBeVisible();
    await expect(page.getByText('Bozza', { exact: true })).toBeVisible();
    // Only the draft carries the review banner: a published program is already visible to
    // the client, so offering "publish" on it would be meaningless.
    await expect(page.getByText(/bozza — non ancora pubblicata/i)).toHaveCount(1);
    await expect(page.getByText('Nessun programma ancora.')).toHaveCount(0);

    await context.close();
  });

  test('Recipes shows the recipe shared with this client and not the unshared one', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await openClient(page);

    await tab(page, /^ricette$/i).click();

    await expect(page.getByText(SHARED_RECIPE.title)).toBeVisible();
    await expect(page.getByText(PRIVATE_RECIPE.title)).toHaveCount(0);
    await expect(page.getByText('Nessuna ricetta condivisa con questo cliente.')).toHaveCount(0);

    await context.close();
  });
});
