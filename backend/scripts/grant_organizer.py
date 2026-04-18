r"""Grant or revoke the ``organizer`` Firebase custom claim on a user.

Why this script exists
----------------------
Our ``firestore.rules`` require ``request.auth.token.role == 'organizer'`` for
privileged writes (creating events, editing sessions, moderating Q&A). Firebase
does NOT set custom claims automatically — a freshly signed-in Google or
email/password user has an empty claims object, so every privileged write is
rejected with "Missing or insufficient permissions".

This script is the intended path for promoting a real human operator to
organizer. Run it once per operator, per Firebase project.

Typical use
-----------
    # Activate backend venv so firebase-admin is importable
    cd backend
    .venv\\Scripts\\activate          # Linux/Mac: source .venv/bin/activate

    # Make sure you're authenticated to the project that owns Firebase Auth.
    # For ignyt, Firestore + Auth live in the FRONTEND project (ignyt-39f6e),
    # NOT the Cloud Run backend project.
    gcloud auth application-default login

    # Promote by email (most common):
    python scripts/grant_organizer.py \\
        --project-id ignyt-39f6e --email me@example.com

    # Or by uid (if you already know it):
    python scripts/grant_organizer.py \\
        --project-id ignyt-39f6e --uid abc123xyz

    # Demote:
    python scripts/grant_organizer.py \\
        --project-id ignyt-39f6e --email me@example.com --revoke

    # List current claims without writing:
    python scripts/grant_organizer.py \\
        --project-id ignyt-39f6e --email me@example.com --dry-run

Important: Firebase ID tokens are cached for up to an hour. After this script
succeeds the target user must EITHER sign out and back in, OR call
``user.getIdToken(true)`` in the client, before the new claim reaches
Firestore rules.

Credentials
-----------
Uses Application Default Credentials (ADC). Acquire them with either:

* ``gcloud auth application-default login`` — recommended for local use.
* ``GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`` — required
  for CI/automation. The service account must have the
  ``roles/firebase.admin`` or at minimum ``roles/firebaseauth.admin`` role.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials

ORGANIZER_ROLE = "organizer"


def _resolve_user(email: str | None, uid: str | None) -> auth.UserRecord:
    """Look up the target user by uid (preferred) or email.

    We prefer uid lookups because an email can be reassigned between accounts
    whereas a uid is immutable. Email is offered for ergonomics.
    """
    if uid:
        try:
            return auth.get_user(uid)
        except auth.UserNotFoundError as exc:
            raise SystemExit(f"[err] no Firebase Auth user with uid={uid!r}") from exc

    if not email:
        raise SystemExit("[err] must supply either --uid or --email")

    try:
        return auth.get_user_by_email(email)
    except auth.UserNotFoundError as exc:
        raise SystemExit(
            f"[err] no Firebase Auth user with email={email!r}. "
            "Sign in with that address in the web app at least once, then retry."
        ) from exc


def _compute_next_claims(existing: dict[str, Any], *, revoke: bool) -> dict[str, Any]:
    """Return the merged claims payload we should persist.

    We merge instead of overwriting so callers can't accidentally wipe
    unrelated claims that the product may rely on later (e.g. ``tenantId``).
    """
    merged = dict(existing)
    if revoke:
        merged.pop("role", None)
    else:
        merged["role"] = ORGANIZER_ROLE
    return merged


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint: parse args, resolve the user, write the merged claims."""
    parser = argparse.ArgumentParser(
        description="Grant/revoke the 'organizer' custom claim on a Firebase user.",
    )
    parser.add_argument(
        "--project-id",
        required=True,
        help="Firebase project id (the one hosting Firebase Auth / Firestore). "
        "For ignyt this is typically 'ignyt-39f6e'.",
    )
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--email", help="Sign-in email of the target user.")
    target.add_argument("--uid", help="Firebase UID of the target user.")
    parser.add_argument(
        "--revoke",
        action="store_true",
        help="Remove the organizer claim instead of granting it.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve the user and print current claims, but don't write.",
    )
    args = parser.parse_args(argv)

    firebase_admin.initialize_app(
        credentials.ApplicationDefault(),
        {"projectId": args.project_id},
    )

    user = _resolve_user(args.email, args.uid)
    current = dict(user.custom_claims or {})
    print(f"[info] target: uid={user.uid} email={user.email}")
    print(f"[info] current claims: {current or '{} (empty)'}")

    next_claims = _compute_next_claims(current, revoke=args.revoke)
    if next_claims == current:
        print("[noop] no change required — claims already match desired state.")
        return 0

    if args.dry_run:
        print(f"[dry-run] would write claims: {next_claims}")
        return 0

    auth.set_custom_user_claims(user.uid, next_claims)
    verb = "revoked" if args.revoke else "granted"
    print(f"[ok] {verb} '{ORGANIZER_ROLE}' on uid={user.uid}")
    print(
        "[next] the target user must sign out and back in (or call "
        "user.getIdToken(true) in the client) for the new claim to reach "
        "Firestore rules."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
