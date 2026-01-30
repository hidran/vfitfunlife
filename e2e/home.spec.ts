import { test, expect } from '@playwright/test';

test.describe('HomePage', () => {
  test('should show refresher when pulling down', async ({ page }) => {
    await page.goto('/home');

    // Simulate a pull-to-refresh gesture
    await page.mouse.move(150, 150);
    await page.mouse.down();
    await page.mouse.move(150, 400, { steps: 10 });

    // Check if the refresher is visible
    const refresher = await page.locator('.animate-spin');
    await expect(refresher).toBeVisible();

    await page.mouse.up();
  });
});
