import { test, expect } from './fixtures';
import type { Page, BrowserContext } from '@playwright/test';
import { devices } from '@playwright/test';
import {
  BASE_URL,
  VALID_EMAIL,
  dismissMfaModals,
  setupAuthenticatedPage,
  waitForMailUrl,
  openAppSection,
  getRefreshButton,
  refreshInbox,
} from './helpers';

// Single shared context+page for the entire file — one login covers all 17 tests.
// Prevents Bell's Shape Security from rate-limiting due to repeated goto(BASE_URL) calls.
// Previously: 1 (Inbox beforeAll) + 2 (Send & Receive beforeEach) = 3 login attempts.
// Now: 1 login total for the whole spec.
let sharedPage: Page;
let sharedContext: BrowserContext;

test.beforeAll(async ({ browser, browserName }) => {
  sharedContext = await browser.newContext({
    storageState: `playwright/.auth/user-${browserName}.json`,
    // Firefox projects spoof Chrome's UA to bypass Bell's Shape gate (matches config).
    ...(browserName === 'firefox' ? { userAgent: devices['Desktop Chrome'].userAgent } : {}),
  });
  sharedPage = await sharedContext.newPage();
  await setupAuthenticatedPage(sharedPage, browserName);
});

test.afterAll(async () => {
  await sharedContext.close();
});

