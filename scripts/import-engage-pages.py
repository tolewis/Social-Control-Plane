#!/usr/bin/env python3
"""
Bulk-load Facebook pages (or Reddit subreddits) into the SCP engage registry.

Reads a CSV and POSTs it to /engage/pages/bulk. Duplicates (matched by
fbPageId) are silently skipped by the server. Intended for expanding the
registry from ~124 seed pages toward 1000-2000 for rotation variety.

CSV schema:
    fbPageId,name,platform,category,notes

Required columns: fbPageId, name
Optional columns: platform (defaults to --platform), category (defaults
to 'community'), notes.

Usage:
    ./import-engage-pages.py pages.csv
    ./import-engage-pages.py pages.csv --platform reddit
    SCP_PASSWORD=xxx ./import-engage-pages.py pages.csv

Force IPv4 because this host has no IPv6 route (recurring gotcha — see
katya/LEARNINGS.md).
"""

import socket
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_only_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4_only_getaddrinfo

import argparse
import csv
import os
import sys
from pathlib import Path

import requests


SCP_BASE = os.environ.get("SCP_API_BASE") or "http://localhost:4001"


def parse_dotenv(path: Path) -> dict:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def get_token() -> str:
    # 1. Explicit API key via env
    key = os.environ.get("SCP_API_KEY")
    if key:
        return key
    # 2. Password env var
    pw = os.environ.get("SCP_PASSWORD")
    # 3. Fall back to ADMIN_PASSWORD in /opt/scp/.env
    if not pw:
        env = parse_dotenv(Path("/opt/scp/.env"))
        pw = env.get("ADMIN_PASSWORD")
    if not pw:
        print("ERROR: no SCP_API_KEY, SCP_PASSWORD, or /opt/scp/.env ADMIN_PASSWORD", file=sys.stderr)
        sys.exit(1)
    r = requests.post(f"{SCP_BASE}/auth/login", json={"password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv_path", help="CSV file with columns: fbPageId,name,platform,category,notes")
    ap.add_argument("--platform", default="facebook",
                    help="Default platform for rows missing the column (facebook|reddit)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Parse the CSV and print what would be sent, don't POST")
    args = ap.parse_args()

    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        print(f"ERROR: csv not found: {csv_path}", file=sys.stderr)
        return 1

    pages: list[dict] = []
    with csv_path.open() as fh:
        reader = csv.DictReader(fh)
        missing_required = [
            col for col in ("fbPageId", "name")
            if col not in (reader.fieldnames or [])
        ]
        if missing_required:
            print(f"ERROR: CSV missing required columns: {missing_required}", file=sys.stderr)
            return 1
        for row in reader:
            fb_page_id = (row.get("fbPageId") or "").strip()
            name = (row.get("name") or "").strip()
            if not fb_page_id or not name:
                print(f"  skip (missing fbPageId or name): {row}", file=sys.stderr)
                continue
            pages.append({
                "fbPageId": fb_page_id,
                "name": name,
                "platform": (row.get("platform") or args.platform).strip() or args.platform,
                "category": (row.get("category") or "community").strip() or "community",
                "notes": (row.get("notes") or "").strip() or None,
            })

    if not pages:
        print("ERROR: no valid rows in CSV", file=sys.stderr)
        return 1

    print(f"Parsed {len(pages)} page(s) from {csv_path}")

    if args.dry_run:
        for p in pages[:5]:
            print(f"  {p}")
        if len(pages) > 5:
            print(f"  ... and {len(pages) - 5} more")
        print("DRY RUN: no POST made")
        return 0

    token = get_token()
    r = requests.post(
        f"{SCP_BASE}/engage/pages/bulk",
        headers={"Authorization": f"Bearer {token}"},
        json={"pages": pages},
        timeout=120,
    )
    if r.status_code >= 400:
        print(f"ERROR: {r.status_code} {r.text[:500]}", file=sys.stderr)
        return 1
    result = r.json()
    print(f"created={result.get('created')} skipped={result.get('skipped')} total={result.get('total')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
