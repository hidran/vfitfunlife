import { test, expect } from '@playwright/test';

test.describe('Venue Detail Page', () => {
  test('Carosello Fitness page does not show "missing param" runtime error', async ({ page }) => {
    await page.goto('/venue/carosello/');
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('missing param');
    expect(bodyText).not.toContain('Runtime Error');
  });

  test('Urban Core Gym page does not show "missing param" runtime error', async ({ page }) => {
    await page.goto('/venue/urban-core/');
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('missing param');
    expect(bodyText).not.toContain('Runtime Error');
  });

  test('Unknown venue id renders the not-found panel without runtime error', async ({ page }) => {
    await page.goto('/venue/this-does-not-exist/');
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('missing param');
    expect(bodyText).not.toContain('Runtime Error');
  });
});
