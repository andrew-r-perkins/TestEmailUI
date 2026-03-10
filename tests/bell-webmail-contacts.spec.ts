import { test, expect } from './fixtures';
import type { Page, BrowserContext } from '@playwright/test';
import { devices } from '@playwright/test';
import { setupAuthenticatedPage, dismissMfaModals, openAppSection } from './helpers';

test.describe.serial('Contacts', () => {
  let sharedPage: Page;
  let sharedContext: BrowserContext;

  test.beforeAll(async ({ browser, browserName }) => {
    // One context+page for the entire suite — reduces goto(BASE_URL) from 3 to 1,
    // preventing Bell's Shape Security from soft-blocking repeated entry-point requests.
    sharedContext = await browser.newContext({
      storageState: `playwright/.auth/user-${browserName}.json`,
      ...(browserName === 'firefox' ? { userAgent: devices['Desktop Chrome'].userAgent } : {}),
    });
    sharedPage = await sharedContext.newPage();
    await setupAuthenticatedPage(sharedPage, browserName);
    await openAppSection(sharedPage, 'contacts');
    await sharedPage.locator('div.ow-contacts-ContactAddressBookItem-name[aria-label="Main"]')
      .waitFor({ state: 'visible', timeout: 10000 });
  });

  test.afterAll(async () => {
    await sharedContext.close();
  });

  test.beforeEach(async () => {
    // Reset to contacts list between tests via SPA nav (no goto(BASE_URL)).
    await dismissMfaModals(sharedPage);
    await sharedPage.getByRole('link', { name: /contacts/i }).click({ timeout: 5000 }).catch(() => {});
    await sharedPage.waitForURL(/.*#\/contacts.*/, { timeout: 5000 }).catch(() => {});
    await sharedPage.locator('div.ow-contacts-ContactAddressBookItem-name[aria-label="Main"]')
      .waitFor({ state: 'visible', timeout: 10000 });
  });

  const getMainCount = async (page: Page): Promise<number> => {
    await page.locator('div.ow-contacts-ContactAddressBookItem-name[aria-label="Main"]')
      .waitFor({ state: 'visible', timeout: 5000 });

    return page.evaluate(() => {
      const nameEl = document.querySelector('div.ow-contacts-ContactAddressBookItem-name[aria-label="Main"]');
      if (!nameEl) return -1;
      let el: Element | null = nameEl;
      for (let i = 0; i < 4; i++) {
        el = el.parentElement;
        if (!el) break;
        const text = (el.textContent ?? '').replace(/main/i, '').trim();
        const match = text.match(/\d+/);
        if (match) return parseInt(match[0]);
      }
      return -1;
    });
  };

  const createTestContact = async (page: Page): Promise<string> => {
    const timestamp = String(Date.now());

    await page.locator('.ow-contacts-contactsToolbar-label[aria-label="New"]').click();
    await expect(page.locator('a[aria-label="Add contact"]')).toBeVisible({ timeout: 5000 });
    await page.locator('a[aria-label="Add contact"]').click();
    await expect(page.locator('input[aria-label="First name"]')).toBeVisible({ timeout: 10000 });

    await page.locator('input[aria-label="First name"]').fill('Playwright');
    await page.locator('input[aria-label="Middle name"]').fill(timestamp);
    await page.locator('input[aria-label="Last name"]').fill('Test');
    await page.locator('input[aria-label="Email address"]').fill('playwright@test.com');

    await page.locator('button[aria-label="Save"]').click();
    await page.locator('button[aria-label="Save"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

    return timestamp;
  };

  test('should create a new contact and increase the Main count by one', async () => {
    await dismissMfaModals(sharedPage);
    const countBefore = await getMainCount(sharedPage);
    expect(countBefore).toBeGreaterThan(-1);

    await createTestContact(sharedPage);

    await expect.poll(async () => await getMainCount(sharedPage), { timeout: 10000 })
      .toBe(countBefore + 1);
  });

  test('should delete a contact and decrease the Main count by one', async () => {
    await dismissMfaModals(sharedPage);
    const timestamp = await createTestContact(sharedPage);

    const countBefore = await getMainCount(sharedPage);
    expect(countBefore).toBeGreaterThan(-1);

    const searchBox = sharedPage.locator('input[aria-label="Search contacts"]');
    await searchBox.fill('Playwright');

    const checkbox = sharedPage.locator(`span[role="checkbox"][aria-label*="${timestamp}"]`).first();
    await checkbox.waitFor({ state: 'visible', timeout: 7000 });
    await checkbox.click({ force: true });

    const directDeleteBtn = sharedPage.locator([
      '.ow-contacts-contactsToolbar-label[aria-label="Delete"]',
      'button[aria-label="Delete"]',
      '[class*="contactsToolbar"] [aria-label="Delete"]',
    ].join(', ')).first();

    if (await directDeleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await directDeleteBtn.click();
    } else {
      await sharedPage.locator('#contactListToolbarMore, button[aria-label="More"]').first().click();
      await expect(sharedPage.locator('a[aria-label="Delete"][role="menuitem"]')).toBeVisible({ timeout: 5000 });
      await sharedPage.locator('a[aria-label="Delete"][role="menuitem"]').click();
    }

    const confirmBtn = sharedPage.locator('button', { hasText: /^(ok|yes|confirm|delete)$/i }).first();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
      await expect(confirmBtn).toBeHidden({ timeout: 5000 }).catch(() => {});
    }

    await searchBox.clear();
    await expect(searchBox).toHaveValue('');

    await expect.poll(async () => await getMainCount(sharedPage), { timeout: 12000 })
      .toBe(countBefore - 1);
  });

  test('should create a group containing two test contacts', async () => {
    test.slow();
    await dismissMfaModals(sharedPage);

    const createGroupContact = async (): Promise<string> => {
      const timestamp = String(Date.now());

      await sharedPage.locator('.ow-contacts-contactsToolbar-label[aria-label="New"]').click();
      await expect(sharedPage.locator('a[aria-label="Add contact"]')).toBeVisible({ timeout: 5000 });
      await sharedPage.locator('a[aria-label="Add contact"]').click();
      await expect(sharedPage.locator('input[aria-label="First name"]')).toBeVisible({ timeout: 10000 });

      // Use pressSequentially so Bell's Angular reactive-form change detection fires and
      // marks the form dirty, enabling the Save button. fill() sets DOM values without
      // input events; on the second call the form component is reused with the previous
      // pristine state, so fill() alone is treated as "no change" and Save stays disabled.
      const typeInField = async (selector: string, value: string) => {
        const field = sharedPage.locator(selector);
        await field.click();
        await field.clear();
        await field.pressSequentially(value, { delay: 50 });
      };

      await typeInField('input[aria-label="First name"]', 'Playwright');
      await typeInField('input[aria-label="Middle name"]', timestamp);
      await typeInField('input[aria-label="Last name"]', 'Test');
      await typeInField('input[aria-label="Email address"]', `playwright.${timestamp}@test.com`);

      const saveBtn = sharedPage.locator('button[aria-label="Save"]');
      await expect(saveBtn).toBeEnabled({ timeout: 7000 });
      await saveBtn.click();

      // Bell sometimes keeps the editor open after save; verify creation in list, then close editor if needed.
      await expect.poll(
        async () => await sharedPage.locator(`span[role="checkbox"][aria-label*="${timestamp}"]`).count(),
        { timeout: 15000 },
      ).toBeGreaterThan(0);

      if (await saveBtn.isVisible().catch(() => false)) {
        const cancelBtn = sharedPage.locator('button[aria-label="Cancel edit contact"]');
        if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cancelBtn.click();
        }
      }
      await sharedPage.locator('dialog[aria-label="New contact"]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});

      return timestamp;
    };

    const timestamp1 = await createGroupContact();
    const timestamp2 = await createGroupContact();

    await sharedPage.locator('.ow-contacts-contactsToolbar-label[aria-label="New"]').click();
    await expect(sharedPage.locator('a[aria-label="Add group"]')).toBeVisible({ timeout: 5000 });
    await sharedPage.locator('a[aria-label="Add group"]').click();

    const groupName = `Playwright Group ${Date.now()}`;
    await expect(sharedPage.locator('input[aria-label="Group name"]')).toBeVisible({ timeout: 10000 });
    await sharedPage.locator('input[aria-label="Group name"]').fill(groupName);

    const groupSearch = sharedPage.locator('input.ow-combox-input');
    for (const timestamp of [timestamp1, timestamp2]) {
      await groupSearch.click();
      await groupSearch.clear();
      await groupSearch.pressSequentially('Playwright', { delay: 50 });
      const suggestion = sharedPage.locator(`div[title*="${timestamp}"]`).first();
      await suggestion.waitFor({ state: 'visible', timeout: 7000 });
      await suggestion.click();
    }

    await expect(sharedPage.getByText(/Contact List \(2\)/i)).toBeVisible({ timeout: 7000 });

    await sharedPage.locator('button[aria-label="Save"]').click();
    await sharedPage.locator('button[aria-label="Save"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

    // Verify via search instead of immediate list rendering, which can lag.
    const searchBox = sharedPage.locator('input[aria-label="Search contacts"]');
    await searchBox.fill(groupName);
    await expect(sharedPage.locator(`span[role="checkbox"][aria-label*="${groupName}"]`).first())
      .toBeVisible({ timeout: 12000 });
    await searchBox.clear();
    // No logout here — ending with a live session lets the next beforeEach reuse it
    // without triggering a re-login that can hit Bell's rate limiter.
  });
});
