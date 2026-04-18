# API Reference

Full, up-to-date reference lives in **Swagger UI** when the backend is
running:

- Local dev: http://localhost:8080/docs
- Local dev (ReDoc): http://localhost:8080/redoc
- Deployed: `https://<your-cloud-run-url>/docs`

This page is the **narrative companion** — it explains design decisions the
schema can't capture (auth flow, cost controls, streaming, error semantics)
and provides copy-pasteable `curl` examples.

A committed, machine-readable copy lives at
[`docs/openapi.json`](./openapi.json) (regenerate with
`python backend/scripts/export_openapi.py --out docs/openapi.json`).

---

## Base URL

| Environment | URL |
|---|---|
| Local | `http://localhost:8080` |
| Staging | (not configured) |
| Production | `https://ignyt-api-jtpuklefxa-uc.a.run.app` |

All v1 endpoints are prefixed with `/api/v1`.

---

## Authentication

Every `/api/v1/*` endpoint requires a **Firebase ID token**.

### Flow

```
[Frontend]                                       [Backend]
  │                                                 │
  ├── firebase.auth().signIn...() ────▶ Firebase Auth
  │◀── User object                                  │
  │                                                 │
  ├── user.getIdToken() ──────────▶ Firebase        │
  │◀── ID token (JWT, 1h TTL)                       │
  │                                                 │
  ├── fetch('/api/v1/...', {                       │
  │    headers: {                                   │
  │      Authorization: `Bearer ${idToken}`   ─────▶│
  │    }                                            │
  │  })                              verify_token() ┤
  │                                  (firebase-admin)│
  │◀── 200 / 401 / ...                              │
```

### Server-side verification

`app/core/security.py` exposes two FastAPI dependencies:

| Dependency | Behavior on missing/invalid token |
|---|---|
| `get_current_user` | Raises `401 Unauthorized` |
| `get_optional_user` | Returns `None` (used for endpoints that have graceful anonymous behavior — currently none) |

### Custom claims

The `role` custom claim gates Firestore write access (see
`firestore.rules`). Set it server-side via:

```bash
python backend/scripts/grant_organizer.py \
  --project-id ignyt-39f6e \
  --email operator@example.com
```

The backend API itself does not check `role` today — enforcement is in
Firestore rules. When a future route needs organizer-only access, gate it
with a `require_role('organizer')` dependency.

---

## Endpoints

### `GET /health`

**Tag:** `health`  •  **Auth:** none

Liveness probe for Cloud Run / load balancers. Does **not** verify
downstream dependencies.

```bash
curl -s https://<api>/health
# {"status":"healthy","service":"ignyt-api"}
```

---

### `GET /api/v1/budget`

**Tag:** `budget`  •  **Auth:** none _(intentional — used by admin dashboards)_

Current daily usage vs. limits for cost-controlled services. Counters
reset at UTC midnight. When a counter reaches its limit, the dependent
endpoint returns `429 Too Many Requests`.

```bash
curl -s https://<api>/api/v1/budget
# {"gemini_used":42,"gemini_limit":1000,"vision_used":7,"vision_limit":1000}
```

---

### `POST /api/v1/checkin/scan`

**Tag:** `checkin`  •  **Auth:** required

Check in an attendee by ID. **Idempotent** — re-calling with an
already-checked-in attendee returns 200 with `message: "Already checked in"`.

```bash
curl -s -X POST https://<api>/api/v1/checkin/scan \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"demo-event","attendee_id":"att-0001"}'
# {"attendee_id":"att-0001","name":"Alice Chen","checked_in":true,"message":"Check-in successful!"}
```

**Error responses**

| Status | When |
|---|---|
| 401 | Missing/invalid `Authorization` header |
| 404 | `attendee_id` not under `events/{event_id}/attendees/` |

---

### `POST /api/v1/checkin/badge`

**Tag:** `checkin`  •  **Auth:** required

Read a badge photo with Cloud Vision OCR and attempt to match the text to
an attendee via a Firestore `name_lower` prefix query. Matches are
**auto-checked-in**.

- `image_base64` is capped at **2MB** post-encoding.
- When OCR finds text but no attendee matches, `detected_text` is still
  returned so the UI can present a manual picker.

```bash
curl -s -X POST https://<api>/api/v1/checkin/badge \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"event_id\":\"demo-event\",\"image_base64\":\"$(base64 -w0 badge.jpg)\"}"
# {"detected_text":["Alice Chen","Acme Corp"],"matched_attendee":"att-0001","confidence":0.85}
```

---

