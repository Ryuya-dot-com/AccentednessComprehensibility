#!/usr/bin/env python3
"""Generate reproducible Wrangler R2 upload commands from the OSF upload plan."""

from __future__ import annotations

import argparse
import csv
import shlex
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PACKAGE_ROOT = PROJECT_ROOT / "Stimuli_OSF_Release_20260703"
DEFAULT_R2_PLAN = DEFAULT_PACKAGE_ROOT / "metadata" / "r2_upload_plan.csv"
DEFAULT_OUT = DEFAULT_PACKAGE_ROOT / "metadata" / "upload_to_r2_accentedness_production_stimuli.sh"
DEFAULT_BUCKET = "accentedness-production-stimuli"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def q(value: str) -> str:
    return shlex.quote(str(value))


def command_for_row(row: dict[str, str]) -> str:
    return " ".join(
        [
            "npx",
            "wrangler",
            "r2",
            "object",
            "put",
            f'"$BUCKET"/{q(row["r2_key"])}',
            "--file",
            q(row["local_file"]),
            "--content-type",
            q(row["content_type"]),
        ]
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--r2-plan", type=Path, default=DEFAULT_R2_PLAN)
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--stimulus-set",
        action="append",
        help="Filter by stimulus_set. Repeatable. Default includes all sets in the plan.",
    )
    parser.add_argument("--limit", type=int, default=0, help="Generate only the first N commands.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = read_csv(args.r2_plan.expanduser().resolve())
    if args.stimulus_set:
        allowed = set(args.stimulus_set)
        rows = [row for row in rows if row.get("stimulus_set") in allowed]
    if args.limit:
        rows = rows[: args.limit]

    missing = [row["local_file"] for row in rows if not Path(row["local_file"]).exists()]
    if missing:
        raise SystemExit(f"Missing local files: {missing[:5]}")

    out = args.out.expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "",
        "# Generated from metadata/r2_upload_plan.csv.",
        "# Requires `npx wrangler login` and an existing or creatable R2 bucket.",
        f"BUCKET={q(args.bucket)}",
        "",
        'echo "Checking Wrangler authentication..."',
        "npx wrangler whoami >/dev/null",
        "",
        'echo "Creating bucket if needed..."',
        'npx wrangler r2 bucket create "$BUCKET" || true',
        "",
        f'echo "Uploading {len(rows)} object(s) to $BUCKET..."',
    ]
    lines.extend(command_for_row(row) for row in rows)
    lines.extend(
        [
            "",
            'echo "R2 upload command batch finished."',
            "",
        ]
    )
    out.write_text("\n".join(lines), encoding="utf-8")
    out.chmod(0o755)
    total_bytes = sum(int(row.get("size_bytes") or 0) for row in rows)
    print(f"upload script: {out}")
    print(f"objects: {len(rows)}")
    print(f"bytes: {total_bytes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
