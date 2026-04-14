#!/usr/bin/env python3
"""
Reddit post discovery for community engagement.

Uses Reddit's public JSON endpoints — no API key, no PRAW, no auth.
Discovers posts from target subreddits and submits to SCP engage API.

Configuration (read from environment):
    SCP_API_BASE       SCP API base URL (default: http://localhost:4001)
    REDDIT_USER_AGENT  User-Agent header sent to Reddit (required — Reddit
                       bans generic UAs). Format per Reddit API docs:
                       "app-name/version (your contact info)"

Usage:
    python3 engage-reddit-scraper.py [--limit N] [--dry-run] [--verbose]
"""

# Force IPv4
import socket
_orig = socket.getaddrinfo
def _v4(host, port, family=0, type=0, proto=0, flags=0):
    return _orig(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _v4

import argparse
import json
import os
import sys
import time

import requests

SCP_BASE = os.environ.get("SCP_API_BASE") or "http://localhost:4001"
REDDIT_UA = os.environ.get("REDDIT_USER_AGENT") or "scp-engage/1.0 (set REDDIT_USER_AGENT in .env)"

# Minimum thresholds — skip low-quality posts
MIN_SCORE = 3          # at least 3 upvotes
MIN_COMMENTS = 1       # at least 1 comment (real discussion)
MIN_TEXT_LEN = 30      # title + body at least 30 chars
MAX_AGE_HOURS = 72     # skip posts older than 3 days

# ---------------------------------------------------------------------------
# SCP API
# ---------------------------------------------------------------------------

def get_scp_token():
    key = os.environ.get("SCP_API_KEY")
    if key:
        return key
    pw = os.environ.get("SCP_PASSWORD", "6e92bb3321e53f9e85b23d6045a2b34f")
    r = requests.post(f"{SCP_BASE}/auth/login", json={"password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]

def scp_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def get_reddit_pages(token):
    r = requests.get(f"{SCP_BASE}/engage/pages?enabled=true&platform=reddit",
                     headers=scp_headers(token), timeout=10)
    r.raise_for_status()
    return r.json()["pages"]

def submit_post(token, page_id, post_id, post_url, post_text, author, score, num_comments):
    r = requests.post(
        f"{SCP_BASE}/engage/posts",
        headers=scp_headers(token),
        json={
            "engagePageId": page_id,
            "fbPostId": post_id,
            "postUrl": post_url,
            "postText": post_text,
            "authorName": author,
            "likeCount": score,
            "commentCount": num_comments,
        },
        timeout=10,
    )
    return r.status_code in (200, 201)

# ---------------------------------------------------------------------------
# Reddit public JSON
# ---------------------------------------------------------------------------

def fetch_subreddit_posts(subreddit_name, limit=25):
    """
    Fetch posts from Reddit's public JSON endpoint.
    No auth needed. Rate limit: ~30 req/min.
    """
    url = f"https://www.reddit.com/r/{subreddit_name}/hot.json"
    params = {"limit": limit, "raw_json": 1}

    try:
        r = requests.get(url, params=params,
                         headers={"User-Agent": REDDIT_UA}, timeout=15)
        if r.status_code == 429:
            print(f"  Rate limited on r/{subreddit_name}, waiting 10s...", file=sys.stderr)
            time.sleep(10)
            r = requests.get(url, params=params,
                             headers={"User-Agent": REDDIT_UA}, timeout=15)

        if r.status_code != 200:
            print(f"  HTTP {r.status_code} for r/{subreddit_name}", file=sys.stderr)
            return []

        data = r.json()
        children = data.get("data", {}).get("children", [])
    except Exception as e:
        print(f"  ERROR fetching r/{subreddit_name}: {e}", file=sys.stderr)
        return []

    now = time.time()
    posts = []

    for child in children:
        d = child.get("data", {})

        # Skip stickied, removed, locked
        if d.get("stickied") or d.get("removed_by_category") or d.get("locked"):
            continue

        # Age check
        created = d.get("created_utc", 0)
        age_hours = (now - created) / 3600
        if age_hours > MAX_AGE_HOURS:
            continue

        # Quality thresholds
        score = d.get("score", 0)
        num_comments = d.get("num_comments", 0)
        if score < MIN_SCORE and num_comments < MIN_COMMENTS:
            continue

        # Build text
        title = d.get("title", "").strip()
        selftext = d.get("selftext", "").strip()
        text_parts = [title]
        if selftext and len(selftext) > 10:
            text_parts.append(selftext[:1500])
        post_text = "\n\n".join(text_parts)

        if len(post_text) < MIN_TEXT_LEN:
            continue

        # Skip image-only brag posts (no selftext, link to i.redd.it)
        url_dest = d.get("url", "")
        is_image_only = (not selftext and
                         any(url_dest.endswith(ext) for ext in [".jpg", ".png", ".gif", ".jpeg", ".webp"]))

        posts.append({
            "id": d.get("id", ""),
            "url": f"https://www.reddit.com{d.get('permalink', '')}",
            "title": title,
            "text": post_text[:2000],
            "author": d.get("author", "[deleted]"),
            "score": score,
            "num_comments": num_comments,
            "age_hours": round(age_hours, 1),
            "is_image_only": is_image_only,
            "flair": d.get("link_flair_text", ""),
        })

    return posts

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Reddit post discovery (public JSON, no API key)")
    parser.add_argument("--limit", type=int, default=20, help="Posts per subreddit (default: 20)")
    parser.add_argument("--dry-run", action="store_true", help="Print but don't submit")
    parser.add_argument("--verbose", action="store_true", help="Show post details")
    args = parser.parse_args()

    token = None
    if not args.dry_run:
        token = get_scp_token()
        pages = get_reddit_pages(token)
        if not pages:
            print("No Reddit subreddits in SCP. Seed them first.")
            sys.exit(0)
    else:
        # Default subreddits for dry-run
        default_subs = ["Fishing", "saltwaterfishing", "kayakfishing", "Fishing_Gear",
                        "SurfFishing", "FloridaFishing"]
        pages = [{"id": f"dry_{s}", "fbPageId": f"r/{s}", "name": f"r/{s}"} for s in default_subs]

    total_posts = 0
    total_submitted = 0
    total_skipped_image = 0

    for pg in pages:
        sub_name = pg["fbPageId"].replace("r/", "").strip()
        print(f"r/{sub_name}...", end=" ", flush=True)

        posts = fetch_subreddit_posts(sub_name, limit=args.limit)

        if not posts:
            print("0 posts")
            time.sleep(3)
            continue

        submitted = 0
        skipped = 0
        for post in posts:
            if post["is_image_only"]:
                skipped += 1
                total_skipped_image += 1
                continue

            if args.verbose:
                age = f"{post['age_hours']:.0f}h"
                flair = f" [{post['flair']}]" if post['flair'] else ""
                print(f"\n  [{post['score']}↑ {post['num_comments']}💬 {age}]{flair} {post['title'][:90]}")
                if post['text'] != post['title']:
                    body_preview = post['text'][len(post['title']):].strip()[:120]
                    if body_preview:
                        print(f"    {body_preview}...")

            if not args.dry_run and token:
                ok = submit_post(
                    token, pg["id"],
                    post["id"],
                    post["url"],
                    post["text"],
                    post["author"],
                    post["score"],
                    post["num_comments"],
                )
                if ok:
                    submitted += 1
            else:
                submitted += 1

        total_posts += len(posts) - skipped
        total_submitted += submitted
        print(f"{len(posts)} found, {skipped} image-only skipped, {submitted} submitted")

        # Polite delay between subreddits — 5s minimum
        time.sleep(5)

    print(f"\n=== Summary ===")
    print(f"Subreddits: {len(pages)}")
    print(f"Posts found: {total_posts}")
    print(f"Image-only skipped: {total_skipped_image}")
    print(f"Submitted: {total_submitted}")

if __name__ == "__main__":
    main()
