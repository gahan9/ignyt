# E2E test suite (Playwright)

Playwright drives Chromium against the dev server and is best-effort smoke:
it covers flows that don't require Firebase egress from CI.

## What we test here

1. **`smoke.spec.ts`** — app boots, auth gate renders, client-side validation
   works, and routes don't leak unauthenticated content.
2. **`checkin-manual.spec.ts`** — manual ID check-in path with the API stubbed
   via route interception (no backend required).
3. **`concierge.spec.ts`** — concierge streaming UI with a fake text/plain
   stream served via route interception.

## What we deliberately skip here

These flows are covered by **unit + RTL tests** or **manual QA**:

- Google OAuth popup
- Real camera QR scanning (`getUserMedia`)
- Vision API / Cloud Storage signed URL uploads
- Real Firestore/Auth subscriptions (covered by rules-unit-testing in Phase 7)

## Running locally

```bash
cd frontend
npm run test:e2e            # headless
npm run test:e2e:ui         # debug UI
```

The config boots a Vite dev server at :5173. Set `VITE_FIREBASE_*` in
`frontend/.env.local` first; otherwise the auth gate is still exercised but
real sign-in won't complete.

## CI

`.github/workflows/ci.yml` runs this suite on pull requests. It does **not**
block merges — failures are reported, but flaky browser timing is expected
not to gate contributors.
