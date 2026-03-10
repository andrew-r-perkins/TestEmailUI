import { expect, test as base } from '@playwright/test';

const testPauseMsRaw = process.env.PLAYWRIGHT_TEST_PAUSE_MS ?? '0';
const testPauseMs = Number.parseInt(testPauseMsRaw, 10);
const testPauseMsSafe = Number.isFinite(testPauseMs) && testPauseMs > 0 ? testPauseMs : 0;

export const test = base.extend<{ _cooldownAfterTest: void }>({
  _cooldownAfterTest: [
    async ({}, use) => {
      await use();
      if (testPauseMsSafe > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, testPauseMsSafe));
      }
    },
    { auto: true },
  ],
});

export { expect };

