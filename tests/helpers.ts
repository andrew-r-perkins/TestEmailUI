import { Page } from '@playwright/test';

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────
export const BASE_URL = 'https://webmail.bell.net/bell/index-rui.jsp';
export const VALID_EMAIL = process.env.BELL_EMAIL || 'your-email@sympatico.ca';
export const VALID_PASSWORD = process.env.BELL_PASSWORD || 'your-password';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Dismiss any MFA / 2FA modals that Bell may show after login.
 * Uses waitFor + force:true because buttons can be animating or partially overlaid.
 * Also waits for any remaining dialog overlay to clear before returning.
 */
export async function dismissMfaModals(page: Page): Promise<void> {
  const laterBtn = page.getByRole('button', { name: 'Later' });
  await laterBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await laterBtn.isVisible().catch(() => false)) {
    await laterBtn.click();
    await laterBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  const closeBtn = page.getByRole('button', { name: 'Close' });
  await closeBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await closeBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  // Ensure no modal overlay remains before proceeding
  await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/**
 * Full login flow: navigate to Bell webmail, fill credentials, clear Shape
 * anti-bot cookies, submit, wait for the mail URL, and dismiss MFA modals.
 *
 * Notes:
 * - pressSequentially() is used (not fill()) to fire real keyboard events that
 *   Bell's login form requires.
 * - clearCookies() before clicking Login bypasses F5 Shape Security's server-side
 *   bot gate which rejects requests carrying Shape-set cookies.
 */
export async function login(
  page: Page,
  email = VALID_EMAIL,
  password = VALID_PASSWORD,
): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForSelector('input[type="text"], input[type="email"]');
  await page.locator('input[type="text"], input[type="email"]').first().fill(email);
  // Use .focus() rather than .click() on the password field — clicking triggers
  // Firefox's native password manager popup which deadlocks Playwright's click.
  await page.locator('input[type="password"]').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.locator('input[type="password"]').pressSequentially(password, { delay: 50 });
  // Clear F5 Shape anti-bot cookies set on page load before submitting.
  await page.context().clearCookies();
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(/.*#\/mail.*/);
  await dismissMfaModals(page);
}

/**
 * Standard beforeEach body for suites that require an authenticated session.
 *
 * - Navigates to BASE_URL.
 * - If Bell's SPA lands on the login page (expired/invalidated session), re-authenticates.
 * - Dismisses any MFA modals.
 * - Persists rotated/refreshed cookies so the next test starts with a valid session.
 */
export async function setupAuthenticatedPage(page: Page, browserName: string): Promise<void> {
  const authFile = `playwright/.auth/user-${browserName}.json`;
  await page.goto(BASE_URL);
  // 5 s timeout — SPA rendering after session expiry can be slow.
  if (await page.getByRole('button', { name: 'Login' }).isVisible({ timeout: 5000 }).catch(() => false)) {
    await login(page);
  } else {
    await page.waitForURL(/.*#\/mail.*/);
  }
  await dismissMfaModals(page);
  await page.context().storageState({ path: authFile });
}