### `POST /api/v1/photos/upload-url`

**Tag:** `photos`  •  **Auth:** required

Returns a **V4 signed PUT URL** valid for 15 minutes. Client uploads the
photo **directly to GCS** — bytes never flow through this API.

```bash
curl -s -X POST https://<api>/api/v1/photos/upload-url \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"demo-event","filename":"crowd-shot-42.jpg"}'
# {"upload_url":"https://storage.googleapis.com/...","gcs_uri":"gs://.../crowd-shot-42.jpg"}
```

Then the client PUTs the image:

```bash
curl -s -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --upload-file ./crowd-shot-42.jpg
```

---

### `POST /api/v1/photos/label`

**Tag:** `photos`  •  **Auth:** required

After the signed-URL upload completes, the client posts the `gcs_uri`
here. The server runs Cloud Vision `LABEL_DETECTION` (top 8 labels) and
persists a new Firestore `photos` document.

Counts against the **daily Vision CostGuard quota** — returns `429` once
exhausted.

```bash
curl -s -X POST https://<api>/api/v1/photos/label \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"demo-event","gcs_uri":"gs://ignyt-photos/.../crowd-shot-42.jpg"}'
# {"labels":["Conference","People","Stage","Indoor"],"photo_id":"abc123XYZ"}
```

---

### `POST /api/v1/concierge/chat`

**Tag:** `concierge`  •  **Auth:** required  •  **Streaming**

Streams a Gemini 2.0 Flash response. The body content type is `text/plain`;
the response is a **single chunked HTTP response** (not SSE) — read the
stream until EOF.

Counts against the **daily Gemini CostGuard quota**.

#### Request validation

- `messages`: 1..20 items
- `messages[].role`: `"user"` or `"assistant"` (no `"system"`; that's injected server-side)
- `messages[].content`: 1..2000 chars

```bash
curl -s -N -X POST https://<api>/api/v1/concierge/chat \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"When is the keynote?"}]}'
```

The `-N` (no-buffer) flag lets you see chunks land in real time.

#### Frontend usage

See `frontend/src/lib/api.ts::apiStreamPost`:

```ts
await apiStreamPost("/api/v1/concierge/chat", { messages }, (chunk) => {
  setCurrentReply((prev) => prev + chunk);
});
```

---

## Error shape

All errors follow the FastAPI default:

```json
{ "detail": "human-readable message" }
```

| Status | Meaning | Common causes |
|---|---|---|
| 401 | Unauthorized | Missing/invalid Firebase ID token |
| 404 | Not found | Resource (e.g. attendee) doesn't exist |
| 413 | Payload too large | `image_base64` > 2MB |
| 422 | Validation failed | Pydantic rejected the request body |
| 429 | Rate limited | Daily Gemini or Vision budget exhausted |
| 502 | Bad gateway | Upstream Vision/Gemini error |

The frontend surfaces these via the `ApiError` class
(`frontend/src/lib/api.ts`), which preserves the numeric `status` and
`detail` string.

---

## CORS

The backend trusts origins listed in the `CORS_ORIGINS` env var
(comma-separated). Deployments pin this to the Firebase Hosting URL; local
dev uses the Vite dev server origin.

Allowed methods: `GET`, `POST`, `OPTIONS`.  
Allowed headers: `Authorization`, `Content-Type`.

---

## Cost guard

The `CostGuard` (`app/core/budget.py`) is a process-local module global.
Key implications:

- **Cloud Run min-instances = 0** is fine because counters reset on every
  cold start _and_ at UTC midnight; worst case a spike on a cold container
  still counts correctly per-request.
- **Cloud Run max-instances = 2**: counters are per-instance, so real
  daily usage can be up to `2 × limit`. We live with this for now — the
  raw GCP billing budget alert at $3 is the hard stop.
- **Tests use an autouse fixture** (`conftest.py::_reset_cost_guard`) to
  zero the counters between tests.

---

## Changelog / versioning

All routes are under `/api/v1`. Breaking changes will bump the prefix to
`/api/v2` and keep `/api/v1` online for at least one release cycle.

Regenerate the committed OpenAPI schema after backend route changes:

```bash
cd backend
python scripts/export_openapi.py --out ../docs/openapi.json
```

CI runs `scripts/export_openapi.py --check` to reject PRs that modify
routes without regenerating the schema.

---

## Related docs

- [`TESTING.md`](./TESTING.md) — how to test the API (incl. `authed_client` fixture)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — request flow diagrams, CostGuard, streaming
- [`../README.md`](../README.md) — quick start + deploy
