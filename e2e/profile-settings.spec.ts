import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Profile Settings E2E suite.
 *
 * Phase 12 follow-ups:
 *  - These tests require a full stack: Next.js dev server + Firebase emulators +
 *    an authenticated test user seeded in the emulator.
 *  - The label selectors use English regex patterns (e.g. /upload avatar/i,
 *    /instagram/i). The real app runs next-intl and may serve Italian strings
 *    depending on the locale config. Either configure the test base URL to force
 *    the `en` locale (e.g. NEXT_PUBLIC_DEFAULT_LOCALE=en) or update regexes to
 *    match the Italian equivalents (e.g. /carica avatar/i).
 *  - Add a `storageState` fixture (Playwright auth helper) so `beforeEach`
 *    can reuse a pre-authenticated session instead of logging in each time.
 *  - The `toggle.isChecked()` assertion may need a small wait after reload for
 *    Firestore to hydrate the saved preference before the toggle renders.
 */

test.describe('Profile settings', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes a test user is auto-logged-in via dev fixture; if not, perform login here.
    await page.goto('/profile/edit');
  });

  test('uploads an avatar and persists across reload', async ({ page }) => {
    const fileInput = page.getByLabel(/upload avatar/i);
    await fileInput.setInputFiles(path.resolve(__dirname, 'fixtures/avatar.jpg'));
    await expect(page.getByRole('img', { name: /current avatar/i })).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByRole('img', { name: /current avatar/i })).toBeVisible();
  });

  test('saves social links', async ({ page }) => {
    await page.getByLabel(/instagram/i).fill('https://instagram.com/playwright_test');
    await page.locator('section#social').getByRole('button', { name: /save/i }).click();
    await page.reload();
    await expect(page.getByLabel(/instagram/i)).toHaveValue('https://instagram.com/playwright_test');
  });

  test('toggles notification preferences and persists', async ({ page }) => {
    const toggle = page.getByLabel(/push.*promotion/i);
    const wasChecked = await toggle.isChecked();
    await toggle.click();
    await page.locator('section#notifications').getByRole('button', { name: /save/i }).click();
    await page.reload();
    expect(await toggle.isChecked()).toBe(!wasChecked);
  });

  test('changes privacy visibility and persists', async ({ page }) => {
    await page.getByLabel(/^private$/i).click();
    await page.locator('section#privacy').getByRole('button', { name: /save/i }).click();
    await page.reload();
    await expect(page.getByLabel(/^private$/i)).toBeChecked();
  });
});
