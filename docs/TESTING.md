# Testing Guide

This doc describes how to run, read, and extend the Ignyt test suite across
backend, frontend, and end-to-end layers.

## TL;DR

```bash
# Backend (unit + integration)
cd backend
pytest --cov=app --cov-report=term-missing

# Frontend (unit + component)
cd frontend
npm test
npm run test:coverage   # with coverage report

# E2E (Playwright)
cd frontend
npm run test:e2e        # headless
npm run test:e2e:ui     # interactive
```

CI runs all of the above on every PR via `.github/workflows/ci.yml`.

## Layers at a glance

| Layer | Framework | Location | What it tests |
|---|---|---|---|
| **Backend unit** | pytest | `backend/tests/` | Services, repos, models, CostGuard, auth helpers |
| **Backend API** | pytest + FastAPI TestClient | `backend/tests/test_*_api.py` | HTTP routes, auth dependency, status codes, error handling |
| **Frontend unit** | Vitest | `frontend/src/**/__tests__/` | Pure functions in `lib/`, type contracts, hooks |
| **Frontend component** | Vitest + React Testing Library | `frontend/src/components/**/__tests__/` | Rendering, user interaction, conditional states |
| **Frontend page** | Vitest + React Testing Library | `frontend/src/pages/**/__tests__/` | Page-level state, routing, seed flows |
| **Firestore rules** | `@firebase/rules-unit-testing` | `tests/rules/` | Security rules (`firestore.rules`) |
| **Contract drift** | pytest | `backend/tests/test_contract.py` | Frontend API calls vs backend OpenAPI schema |
| **E2E** | Playwright | `frontend/tests/e2e/` | Full user journeys against a running app |

## Backend testing

### Running

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # bash: source .venv/bin/activate
pip install -e ".[dev]"

pytest                          # run all
pytest tests/test_checkin_api.py            # one file
pytest -k "concierge"                       # by name substring
pytest --cov=app --cov-report=html          # coverage to htmlcov/
```

### Fixtures (see `backend/tests/conftest.py`)

| Fixture | Purpose |
|---|---|
| `authed_client` | `TestClient` with `get_current_user`/`get_optional_user` replaced by a fake user (`test@example.com`) and `get_firestore` overridden to a `MagicMock` |
| `unauthed_client` | `TestClient` with **no** dependency overrides — for testing 401/403 paths |
| `mock_db` | An `AsyncMock` Firestore client injected into `authed_client` |
| `fresh_cost_guard` | A fresh `CostGuard` instance when a test needs isolation from the module-global singleton |
| `_reset_cost_guard` | Autouse fixture that resets `cost_guard._gemini_count`/`_vision_count` before every test |
| `make_mock_doc(data, doc_id)` | Helper to build a `MagicMock` Firestore DocumentSnapshot |

### Writing a new API test

```python
def test_scan_requires_auth(unauthed_client):
    res = unauthed_client.post("/api/v1/checkin/scan", json={"attendee_id": "att-0001"})
    assert res.status_code == 401

def test_scan_happy_path(authed_client, mock_db):
    # Arrange: shape mock_db so the repo under test returns a valid doc
    ...
    res = authed_client.post("/api/v1/checkin/scan", json={"attendee_id": "att-0001"})
    assert res.status_code == 200
    assert res.json()["checked_in"] is True
```

### Coverage target

- **Soft target: 70% line coverage** across `app/`.
- CI emits a `::warning::` under 70%; it does not fail the build.
- Raise to a hard threshold once consistently above target.

## Frontend testing

### Running

```bash
cd frontend
npm install

