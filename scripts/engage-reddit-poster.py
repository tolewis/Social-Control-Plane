#!/usr/bin/env python3
"""
Reddit comment poster for SCP engage system.

Posts a comment to a Reddit submission using PRAW with credentials from the
environment. Designed as both a CLI tool for manual testing and a subprocess
target for the worker (handleEngageComment.ts Reddit path).

Credentials (read from env):
    REDDIT_CLIENT_ID
    REDDIT_CLIENT_SECRET
    REDDIT_USERNAME
    REDDIT_PASSWORD
    REDDIT_USER_AGENT       (optional, defaults to scp-engage/1.0 by u/thetackleroom)

Usage (CLI):
    # Post a comment
    python3 engage-reddit-poster.py --submission-id abc1234 --text "your comment"

    # Read comment text from stdin (safer for long text with special chars)
    echo "your comment text" | python3 engage-reddit-poster.py --submission-id abc1234 --stdin

    # Dry-run (validate credentials, resolve submission, but don't post)
    python3 engage-reddit-poster.py --submission-id abc1234 --text "test" --dry-run

    # Post by direct invocation from SCP worker:
    #   SCP calls this via subprocess with --stdin and pipes JSON {submission_id, text}

Output:
    Always prints a single JSON line to stdout:
        {"ok": true, "commentId": "t1_xyz", "error": null, "permalink": "/r/.../_/xyz/"}
        {"ok": false, "commentId": null, "error": "reason", "permalink": null}

Exit codes:
    0 — ran successfully (check "ok" in JSON for actual result)
    2 — argparse / input validation failure
    3 — missing credentials
"""

# Force IPv4 to avoid this machine's IPv6 "Network is unreachable" issue.
import socket
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_only_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4_only_getaddrinfo

import argparse
import json
import os
import sys


def emit(ok, comment_id=None, error=None, permalink=None):
    """Print a single JSON result line and exit 0. Never raises."""
    payload = {
        "ok": bool(ok),
        "commentId": comment_id,
        "error": error,
        "permalink": permalink,
    }
    print(json.dumps(payload))
    sys.exit(0)


def load_credentials():
    creds = {
        "client_id": os.environ.get("REDDIT_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get("REDDIT_CLIENT_SECRET", "").strip(),
        "username": os.environ.get("REDDIT_USERNAME", "").strip(),
        "password": os.environ.get("REDDIT_PASSWORD", "").strip(),
        "user_agent": os.environ.get(
            "REDDIT_USER_AGENT",
            "scp-engage/1.0 by u/thetackleroom",
        ).strip(),
    }
    missing = [k for k in ("client_id", "client_secret", "username", "password") if not creds[k]]
    return creds, missing


def resolve_text(args):
    """Return the comment text from --text or --stdin. Accepts JSON blob on stdin too."""
    if args.text:
        return args.text

    if args.stdin:
        raw = sys.stdin.read()
        if not raw.strip():
            return None

        # Worker hands us JSON: {"submission_id": "...", "text": "..."}
        # CLI users may just pipe raw text.
        stripped = raw.strip()
        if stripped.startswith("{"):
            try:
                data = json.loads(stripped)
                if isinstance(data, dict) and "text" in data:
                    if "submission_id" in data and not args.submission_id:
                        args.submission_id = data["submission_id"]
                    return data["text"]
            except json.JSONDecodeError:
                pass
        return raw.rstrip("\n")

    return None


def main():
    parser = argparse.ArgumentParser(
        description="Post a comment to a Reddit submission via PRAW.",
    )
    parser.add_argument("--submission-id", help="Reddit submission id (e.g. abc1234, no 't3_' prefix)")
    parser.add_argument("--text", help="Comment body. Use --stdin for long/sensitive content.")
    parser.add_argument("--stdin", action="store_true", help="Read comment body from stdin.")
    parser.add_argument("--dry-run", action="store_true", help="Validate + resolve submission but don't post.")
    parser.add_argument("--quiet", action="store_true", help="Suppress all stderr output.")
    args = parser.parse_args()

    text = resolve_text(args)
    if not args.submission_id:
        parser.error("--submission-id is required")
    if not text:
        parser.error("comment text required (--text or --stdin)")
    if len(text) > 10_000:
        emit(False, error=f"comment_too_long: {len(text)} chars (reddit cap ~10000)")

    creds, missing = load_credentials()
    if missing:
        if not args.quiet:
            print(f"missing reddit credentials: {', '.join(missing)}", file=sys.stderr)
        emit(False, error=f"missing_credentials: {','.join(missing)}")

    try:
        import praw  # type: ignore
        from prawcore.exceptions import (  # type: ignore
            ResponseException,
            RequestException,
            OAuthException,
            Forbidden,
            NotFound,
        )
    except ImportError as e:
        emit(False, error=f"praw_import_failed: {e}")

    try:
        reddit = praw.Reddit(
            client_id=creds["client_id"],
            client_secret=creds["client_secret"],
            username=creds["username"],
            password=creds["password"],
            user_agent=creds["user_agent"],
            check_for_async=False,
        )
        reddit.read_only = False
    except Exception as e:
        emit(False, error=f"praw_init_failed: {e}")

    try:
        submission = reddit.submission(id=args.submission_id)
        # Touching .title forces PRAW to fetch the submission so we catch 404/403
        # before the reply attempt.
        _ = submission.title
        if submission.locked:
            emit(False, error="submission_locked")
        if submission.archived:
            emit(False, error="submission_archived")
    except NotFound:
        emit(False, error="submission_not_found")
    except Forbidden:
        emit(False, error="submission_forbidden")
    except (ResponseException, RequestException) as e:
        emit(False, error=f"submission_fetch_failed: {e}")
    except Exception as e:
        emit(False, error=f"submission_fetch_failed: {e}")

    if args.dry_run:
        emit(True, comment_id=None, error=None, permalink=submission.permalink)

    try:
        comment = submission.reply(text)
        if comment is None:
            emit(False, error="reply_returned_none")
        emit(
            True,
            comment_id=comment.id,
            permalink=f"https://www.reddit.com{comment.permalink}",
        )
    except OAuthException as e:
        emit(False, error=f"oauth_failed: {e}")
    except Forbidden as e:
        emit(False, error=f"reply_forbidden: {e}")
    except (ResponseException, RequestException) as e:
        emit(False, error=f"reply_http_error: {e}")
    except Exception as e:
        emit(False, error=f"reply_failed: {e}")


if __name__ == "__main__":
    main()
