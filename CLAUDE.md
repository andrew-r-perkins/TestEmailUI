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
```

## Architecture

This is a Playwright E2E test suite targeting Bell Webmail (https://webmail.bell.net). TypeScript is compiled on-the-fly by Playwright — no build step needed.

**Structure:**
- `tests/bell-webmail.spec.ts` — All 27 tests across 3 suites: Login Page, Inbox, Logout
- `playwright.config.ts` — Test configuration (30s timeout, 1 retry, Chromium + Firefox)
- `.env` — Credentials (`BELL_EMAIL`, `BELL_PASSWORD`); copy from `.env.example`

**Test organization:**
- `login(page)` helper function encapsulates authentication — reused in `beforeEach` hooks for Inbox and Logout suites
- `dismissMfaModals(page)` helper dismisses "Later" / "Close" MFA dialogs with 5 s `waitFor` checks; called in `login()`, all `beforeEach` hooks, and at the start of any test body that performs clicks in the email list
- Tests use role-based, text-based, and CSS locators with fallback selectors for robustness
- `.catch(() => false)` patterns handle optional UI elements that may not always appear
- The "should show error on invalid credentials" test is deliberately last in the Login suite to prevent Bell IP rate-limiting from blocking the valid-login test
- `test.slow()` is set on "should successfully log in" to triple the timeout (90 s) as a safety margin

**Configuration notes:**
- `headless: false` in `playwright.config.ts` — set to `true` for CI environments
- Tests run against both Chromium and Firefox by default; each test runs twice
- `baseURL` is `https://webmail.bell.net` — page navigations use relative paths
- Screenshots and videos are captured only on failure (`test-results/` directory)
- `dotenv` is loaded in `playwright.config.ts` so `.env` credentials are available to tests

**Known Bell Webmail behaviours:**
- The Login button has `aria-label="Login"` — use `getByRole('button', { name: 'Login' })`, not `'Log in'`
- Navbar items (Log out, Settings, Help) are `<span class="ow-navbar-label">` elements, **not** `<a>` links — use `locator('span.ow-navbar-label', { hasText: /…/i })`
- The French login button visible text is "Se connecter" but its `aria-label` stays "Login" — use `locator('button', { hasText: /se connecter/i })`, not `getByRole`
- Logout redirects to `ctvnews.ca`, not back to the Bell login page
- Bell's email list may not use `<table>` rows — use `getByRole('row').nth(1)` (skip the header row at `nth(0)`) to click the first email
- Bell may use CSS-styled (visually hidden) checkboxes — use `locator('[type="checkbox"], [role="checkbox"]')` and `.click({ force: true })` instead of `.check()`
- MFA modals can re-appear after `beforeEach` in tests that interact with the email list; call `await dismissMfaModals(page)` again at the top of those test bodies
- `beforeEach` in Inbox/Logout suites uses a 5 s timeout to detect the login button (SPA rendering can be slow after session expiry)
- Quote `.env` values containing special characters (e.g. `$`) in single quotes to prevent shell/dotenv interpolation
