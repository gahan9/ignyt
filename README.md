# Ignyt

> AI-powered physical event experience platform | Built on Google Cloud

Transform physical events with real-time audience engagement, an AI concierge,
and smart check-in — all within a **$3 GCP budget**.

## Features

| Feature | Google Cloud Service | Description |
|---------|---------------------|-------------|
| Live Engagement Wall | Firestore real-time | Reactions, polls, Q&A updating instantly across all screens |
| AI Event Concierge | Gemini 2.0 Flash | Chat with an AI that knows the schedule, speakers, and venue |
| Smart Check-in | Vision API | QR code scan with optional badge photo recognition |
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
cp .env.example .env.local      # fill in Firebase config
npm run dev
```

## Deploy

```bash
export EP_GCP_PROJECT_ID=your-project-id
bash deploy.sh
```

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
│   └── pyproject.toml
├── frontend/                React SPA
│   ├── src/
│   │   ├── components/      UI and feature components
│   │   ├── hooks/           Custom React hooks
│   │   ├── lib/             Firebase SDK, API client
│   │   └── types/           TypeScript interfaces
│   └── package.json
├── firestore.rules          Security rules for direct client writes
├── firebase.json            Firebase Hosting configuration
└── deploy.sh                One-command deploy to GCP
```

## License

MIT
