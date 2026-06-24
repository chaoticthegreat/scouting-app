// tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

// Auth was removed: the root redirects straight to the open scouter home. A fresh
// device has a silent anonymous session and no selected scouter, so it shows the
// scout-home shell (either the name picker or the "no active event" message).
test('app loads and lands on /scout (no login)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/scout$/, { timeout: 10_000 });
  await expect(page.getByTestId('scout-home')).toBeVisible({ timeout: 10_000 });
});

// The dashboard/lead views are open too — no login gate.
test('dashboard is reachable without a login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('dash-tab-setup')).toBeVisible();
});

// Legacy /admin alias folds into the dashboard Setup tab.
test('/admin redirects into the dashboard Setup tab', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard\?tab=setup$/, { timeout: 10_000 });
  await expect(page.getByTestId('setup-tab')).toBeVisible({ timeout: 10_000 });
});
