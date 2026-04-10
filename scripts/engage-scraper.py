#!/usr/bin/env python3
"""
Facebook post discovery scraper for TackleRoom community engagement.

Two-phase approach:
1. Resolve phase: Gets numeric FB page IDs via desktop facebook.com
2. Scrape phase: Reads posts from mbasic.facebook.com/{numeric_id}

Requires: engage-fb-state.json (created by engage-fb-login.py)

Usage:
    python3 engage-scraper.py [--resolve] [--scrape] [--limit N] [--category CAT] [--dry-run] [--verbose]

    --resolve    Look up numeric FB IDs for pages that don't have one yet
    --scrape     Scrape posts from pages (default action)
    --limit N    Process first N pages only
    --category   Filter by category (media, tournament, etc.)
    --dry-run    Print but don't submit to SCP
    --verbose    Show post text
"""

# Force IPv4
import socket
_orig = socket.getaddrinfo
def _v4(host, port, family=0, type=0, proto=0, flags=0):
    return _orig(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _v4

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright

STATE_FILE = Path(__file__).parent / "engage-fb-state.json"
SCP_BASE = "http://localhost:4001"

# ---------------------------------------------------------------------------
# SCP API
# ---------------------------------------------------------------------------

def get_scp_token():
    import os
    key = os.environ.get("SCP_API_KEY")
    if key:
        return key
    pw = os.environ.get("SCP_PASSWORD", "6e92bb3321e53f9e85b23d6045a2b34f")
    r = requests.post(f"{SCP_BASE}/auth/login", json={"password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]

def scp_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def get_target_pages(token, category=None):
    r = requests.get(f"{SCP_BASE}/engage/pages?enabled=true", headers=scp_headers(token), timeout=10)
    r.raise_for_status()
    pages = r.json()["pages"]
    if category:
        pages = [p for p in pages if p["category"] == category]
    return pages

def submit_post(token, page_id, fb_post_id, post_url, post_text):
    r = requests.post(
        f"{SCP_BASE}/engage/posts",
        headers=scp_headers(token),
        json={"engagePageId": page_id, "fbPostId": fb_post_id, "postUrl": post_url, "postText": post_text},
        timeout=10,
    )
    return r.status_code in (200, 201)

# ---------------------------------------------------------------------------
# Phase 1: Resolve slugs → numeric IDs
# ---------------------------------------------------------------------------

def resolve_page_id(page_ctx, slug):
    """
    Load facebook.com/{slug} in desktop mode, extract the numeric page ID
    from the page source (userID pattern).
    """
    try:
        page_ctx.goto(f"https://www.facebook.com/{slug}/", timeout=15000, wait_until="domcontentloaded")
        page_ctx.wait_for_timeout(3000)
    except Exception:
        return None

    html = page_ctx.content()

    # Look for userID which is the page's numeric ID
    m = re.search(r'"userID":"(\d+)"', html)
    if m:
        return m.group(1)

    # Fallback patterns
    for pat in [r'"pageID":"(\d+)"', r'"ownerID":"(\d+)"', r'"profileID":"(\d+)"']:
        m = re.search(pat, html)
        if m:
            return m.group(1)

    return None

# ---------------------------------------------------------------------------
# Phase 2: Scrape posts from mbasic
# ---------------------------------------------------------------------------

def scrape_posts(page_ctx, numeric_id, page_name):
    """
    Load mbasic.facebook.com/{numeric_id} and extract posts.
    Returns list of {fb_post_id, post_url, post_text}.
    """
    try:
        page_ctx.goto(f"https://mbasic.facebook.com/{numeric_id}?v=timeline", timeout=15000, wait_until="domcontentloaded")
        page_ctx.wait_for_timeout(2000 + random.randint(0, 1500))
    except Exception as e:
        print(f"  ERROR loading: {e}", file=sys.stderr)
        return []

    body_start = page_ctx.inner_text("body")[:300].lower()
    if "log in" in body_start[:100]:
        print("  ERROR: session expired", file=sys.stderr)
        return []

    html = page_ctx.content()
    posts = []
    seen = set()

    # Extract post IDs from data-video-tracking JSON (video posts)
    for m in re.finditer(r'data-video-tracking="([^"]+)"', html):
        try:
            tracking = json.loads(m.group(1).replace("&quot;", '"').replace("&amp;", "&"))
            post_id = tracking.get("top_level_post_id") or tracking.get("mf_story_key")
            owner_id = tracking.get("content_owner_id_new") or numeric_id
            if post_id and post_id not in seen:
                seen.add(post_id)
                fb_post_id = f"{owner_id}_{post_id}"
                posts.append({
                    "fb_post_id": fb_post_id,
                    "post_url": f"https://www.facebook.com/{owner_id}/posts/{post_id}",
                    "post_text": "",  # fill in below
                })
        except (json.JSONDecodeError, KeyError):
            pass

    # Extract post IDs from data-tracking JSON (non-video posts)
    for m in re.finditer(r'data-(?:tracking|ft)=[\'"]\{([^}]+)\}[\'"]', html):
        chunk = "{" + m.group(1).replace("&quot;", '"').replace("&amp;", "&") + "}"
        try:
            data = json.loads(chunk)
            post_id = data.get("top_level_post_id") or data.get("mf_story_key") or data.get("tl_objid")
            owner_id = data.get("content_owner_id_new") or numeric_id
            if post_id and post_id not in seen:
                seen.add(post_id)
                fb_post_id = f"{owner_id}_{post_id}"
                posts.append({
                    "fb_post_id": fb_post_id,
                    "post_url": f"https://www.facebook.com/{owner_id}/posts/{post_id}",
                    "post_text": "",
                })
        except (json.JSONDecodeError, KeyError):
            pass

    # Extract post text from native-text divs
    # The text appears in <div dir="auto" class="native-text ..."> elements
    text_blocks = []
    for m in re.finditer(r'<div dir="auto"[^>]*class="native-text[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL):
        inner = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        inner = inner.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
        if len(inner) > 30:  # Skip short UI elements
            text_blocks.append(inner)

    # Match text blocks to posts (they appear in order)
    for i, post in enumerate(posts):
        if i < len(text_blocks):
            post["post_text"] = text_blocks[i][:2000]

    # If we found text but no post IDs, create hash-based IDs
    if not posts and text_blocks:
        import hashlib
        for text in text_blocks:
            text_hash = hashlib.md5(text[:200].encode()).hexdigest()[:12]
            fb_post_id = f"{numeric_id}_text_{text_hash}"
            if fb_post_id not in seen:
                seen.add(fb_post_id)
                posts.append({
                    "fb_post_id": fb_post_id,
                    "post_url": f"https://www.facebook.com/{numeric_id}/",
                    "post_text": text[:2000],
                })

    # Filter out posts without meaningful text
    posts = [p for p in posts if len(p.get("post_text", "")) > 30]

    return posts

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resolve", action="store_true", help="Resolve slugs to numeric IDs")
    parser.add_argument("--scrape", action="store_true", help="Scrape posts (default)")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--category", type=str)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if not args.resolve and not args.scrape:
        args.scrape = True  # Default action

    if not STATE_FILE.exists():
        print("ERROR: Run engage-fb-login.py first")
        sys.exit(1)

    token = None
    if not args.dry_run:
        token = get_scp_token()

    pages = get_target_pages(token, args.category) if token else []
    if args.limit:
        pages = pages[:args.limit]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")

        # ---- RESOLVE PHASE ----
        if args.resolve:
            print(f"Resolving numeric IDs for {len(pages)} pages...")
            desktop_ctx = browser.new_context(
                storage_state=str(STATE_FILE),
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 900},
            )
            desktop_page = desktop_ctx.new_page()

            resolved = 0
            for i, pg in enumerate(pages):
                slug = pg["fbPageId"]
                # Skip if already numeric
                if slug.isdigit():
                    continue

                print(f"  [{i+1}/{len(pages)}] {pg['name']} ({slug})...", end=" ", flush=True)
                numeric = resolve_page_id(desktop_page, slug)

                if numeric:
                    print(f"→ {numeric}")
                    if not args.dry_run:
                        # Update the page's fbPageId to numeric
                        requests.delete(f"{SCP_BASE}/engage/pages/{pg['id']}", headers=scp_headers(token), timeout=10)
                        requests.post(f"{SCP_BASE}/engage/pages", headers=scp_headers(token), timeout=10,
                            json={"fbPageId": numeric, "name": pg["name"], "category": pg["category"], "notes": f"slug:{slug} " + (pg.get("notes") or "")})
                    resolved += 1
                else:
                    print("FAILED")

                time.sleep(2 + random.random() * 3)

            desktop_ctx.close()
            print(f"\nResolved {resolved} pages")

        # ---- SCRAPE PHASE ----
        if args.scrape:
            # Re-fetch pages (may have updated IDs from resolve phase)
            if token:
                pages = get_target_pages(token, args.category)
                if args.limit:
                    pages = pages[:args.limit]

            # Only scrape pages with numeric IDs
            numeric_pages = [pg for pg in pages if pg["fbPageId"].isdigit()]
            print(f"\nScraping {len(numeric_pages)} pages (of {len(pages)} total, {len(pages)-len(numeric_pages)} need --resolve)...")

            mobile_ctx = browser.new_context(
                storage_state=str(STATE_FILE),
                user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
                viewport={"width": 412, "height": 915},
            )
            mobile_page = mobile_ctx.new_page()

            total_posts = 0
            total_submitted = 0

            for i, pg in enumerate(numeric_pages):
                name = pg["name"]
                numeric_id = pg["fbPageId"]
                print(f"  [{i+1}/{len(numeric_pages)}] {name} ({numeric_id})...", end=" ", flush=True)

                posts = scrape_posts(mobile_page, numeric_id, name)
                total_posts += len(posts)

                if not posts:
                    print("0 posts")
                    continue

                submitted = 0
                for post in posts:
                    if args.verbose:
                        print(f"\n    {post['post_text'][:120]}...")

                    if not args.dry_run and token:
                        ok = submit_post(token, pg["id"], post["fb_post_id"], post["post_url"], post["post_text"])
                        if ok:
                            submitted += 1
                    else:
                        submitted += 1

                total_submitted += submitted
                print(f"{len(posts)} posts, {submitted} submitted")

                if i < len(numeric_pages) - 1:
                    time.sleep(5 + random.random() * 7)

            mobile_ctx.close()
            print(f"\n=== Summary ===")
            print(f"Pages scraped: {len(numeric_pages)}")
            print(f"Posts found: {total_posts}")
            print(f"Posts submitted: {total_submitted}")

        browser.close()


if __name__ == "__main__":
    main()
