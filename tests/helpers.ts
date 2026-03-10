import { Page } from '@playwright/test';

// Configuration
export const BASE_URL = 'https://webmail.bell.net/bell/index-rui.jsp';
export const VALID_EMAIL = process.env.BELL_EMAIL || 'your-email@sympatico.ca';
export const VALID_PASSWORD = process.env.BELL_PASSWORD || 'your-password';
export type AppSection = 'mail' | 'contacts' | 'calendar' | 'tasks' | 'settings';

const REFRESH_SELECTOR = 'button[title*="refresh" i], button[aria-label*="refresh" i], [class*="refresh"]';

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

  await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

export async function openLoginPage(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForSelector('input[type="text"], input[type="email"]');
}

export async function submitLoginForm(
  page: Page,
  email = VALID_EMAIL,
  password = VALID_PASSWORD,
): Promise<void> {
  await page.locator('input[type="text"], input[type="email"]').first().fill(email);

  // Use .focus() rather than .click() on the password field — clicking triggers
  // Firefox's native password manager popup which can deadlock Playwright's click.
  // Use pressSequentially (not fill) to fire real keyboard events Bell's form requires.
  // Clear the field first with Control+a + Delete before typing.
  // Use delay:50 to mimic human typing speed and avoid Shape Security bot detection.
  const pwField = page.locator('input[type="password"]');
  await pwField.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await pwField.pressSequentially(password, { delay: 50 });

  // Clear Shape Security anti-bot cookies set on page load before submitting.
  await page.context().clearCookies();
  await page.getByRole('button', { name: /log ?in/i }).click();
}

export async function waitForMailUrl(
  page: Page,
  waitUntil: 'commit' | 'domcontentloaded' | 'load' | 'networkidle' = 'load',
): Promise<void> {
  const timeout = parseInt(process.env.PLAYWRIGHT_TIMEOUT || '60000');
  await page.waitForURL(/.*#\/mail.*/, { waitUntil, timeout });
}

export async function login(
  page: Page,
  email = VALID_EMAIL,
  password = VALID_PASSWORD,
  options: {
    dismissMfa?: boolean;
    waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle';
  } = {},
): Promise<void> {
  const { dismissMfa = true, waitUntil = 'load' } = options;

  await openLoginPage(page);
  await submitLoginForm(page, email, password);

  // Race the mail-URL redirect against a visible credentials-error message.
  // Bell's login page has hidden error-message DOM nodes that contain "invalid credentials"
  // text even before a login attempt — so we use state:'visible' to only match when the
  // element is actually shown on screen, avoiding false-positives from hidden nodes.
  // We do NOT check body text after a timeout because by that point the test timeout may
  // have already fired, causing textContent() to return empty and swallow the real error.
  const timeout = parseInt(process.env.PLAYWRIGHT_TIMEOUT || '60000');
  const outcome = await Promise.race([
    waitForMailUrl(page, waitUntil)
      .then(() => 'success' as const)
      .catch(() => 'timeout' as const),
    page.getByText(/invalid credentials/i).first()
      .waitFor({ state: 'visible', timeout })
      .then(() => 'invalid_creds' as const)
      .catch(() => 'no_error' as const),
  ]);

  if (outcome === 'invalid_creds') {
    throw new Error('Login failed: Bell reports invalid credentials. Check BELL_EMAIL and BELL_PASSWORD in .env.');
  }
  if (outcome !== 'success') {
    throw new Error('Login failed: timed out waiting for inbox (#/mail) after submit.');
  }

  if (dismissMfa) {
    await dismissMfaModals(page);
  }
}
export async function setupAuthenticatedPage(page: Page, browserName: string): Promise<void> {
  const authFile = `playwright/.auth/user-${browserName}.json`;

  await page.goto(BASE_URL);

  // Race: either the SPA redirects us to #/mail (valid session) or the Login button appears.
  // We do NOT call login() here because login() calls openLoginPage() which does a second
  // page.goto(BASE_URL) — that double-navigation triggers Bell's Shape Security anti-bot.
  // needsLogin === null means neither resolved in 8 s (odd intermediate state); fall through.
  const loginBtn = page.getByRole('button', { name: 'Login' });
  const needsLogin = await Promise.race([
    page.waitForURL(/.*#\/mail.*/, { timeout: 8000 }).then(() => false).catch(() => null),
    loginBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => null),
  ]);

  if (needsLogin === true) {
    // Session is invalid. Retry up to 2 times — mirrors auth.setup.ts retry logic.
    // Each attempt: clear stale cookies, fresh navigation, submit form, then race URL
    // redirect against a visible credentials-error message.
    // If Bell shows "invalid credentials" on screen we fail fast rather than burning the
    // full 15 s waitForURL timeout.
    let loginSucceeded = false;
    for (let attempt = 1; attempt <= 2 && !loginSucceeded; attempt++) {
      await page.context().clearCookies();
      await page.goto(BASE_URL);
      await submitLoginForm(page);
      const outcome = await Promise.race([
        page.waitForURL(/.*#\/mail.*/, { timeout: 15000 })
          .then(() => 'success' as const)
          .catch(() => 'timeout' as const),
        page.getByText(/invalid credentials/i).first()
          .waitFor({ state: 'visible', timeout: 15000 })
          .then(() => 'invalid_creds' as const)
          .catch(() => 'no_error' as const),
      ]);
      if (outcome === 'invalid_creds') {
        throw new Error(
          'Login failed: Bell returned "invalid credentials". ' +
          'This is either wrong credentials (check BELL_EMAIL and BELL_PASSWORD in .env) ' +
          'or Bell\'s Shape Security has rate-limited this IP after too many login attempts — ' +
          'wait 30–60 minutes and retry.'
        );
      }
      loginSucceeded = (outcome === 'success');
    }
    if (!loginSucceeded) {
      throw new Error('Login failed: could not reach inbox after 2 attempts in setupAuthenticatedPage.');
    }
    await page.context().storageState({ path: authFile });
  }

  await dismissMfaModals(page);
}

export async function openAppSection(page: Page, section: AppSection): Promise<void> {
  if (section === 'contacts' || section === 'settings') {
    await page.locator('span.ow-navbar-label', { hasText: new RegExp(section, 'i') }).click();
  } else {
    await page.getByRole('link', { name: new RegExp(section, 'i') }).first().click();
  }

  const timeout = parseInt(process.env.PLAYWRIGHT_TIMEOUT || '60000');
  await page.waitForURL(new RegExp(`.*#\\/${section}.*`), { timeout });
}

export function getRefreshButton(page: Page) {
  return page.locator(REFRESH_SELECTOR).first();
}

export async function refreshInbox(page: Page): Promise<void> {
  const refreshBtn = getRefreshButton(page);
  if (await refreshBtn.isVisible().catch(() => false)) {
    await refreshBtn.click();
  } else {
    await page.reload();
    await dismissMfaModals(page);
  }
}

export async function logout(page: Page): Promise<void> {
  await page.locator('span.ow-navbar-label', { hasText: /log out/i }).click();
  await page.waitForURL(/ctvnews\.ca/, { timeout: 15000, waitUntil: 'domcontentloaded' });
}




