# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests (headless)
npm test

# Run tests with visible browser
npm run test:headed

# Run tests in interactive UI mode
npm run test:ui

# View HTML test report from last run
npm run test:report

# Run a single test by name
npx playwright test --grep "test name here"

# Run a single test file
npx playwright test tests/bell-webmail.spec.ts

# Run tests in a specific browser only
npx playwright test --project=chromium
npx playwright test --project=firefox

# Run only the auth setup for one browser (useful for debugging login)
npx playwright test --project=setup-chromium
npx playwright test --project=setup-firefox
```

## Architecture

This is a Playwright E2E test suite targeting Bell Webmail (https://webmail.bell.net). TypeScript is compiled on-the-fly by Playwright — no build step needed.

**Structure:**
- `tests/auth.setup.ts` — Pre-test authentication; saves session cookies to `playwright/.auth/user-{browser}.json`
- `tests/fixtures.ts` — Extends Playwright's `test` with an automatic post-test cooldown pause (`PLAYWRIGHT_TEST_PAUSE_MS`); all spec files import `{ test, expect }` from here instead of `@playwright/test`
- `playwright.config.ts` — Test configuration (timeout, retries, workers, Chromium + Firefox projects)
- `playwright/.auth/` — Per-browser saved sessions (`user-chromium.json`, `user-firefox.json`); gitignored
- `.env` — Credentials and tuning (`BELL_EMAIL`, `BELL_PASSWORD`, `PLAYWRIGHT_WORKERS`, `PLAYWRIGHT_TIMEOUT`, `PLAYWRIGHT_TEST_PAUSE_MS`); copy from `.env.example`

**Test organization:**
- `login(page)` helper function encapsulates authentication — reused in `beforeEach` hooks for Inbox and Logout suites
- `dismissMfaModals(page)` helper dismisses "Later" / "Close" MFA dialogs with `waitFor` checks and `force: true` clicks (buttons can be animating or overlaid); called in `login()`, all `beforeEach` hooks, and at the start of any test body that performs clicks in the email list
- Tests use role-based, text-based, and CSS locators with fallback selectors for robustness
- `.catch(() => false)` patterns handle optional UI elements that may not always appear
- The "should show error on invalid credentials" test is deliberately last in the Login suite to prevent Bell IP rate-limiting from blocking the valid-login test
- `test.slow()` is set on "should successfully log in" to triple the timeout as a safety margin
- Login Page suite uses `test.use({ storageState: { cookies: [], origins: [] } })` to override the project-level storageState so those tests always see the real login page

**Configuration notes:**
- `headless: true` in `playwright.config.ts` — use `npm run test:headed` to run with visible browser windows
- Tests run against both Chromium and Firefox by default; each test runs twice
- `baseURL` is `https://webmail.bell.net` — page navigations use relative paths
- Screenshots and videos are captured only on failure (`test-results/` directory)
- `dotenv` is loaded in `playwright.config.ts` so all `.env` values are available to tests
- `PLAYWRIGHT_TIMEOUT` (default `60000`) controls the global test timeout in ms; also passed explicitly as the `timeout` option to `waitForURL` in `waitForMailUrl` — do not omit it from that call
- `PLAYWRIGHT_WORKERS` (default: Playwright's default) controls parallelism — set to `1` on low-powered machines to prevent CPU spikes
- `PLAYWRIGHT_TEST_PAUSE_MS` (default `0`) inserts a post-test cooldown pause after every test via `tests/fixtures.ts`; use on low-powered laptops where back-to-back tests cause CPU spikes that can trigger overheating and system reboots
- Four projects are defined: `setup-chromium` and `setup-firefox` run `auth.setup.ts` first; `chromium` and `firefox` depend on their respective setup and load saved sessions

**Known Bell Webmail behaviours:**
- The Login button has `aria-label="Login"` — use `getByRole('button', { name: 'Login' })`, not `'Log in'`
- Navbar items (Log out, Settings, Help) are `<span class="ow-navbar-label">` elements, **not** `<a>` links — use `locator('span.ow-navbar-label', { hasText: /…/i })`
- The French login button visible text is "Se connecter" but its `aria-label` stays "Login" — use `locator('button', { hasText: /se connecter/i })`, not `getByRole`
- Logout redirects to `ctvnews.ca`, not back to the Bell login page
- Bell's email list may not use `<table>` rows — use `getByRole('row').nth(1)` (skip the header row at `nth(0)`) to click the first email
- Bell email row checkboxes are `<span role="checkbox" class="ow-icon ow-icon-checkbox-unselected">` — use `locator('[class*="ow-icon-checkbox-unselected"]').first()` to target the first email checkbox specifically; avoid generic `[role="checkbox"]` nth() selectors as nth(0) is the header select-all and nth(1) is a date-group select-all, both of which delete multiple emails
- MFA modals can re-appear after `beforeEach` in tests that interact with the email list; call `await dismissMfaModals(page)` again at the top of those test bodies
- `beforeEach` in Inbox/Logout suites uses a 5 s timeout to detect the login button (SPA rendering can be slow after session expiry)
- Quote `.env` values containing special characters (e.g. `$`) in single quotes to prevent shell/dotenv interpolation
- Bell's backend uses **F5 Shape Security** anti-bot protection — Shape sets cookies on page load that can cause the auth POST to be rejected; calling `page.context().clearCookies()` before clicking Login bypasses this gate
- Password input must use `pressSequentially(password, { delay: 50 })` (not `fill()`) to fire keyboard events at human-like speed; use `.focus()` (not `.click()`) on the password field to avoid triggering Firefox's native password manager popup; clear the field first with `Control+a` + `Delete` before typing
- Firefox is blocked by Shape at the server level unless the browser's User-Agent is spoofed to Chrome's UA — set via `userAgent: devices['Desktop Chrome'].userAgent` in the Firefox project configs
- Firefox's built-in password manager must be disabled via `firefoxUserPrefs` (`signon.rememberSignons`, `signon.autofillForms`, `signon.generation.enabled`) to prevent stale credentials being injected over what Playwright types
- Chromium projects use `launchOptions.args: ['--disable-save-password-bubble', '--password-store=basic']` to suppress Chrome's own password manager in headed mode
- Bell's Shape Security can temporarily block an IP/browser-fingerprint combination after repeated failed login attempts — if auth suddenly starts failing with "invalid credentials" for correct credentials, wait 30–60 minutes for the rate limit to expire before re-running
