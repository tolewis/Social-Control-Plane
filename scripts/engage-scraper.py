#!/usr/bin/env python3
"""
Facebook post discovery scraper for TackleRoom community engagement.

Scrapes mbasic.facebook.com for each target page in SCP, extracts recent posts
(text + post IDs), and submits them to the SCP engage API.

Requires: engage-fb-state.json (created by engage-fb-login.py)

Usage:
    python3 /opt/scp/scripts/engage-scraper.py [--limit N] [--category CAT] [--dry-run]

Options:
    --limit N       Only scrape first N pages (default: all)
    --category CAT  Only scrape pages in this category (media, tournament, etc.)
    --dry-run       Print discovered posts but don't submit to SCP
    --verbose       Print post text for each discovered post
"""

# Force IPv4 (this machine has no IPv6 route)
import socket
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4_only

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, parse_qs, urlparse

import requests
from playwright.sync_api import sync_playwright, Page

STATE_FILE = Path(__file__).parent / "engage-fb-state.json"
SCP_BASE = "http://localhost:4001"

# ---------------------------------------------------------------------------
# SCP API helpers
# ---------------------------------------------------------------------------

def get_scp_token():
    """Get auth token from SCP API."""
    import os
    # Try API key first
    api_key = os.environ.get("SCP_API_KEY")
    if api_key:
        return api_key

    # Fall back to password auth
    password = os.environ.get("SCP_PASSWORD", "6e92bb3321e53f9e85b23d6045a2b34f")
    r = requests.post(f"{SCP_BASE}/auth/login", json={"password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def scp_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def get_target_pages(token: str, category: str | None = None) -> list[dict]:
    """Fetch enabled target pages from SCP."""
    r = requests.get(f"{SCP_BASE}/engage/pages?enabled=true", headers=scp_headers(token), timeout=10)
    r.raise_for_status()
    pages = r.json()["pages"]
    if category:
        pages = [p for p in pages if p["category"] == category]
    return pages


def submit_post(token: str, page_id: str, fb_post_id: str, post_url: str, post_text: str) -> bool:
    """Submit a discovered post to SCP."""
    r = requests.post(
        f"{SCP_BASE}/engage/posts",
        headers=scp_headers(token),
        json={
            "engagePageId": page_id,
            "fbPostId": fb_post_id,
            "postUrl": post_url,
            "postText": post_text,
        },
        timeout=10,
    )
    return r.status_code in (200, 201)


# ---------------------------------------------------------------------------
# Facebook scraping
# ---------------------------------------------------------------------------

def extract_posts_from_page(page: Page, fb_slug: str) -> list[dict]:
    """
    Extract posts from a mbasic.facebook.com page.
    Returns list of {fb_post_id, post_url, post_text}.
    """
    posts = []

    # mbasic.facebook.com structures posts in <div> elements with story links
    # Look for links to /story.php which contain the story_fbid and page id
    story_links = page.query_selector_all("a[href*='/story.php']")

    seen_ids = set()
    for link in story_links:
        href = link.get_attribute("href") or ""
        parsed = urlparse(href)
        params = parse_qs(parsed.query)

        story_fbid = params.get("story_fbid", [None])[0]
        page_id = params.get("id", [None])[0]

        if not story_fbid or not page_id:
            continue

        fb_post_id = f"{page_id}_{story_fbid}"
        if fb_post_id in seen_ids:
            continue
        seen_ids.add(fb_post_id)

        post_url = f"https://www.facebook.com/permalink.php?story_fbid={story_fbid}&id={page_id}"

        # Try to find the post text — walk up to find the containing article/section
        # On mbasic, the post text is usually in a nearby div
        post_text = _find_post_text(link)

        if post_text and len(post_text.strip()) > 20:  # Skip very short/empty posts
            posts.append({
                "fb_post_id": fb_post_id,
                "post_url": post_url,
                "post_text": post_text.strip()[:2000],  # Cap at 2000 chars
            })

    # Also try extracting from the page's timeline section structure
    # mbasic uses various structures — try article elements too
    if not posts:
        posts = _extract_from_timeline_divs(page, fb_slug)

    return posts


def _find_post_text(link_element) -> str:
    """Walk up from a story link to find the containing post's text content."""
    # Try parent, grandparent, etc. up to 5 levels
    el = link_element
    for _ in range(6):
        parent = el.evaluate_handle("el => el.parentElement")
        if not parent:
            break
        el = parent

        text = el.inner_text()
        # A good post container has substantial text and isn't the whole page
        if 50 < len(text) < 5000:
            # Clean up — remove "Like · Comment · Share" type footers
            lines = text.split("\n")
            content_lines = []
            for line in lines:
                line_stripped = line.strip()
                # Stop at interaction buttons
                if any(kw in line_stripped.lower() for kw in ["like", "comment", "share", "· reply", "write a comment"]):
                    if len(line_stripped) < 50:  # Short line with these words = UI element
                        break
                content_lines.append(line_stripped)
            return "\n".join(content_lines).strip()

    return ""


def _extract_from_timeline_divs(page: Page, fb_slug: str) -> list[dict]:
    """
    Fallback extraction: look for post-like content blocks in the timeline.
    mbasic structures vary, so this is a best-effort fallback.
    """
    posts = []

    # Look for any links that contain the page's numeric ID in the href
    all_links = page.query_selector_all("a[href*='/permalink.php'], a[href*='/posts/']")
    seen = set()

    for link in all_links:
        href = link.get_attribute("href") or ""

        # Try /posts/POSTID format
        match = re.search(r'/posts/(\d+)', href)
        if match:
            post_id = match.group(1)
            # We need the page's numeric ID — might be in the URL
            page_id_match = re.search(r'/(\d+)/posts/', href)
            if page_id_match:
                fb_post_id = f"{page_id_match.group(1)}_{post_id}"
            else:
                fb_post_id = f"{fb_slug}_{post_id}"

            if fb_post_id in seen:
                continue
            seen.add(fb_post_id)

            post_text = _find_post_text(link)
            if post_text and len(post_text.strip()) > 20:
                posts.append({
                    "fb_post_id": fb_post_id,
                    "post_url": f"https://www.facebook.com{href}" if href.startswith("/") else href,
                    "post_text": post_text.strip()[:2000],
                })

    return posts


def scrape_page(page: Page, fb_slug: str) -> list[dict]:
    """Scrape a single Facebook page for recent posts."""
    url = f"https://mbasic.facebook.com/{fb_slug}"
    try:
        page.goto(url, timeout=20000, wait_until="domcontentloaded")
        page.wait_for_timeout(1500 + random.randint(0, 1500))  # Natural delay
    except Exception as e:
        print(f"  ERROR loading {fb_slug}: {e}", file=sys.stderr)
        return []

    # Check for login wall or error
    body_start = page.inner_text("body")[:300].lower()
    if "log in" in body_start[:100] or "you must log in" in body_start:
        print(f"  ERROR: Login wall on {fb_slug} — session expired?", file=sys.stderr)
        return []

    if "page isn't available" in body_start or "content isn't available" in body_start:
        print(f"  SKIP: {fb_slug} — page not available", file=sys.stderr)
        return []

    return extract_posts_from_page(page, fb_slug)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Facebook pages for engage system")
    parser.add_argument("--limit", type=int, default=0, help="Max pages to scrape (0=all)")
    parser.add_argument("--category", type=str, help="Only scrape this category")
    parser.add_argument("--dry-run", action="store_true", help="Don't submit to SCP")
    parser.add_argument("--verbose", action="store_true", help="Print post text")
    args = parser.parse_args()

    # Check for saved session
    if not STATE_FILE.exists():
        print(f"ERROR: {STATE_FILE} not found.")
        print("Run engage-fb-login.py first to create a Facebook session.")
        sys.exit(1)

    # Get SCP auth
    if not args.dry_run:
        try:
            token = get_scp_token()
        except Exception as e:
            print(f"ERROR: Can't auth with SCP API: {e}")
            sys.exit(1)

        pages = get_target_pages(token, args.category)
    else:
        token = None
        # Load pages from seed file for dry-run
        seed_file = Path(__file__).parent / "seed-engage-pages.json"
        with open(seed_file) as f:
            raw = json.load(f)
        pages = [{"id": f"dry_{i}", "fbPageId": p["slug"], "name": p["name"], "category": p["cat"]} for i, p in enumerate(raw)]
        if args.category:
            pages = [p for p in pages if p["category"] == args.category]

    if args.limit:
        pages = pages[:args.limit]

    print(f"Scraping {len(pages)} pages...")

    total_posts = 0
    total_submitted = 0
    total_errors = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            storage_state=str(STATE_FILE),
            user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
            viewport={"width": 412, "height": 915},
        )
        page = ctx.new_page()

        for i, target in enumerate(pages):
            slug = target["fbPageId"]
            name = target["name"]
            page_db_id = target["id"]

            print(f"[{i+1}/{len(pages)}] {name} ({slug})...", end=" ", flush=True)

            posts = scrape_page(page, slug)
            total_posts += len(posts)

            if not posts:
                print("0 posts")
                continue

            submitted = 0
            for post_data in posts:
                if args.verbose:
                    print(f"\n    Post: {post_data['post_text'][:120]}...")

                if not args.dry_run:
                    ok = submit_post(
                        token, page_db_id,
                        post_data["fb_post_id"],
                        post_data["post_url"],
                        post_data["post_text"],
                    )
                    if ok:
                        submitted += 1
                    else:
                        total_errors += 1
                else:
                    submitted += 1

            total_submitted += submitted
            print(f"{len(posts)} posts found, {submitted} submitted")

            # Polite delay between pages (5-12s, natural browsing speed)
            if i < len(pages) - 1:
                delay = 5 + random.random() * 7
                time.sleep(delay)

        browser.close()

    print(f"\n=== Summary ===")
    print(f"Pages scraped: {len(pages)}")
    print(f"Posts found: {total_posts}")
    print(f"Posts submitted: {total_submitted}")
    if total_errors:
        print(f"Errors: {total_errors}")


if __name__ == "__main__":
    main()
