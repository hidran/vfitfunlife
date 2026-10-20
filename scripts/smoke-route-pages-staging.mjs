// Staging-only Playwright smoke of the course screens: the routed course page and participants page (no popups), and
// the month filter / paging on a year-long course. Read-only: it signs in with the demo accounts, opens pages and
// changes only client-side filters.
//
// Run: node scripts/smoke-route-pages-staging.mjs
// Evidence: output/playwright/route-pages-staging-smoke.json and two screenshots beside it.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

const env = dotenv.parse(fs.readFileSync('.env.staging'));
const project = 'vfit-app-staging';
assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, project, 'refusing to smoke a build that is not staging');

const baseURL = process.env.VFIT_SMOKE_BASE_URL ?? 'https://vfit-app-staging.web.app';
const password = process.env.VFIT_SMOKE_PASSWORD ?? 'VfitDemo!2026';
const providerEmail = process.env.VFIT_SMOKE_PROVIDER_EMAIL ?? 'demo.provider@vitfitdemo.dev';
const customerEmail = process.env.VFIT_SMOKE_CUSTOMER_EMAIL ?? 'demo.customer@vitfitdemo.dev';
const courseName = process.env.VFIT_SMOKE_COURSE ?? 'Demo Karate annuale Torino';
const evidence = { project, baseURL, startedAt: new Date().toISOString(), checks: [], skipped: [] };
const mark = (name, detail) => { evidence.checks.push(detail ? { name, detail } : { name }); console.log('PASS', name); };
const skip = (name, why) => { evidence.skipped.push({ name, why }); console.log('SKIP', name, '-', why); };

