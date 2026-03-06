import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config();

// Firefox user preferences that disable the built-in password manager.
// Without these, Firefox can auto-fill a stale saved password on top of (or instead of)
// what Playwright types, causing Bell to receive wrong credentials.
const firefoxNoAutofill = {
  'signon.rememberSignons': false,
  'signon.autofillForms': false,
  'signon.generation.enabled': false,
};

// Bell's webmail uses F5 Shape Security anti-bot protection.  Shape blocks Firefox
// automation at the server level (even with correct credentials) while allowing Chrome
// automation through.  Spoofing Chrome's UA on Firefox projects bypasses the Shape gate
// while still running tests on Firefox's Gecko rendering engine.
const chromeUA = devices['Desktop Chrome'].userAgent;

export default defineConfig({
  testDir: './tests',
  timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000'),
  retries: 1,
  workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS) : undefined,
  use: {
    headless: false,          // set true for CI
    baseURL: 'https://webmail.bell.net',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup-chromium',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
      timeout: 60_000,
    },
    {
      name: 'setup-firefox',
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        userAgent: chromeUA,   // Spoof Chrome UA to bypass Bell's Shape anti-bot gate
        launchOptions: { firefoxUserPrefs: firefoxNoAutofill },
      },
      timeout: 60_000,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user-chromium.json',
      },
      dependencies: ['setup-chromium'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        userAgent: chromeUA,   // Keep Chrome UA so Bell honours the saved session
        storageState: 'playwright/.auth/user-firefox.json',
        launchOptions: { firefoxUserPrefs: firefoxNoAutofill },
      },
      dependencies: ['setup-firefox'],
    },
  ],
});
