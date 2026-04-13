#!/usr/bin/env python3
"""
Reddit comment poster — headed Chrome browser automation.

Reddit does not grant API access for our use case, so this script uses
Playwright-driven headed Chrome with a saved session instead of PRAW.

Flow:
    1. Launch headed Chrome with storage state from engage-reddit-login.py
    2. Load the submission URL (auto-rewritten to old.reddit.com for stable selectors)
    3. Find the top-level comment textarea
    4. Type the comment with realistic pacing
    5. Pause — human reviews the browser, solves any bot check, then presses ENTER
    6. Click save, wait, extract the new comment permalink
    7. Print JSON result

This is a manual-assisted tool. It must run on a machine with an X display.
It is NOT safe to call from a headless worker (no DISPLAY, no human in the loop).

Requires:
- scripts/reddit-state.json (from engage-reddit-login.py)
- Google Chrome installed
- Playwright

Usage:
    # Primitive: one comment, pause-before-submit
    python3 engage-reddit-poster.py \\
        --submission-url https://www.reddit.com/r/saltwaterfishing/comments/1sk6pjr/... \\
        --text "your comment text"

    # Read comment text from stdin (JSON blob or raw)
    echo '{"text": "your comment"}' | python3 engage-reddit-poster.py \\
        --submission-url <url> --stdin

    # Dry-run — load page, don't type or submit
    python3 engage-reddit-poster.py --submission-url <url> --dry-run

    # Auto-submit without the ENTER pause (use only after you trust the selector path)
    python3 engage-reddit-poster.py --submission-url <url> --text "..." --auto-submit

Output:
    JSON to stdout:
        {"ok": true, "commentUrl": "https://old.reddit.com/...", "error": null}
        {"ok": false, "commentUrl": null, "error": "reason"}

Exit codes:
    0 — ran successfully (check "ok" for real result)
    1 — uncaught error
"""

import argparse
import json
import sys
from pathlib import Path


STATE_FILE = Path(__file__).parent / "reddit-state.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def to_old_reddit(url: str) -> str:
    """Rewrite any reddit host to old.reddit.com — old has stable selectors."""
    for host in ("www.reddit.com", "new.reddit.com", "sh.reddit.com", "reddit.com"):
        if f"//{host}/" in url:
            return url.replace(f"//{host}/", "//old.reddit.com/", 1)
    return url


def emit(ok: bool, comment_url=None, error=None):
    """Print a single JSON line to stdout, then exit."""
    print(json.dumps({
        "ok": bool(ok),
        "commentUrl": comment_url,
        "error": error,
    }))
    sys.exit(0 if ok else 1)


def resolve_text(args) -> str | None:
    if args.text:
        return args.text
    if args.stdin:
        raw = sys.stdin.read()
        if not raw.strip():
            return None
        stripped = raw.strip()
        if stripped.startswith("{"):
            try:
                data = json.loads(stripped)
                if isinstance(data, dict) and "text" in data:
                    return data["text"]
            except json.JSONDecodeError:
                pass
        return raw.rstrip("\n")
    return None


