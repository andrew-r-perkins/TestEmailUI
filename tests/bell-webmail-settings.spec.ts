import { test, expect } from '@playwright/test';
import { BASE_URL, setupAuthenticatedPage } from './helpers';

// ═════════════════════════════════════════════
// SETTINGS
// Tests covering reading, changing, and saving preferences
// in Bell Webmail's Settings section.
// ═════════════════════════════════════════════
test.describe('Settings', () => {
  // storageState is inherited from the project config (user-chromium.json or user-firefox.json).

  test.beforeEach(async ({ page, browserName }) => {
    await setupAuthenticatedPage(page, browserName);
    // Settings is rendered as a <span class="ow-navbar-label">, not an <a> tag
    await page.locator('span.ow-navbar-label', { hasText: /settings/i }).click();
    await page.waitForURL(/.*#\/settings.*/);
  });

  // test.todo('should display the Settings section after clicking the Settings navbar item');
  // test.todo('should display settings categories in the sidebar (General, Mail, etc.)');
  // test.todo('should be able to change the display name and save');
  // test.todo('should be able to change the email signature and save');
  // test.todo('should be able to change the default reply behaviour (reply vs reply-all)');
  // test.todo('should be able to change the number of messages shown per page');
  // test.todo('should be able to toggle the reading pane on and off');
  // test.todo('should be able to add an auto-reply / out-of-office message');
  // test.todo('should be able to create and delete an email filter rule');
  // test.todo('should be able to change the display language');
});
