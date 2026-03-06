import { test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://webmail.bell.net/bell/index-rui.jsp';
const VALID_EMAIL = process.env.BELL_EMAIL || 'your-email@sympatico.ca';
const VALID_PASSWORD = process.env.BELL_PASSWORD || 'your-password';

setup('authenticate', async ({ page }, testInfo) => {
  // Derive the file name from the project running this setup:
  // 'setup-chromium' → 'user-chromium.json', 'setup-firefox' → 'user-firefox.json'
  const browser = testInfo.project.name.replace('setup-', '');
  const authFile = path.join(__dirname, `../playwright/.auth/user-${browser}.json`);
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto(BASE_URL);
  await page.waitForSelector('input[type="text"], input[type="email"]');
  await page.locator('input[type="text"], input[type="email"]').first().fill(VALID_EMAIL);
  // pressSequentially() simulates real key presses (fires keydown/keyup/input events),
  // which is required for Bell's login form to capture the password correctly in Firefox.
  // fill() sets the value directly and may miss keyboard event listeners.
  // Use .focus() instead of .click() — clicking a password field in Firefox triggers
  // the browser's native password manager popup, which deadlocks Playwright's click action.
  await page.locator('input[type="password"]').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.locator('input[type="password"]').pressSequentially(VALID_PASSWORD, { delay: 50 });

  // Bell's backend runs F5 Shape anti-bot checks.  Shape cookies (dMUfLNHo,
  // BellShapeVUONX1mQ34) are set on page load based on the TLS fingerprint and can cause
  // auth.login to fail.  Clearing cookies here replicates Chrome's cookie-free state,
  // which Bell's auth endpoint accepts unconditionally.
  await page.context().clearCookies();

  await page.getByRole('button', { name: 'Login' }).click();
  // 'commit' fires as soon as the URL changes and the response starts —
  // no need to wait for Bell's full SPA asset bundle to finish loading.
  // Session cookies arrive with the initial response headers, so storageState is safe.
  await page.waitForURL(/.*#\/mail.*/, { waitUntil: 'commit' });

  // Dismiss MFA prompts if they appear
  const randomTimeout = () => Math.floor(Math.random() * 2000) + 1000;
  const laterBtn = page.getByRole('button', { name: 'Later' });
  await laterBtn.waitFor({ state: 'visible', timeout: randomTimeout() }).catch(() => {});
  if (await laterBtn.isVisible().catch(() => false)) {
    await laterBtn.click({ force: true });
  }
  const closeBtn = page.getByRole('button', { name: 'Close' });
  await closeBtn.waitFor({ state: 'visible', timeout: randomTimeout() }).catch(() => {});
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true });
  }

  await page.context().storageState({ path: authFile });
});
