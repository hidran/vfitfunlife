import { test, expect, type Page } from '@playwright/test';
import { assertEmulatorsReachable, putDoc, removeDoc } from './helpers/emulator';
import { SUPERADMIN } from './helpers/demo';
import { loginWithEmail, personaContext } from './helpers/app';

/**
 * /admin/logs paging, in the browser.
 *
 * The list pages through Firestore with a cursor stack (startAfter the last document of the
 * previous page), and falls back to over-fetching when a page is reached without a cursor
 * (a deep link, or a reload on page 3). The unit tests cover that logic against a mocked
 * Firestore; this drives the real controls against the emulator, where the ways it can go
 * wrong are the ones that matter to an admin: page 2 repeating page 1, "previous" landing on
 * the wrong rows, or the URL and the table disagreeing.
 *
 * The fixtures share one actor uid, and the page is opened filtered to it (`?q=` is the
 * actor filter), so rows written by other specs cannot shift the pages. `?size=5` keeps the
 * fixture small while still spanning three pages.
 */

const ACTOR = 'e2e-logs-paging-actor';
const TOTAL = 12;
const PAGE_SIZE = 5;

/** #12 is the newest: the list is newest-first. */
const label = (n: number) => `E2E paging #${String(n).padStart(2, '0')}`;
const ids = Array.from({ length: TOTAL }, (_, i) => `e2e-log-paging-${i + 1}`);

/** The rows expected on a page, newest first. */
function expectedPage(page: number): string[] {
  const newest = TOTAL - (page - 1) * PAGE_SIZE;
  const count = Math.min(PAGE_SIZE, newest);
  return Array.from({ length: count }, (_, i) => label(newest - i));
}

async function visibleRows(page: Page): Promise<string[]> {
  const cells = page.locator('tbody tr').getByText(/E2E paging #\d\d/);
  return (await cells.allInnerTexts()).map((t) => t.trim());
}

async function expectRows(page: Page, pageNumber: number) {
  await expect.poll(() => visibleRows(page), { timeout: 20_000 }).toEqual(expectedPage(pageNumber));
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await assertEmulatorsReachable();
  const base = Date.now() - 60 * 60 * 1000;
  for (const [i, id] of ids.entries()) {
    const n = i + 1;
    await putDoc(`systemLogs/${id}`, {
      action: 'UPDATE_SETTINGS',
      severity: n % 4 === 0 ? 'warning' : 'info',
      details: label(n),
      by: ACTOR,
      // A minute apart, so the newest-first order is unambiguous.
      timestamp: new Date(base + n * 60_000),
    });
  }
});

test.afterAll(async () => {
  for (const id of ids) await removeDoc(`systemLogs/${id}`);
});

test.describe('system logs paging', () => {
  test('next and previous walk distinct pages and come back to the same rows', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, SUPERADMIN.email, SUPERADMIN.password);
    await page.waitForURL(/\/admin/, { timeout: 30_000 });

    await page.goto(`/admin/logs?q=${ACTOR}&size=${PAGE_SIZE}`);
    await expect(page.getByRole('heading', { name: 'Log di sistema' })).toBeVisible();

    const next = page.getByRole('button', { name: 'Pagina successiva' });
    const prev = page.getByRole('button', { name: 'Pagina precedente' });
    const showing = page.getByText(/Visualizzati \d+–\d+ di \d+/);

    // Page 1
    await expectRows(page, 1);
    await expect(showing).toHaveText(`Visualizzati 1–5 di ${TOTAL}`);
    await expect(page.getByText('1 / 3', { exact: true })).toBeVisible();
    await expect(prev).toBeDisabled();
    const page1 = await visibleRows(page);

    // Page 2: five different rows, and the URL says so.
    await next.click();
    await expectRows(page, 2);
    await expect(showing).toHaveText(`Visualizzati 6–10 di ${TOTAL}`);
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    const page2 = await visibleRows(page);
    expect(page2.filter((r) => page1.includes(r))).toEqual([]);

    // Page 3: the two oldest, and no further.
    await next.click();
    await expectRows(page, 3);
    await expect(next).toBeDisabled();

    // And back: previous must retrace the same pages, not re-derive different ones.
    await prev.click();
    await expectRows(page, 2);
    await prev.click();
    await expectRows(page, 1);
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(prev).toBeDisabled();

    await context.close();
  });

  test('a deep link to page 2 renders page 2 without walking there', async ({ browser }) => {
    const context = await personaContext(browser);
    const page = await context.newPage();
    await loginWithEmail(page, SUPERADMIN.email, SUPERADMIN.password);
    await page.waitForURL(/\/admin/, { timeout: 30_000 });

    // No cursor exists for this page yet: the over-fetch path.
    await page.goto(`/admin/logs?q=${ACTOR}&size=${PAGE_SIZE}&page=2`);
    await expectRows(page, 2);

    // Stepping back from a deep link still lands on page 1's rows.
    await page.getByRole('button', { name: 'Pagina precedente' }).click();
    await expectRows(page, 1);

    await context.close();
  });
});