fs.mkdirSync('output/playwright', { recursive: true });
const browser = await chromium.launch();
let passed = false;
try {
  // Italian is the source locale; pinning it keeps the labels used below stable.
  async function newPage() {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => { try { window.localStorage.setItem('vfit.locale', 'it'); } catch { /* blocked storage */ } });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return { context, page };
  }
  async function signIn(page, email) {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /Accedi con email e password/i }).click();
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/auth/'), { timeout: 45_000 });
  }
  // The app shell keeps a navigation drawer mounted with role=dialog, so only a dialog that carries the course
  // itself would mean the screen opened as a popup.
  const courseDialogs = async (page, name) => page.locator('[role="dialog"]').filter({ hasText: name }).count();
  const shown = async () => (await customer.page.getByTestId('lessons-shown').innerText()).replace(/\s+/g, ' ').trim();

  // ---- Customer: the course opens on its own page, with month filter and paging ----
  const customer = await newPage();
  await signIn(customer.page, customerEmail);
  await customer.page.goto('/courses');
  const card = customer.page.locator('article', { hasText: courseName }).first();
  await card.waitFor();
  await card.locator('a[href*="/courses/detail"]').click();
  await customer.page.waitForURL(/\/courses\/detail/);
  await customer.page.getByRole('heading', { level: 1, name: courseName }).waitFor();
  assert.equal(await courseDialogs(customer.page, courseName), 0, 'the course must not open in a dialog');
  mark('Customer course opens as a routed page, not a popup', customer.page.url());

  // The month filter is the select whose options are `YYYY-MM` values (labels follow the user's language).
  const monthIndex = await customer.page.locator('select').evaluateAll(selects =>
    selects.findIndex(select => [...select.options].some(option => /^\d{4}-\d{2}$/.test(option.value))));
  assert.ok(monthIndex >= 0, 'the course page has no month selector');
  const month = customer.page.locator('select').nth(monthIndex);
  await month.waitFor();
  const monthOptions = await month.locator('option').evaluateAll(options => options.map(option => option.textContent?.trim()));
  assert.ok(monthOptions.length > 2, `expected several months, got ${JSON.stringify(monthOptions)}`);
  assert.ok(await month.locator('option[value=""]').count(), 'the "all months" option is missing');
  mark('Month selector lists the course months', monthOptions.slice(0, 4));

  const visibleRows = () => customer.page.locator('ul.divide-y > li').count();
  const pageOne = await visibleRows();
  assert.ok(pageOne > 0 && pageOne <= 10, `one page must hold at most 10 lessons, got ${pageOne}`);
  await month.selectOption('');
  const nextPage = customer.page.getByRole('button', { name: /successiva|next page/i });
  await nextPage.waitFor();
  const all = await shown();
  assert.match(all, /^(Lezioni|Lessons) 1–10 (di|of) \d+$/, `unexpected page summary: ${all}`);
  assert.equal(await visibleRows(), 10, 'a page must render 10 lessons');
  mark('All months pages the long course', all);

  await nextPage.click();
  const second = await shown();
  assert.match(second, /^(Lezioni|Lessons) 11–/, `the next page did not advance: ${second}`);
  mark('Next page shows the next lessons', second);

  const firstMonth = (await month.locator('option').evaluateAll(options =>
    options.map(option => option.value).filter(value => value)))[0];
  await month.selectOption(firstMonth);
  const monthRows = await visibleRows();
  assert.ok(monthRows > 0 && monthRows <= 10, `one month must hold at most a page of lessons, got ${monthRows}`);
  // A month that fits on one page needs no pager: the summary must not be there.
  if (await customer.page.getByTestId('lessons-shown').count()) assert.match(await shown(), /^(Lezioni|Lessons) 1–/);
  mark('Month filter narrows the list', `${monthRows} lessons in ${firstMonth}`);
  await customer.page.screenshot({ path: 'output/playwright/staging-course-detail.png', fullPage: true });

  // ---- Customer: a booking card with a long series gets the same controls (when the demo has one) ----
  await customer.page.goto('/courses/?tab=bookings');
  await customer.page.getByRole('heading', { name: /Prenotazioni corsi/i }).first().waitFor().catch(() => {});
  const bookingMonth = customer.page.getByLabel('Mese').first();
  // The bookings read from Firestore after the shell: give the cards a moment before judging them.
  await bookingMonth.waitFor({ timeout: 8_000 }).catch(() => {});
  if (await bookingMonth.count()) {
    await bookingMonth.waitFor();
    mark('Booking card offers the month filter');
    if (await customer.page.getByRole('button', { name: /successiva|next page/i }).count()) mark('Booking card pages its lessons');
    else skip('Booking card pages its lessons', 'the demo booking fits on one page');
  } else skip('Booking card offers the month filter', 'the demo customer has no multi-month booking on staging');

  // ---- Provider: participants open on their own page ----
  const provider = await newPage();
  await signIn(provider.page, providerEmail);
  await provider.page.goto('/provider/courses');
  // Whichever course the demo provider owns: the participants link is the roster page's own href.
  const providerCard = provider.page.locator('article').filter({ has: provider.page.locator('a[href*="/provider/courses/detail"]') }).first();
  await providerCard.waitFor();
  const providerCourse = (await providerCard.locator('h2').innerText()).trim();
  await providerCard.locator('a[href*="/provider/courses/detail"]').click();
  await provider.page.waitForURL(/\/provider\/courses\/detail/);
  await provider.page.getByRole('heading', { level: 1, name: providerCourse }).waitFor();
  assert.equal(await courseDialogs(provider.page, providerCourse), 0, 'the roster must not open in a dialog');
  mark('Provider participants open as a routed page, not a popup', provider.page.url());
  assert.ok(provider.page.url().includes('?id='), 'the roster page must carry the course id in its address');

  // The lesson selector is the select with an empty "choose a lesson" option (the language switcher has none).
  const lessonIndex = await provider.page.locator('select').evaluateAll(selects =>
    selects.findIndex(select => [...select.options].filter(option => option.value).length > 0 &&
      [...select.options].some(option => option.value === '')));
  assert.ok(lessonIndex >= 0, 'the roster page has no lesson selector');
  const lessonSelect = provider.page.locator('select').nth(lessonIndex);
  const lesson = (await lessonSelect.locator('option').evaluateAll(options =>
    options.map(option => option.value).filter(value => value)))[0];
  assert.ok(lesson, 'the course has no lesson to open');
  await lessonSelect.selectOption(lesson);
  await provider.page.waitForURL(/lesson=/);
  await provider.page.getByRole('heading', { name: /^(Participants|Partecipanti)$/ }).waitFor();
  mark('Choosing a lesson shows its roster and keeps the lesson in the URL', providerCourse);
  await provider.page.screenshot({ path: 'output/playwright/staging-provider-roster.png', fullPage: true });

  await customer.context.close();
  await provider.context.close();
  passed = true;
} catch (error) {
  evidence.error = error.message;
  console.error('FAIL', error.message);
  process.exitCode = 1;
} finally {
  evidence.passed = passed;
  evidence.completedAt = new Date().toISOString();
  fs.writeFileSync('output/playwright/route-pages-staging-smoke.json', JSON.stringify(evidence, null, 2));
  console.log(`Evidence: output/playwright/route-pages-staging-smoke.json (${evidence.checks.length} checks, ${evidence.skipped.length} skipped)`);
  await browser.close();
}
