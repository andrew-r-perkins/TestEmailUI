# Bell Webmail E2E Tests

Playwright end-to-end test suite for [Bell Webmail](https://webmail.bell.net), covering login, inbox, and logout across Chromium and Firefox.

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium firefox

# Copy and fill in credentials
cp .env.example .env
```

Edit `.env` with your Bell email and password.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `BELL_EMAIL` | — | Your Bell / Sympatico email address |
| `BELL_PASSWORD` | — | Your Bell email password |
| `PLAYWRIGHT_WORKERS` | Playwright default | Number of parallel workers — set to `1` on low-powered machines |
| `PLAYWRIGHT_TIMEOUT` | `30000` | Per-test timeout in milliseconds |

## Running Tests

```bash
# Run all tests (headless)
npm test

# Run with visible browser windows (useful for debugging)
npm run test:headed

# Open the interactive Playwright UI
npm run test:ui

# View the HTML report from the last run
npm run test:report
```

### Useful npx commands

```bash
# Run a single test by name
npx playwright test --grep "should successfully log in"

# Run one browser only
npx playwright test --project=chromium
npx playwright test --project=firefox

# Run a single test file
npx playwright test tests/bell-webmail.spec.ts

# Re-run auth setup for one browser (useful if session has expired)
npx playwright test --project=setup-chromium
npx playwright test --project=setup-firefox

# Run with retries disabled (useful when debugging a flaky test)
npx playwright test --retries=0

# Run a specific test file headed with no retries (good for debugging)
npx playwright test tests/bell-webmail.spec.ts --headed --retries=0
```

## Test Coverage

28 tests across 3 suites, run against both Chromium and Firefox (56 runs total):

- **Login Page** — page elements, field behaviour, language switching, valid/invalid login
- **Inbox** — navigation, folders, toolbar, email list, search, open/select emails
- **Logout** — logout button, redirect, session invalidation

## Notes

- Tests run headless by default; use `npm run test:headed` to watch them run
- Screenshots and videos are saved to `test-results/` on failure only
- Bell uses F5 Shape Security anti-bot protection; the suite handles this automatically
- Sessions are saved per-browser to `playwright/.auth/` so login only runs once per browser at the start of each suite run