def wait_for_enter(prompt: str) -> bool:
    """Return True if user pressed ENTER, False on Ctrl+C / EOF."""
    try:
        input(prompt)
        return True
    except (EOFError, KeyboardInterrupt):
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Post a Reddit comment via headed Chrome.")
    parser.add_argument("--submission-url", required=True, help="Reddit submission URL (any host)")
    parser.add_argument("--text", help="Comment body. Use --stdin for long text or worker mode.")
    parser.add_argument("--stdin", action="store_true", help="Read comment body from stdin.")
    parser.add_argument("--auto-submit", action="store_true", help="Submit without the human ENTER pause.")
    parser.add_argument("--dry-run", action="store_true", help="Load page, don't type or submit.")
    parser.add_argument("--state", default=str(STATE_FILE), help="Playwright session state file.")
    parser.add_argument("--keep-open", action="store_true", help="Leave browser open until ENTER after success.")
    parser.add_argument("--timeout-ms", type=int, default=30000, help="Page load timeout in ms.")
    args = parser.parse_args()

    text = resolve_text(args)
    if not args.dry_run and not text:
        emit(False, error="missing_comment_text: pass --text or --stdin")
    if text and len(text) > 10_000:
        emit(False, error=f"comment_too_long: {len(text)} chars")

    state_path = Path(args.state)
    if not state_path.exists():
        emit(False, error=f"missing_session: run engage-reddit-login.py first ({state_path})")

    url = to_old_reddit(args.submission_url)

    # Status output goes to stderr so stdout stays clean JSON for callers.
    def log(msg):
        print(msg, file=sys.stderr, flush=True)

    log("")
    log(f"  Target: {url}")
    if text:
        preview = text if len(text) < 120 else text[:117] + "..."
        log(f"  Comment: {preview}")

    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        emit(False, error="playwright_not_installed: pip install playwright && playwright install chrome")

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(
                headless=False,
                channel="chrome",
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-first-run",
                ],
            )
        except Exception as e:
            emit(False, error=f"browser_launch_failed: {e}")

        try:
            ctx = browser.new_context(
                storage_state=str(state_path),
                viewport={"width": 1400, "height": 900},
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
                ),
            )
        except Exception as e:
            browser.close()
            emit(False, error=f"context_failed: {e}")

        page = ctx.new_page()

        try:
            page.goto(url, timeout=args.timeout_ms, wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
        except PWTimeout:
            browser.close()
            emit(False, error=f"goto_timeout: {url}")
        except Exception as e:
            browser.close()
            emit(False, error=f"goto_failed: {e}")

        # Sanity check the session is still valid.
        current = page.url or ""
        title = (page.title() or "").lower()
        if "/login" in current or "login" in title and "reddit" not in title:
            browser.close()
            emit(False, error="session_expired: re-run engage-reddit-login.py")

        # Detect obvious bot checkers so we can tell the human what to look for.
        html_head = page.content()[:6000].lower()
        checker_hints = []
        if "hcaptcha" in html_head:
            checker_hints.append("hCaptcha iframe present")
        if "are you a human" in html_head or "verify you are human" in html_head:
            checker_hints.append("human-verify prompt")
        if "recaptcha" in html_head:
            checker_hints.append("reCAPTCHA present")
        if checker_hints:
            log("  ⚠ possible bot check on page: " + ", ".join(checker_hints))
            log("    Solve it in the browser before pressing ENTER.")

        if args.dry_run:
            log("  ✓ Page loaded. Dry-run complete — not typing or submitting.")
            if args.keep_open:
                wait_for_enter("  Press ENTER to close browser... ")
            browser.close()
            emit(True, comment_url=None)

        # Find the top-level comment textarea on old reddit.
        textarea = None
        try:
            textarea = page.wait_for_selector('textarea[name="text"]', timeout=10000)
        except PWTimeout:
            pass

        if textarea is None:
            log("  ✗ Could not find the comment textarea.")
            log("    - Confirm old.reddit.com loaded (check browser address bar)")
            log("    - Confirm the submission is not locked or archived")
            log("    - Confirm u/thetackleroom has comment karma in this sub")
            if args.keep_open:
                wait_for_enter("  Press ENTER to close... ")
            browser.close()
            emit(False, error="textarea_not_found")

        try:
            textarea.scroll_into_view_if_needed()
            textarea.click()
            page.wait_for_timeout(400)
            textarea.fill("")
            # Realistic typing cadence so we don't look like a bot.
            textarea.type(text, delay=18)
            page.wait_for_timeout(600)
        except Exception as e:
            browser.close()
            emit(False, error=f"type_failed: {e}")

        log("")
        log("  ⚠ Comment typed. Review the browser:")
        log("    - text looks right?")
        log("    - any captcha / AI check visible? solve it now")
        log("    - any error banners?")

        if args.auto_submit:
            log("  Auto-submitting in 2s...")
            page.wait_for_timeout(2000)
        else:
            ok = wait_for_enter("  Press ENTER to submit (Ctrl+C to cancel): ")
            if not ok:
                log("  ✗ Cancelled by user.")
                browser.close()
                emit(False, error="user_cancelled")

        # Click the "save" button inside the same form as the textarea.
        # On old.reddit.com the top-level reply form is .usertext-edit and
        # the button is button.save within the sibling .usertext-buttons.
        submitted = False
        try:
            form = page.locator('form.usertext:has(textarea[name="text"])').first
            save_btn = form.locator('button.save, button[type="submit"]').first
            if save_btn.count() > 0:
                save_btn.click()
                submitted = True
        except Exception as e:
            log(f"  ! primary submit selector failed: {e}")

        if not submitted:
            # Fallback: any visible save button on the page.
            try:
                page.locator('button.save').first.click()
                submitted = True
            except Exception as e:
                browser.close()
                emit(False, error=f"submit_click_failed: {e}")

        # Wait for the form to disappear or the comment to render.
        try:
            page.wait_for_timeout(3500)
        except Exception:
            pass

        # Try to harvest the new comment permalink.
        comment_url = None
        try:
            # On old reddit the newest comment by the logged-in user has
            # .comment.new-comment or a recent timestamp. Easier: grab the
            # first .permalink link under the logged-in username's comment.
            perma = page.locator('a.bylink:has-text("permalink")').first
            if perma.count() > 0:
                href = perma.get_attribute("href")
                if href:
                    comment_url = href if href.startswith("http") else f"https://old.reddit.com{href}"
        except Exception:
            pass

        log("")
        log("  ✓ Submit clicked.")
        if comment_url:
            log(f"  Permalink: {comment_url}")
        else:
            log("  (no permalink extracted — check the browser to confirm the comment landed)")

        if args.keep_open:
            wait_for_enter("  Press ENTER to close browser... ")

        browser.close()
        emit(True, comment_url=comment_url)


if __name__ == "__main__":
    main()
