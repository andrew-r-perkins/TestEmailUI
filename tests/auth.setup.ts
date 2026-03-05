import { test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

const BASE_URL = 'https://webmail.bell.net/bell/index-rui.jsp';
const VALID_EMAIL = process.env.BELL_EMAIL || 'your-email@sympatico.ca';
const VALID_PASSWORD = process.env.BELL_PASSWORD || 'your-password';

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto(BASE_URL);
  await page.waitForSelector('input[type="text"], input[type="email"]');
  await page.locator('input[type="text"], input[type="email"]').first().fill(VALID_EMAIL);
  await page.locator('input[type="password"]').fill(VALID_PASSWORD);
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
    await laterBtn.click();
  }
  const closeBtn = page.getByRole('button', { name: 'Close' });
  await closeBtn.waitFor({ state: 'visible', timeout: randomTimeout() }).catch(() => {});
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  }

  await page.context().storageState({ path: authFile });
});
