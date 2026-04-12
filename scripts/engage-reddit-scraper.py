#!/usr/bin/env python3
"""
Reddit post discovery scraper for TackleRoom community engagement.

Uses PRAW to monitor target subreddits, extract recent posts with real
discussion, and submit them to SCP engage API.

Requires Reddit API credentials in environment:
  REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD

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

import praw
import requests

SCP_BASE = "http://localhost:4001"

# ---------------------------------------------------------------------------
# SCP API helpers
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
    """Get enabled Reddit subreddit targets from SCP."""
    r = requests.get(f"{SCP_BASE}/engage/pages?enabled=true&platform=reddit", headers=scp_headers(token), timeout=10)
    r.raise_for_status()
    return r.json()["pages"]

def submit_post(token, page_id, post_id, post_url, post_text, author, score, num_comments):
    r = requests.post(
        f"{SCP_BASE}/engage/posts",
        headers=scp_headers(token),
        json={
            "engagePageId": page_id,
            "fbPostId": post_id,  # Reddit submission ID stored in this field
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
# Reddit scraping
# ---------------------------------------------------------------------------

def create_reddit():
    """Create PRAW Reddit instance from env credentials."""
    client_id = os.environ.get("REDDIT_CLIENT_ID", "")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET", "")
    username = os.environ.get("REDDIT_USERNAME", "")
    password = os.environ.get("REDDIT_PASSWORD", "")
    user_agent = os.environ.get("REDDIT_USER_AGENT", "scp-engage/1.0 by u/thetackleroom")

    if not all([client_id, client_secret, username, password]):
        print("ERROR: Missing Reddit credentials. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD")
        sys.exit(1)

    return praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        username=username,
        password=password,
        user_agent=user_agent,
    )

def scrape_subreddit(reddit, subreddit_name, limit=25):
    """
    Get recent posts from a subreddit.
    Returns list of {id, url, title, text, author, score, num_comments}.
    """
    posts = []
    try:
        subreddit = reddit.subreddit(subreddit_name)
        for submission in subreddit.hot(limit=limit):
            # Skip stickied posts (mod announcements)
            if submission.stickied:
                continue

            # Build post text from title + selftext
            text_parts = [submission.title]
            if submission.selftext and len(submission.selftext) > 10:
                text_parts.append(submission.selftext[:1500])

            post_text = "\n\n".join(text_parts)

            posts.append({
                "id": submission.id,
                "url": f"https://www.reddit.com{submission.permalink}",
                "title": submission.title,
                "text": post_text[:2000],
                "author": str(submission.author) if submission.author else "[deleted]",
                "score": submission.score,
                "num_comments": submission.num_comments,
                "created_utc": submission.created_utc,
            })
    except Exception as e:
        print(f"  ERROR scraping r/{subreddit_name}: {e}", file=sys.stderr)

    return posts

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Reddit for engage system")
    parser.add_argument("--limit", type=int, default=15, help="Posts per subreddit (default: 15)")
    parser.add_argument("--dry-run", action="store_true", help="Print but don't submit")
    parser.add_argument("--verbose", action="store_true", help="Show post text")
    args = parser.parse_args()

    # Get SCP targets
    token = None
    if not args.dry_run:
        token = get_scp_token()
        pages = get_reddit_pages(token)
    else:
        pages = []

    if not pages and not args.dry_run:
        print("No Reddit subreddits configured in SCP. Add them with platform='reddit'.")
        sys.exit(0)

    # Create Reddit instance
    reddit = create_reddit()
    print(f"Authenticated as: u/{reddit.user.me()}")

    # If dry-run with no SCP pages, use defaults
    if args.dry_run and not pages:
        default_subs = ["Fishing", "saltwaterfishing", "kayakfishing", "Fishing_Gear", "SurfFishing", "FloridaFishing"]
        pages = [{"id": f"dry_{s}", "fbPageId": f"r/{s}", "name": f"r/{s}"} for s in default_subs]

    total_posts = 0
    total_submitted = 0

    for pg in pages:
        # Extract subreddit name from fbPageId (stored as "r/Fishing" or just "Fishing")
        sub_name = pg["fbPageId"].replace("r/", "").strip()
        print(f"r/{sub_name}...", end=" ", flush=True)

        posts = scrape_subreddit(reddit, sub_name, limit=args.limit)
        total_posts += len(posts)

        if not posts:
            print("0 posts")
            continue

        submitted = 0
        for post in posts:
            if args.verbose:
                print(f"\n  [{post['score']}↑ {post['num_comments']}💬] {post['title'][:100]}")

            if not args.dry_run and token:
                # Use reddit submission ID as the post identifier
                ok = submit_post(
                    token, pg["id"],
                    post["id"],  # Reddit submission ID (e.g., "1a2b3c")
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

        total_submitted += submitted
        print(f"{len(posts)} posts, {submitted} submitted")

        # Brief pause between subreddits (respect rate limits)
        time.sleep(2)

    print(f"\n=== Summary ===")
    print(f"Subreddits scraped: {len(pages)}")
    print(f"Posts found: {total_posts}")
    print(f"Posts submitted: {total_submitted}")

if __name__ == "__main__":
    main()
