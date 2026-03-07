import { test, expect, Page } from '@playwright/test';
import { setupAuthenticatedPage, dismissMfaModals } from './helpers';

// ═════════════════════════════════════════════
// CONTACTS
// Tests covering creation, editing, deletion, and use of contacts
// in Bell Webmail's Contacts section.
// ═════════════════════════════════════════════
test.describe('Contacts', () => {
  // storageState is inherited from the project config (user-chromium.json or user-firefox.json).

  test.beforeEach(async ({ page, browserName }) => {
    await setupAuthenticatedPage(page, browserName);
    // Dismiss any MFA / 2FA modals before interacting with the navbar —
    // they can reappear after session restore and block the click.
    await dismissMfaModals(page);
    // Contacts navbar item is a <span class="ow-navbar-label">, not an <a> tag —
    // same pattern as Settings and Log out.
    await page.locator('span.ow-navbar-label', { hasText: /contacts/i }).click();
    // Wait for the Main folder to appear — reliable signal the contacts view is loaded.
    await page.locator('div.ow-contacts-ContactAddressBookItem-name[aria-label="Main"]')
      .waitFor({ state: 'visible', timeout: 10000 });
  });

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * Read the total count displayed next to the "Main" contacts folder.
   * Bell renders the count as inline text in the parent row element, e.g. "Main5".
   * We read the parent's textContent via evaluate(), strip the folder name, and
   * extract the number. Returns -1 if the count could not be determined.
   */
  const getMainCount = async (page: Page): Promise<number> => {
    // Ensure the Main element is present before querying
    await page.locator('div.ow-contacts-ContactAddressBookItem-name[aria-label="Main"]')
      .waitFor({ state: 'visible', timeout: 5000 });

    return page.evaluate(() => {
      const nameEl = document.querySelector(
        'div.ow-contacts-ContactAddressBookItem-name[aria-label="Main"]'
      );
      if (!nameEl) return -1;
      // Walk up until we find a parent that contains a number beyond just "Main"
      let el: Element | null = nameEl;
      for (let i = 0; i < 4; i++) {
        el = el.parentElement;
        if (!el) break;
        const text = (el.textContent ?? '').replace(/main/i, '').trim();
        const match = text.match(/\d+/);  // number remaining after stripping "Main"
        if (match) return parseInt(match[0]);
      }
      return -1;
    });
  };

  /**
   * Open the New Contact form, fill in all fields, and save.
   * Uses first name "Playwright", a unique Date.now() timestamp as middle name,
   * last name "Test", and email "playwright@test.com".
   *
   * Returns the timestamp used as the middle name so callers can target this
   * specific contact later (e.g. for deletion) via its aria-label:
   * "Playwright <timestamp> Test".
   */
  const createTestContact = async (page: Page): Promise<string> => {
    const timestamp = String(Date.now());

    // ── Open the New contact dropdown ────────────────────────────────────────
    await page.locator('.ow-contacts-contactsToolbar-label[aria-label="New"]').click();
    await page.waitForTimeout(500);
    await page.locator('a[aria-label="Add contact"]').click();
    await page.waitForTimeout(1000); // wait for the contact form to render

    // ── Fill contact form ────────────────────────────────────────────────────
    await page.locator('input[aria-label="First name"]').fill('Playwright');
    await page.locator('input[aria-label="Middle name"]').fill(timestamp);
    await page.locator('input[aria-label="Last name"]').fill('Test');
    await page.locator('input[aria-label="Email address"]').fill('playwright@test.com');

    // ── Save ─────────────────────────────────────────────────────────────────
    await page.locator('button[aria-label="Save"]').click();
    // Wait for the Save button to disappear — confirms the form has closed.
    await page.locator('button[aria-label="Save"]')
      .waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    return timestamp;
  };

  // ═════════════════════════════════════════════
  // CREATE CONTACT
  // ═════════════════════════════════════════════
  test('should create a new contact and increase the Main count by one', async ({ page }) => {
    await dismissMfaModals(page);
    // ── Step 1: Record baseline Main folder count ─────────────────────────────
    const countBefore = await getMainCount(page);
    expect(countBefore).toBeGreaterThan(-1); // ensure count was readable

    // ── Steps 2–8: Fill and save the new contact form ─────────────────────────
    await createTestContact(page);

    // ── Step 9: Re-read the Main count ───────────────────────────────────────
    const countAfter = await getMainCount(page);

    // ── Step 10: Verify count increased by exactly 1 ─────────────────────────
    expect(countAfter).toBe(countBefore + 1);
  });

  // ═════════════════════════════════════════════
  // DELETE CONTACT
  // Self-contained: creates its own contact first so it does not depend on
  // the create test having run previously.
  // ═════════════════════════════════════════════
  test('should delete a contact and decrease the Main count by one', async ({ page }) => {
    await dismissMfaModals(page);
    // ── Step 1: Create a fresh contact; capture its unique timestamp ──────────
    // The timestamp is used as the middle name, which Bell includes in the
    // checkbox aria-label: "Playwright <timestamp> Test" — allowing us to
    // target this exact contact rather than any other Playwright contact.
    const timestamp = await createTestContact(page);

    // ── Step 2: Record the Main count after creation (baseline for deletion) ──
    const countBefore = await getMainCount(page);
    expect(countBefore).toBeGreaterThan(-1);

    // ── Step 3: Search for the contact ───────────────────────────────────────
    const searchBox = page.locator('input[aria-label="Search contacts"]');
    await searchBox.fill('Playwright');
    await page.waitForTimeout(1500); // wait for search results to render

    // ── Step 4: Select the specific contact using the timestamp middle name ───
    // aria-label format from Bell's SPA: "Playwright <timestamp> Test"
    const checkbox = page.locator(`span[role="checkbox"][aria-label*="${timestamp}"]`).first();
    await checkbox.waitFor({ state: 'visible', timeout: 5000 });
    await checkbox.click({ force: true });
    await page.waitForTimeout(500);

    // ── Step 5: Delete the selected contact ──────────────────────────────────
    // Primary: try any direct Delete button that appears in the toolbar when a
    // contact is selected. Multiple selectors tried in order of specificity.
    const directDeleteBtn = page.locator([
      '.ow-contacts-contactsToolbar-label[aria-label="Delete"]',
      'button[aria-label="Delete"]',
      '[class*="contactsToolbar"] [aria-label="Delete"]',
    ].join(', ')).first();

    if (await directDeleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await directDeleteBtn.click();
    } else {
      // Fallback: More dropdown → Delete menu item
      // <button id="contactListToolbarMore" aria-label="More" ...>
      // <a aria-label="Delete" role="menuitem" ...>
      await page.locator('#contactListToolbarMore, button[aria-label="More"]').first().click();
      await page.waitForTimeout(500);
      await page.locator('a[aria-label="Delete"][role="menuitem"]').click();
    }
    await page.waitForTimeout(1000);

    // ── Step 6: Confirm deletion dialog if one appears ────────────────────────
    const confirmBtn = page.locator('button', { hasText: /^(ok|yes|confirm|delete)$/i }).first();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(1000);

    // ── Step 7: Clear search to return to the full contacts view ─────────────
    await searchBox.clear();
    await page.waitForTimeout(1000);

    // ── Step 8: Re-read the Main count ───────────────────────────────────────
    const countAfter = await getMainCount(page);

    // ── Step 9: Verify count decreased by exactly 1 ──────────────────────────
    expect(countAfter).toBe(countBefore - 1);
  });

  // ═════════════════════════════════════════════
  // CREATE GROUP
  // Creates two test contacts then groups them together.
  // Self-contained: all contacts and the group are created within the test.
  // ═════════════════════════════════════════════
  test('should create a group containing two test contacts', async ({ page }) => {
    await dismissMfaModals(page);
    // Contact creation + group form submission takes time — triple the timeout.
    test.slow();

    // ── Steps 1–2: Create two uniquely identifiable test contacts ─────────────
    // Each returns its timestamp (middle name) for targeted lookup later.
    const timestamp1 = await createTestContact(page);
    const timestamp2 = await createTestContact(page);

    // ── Step 3: Open New → Add group ─────────────────────────────────────────
    await page.locator('.ow-contacts-contactsToolbar-label[aria-label="New"]').click();
    await page.waitForTimeout(500);
    await page.locator('a[aria-label="Add group"]').click();
    await page.waitForTimeout(1000); // wait for group form to render

    // ── Step 4: Fill group name ───────────────────────────────────────────────
    const groupName = `Playwright Group ${Date.now()}`;
    await page.locator('input[aria-label="Group name"]').fill(groupName);

    // ── Step 5: Add both contacts to the group ────────────────────────────────
    // The group form has its own combobox search (input.ow-combox-input), distinct
    // from the contact list search bar (input.ow-contacts-ContactListSearch-input).
    // Typing each contact's timestamp (middle name) gives a unique autocomplete
    // match so we always select the right contact.
    const groupSearch = page.locator('input.ow-combox-input');

    for (const timestamp of [timestamp1, timestamp2]) {
      // Search by first name to reliably trigger the autocomplete dropdown.
      // Then target the specific contact by its timestamp, which Bell renders
      // as the div title: <div title="Playwright <timestamp> Test">
      await groupSearch.fill('Playwright');
      await page.waitForTimeout(1000); // allow autocomplete list to populate

      const suggestion = page.locator(`div[title*="${timestamp}"]`).first();
      await suggestion.waitFor({ state: 'visible', timeout: 5000 });
      await suggestion.click();
      await page.waitForTimeout(500);
      // Bell clears the search box after each selection — no manual clear needed
    }

    // ── Step 6: Verify both contacts were added before saving ─────────────────
    await expect(page.getByText(/Contact List \(2\)/i)).toBeVisible({ timeout: 5000 });

    // ── Step 7: Save the group ────────────────────────────────────────────────
    await page.locator('button[aria-label="Save"]').click();
    await page.locator('button[aria-label="Save"]')
      .waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // ── Step 8: Verify the group name appears in the contacts area ────────────
    await expect(page.getByText(groupName, { exact: false })).toBeVisible({ timeout: 5000 });

    // ── Step 9: Logout ────────────────────────────────────────────────────────
    await page.locator('span.ow-navbar-label', { hasText: /log out/i }).click();
    await expect(page).toHaveURL(/ctvnews\.ca/, { timeout: 15000 });
  });

  // ─────────────────────────────────────────────
  // Remaining test stubs — to be implemented
  // ─────────────────────────────────────────────
  // test.todo('should display the Contacts section after navigating from inbox');
  // test.todo('should display New Contact button in toolbar');
  // test.todo('should display newly created contact in the contacts list');
  // test.todo('should open a contact and display its details');
  // test.todo('should edit an existing contact and save changes');
  // test.todo('should search for a contact by name');
  // test.todo('should search for a contact by email address');
  // test.todo('should be able to use a contact address when composing an email');
});
