import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers';

// ═════════════════════════════════════════════
// LOGIN PAGE
// Tests covering the login page UI and form behaviour only.
// No credentials are submitted and no session is created here —
// see bell-webmail-authentication.spec.ts for that.
// ═════════════════════════════════════════════
test.describe('Login Page', () => {
  // The chromium/firefox projects set storageState at the project level.
  // Override it here with an empty state so these tests always see the real login page.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('input[type="text"], input[type="email"]');
  });

  test('should display login page with correct elements', async ({ page }) => {
    // Bell logo / page header
    await expect(page.locator('img[alt*="Bell"], .bell-logo, header').first()).toBeVisible();
    // Form fields
    await expect(page.locator('input[type="text"], input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Keep me logged in checkbox
    await expect(page.getByLabel(/keep me logged in/i)).toBeVisible();
    // Log in button
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    // Forgot password link
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
  });

  test('should have email field focused or ready for input', async ({ page }) => {
    const emailField = page.locator('input[type="text"], input[type="email"]').first();
    await expect(emailField).toBeEnabled();
    await emailField.fill('test@sympatico.ca');
    await expect(emailField).toHaveValue('test@sympatico.ca');
  });

  test('should toggle "Keep me logged in" checkbox', async ({ page }) => {
    const checkbox = page.getByLabel(/keep me logged in/i);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });

  test('should show error on empty form submission', async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForTimeout(500);
    // Bell uses HTML5 required field validation — page stays on login
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(page).not.toHaveURL(/.*#\/mail.*/);
  });

  test('should navigate to Forgot Password page', async ({ page }) => {
    await page.getByRole('link', { name: /forgot password/i }).click();
    await page.waitForLoadState('networkidle');
    // Should navigate away or open a new flow
    const urlChanged = !page.url().endsWith('#/');
    const contentChanged = await page.getByText(/reset|password|email/i).isVisible().catch(() => false);
    expect(urlChanged || contentChanged).toBeTruthy();
  });

  test('should display page in English by default with French toggle available', async ({ page }) => {
    await expect(page.getByText(/log in to bell email/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /français/i })).toBeVisible();
  });

  test('should switch UI language to French', async ({ page }) => {
    await page.getByRole('link', { name: /français/i }).click();
    await page.waitForTimeout(1000);
    // French login button reads "Se connecter" — match by visible text, not aria-label
    await expect(page.locator('button', { hasText: /se connecter/i })).toBeVisible();
  });

  test('password field should mask input', async ({ page }) => {
    const passwordField = page.locator('input[type="password"]');
    await expect(passwordField).toHaveAttribute('type', 'password');
  });
});
