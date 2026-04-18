# Ignyt

> AI-powered physical event experience platform | Built on Google Cloud

Transform physical events with real-time audience engagement, an AI concierge,
and smart check-in — all within a **$3 GCP budget**.

## Features

| Feature | Google Cloud Service | Description |
|---------|---------------------|-------------|
| Live Engagement Wall | Firestore real-time | Reactions, polls, Q&A updating instantly across all screens |
| AI Event Concierge | Gemini 2.0 Flash | Chat with an AI that knows the schedule, speakers, and venue |
| Smart Check-in | Vision API + in-browser QR | Mobile camera QR scan, manual ID entry, or Vision OCR fallback |
| Admin Console | Firestore real-time | Roster with per-attendee QR codes, live stats, manual check-in |
| Photo Board | Cloud Storage + Vision API | Shared event photos with auto-generated labels |

## Architecture

```
[React SPA]  ───▶  [Cloud Run: FastAPI]  ───▶  [Gemini | Vision | GCS]
     ↕                                                ↓
[Firebase Auth]                                 [Firestore]
[Firebase Hosting]
```

Every service stays within GCP free tiers. A `CostGuard` middleware enforces
daily limits on AI and Vision API calls to guarantee the $3 cap.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Backend | Python 3.11+, FastAPI (async) |
| Database | Firestore |
| Auth | Firebase Auth |
| AI | Gemini 2.0 Flash (Google AI Studio) |
| Vision | Cloud Vision API |
| Storage | Cloud Storage |
| Hosting | Firebase Hosting + Cloud Run |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- Google Cloud SDK (`gcloud`)
- Firebase CLI (`npm i -g firebase-tools`)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Linux/Mac: source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # fill in your values
uvicorn app.main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local      # fill in Firebase config; leave VITE_API_URL blank in dev
npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:8080`, so the backend
must be running before AI concierge, check-in, and photo board calls will
succeed. If you change the backend port, update both `vite.config.ts` and the
`VITE_API_URL` env var.

### Demo walkthrough

1. Sign in (Google or email + password).
2. Open **Admin** → click **Re-seed demo** (seeds the event, 4 sessions, and
   15 attendees with `name_lower` indexes for the OCR search path).
3. On a phone, open **Check-in** → **Scan QR** → scan any attendee card from
   the Admin page. The roster flips to "checked in" live.
4. For a desktop-only demo: **Enter ID** (`att-0001`) or **Badge Photo** to
   exercise the Vision OCR fallback.

> **Why can I seed without being an organizer?**
> `firestore.rules` locks event/session/attendee writes behind the
> `organizer` custom claim, *except* for the hard-coded `demo-event` id
> (see `DEMO_EVENT_ID` in `frontend/src/lib/constants.ts`) which any
> signed-in user can write. Real events stay locked down.

### Promoting a real organizer

For any event other than the demo, grant the `organizer` custom claim to
the operator's Firebase Auth user. The claim only applies after the user
signs out and back in (or force-refreshes their ID token).

```powershell
cd backend
.venv\Scripts\activate
gcloud auth application-default login          # one-time
python scripts/grant_organizer.py `
    --project-id ignyt-39f6e `
    --email operator@example.com
```

Use `--revoke` to demote, `--dry-run` to inspect current claims without
writing. `--project-id` MUST be the Firebase project that owns Firestore
(for ignyt that's `ignyt-39f6e`, not the Cloud Run project).

## Deploy

### First time on a fresh machine (Windows)

1. **Authenticate the three CLIs** (interactive browser flows — cannot be
   scripted):

   ```powershell
   gcloud auth login
   gcloud auth application-default login --project ignyt-39f6e
   gcloud auth application-default set-quota-project ignyt-39f6e
   firebase login
   ```

2. **Sign in once** to the web app (`https://ignyt-39f6e.web.app` or your dev
   build) with the email you want to promote to `organizer`. The Firebase Auth
   user record must exist before `grant_organizer.py` can find it.

3. **Run the bootstrap**:

   ```powershell
   .\bootstrap.ps1 -OperatorEmail you@example.com -GeminiApiKey "AIza..."
   ```

   Idempotent; safe to re-run. Enables APIs on both projects, creates the
   Firestore DB (if missing), deploys `firestore.rules` + indexes, creates
   the photos bucket with CORS + 30-day lifecycle, wires cross-project IAM
   for the Cloud Run runtime SA, uploads the Gemini key to Secret Manager,
   registers a Firebase Web App, writes `frontend/.env.local`, and grants
   the `organizer` custom claim.

   Two steps cannot be automated and are printed as follow-ups:
   - Enable **Email/Password** and **Google** providers in the Firebase
     Auth console.
   - Create the **$3 billing budget** with alerts.

