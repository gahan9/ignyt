# Firestore security-rules tests

These tests exercise every path in `firestore.rules` using the
`@firebase/rules-unit-testing` in-memory emulator.

## Running locally

```bash
# 1. Install the Firebase CLI if you haven't already
npm install -g firebase-tools

# 2. From the repo root, start the Firestore emulator
firebase emulators:start --only firestore

# 3. In another terminal, install and run
cd tests/rules
npm install
npm test
```

The emulator must be running at `localhost:8080` (the default) before tests
execute — `@firebase/rules-unit-testing` connects to it on init.

## What's covered

- Events: read/write permissions, organizer vs demo-event carve-out
- Attendees: ownership (`isOwner`), organizer override, demo bypass
- Sessions + reactions + questions: create by any signed-in user, update
  gated to organizers
- Photos: create by any signed-in user, delete restricted to organizers
- Anonymous user rejection across all paths

## CI

These tests require a Firebase CLI runtime (Java) and are run on pull
requests. See `.github/workflows/ci.yml` (job: `rules`).