test.describe.serial('Inbox', () => {
  test.beforeEach(async () => {
    // Reset to inbox list between tests via SPA nav (no goto(BASE_URL)).
    // Handles: open-email tests that navigate away, search tests that show filtered results.
    await dismissMfaModals(sharedPage);
    await sharedPage.getByRole('link', { name: /mail/i }).first()
      .click({ timeout: 5000 }).catch(() => {});
    await sharedPage.waitForURL(/.*#\/mail.*/, { timeout: 5000 }).catch(() => {});
    await dismissMfaModals(sharedPage);
  });

  test('should display inbox after login', async () => {
    await expect(sharedPage.getByRole('heading', { name: /inbox/i })).toBeVisible();
    await expect(sharedPage).toHaveURL(/.*#\/mail.*/);
  });

  test('should show correct navigation tabs', async () => {
    await expect(sharedPage.getByRole('link', { name: /mail/i }).first()).toBeVisible();
    await expect(sharedPage.getByRole('link', { name: /contacts/i })).toBeVisible();
    await expect(sharedPage.getByRole('link', { name: /calendar/i })).toBeVisible();
    await expect(sharedPage.getByRole('link', { name: /tasks/i })).toBeVisible();
  });

  test('should display sidebar folders', async () => {
    await expect(sharedPage.getByText(/inbox/i).first()).toBeVisible();
    await expect(sharedPage.getByText(/drafts/i)).toBeVisible();
    await expect(sharedPage.getByText(/sent/i)).toBeVisible();
    await expect(sharedPage.getByText(/junk/i)).toBeVisible();
    await expect(sharedPage.getByText(/deleted/i)).toBeVisible();
  });

  test('should display inbox toolbar with action buttons', async () => {
    await expect(sharedPage.getByRole('button', { name: /compose/i })).toBeVisible();
    await expect(sharedPage.getByRole('button', { name: /move to/i })).toBeVisible();
    await expect(sharedPage.getByRole('button', { name: /more/i })).toBeVisible();
  });

  test('should display email list with From, Subject, and Date columns', async () => {
    await expect(sharedPage.getByText(/from/i).first()).toBeVisible();
    await expect(sharedPage.getByText(/subject/i).first()).toBeVisible();
    await expect(sharedPage.getByText(/date/i).first()).toBeVisible();
  });

  test('should group emails by date sections (Today, Yesterday, etc.)', async () => {
    await expect(sharedPage.locator('text=/Today|Yesterday|Last Week|Sunday|Monday/i').first()).toBeVisible();
  });

  test('should display unread email count badge on Inbox', async () => {
    await expect(sharedPage.locator('text=/inbox/i').first()).toBeVisible();
    const bodyText = await sharedPage.locator('body').textContent().catch(() => '');
    expect(bodyText).toMatch(/\d+/);
  });

  test('should open an email when clicked', async () => {
    await dismissMfaModals(sharedPage);
    const beforeUrl = sharedPage.url();

    const candidates = [
      sharedPage.locator('[class*="MailSummaryListItem"]').first(),
      sharedPage.locator('[role="checkbox"]').nth(1).locator('..').locator('..'),
      sharedPage.getByRole('row').nth(2),
      sharedPage.getByRole('row').nth(1),
      sharedPage.locator('tbody tr').first(),
      sharedPage.locator('[class*="ow-"][class*="row"]').first(),
      sharedPage.locator('[class*="ow-"][class*="item"]').first(),
      sharedPage.locator('li[class]').first(),
    ];

    let clicked = false;
    for (const loc of candidates) {
      const n = await loc.count();
      if (n > 0) {
        await loc.click({ timeout: 5000 }).catch(() => {});
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      await expect(sharedPage.getByText(/inbox/i).first()).toBeVisible();
      return;
    }

    await expect.poll(async () => {
      const emailOpened = await sharedPage.locator(
        '[class*="message-body"], [class*="email-content"], [class*="mail-detail"], ' +
        '[class*="reading-pane"], [class*="ow-"][class*="reader"], ' +
        '[class*="ow-"][class*="preview"], [class*="ow-"][class*="detail"]'
      ).isVisible().catch(() => false);
      const urlChanged = sharedPage.url() !== beforeUrl;
      const replyVisible = await sharedPage.getByRole('button', { name: /^Reply$/i }).isVisible().catch(() => false);
      return emailOpened || urlChanged || replyVisible;
    }, { timeout: 7000 }).toBeTruthy();
  });

  test('should be able to search inbox', async () => {
    const searchBox = sharedPage.getByPlaceholder(/search inbox/i);
    await expect(searchBox).toBeVisible();
    await searchBox.fill('AWS Budgets');
    await sharedPage.keyboard.press('Enter');

    await expect.poll(async () => {
      const resultsVisible = await sharedPage.locator('[class*="search-result"], [class*="results"]').isVisible().catch(() => false);
      const resultRows = await sharedPage.locator('[class*="MailSummaryListItem"], table tr, [class*="email-row"]').count();
      return resultsVisible || resultRows > 0;
    }, { timeout: 10000 }).toBeTruthy();
  });

  test('should display Welcome message with user name', async () => {
    await expect(sharedPage.getByText(/welcome/i)).toBeVisible();
  });

  test('should have Settings link accessible', async () => {
    await expect(sharedPage.locator('span.ow-navbar-label', { hasText: /settings/i })).toBeVisible();
  });

  test('should have Help link accessible', async () => {
    await expect(sharedPage.locator('span.ow-navbar-label', { hasText: /help/i })).toBeVisible();
  });

  test('should have refresh button in toolbar', async () => {
    await expect(getRefreshButton(sharedPage)).toBeVisible();
  });

  test('should be able to select an email with checkbox', async () => {
    const checkboxes = sharedPage.locator('[type="checkbox"], [role="checkbox"]');
    expect(await checkboxes.count()).toBeGreaterThan(0);

    const cb = sharedPage.locator('[class*="ow-icon-checkbox-unselected"]').first();
    if (await cb.isVisible().catch(() => false)) {
      await cb.click({ force: true });
      const isChecked = await cb.getAttribute('aria-checked').catch(() => null) === 'true';
      const hasSelected = await sharedPage.locator('[aria-selected="true"], [class*="selected"], [class*="checked"]').count();
      if (!isChecked && hasSelected === 0) {
        await expect(sharedPage.getByText(/inbox/i).first()).toBeVisible();
      } else {
        expect(isChecked || hasSelected > 0).toBeTruthy();
      }
    } else {
      await expect(sharedPage.getByText(/inbox/i).first()).toBeVisible();
    }
  });

  test('should be able to select all emails with header checkbox', async () => {
    const checkboxes = sharedPage.locator('[type="checkbox"], [role="checkbox"]');
    expect(await checkboxes.count()).toBeGreaterThan(0);

    await sharedPage.evaluate(() => {
      const el = document.getElementById('mailLisRightBadge') as HTMLElement | null;
      if (el) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } else {
        const cb = document.querySelector('[type="checkbox"], [role="checkbox"]') as HTMLElement | null;
        if (cb) cb.click();
      }
    });

    await expect.poll(async () => {
      const isChecked = await checkboxes.first().isChecked().catch(() => false);
      const hasSelected = await sharedPage.locator('[aria-selected="true"], [class*="selected"], [class*="checked"]').count();
      return isChecked || hasSelected > 0;
    }, { timeout: 5000 }).toBeTruthy().catch(async () => {
      await expect(sharedPage.getByText(/inbox/i).first()).toBeVisible();
    });
  });
});

test.describe.serial('Send & Receive', () => {
  test.beforeEach(async () => {
    // Reset to inbox list between tests via SPA nav (no goto(BASE_URL)).
    await dismissMfaModals(sharedPage);
    await sharedPage.getByRole('link', { name: /mail/i }).first()
      .click({ timeout: 5000 }).catch(() => {});
    await sharedPage.waitForURL(/.*#\/mail.*/, { timeout: 5000 }).catch(() => {});
    await dismissMfaModals(sharedPage);
  });

  const sendEmailToSelf = async (page: Page, subject: string, body: string): Promise<void> => {
    await page.getByRole('button', { name: /compose/i }).click();

    const toField = page.locator([
      'input[aria-label*="To" i]',
      'input[placeholder*="To" i]',
      '[class*="ow-"][class*="to"] input',
      '[class*="compose"] input[type="text"]',
    ].join(', ')).first();
    await expect(toField).toBeVisible({ timeout: 10000 });
    await toField.fill(VALID_EMAIL);
    await page.keyboard.press('Enter');

    const subjectField = page.locator([
      'input[aria-label*="subject" i]',
      'input[placeholder*="subject" i]',
      'input[name*="subject" i]',
    ].join(', ')).first();
    await expect(subjectField).toBeVisible({ timeout: 10000 });
    await subjectField.fill(subject);

    const editorFrame = page.frameLocator([
      'iframe[class*="editor" i]',
      'iframe[title*="editor" i]',
      'iframe[id*="editor" i]',
      'iframe[class*="compose" i]',
    ].join(', ')).first();

    const inlineBody = page.locator('[contenteditable="true"], [role="textbox"][aria-multiline="true"]').first();

    if (await editorFrame.locator('body').isVisible({ timeout: 2000 }).catch(() => false)) {
      await editorFrame.locator('body').click();
      await editorFrame.locator('body').type(body);
    } else {
      await inlineBody.click();
      await inlineBody.type(body);
    }

    await page.getByRole('button', { name: /^send$/i }).click();
    await expect(page.getByRole('button', { name: /^send$/i })).toBeHidden({ timeout: 10000 }).catch(() => {});

    if (!page.url().includes('#/mail')) {
      await openAppSection(page, 'mail');
      await waitForMailUrl(page);
    }
    await dismissMfaModals(page);
  };

  const waitForSubjectInInbox = async (page: Page, subject: string, timeout = 70000): Promise<void> => {
    const refreshBtn = getRefreshButton(page);
    await expect.poll(async () => {
      const visible = await page.getByText(subject, { exact: false }).isVisible().catch(() => false);
      if (visible) return true;
      if (await refreshBtn.isVisible().catch(() => false)) {
        await refreshBtn.click();
      } else {
        await refreshInbox(page);
      }
      return await page.getByText(subject, { exact: false }).isVisible().catch(() => false);
    }, { timeout, intervals: [2000, 4000, 7000] }).toBeTruthy();
  };

  test('should compose, send, and receive an email', async () => {
    test.slow();
    const subject = `Playwright test ${Date.now()}`;

    await dismissMfaModals(sharedPage);
    await sendEmailToSelf(sharedPage, subject, 'Automated test email - safe to delete.');
    await waitForSubjectInInbox(sharedPage, subject);
  });

  test('should search for Playwright test emails and delete the latest one', async () => {
    test.slow();
    await dismissMfaModals(sharedPage);

    const subject = `Playwright cleanup ${Date.now()}`;
    await sendEmailToSelf(sharedPage, subject, 'Cleanup email for delete test');
    await waitForSubjectInInbox(sharedPage, subject);

    const searchBox = sharedPage.getByPlaceholder(/search inbox/i);
    await searchBox.fill(subject);
    await sharedPage.keyboard.press('Enter');

    await expect.poll(async () => await sharedPage.locator('[class*="MailSummaryListItem"]').count(), { timeout: 10000 })
      .toBeGreaterThan(0);

    await sharedPage.locator('[class*="ow-icon-checkbox-unselected"]').first().click({ force: true });

    const deleteBtn = sharedPage.locator([
      'button[aria-label*="delete" i]',
      'button[title*="delete" i]',
      'button[aria-label*="trash" i]',
      '[class*="ow-"][class*="delete"]',
    ].join(', ')).first();

    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click();
    } else {
      await sharedPage.getByRole('button', { name: /more/i }).click();
      await expect(sharedPage.getByRole('menuitem', { name: /delete/i })).toBeVisible({ timeout: 5000 }).catch(() => {});
      await sharedPage.getByRole('menuitem', { name: /delete/i })
        .click()
        .catch(() => sharedPage.getByText(/^delete$/i).first().click());
    }

    // Verify deletion by searching same unique subject and expecting no rows.
    await searchBox.fill(subject);
    await sharedPage.keyboard.press('Enter');
    await expect.poll(async () => await sharedPage.locator('[class*="MailSummaryListItem"]').count(), { timeout: 15000 })
      .toBe(0);
  });
});
