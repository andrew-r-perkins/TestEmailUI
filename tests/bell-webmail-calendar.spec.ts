import { test, expect } from '@playwright/test';
import { BASE_URL, setupAuthenticatedPage } from './helpers';

// ═════════════════════════════════════════════
// CALENDAR
// Tests covering creation, editing, deletion, and use of events
// in Bell Webmail's Calendar section.
// ═════════════════════════════════════════════
test.describe('Calendar', () => {
  // storageState is inherited from the project config (user-chromium.json or user-firefox.json).

  test.beforeEach(async ({ page, browserName }) => {
    await setupAuthenticatedPage(page, browserName);
    // Navigate to the Calendar section
    await page.getByRole('link', { name: /calendar/i }).click();
    await page.waitForURL(/.*#\/calendar.*/);
  });

  // test.todo('should display the Calendar section after navigating from inbox');
  // test.todo('should display the current month view by default');
  // test.todo('should display New Event button in toolbar');
  // test.todo('should switch between day, week, and month views');
  // test.todo('should navigate to the next and previous month');
  // test.todo('should create a new calendar event with a title, date, and time');
  // test.todo('should display the newly created event on the calendar');
  // test.todo('should open an event and display its details');
  // test.todo('should edit an existing event and save changes');
  // test.todo('should delete a calendar event and confirm it is removed');
});
