# Contributing to Ignyt

Thanks for your interest. This doc covers everything you need to open a PR
that ships cleanly through CI.

## TL;DR for new contributors

1. Fork & clone.
2. Create a branch: `git switch -c feat/your-feature`.
3. Make changes; run local tests (see below).
4. Commit with a conventional-commit-style message.
5. Push; open a PR against `main`.
6. Wait for CI (backend pytest + frontend vitest + Playwright E2E).
7. Address review comments; squash-merge when approved.

## Local setup

Follow [`README.md`'s Quick Start](./README.md#quick-start) once. For
ongoing work:

```powershell
# Backend
cd backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload --port 8080

# Frontend (separate terminal)
cd frontend
npm run dev
```

**reCAPTCHA (optional for local dev):** The backend and frontend both skip
reCAPTCHA verification when their respective keys are empty. To test the full
flow locally, set `EP_RECAPTCHA_SECRET_KEY` in `backend/.env` and
`VITE_RECAPTCHA_SITE_KEY` in `frontend/.env.local`. See
[README.md § reCAPTCHA](./README.md#recaptcha-v3-bot-protection) for details.

## Running tests before pushing

```powershell
# Backend unit + API tests
cd backend
pytest --cov=app --cov-report=term-missing

# Frontend unit + component tests
cd frontend
npm test
npm run typecheck        # tsc --noEmit
npm run test:coverage    # with v8 coverage report

# E2E (optional locally, required in CI on PRs)
npm run test:e2e
```

Full guide: [`docs/TESTING.md`](./docs/TESTING.md).

## Branch & commit conventions

- **Branch names:** `feat/<short-desc>`, `fix/<short-desc>`,
  `docs/<short-desc>`, `chore/<short-desc>`, `refactor/<short-desc>`.
- **Commit messages:** [Conventional Commits](https://www.conventionalcommits.org/)
  — e.g. `feat(checkin): batch writes for manual ID entry`,
  `fix(api): restore rich error messages in apiStreamPost`.
- **One logical change per PR.** Mixing a refactor with a feature makes
  review a nightmare and bisecting a regression harder.

## Code style

### Python (backend)

- **Python 3.11+**. We ship a constraint of `>=3.11` — Python 3.14 is not
  yet supported by some transitive deps (see the
  [`TESTING.md` troubleshooting](./docs/TESTING.md#troubleshooting)).
- **Ruff** is the formatter + linter. `ruff check app tests` must pass.
- **Type hints** on all public functions. `Any` is a yellow flag, not red,
  but justify it in review.
- **Async-first** — every route is `async def`; services/repos use
  `google-cloud-firestore`'s `AsyncClient`.

### TypeScript (frontend)

- **Strict TS** (`"strict": true` in `tsconfig.json`). Fix type errors,
  don't `any` around them.
- **Imports at top of file.** No inline `import(...)` inside functions
  except for dynamic-import legitimate cases (lazy-loaded routes).
- **Exhaustive `switch` on unions / enums.** Use a `never` assertion at
  the default branch so the compiler flags missing cases.
- **Prefer behavior-based selectors** in React Testing Library
  (`getByRole`, `getByLabelText`) over test IDs.
- No project-wide Prettier config enforced today; match surrounding
  style.

### Firestore rules

- Keep `isOrganizer()`, `isDemoEvent()`, `isOwner()` as named helpers.
  Inline predicates in rules make review harder.
- Any new collection needs both a rule **and** a test in
  `tests/rules/firestore-rules.test.ts` (Phase 7).
- If you add a composite index, update `firestore.indexes.json`. Single-
  field indexes are Firestore's default — don't declare them explicitly
  (the deploy will reject).

## Pull request checklist

Before marking ready for review:

- [ ] `pytest` passes locally (backend).
- [ ] `npm test` passes locally (frontend).
- [ ] `npm run typecheck` passes locally.
- [ ] If you touched a backend route, you regenerated the OpenAPI schema:
      `python scripts/export_openapi.py --out ../docs/openapi.json`.
- [ ] If you added / changed a React component used by a page, there's
      at least one RTL test covering the new behavior.
- [ ] If you touched `firestore.rules`, there's a rules test asserting
      the new / changed rule.
- [ ] If you added a new API route, there's a test for the happy path
      AND the 401 unauthenticated path.
- [ ] Docs updated: `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`,
      or `docs/TESTING.md` — whichever applies.
- [ ] No new TODO / FIXME without a linked issue.
- [ ] No `.env` files, API keys, reCAPTCHA secret keys, or service-account
      JSON committed.

## What requires review from a maintainer

Anything in these categories needs a maintainer approval (not just auto-merge):

1. **Security rule changes** (`firestore.rules`).
2. **New backend dependencies** (`backend/pyproject.toml`).
3. **New frontend dependencies** that are not devDependencies.
4. **CI workflow changes** (`.github/workflows/*.yml`).
5. **IAM / GCP config / Secret Manager changes** (`bootstrap.ps1`, `deploy.ps1`).
6. **Breaking API changes** — bump `/api/v1` to `/api/v2` instead.

## Reporting bugs

Open a GitHub issue with the template. Minimum viable bug report:

- What you expected.
- What actually happened.
- Steps to reproduce (link to a failing test if possible).
- Browser + OS if frontend; Python version + OS if backend.
- Screenshots / logs / stack traces where helpful.

## Proposing features

For anything non-trivial, open an issue first to align on design before
writing code. Nothing worse than writing 800 lines that get rejected for
architectural reasons that a 10-minute issue discussion would have caught.

## License

By contributing you agree your work is licensed under the MIT license of
this project (see [`README.md`](./README.md#license)).
