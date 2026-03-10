# Bell Webmail E2E Tests

Playwright end-to-end test suite for [Bell Webmail](https://webmail.bell.net), covering authentication, inbox, contacts, and more across Chromium and Firefox.

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
| `PLAYWRIGHT_TIMEOUT` | `60000` | Per-test timeout in milliseconds |
| `PLAYWRIGHT_WORKERS` | Playwright default | Number of parallel workers — set to `1` on low-powered machines to prevent CPU spikes |
| `PLAYWRIGHT_TEST_PAUSE_MS` | `0` | Post-test cooldown pause in milliseconds — increase on low-powered laptops to prevent overheating |

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
npx playwright test tests/bell-webmail-mail.spec.ts

# Re-run auth setup for one browser (useful if session has expired)
npx playwright test --project=setup-chromium
npx playwright test --project=setup-firefox

# Run a specific test file headed with no retries (good for debugging)
npx playwright test tests/bell-webmail-mail.spec.ts --headed --retries=0
```

## Test Coverage

34 tests across 6 suites, run against both Chromium and Firefox (68 runs total):

- **Login Page** — page elements, field behaviour, language switching, valid/invalid login
- **Authentication** — valid login, invalid credentials error, logout redirect, session invalidation
- **Inbox** — navigation, folders, toolbar, email list, search, open/select emails
- **Send & Receive** — compose and send email to self, search and delete sent email
- **Contacts** — create contact, delete contact, create group with multiple contacts
- **Settings, Calendar, Tasks** — placeholder suites (in progress)

## Notes

- Tests run headless by default; use `npm run test:headed` to watch them run
- Screenshots and videos are saved to `test-results/` on failure only
- Bell uses F5 Shape Security anti-bot protection; the suite handles this automatically
- Sessions are saved per-browser to `playwright/.auth/` so login only runs once per browser at the start of each suite run
- **Rate limiting:** Bell's Shape Security blocks repeated login attempts from the same IP. If you see `"Login failed: Bell returned invalid credentials"` for correct credentials, wait 30–60 minutes before retrying. Running both browsers back-to-back (`npm test`) is more likely to trigger this than running one browser at a time
