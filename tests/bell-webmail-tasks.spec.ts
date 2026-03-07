import { test, expect } from '@playwright/test';
import { BASE_URL, setupAuthenticatedPage } from './helpers';

// ═════════════════════════════════════════════
// TASKS
// Tests covering creation, editing, completion, and deletion of tasks
// in Bell Webmail's Tasks section.
// ═════════════════════════════════════════════
test.describe('Tasks', () => {
  // storageState is inherited from the project config (user-chromium.json or user-firefox.json).

  test.beforeEach(async ({ page, browserName }) => {
    await setupAuthenticatedPage(page, browserName);
    // Navigate to the Tasks section
    await page.getByRole('link', { name: /tasks/i }).click();
    await page.waitForURL(/.*#\/tasks.*/);
  });

  // test.todo('should display the Tasks section after navigating from inbox');
  // test.todo('should display New Task button in toolbar');
  // test.todo('should create a new task with a title and due date');
  // test.todo('should display the newly created task in the task list');
  // test.todo('should open a task and display its details');
  // test.todo('should edit an existing task and save changes');
  // test.todo('should mark a task as complete');
  // test.todo('should filter tasks by status (all, active, completed)');
  // test.todo('should delete a task and confirm it is removed from the list');
});