### Ongoing deploys

```powershell
.\deploy.ps1           # Windows
bash deploy.sh         # Linux/macOS
```

`deploy.ps1` pushes a new backend container to Cloud Run in `ignyt-493612`,
rebuilds the frontend with the correct Cloud Run URL wired in, and deploys
Firebase Hosting + Firestore rules/indexes in `ignyt-39f6e`. Assumes
`bootstrap.ps1` has already run successfully at least once.

## Budget Controls ($3 Cap)

| Control | Mechanism |
|---------|-----------|
| Cloud Run | min-instances=0, CPU-throttled, max-instances=2 |
| Gemini API | Daily request limit via CostGuard middleware |
| Vision API | Daily call limit via CostGuard middleware |
| Billing | Alerts configured at $2 and $3 in GCP Console |

## Project Structure

```
├── backend/                 Python FastAPI server
│   ├── app/
│   │   ├── api/v1/          Route handlers
│   │   ├── core/            Config, auth, budget guard
│   │   ├── models/          Pydantic schemas
│   │   ├── services/        Gemini, Vision, Storage wrappers
│   │   └── repositories/    Firestore data access
│   ├── Dockerfile
│   ├── scripts/             export_openapi.py, grant_organizer.py, etc.
│   ├── tests/               pytest suite (incl. contract drift tests)
│   └── pyproject.toml
├── frontend/                React SPA
│   ├── src/
│   │   ├── __tests__/       App-level RTL tests
│   │   ├── components/      UI and feature components (incl. QrScanner)
│   │   ├── hooks/           Custom React hooks (+ seedDemoData)
│   │   ├── lib/             Firebase SDK, API client, demo roster
│   │   ├── pages/           EventPage, Admin
│   │   └── types/           TypeScript interfaces
│   ├── tests/e2e/           Playwright smoke specs
│   └── package.json
├── tests/rules/             Firestore security-rules tests (emulator)
├── docs/
│   ├── API.md               Narrative companion to OpenAPI / Swagger UI
│   ├── ARCHITECTURE.md      System design + Mermaid sequence diagrams
│   └── TESTING.md           How to run every test tier locally
├── .github/
│   ├── ISSUE_TEMPLATE/      bug / feature request templates
│   ├── pull_request_template.md
│   └── workflows/ci.yml     Backend + frontend + rules + e2e jobs
├── CONTRIBUTING.md          Local setup, style, PR checklist
├── firestore.rules          Security rules for direct client writes
├── firebase.json            Firebase Hosting configuration
└── deploy.sh                One-command deploy to GCP
```

## Testing

Tests run in four tiers:

| Tier | Location | Command | What it covers |
|------|----------|---------|----------------|
| Backend unit | `backend/tests/` | `pytest` | FastAPI routes, services, CostGuard, contract drift |
| Frontend unit + RTL | `frontend/src/**/__tests__/` | `npm test` (vitest) | Hooks, lib utilities, all components + pages |
| Firestore rules | `tests/rules/` | `firebase emulators:exec --only firestore "npm test"` | Security rules for every collection + identity |
| E2E smoke | `frontend/tests/e2e/` | `npm run test:e2e` (Playwright) | Sign-in gate, validation, route guards |

The current state:

- **Frontend:** 165 tests across 17 files, 98.99% statement / 91.42% branch coverage
- **Backend:** pytest suite covers routes, services, models, security, budget
- **E2E:** 6 Chromium smoke tests on every PR
- **Rules:** every path in `firestore.rules` has at least one allow + deny case

See `docs/TESTING.md` for local setup and `CONTRIBUTING.md` for the PR
checklist. CI status lives under the "Actions" tab of the repo.

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/API.md`](docs/API.md) | Narrative API reference — auth, errors, budget, curl examples |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, request flows (Mermaid), security + cost controls |
| [`docs/TESTING.md`](docs/TESTING.md) | Running every test tier; writing tests; troubleshooting |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Local setup, style guides, branch/commit conventions, PR checklist |
| [`backend/scripts/export_openapi.py`](backend/scripts/export_openapi.py) | Emit the live OpenAPI schema to `openapi.json` (or `--check` for drift) |

Live Swagger UI is served by the backend at `/docs` while the server runs.

## License

MIT