npm test                         # run once (vitest run)
npm run test:watch               # interactive watch mode
npm run test:coverage            # with v8 coverage report
npm run typecheck                # tsc --noEmit
```

Coverage HTML lands in `frontend/coverage/index.html`.

### Conventions

- **Unit tests** live alongside source in `__tests__/` subdirectories
  (`src/lib/__tests__/api.test.ts`, `src/hooks/__tests__/useAuth.test.ts`, ...).
- **Component tests** use **React Testing Library** — assert on behavior,
  not implementation. Prefer `getByRole`, `getByLabelText` over test IDs.
- **Mock Firebase** at module boundaries:
  ```ts
  vi.mock("../firebase", () => ({
    auth: { currentUser: null },
    db: { /* firestore mock */ },
  }));
  ```
- **Mock `fetch`** with `vi.fn().mockResolvedValue({ ok: true, ... })`
  rather than spinning up a real server.

### Vitest config highlights (`frontend/vitest.config.ts`)

| Setting | Value |
|---|---|
| `environment` | `jsdom` |
| `setupFiles` | `./src/test/setup.ts` (registers `@testing-library/jest-dom` matchers) |
| `include` | `src/**/*.test.{ts,tsx}` |
| `exclude` | `tests/e2e/**` (Playwright owns those) |
| Coverage provider | `v8` |
| Coverage target | soft 60% lines/statements (warn-only in CI) |

### Writing a component test

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CheckIn } from "../CheckIn";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false }),
}));

describe("<CheckIn />", () => {
  it("calls the scan API with the entered id", async () => {
    const scan = vi.fn().mockResolvedValue({ checked_in: true });
    render(<CheckIn onScan={scan} />);

    await userEvent.type(screen.getByLabelText(/attendee id/i), "att-0001");
    await userEvent.click(screen.getByRole("button", { name: /check in/i }));

    expect(scan).toHaveBeenCalledWith("att-0001");
    expect(await screen.findByText(/checked in/i)).toBeInTheDocument();
  });
});
```

## Firestore rules testing

Security rules are code. They need tests. We use
`@firebase/rules-unit-testing` + the Firebase emulator.

```bash
# one-time
npm install -g firebase-tools
cd tests/rules && npm install

# run — starts the emulator, runs vitest against it, shuts down
cd <repo-root>
firebase emulators:exec --only firestore --project ignyt-rules-test "cd tests/rules && npm test"
```

Each rule test asserts that **a specific principal** is **allowed or denied**
a **specific operation** against a **specific path**. See
[`tests/rules/firestore.test.ts`](../tests/rules/firestore.test.ts) for the
full catalogue. It locks in:

- Any signed-in user can read events (but not anonymous users).
- Any signed-in user can write to `/events/demo-event/**` (the `isDemoEvent`
  whitelist).
- Only `organizer` custom-claim holders can write to non-demo events.
- Attendees can update their own attendee doc (`isOwner`), organizers can
  update anyone's.
- Reactions are write-any-signed-in; questions are insert-only for attendees
  and organizers can moderate (update/upvote).
- Photos: any signed-in user can insert; only organizers can delete.

Local setup notes live in [`tests/rules/README.md`](../tests/rules/README.md).

## Contract drift (frontend ↔ backend)

The backend test suite also runs a **contract drift** check
([`backend/tests/test_contract.py`](../backend/tests/test_contract.py)) that:

1. Materializes the live OpenAPI schema from `app.main:app`.
2. Static-greps `frontend/src/` for every `apiGet` / `apiPost` /
   `apiStreamPost` call site.
3. Fails the build if the frontend calls a path that the backend doesn't
   serve (or vice-versa), and if any non-public endpoint is missing the
   `Authorization` header requirement.

This catches the "rename a route, forget to bump the frontend" bug at PR
time rather than in production.

## End-to-end testing (Playwright)

### Running locally

```bash
cd frontend
npx playwright install --with-deps   # first time only
npm run test:e2e                     # headless
npm run test:e2e:ui                  # interactive UI mode (fantastic for debugging)
```

Playwright auto-starts the Vite dev server via its `webServer` config. For
real back-end behavior, start the FastAPI backend separately (`uvicorn
app.main:app --port 8080 --reload`).

### CI behavior

- E2E runs on **pull requests only** (not every push to main) to save CI time.
- Backend + frontend unit jobs must pass first.
- On failure, `frontend/playwright-report/` is uploaded as a build artifact.

### Scope of E2E suite

We intentionally keep E2E **narrow** — they're slow and flaky compared to
unit tests, so each one must justify its existence. Current suite:

| Flow | Why |
|---|---|
| Sign-in → seed demo → roster populates | Regression-tests the permission bug that prompted this test suite |
| Check-in via manual ID | Avoids browser-camera prompts while covering the core path |
| Concierge chat happy path | Validates SSE streaming end-to-end |

For camera-dependent flows (QR scan), we rely on component tests with a
mocked `html5-qrcode` rather than real E2E.

## Coverage targets

| Scope | Target | Enforcement |
|---|---|---|
| Backend `app/` | 70% lines | soft (CI warning) |
| Frontend `src/lib/`, `src/hooks/` | 60% lines | soft (CI warning) |
| Frontend `src/components/` | 60% lines | soft (CI warning) |
| Firestore rules | 100% of custom functions (`isOrganizer`, `isDemoEvent`, `isOwner`) | asserted by rules tests |

These are **ratchets** we intend to raise, not ceilings.

## When a test fails in CI

1. Open the CI run, expand the failing job.
2. For pytest: look at the test summary and the first traceback.
3. For vitest: look at the "FAIL" block with file + line.
4. For Playwright: download the `playwright-report` artifact and open
   `index.html` locally — trace viewer shows every network call, console
   log, and DOM snapshot.

## Anti-patterns to avoid

- ❌ **Testing implementation details.** Avoid `getByTestId` unless no
  semantic selector exists; test behavior users can observe.
- ❌ **Over-mocking.** If your test mocks 8 things to exercise 1 line of
  real code, the test mostly verifies the mocks.
- ❌ **Shared mutable fixtures.** Use `@pytest.fixture` scope correctly and
  `beforeEach` hooks in vitest — a test that depends on order is a flake
  waiting to happen.
- ❌ **Skipping CostGuard.** Tests must not bump the real daily Gemini/Vision
  counters; the autouse `_reset_cost_guard` fixture handles this — do not
  remove it.
- ❌ **Hard-coded Firestore document IDs without `make_mock_doc`.** Use the
  helper so shape changes propagate cleanly.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: firebase_admin` | Venv not activated or deps not installed | `.\.venv\Scripts\activate && pip install -e ".[dev]"` |
| `Failed to build 'pyparsing'` wheel | Python 3.14+ with no prebuilt wheel | Use Python 3.11 or 3.12 (project requires `>=3.11`; 3.14 is unsupported for transitive deps) |
| Vitest "Cannot find module 'firebase'" in test | Test forgot to `vi.mock("../firebase", ...)` | Add the mock at the top of the test file |
| Playwright "browser not found" | Browsers not installed | `npx playwright install --with-deps chromium` |
| Coverage shows `0%` for an obviously-tested file | File not in `coverage.include` glob | Check `vitest.config.ts` include list |

## Related docs

- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — system diagrams and sequence flows
- [`docs/API.md`](./API.md) — REST endpoint reference (derived from OpenAPI)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — PR checklist, branch conventions
