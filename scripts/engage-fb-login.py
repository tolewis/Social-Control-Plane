#!/usr/bin/env python3
"""
One-time Facebook login for the engage scraper.

Launches a VISIBLE browser window. Log into Facebook manually (handle 2FA etc).
Once logged in and you see the News Feed, press Enter in this terminal.
Session cookies are saved to engage-fb-state.json for the scraper to reuse.

Usage:
    python3 /opt/scp/scripts/engage-fb-login.py
"""

import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

STATE_FILE = Path(__file__).parent / "engage-fb-state.json"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # VISIBLE — user needs to see the login form
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
            viewport={"width": 412, "height": 915},
        )
        page = ctx.new_page()

        page.goto("https://m.facebook.com/login/", timeout=30000)
        print("\n=== Facebook Login ===")
        print("Log in to Facebook in the browser window.")
        print("Handle any 2FA prompts.")
        print("Once you see the News Feed or your profile, come back here.\n")

        input("Press ENTER when you're logged in... ")

        # Verify we're actually logged in
        page.goto("https://mbasic.facebook.com/", timeout=15000)
        page.wait_for_timeout(2000)
        body = page.inner_text("body")[:500]

        if "log in" in body.lower()[:200]:
            print("ERROR: Still seeing login page. Try again.")
            browser.close()
            sys.exit(1)

        # Save storage state (cookies + localStorage)
        ctx.storage_state(path=str(STATE_FILE))
        print(f"\nSession saved to {STATE_FILE}")
        print("The engage scraper will use this file automatically.")
        print("Re-run this script if the session expires (typically 30-90 days).\n")

        browser.close()

if __name__ == "__main__":
    main()
