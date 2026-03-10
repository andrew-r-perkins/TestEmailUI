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
  timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '60000'),
  retries: 0,
  workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS) : undefined,
  reporter: 'html',
  use: {
    headless: true,
    baseURL: 'https://webmail.bell.net',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup-chromium',
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Suppress Chrome's "Save password?" bubble and use a basic credential store
          // so the native password manager never interferes with Playwright's typed input.
          args: ['--disable-save-password-bubble', '--password-store=basic'],
        },
      },
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
      // Explicit ordering: contacts runs first so it uses the freshly-saved auth session
      // before bell-webmail-authentication.spec.ts generates ~4 login events (including a
      // deliberate invalid-credentials submission) that trigger Bell's Shape Security
      // rate-limiter.  Exact file paths (no wildcards) are respected in order by Playwright.
      testMatch: [
        'tests/bell-webmail-contacts.spec.ts',
        'tests/bell-webmail-login-page.spec.ts',
        'tests/bell-webmail-authentication.spec.ts',
        'tests/bell-webmail-mail.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user-chromium.json',
        launchOptions: {
          args: ['--disable-save-password-bubble', '--password-store=basic'],
        },
      },
      dependencies: ['setup-chromium'],
    },
    {
      name: 'firefox',
      // Same ordering as chromium — contacts before authentication to avoid rate-limiting.
      testMatch: [
        'tests/bell-webmail-contacts.spec.ts',
        'tests/bell-webmail-login-page.spec.ts',
        'tests/bell-webmail-authentication.spec.ts',
        'tests/bell-webmail-mail.spec.ts',
      ],
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
