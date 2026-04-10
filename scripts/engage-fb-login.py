#!/usr/bin/env python3
"""
One-time Facebook login for the engage scraper.

Opens a Chrome window to Facebook. Log in, handle 2FA, then press Enter here.
Cookies saved to engage-fb-state.json — scraper reuses them for 30-90 days.

Usage:
    python3 /opt/scp/scripts/engage-fb-login.py
"""

import sys
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

STATE_FILE = Path(__file__).parent / "engage-fb-state.json"

def main():
    with sync_playwright() as p:
        # Use installed Chrome (not Chromium) — looks normal, has Tim's font/rendering
        browser = p.chromium.launch(
            headless=False,
            channel="chrome",
            args=["--no-first-run", "--no-default-browser-check"],
        )
        ctx = browser.new_context(
            viewport={"width": 420, "height": 920},
            user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
        )
        page = ctx.new_page()
        page.goto("https://m.facebook.com/login/", timeout=30000)

        print("\n  Log into Facebook in the browser window.")
        print("  Handle 2FA if prompted.")
        print("  Once you see the feed, come back here.\n")
        input("  Press ENTER when done... ")

        # Verify login worked
        page.goto("https://mbasic.facebook.com/", timeout=15000)
        page.wait_for_timeout(2000)
        body = page.inner_text("body")[:300].lower()

        if "log in" in body[:150]:
            print("\n  Still seeing login page. Try again.")
            browser.close()
            sys.exit(1)

        # Save cookies
        ctx.storage_state(path=str(STATE_FILE))
        print(f"\n  Session saved to {STATE_FILE}")
        print("  Good for 30-90 days. Re-run if it expires.\n")
        browser.close()


if __name__ == "__main__":
    main()
