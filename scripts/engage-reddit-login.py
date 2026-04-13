#!/usr/bin/env python3
"""
One-off Reddit login for SCP engage posting.

Launches headed Chrome so you can log in manually as u/thetackleroom,
solve any captchas or AI checkers, and then saves the session state
(cookies + localStorage) for engage-reddit-poster.py to reuse.

Reddit does not give us an API key, so every posting action flows
through a real browser with a persisted session instead of PRAW.

Requires:
- An X display (headed Chrome window)
- Google Chrome installed
- Playwright (python3 -m playwright install chrome)

Usage:
    python3 engage-reddit-login.py
    python3 engage-reddit-login.py --state /custom/path/reddit-state.json
"""

import argparse
import sys
from pathlib import Path


STATE_FILE = Path(__file__).parent / "reddit-state.json"


def main():
    parser = argparse.ArgumentParser(description="Save a Reddit session for engage posting.")
    parser.add_argument("--state", default=str(STATE_FILE), help="Where to save session state")
    parser.add_argument(
        "--url",
        default="https://www.reddit.com/login/",
        help="Landing URL (default: reddit login page)",
    )
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: Playwright not installed. Run: pip install playwright && playwright install chrome", file=sys.stderr)
        sys.exit(1)

    state_path = Path(args.state)
    state_path.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            viewport={"width": 1400, "height": 900},
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
            ),
        )
        page = ctx.new_page()

        try:
            page.goto(args.url, timeout=30000, wait_until="domcontentloaded")
        except Exception as e:
            print(f"WARN: initial goto failed: {e}", file=sys.stderr)

        print()
        print("=" * 64)
        print("  Reddit Login — save session for engage posting")
        print("=" * 64)
        print("  1. Log in as u/thetackleroom in the browser window.")
        print("  2. Solve any captcha / email verification / AI checker.")
        print("  3. Navigate to the home feed (reddit.com) to confirm login.")
        print("  4. Come back to this terminal and press ENTER.")
        print()

        try:
            input("  Press ENTER to save session and close browser... ")
        except (EOFError, KeyboardInterrupt):
            print("\n  Cancelled. No state saved.", file=sys.stderr)
            browser.close()
            sys.exit(1)

        # Confirm we are actually logged in before saving
        try:
            page.goto("https://www.reddit.com/", timeout=15000, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            html_snippet = page.content()[:4000].lower()
            if "log in" in page.title().lower() or 'href="/login"' in html_snippet:
                print("  WARN: page still looks logged out. Saving state anyway — verify with --dry-run on the poster.")
        except Exception as e:
            print(f"  WARN: post-login check failed: {e}", file=sys.stderr)

        ctx.storage_state(path=str(state_path))
        print(f"\n  Saved session to: {state_path}")
        print(f"  Next: python3 {Path(__file__).parent}/engage-reddit-poster.py --submission-url <url> --text '...' --dry-run")
        browser.close()


if __name__ == "__main__":
    main()
