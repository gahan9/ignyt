"""Export the FastAPI OpenAPI schema to a JSON file.

Used by:
- CI contract-drift tests (compares generated schema to committed copy).
- Docs generation (the shipped openapi.json feeds docs/API.md & Swagger UI).

Usage
-----
    python scripts/export_openapi.py                     # -> openapi.json
    python scripts/export_openapi.py --out ../docs/openapi.json
    python scripts/export_openapi.py --check             # fail if drift
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.main import app


def build_schema() -> dict:
    """Materialize the OpenAPI schema from the live FastAPI app."""
    return app.openapi()


def load_existing(path: Path) -> dict | None:
    """Load a previously-exported schema from disk, or ``None`` if absent."""
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    """CLI entrypoint: write or drift-check the exported OpenAPI schema."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("openapi.json"),
        help="Output path (default: openapi.json in CWD).",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "Drift mode: compare the generated schema against --out and "
            "exit non-zero if they differ. Does not write anything."
        ),
    )
    args = parser.parse_args()

    schema = build_schema()
    rendered = json.dumps(schema, indent=2, sort_keys=True) + "\n"

    if args.check:
        existing = load_existing(args.out)
        if existing is None:
            sys.stderr.write(
                f"[export_openapi] --check target missing: {args.out}\n"
                "Run without --check to generate it.\n"
            )
            return 1
        existing_rendered = json.dumps(existing, indent=2, sort_keys=True) + "\n"
        if existing_rendered != rendered:
            sys.stderr.write(
                "[export_openapi] OpenAPI schema drift detected.\n"
                f"  {args.out} is out of sync with app.main:app.openapi().\n"
                "  Regenerate with: python scripts/export_openapi.py --out "
                f"{args.out}\n"
            )
            return 2
        print(f"[export_openapi] OK: {args.out} matches live schema.")
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding="utf-8")
    print(f"[export_openapi] Wrote {args.out} ({len(schema.get('paths', {}))} paths)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
