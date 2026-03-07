import { test, expect } from '@playwright/test';
import { BASE_URL, VALID_EMAIL, VALID_PASSWORD, dismissMfaModals, setupAuthenticatedPage } from './helpers';

// ═════════════════════════════════════════════
// AUTHENTICATION — LOGIN
// Tests that actually submit credentials and verify the outcome.
// Uses an empty storageState so these tests always hit the real login page.
// ═════════════════════════════════════════════
test.describe('Authentication - Login', () => {
  // Override the project-level storageState so these tests always see the real login page.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('input[type="text"], input[type="email"]');
  });

  test('should successfully log in with valid credentials', async ({ page }) => {
    test.slow(); // triple timeout — Bell can be slow to redirect after login
    // beforeEach already loaded the login page; fill and submit directly to avoid
    // an extra page.goto() which can confuse Bell's server and add latency.
    await page.locator('input[type="text"], input[type="email"]').first().fill(VALID_EMAIL);
    // Use .focus() rather than .click() — clicking triggers Firefox's native password
    // manager popup which deadlocks Playwright's click action.
    await page.locator('input[type="password"]').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.locator('input[type="password"]').pressSequentially(VALID_PASSWORD, { delay: 50 });
    // Clear Shape anti-bot cookies before submitting (see helpers.ts login() comment).
    await page.context().clearCookies();
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL(/.*#\/mail.*/, { timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000') });
    await dismissMfaModals(page);
    await expect(page).toHaveURL(/.*#\/mail.*/);
    await expect(page.getByText(/inbox/i).first()).toBeVisible();
  });

  // Kept last so that any IP-level rate-limiting from failed logins doesn't block
  // the valid-login test above.
  test('should show error on invalid credentials', async ({ page }) => {
    await page.locator('input[type="text"], input[type="email"]').first().fill('invalid@sympatico.ca');
    await page.locator('input[type="password"]').fill('wrongpassword123');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForTimeout(2000);
    const errorVisible = await page.locator(
      '[class*="error"], [class*="alert"], [role="alert"]'
    ).isVisible().catch(() => false);
    const stillOnLoginPage = page.url().includes('#/') && !page.url().includes('#/mail');
    expect(errorVisible || stillOnLoginPage).toBeTruthy();
  });
});

// ═════════════════════════════════════════════
// AUTHENTICATION — LOGOUT
// Tests that verify session termination behaviour.
// Uses the saved session from the project-level storageState.
// ═════════════════════════════════════════════
test.describe('Authentication - Logout', () => {
  // storageState is inherited from the project config (user-chromium.json or user-firefox.json).

  test.beforeEach(async ({ page, browserName }) => {
    await setupAuthenticatedPage(page, browserName);
  });

  test('should display Log out button when logged in', async ({ page }) => {
    // Navbar items are <span class="ow-navbar-label">, not <a> links
    await expect(page.locator('span.ow-navbar-label', { hasText: /log out/i })).toBeVisible();
  });

  test('should log out and redirect away from webmail', async ({ page }) => {
    await page.locator('span.ow-navbar-label', { hasText: /log out/i }).click();
    // Bell redirects to ctvnews.ca (not back to the Bell login page) after logout
    await expect(page).toHaveURL(/ctvnews\.ca/, { timeout: 15000 });
  });

  test('should not be able to access inbox after logout', async ({ page }) => {
    // beforeEach may need to re-authenticate if the previous test's logout invalidated
    // the session; triple the timeout to give budget for re-auth + the test body.
    test.slow();
    await page.locator('span.ow-navbar-label', { hasText: /log out/i }).click();
    await expect(page).toHaveURL(/ctvnews\.ca/, { timeout: 15000 });
    await page.goto(`${BASE_URL}#/mail`);
    await page.waitForTimeout(2000);
    // Should be redirected back to login
    const onLoginPage = await page.getByRole('button', { name: 'Login' }).isVisible({ timeout: 5000 }).catch(() => false);
    expect(onLoginPage).toBeTruthy();
  });
});
