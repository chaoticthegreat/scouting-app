// tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

// Auth was removed: the root is a landing chooser (no login gate) that forks
// between scouting and the lead dashboard. From there a scout tap reaches the
// open scouter home shell (name picker or "no active event" message).
test('app loads on the landing chooser and Scout reaches /scout (no login)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-screen')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('home-go-scout').click();
  await expect(page).toHaveURL(/\/scout$/, { timeout: 10_000 });
  await expect(page.getByTestId('scout-home')).toBeVisible({ timeout: 10_000 });
});

// The dashboard/lead views are open too — no login gate.
test('dashboard is reachable without a login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('tab', { name: 'Setup' })).toBeVisible();
});

// Legacy /admin alias folds into the dashboard Setup tab.
test('/admin redirects into the dashboard Setup tab', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard\?tab=setup$/, { timeout: 10_000 });
  await expect(page.getByTestId('setup-tab')).toBeVisible({ timeout: 10_000 });
});
