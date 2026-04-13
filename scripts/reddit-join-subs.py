#!/usr/bin/env python3
"""Join all target fishing subreddits as u/thetackleroom."""
from playwright.sync_api import sync_playwright
import time

SUBS = [
    'Fishing', 'saltwaterfishing', 'kayakfishing', 'Fishing_Gear',
    'SurfFishing', 'FloridaFishing', 'flyfishing', 'Offshore_Fishing',
    'FishingForBeginners',
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, channel='chrome', args=['--incognito'])
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = ctx.new_page()
    page.goto('https://www.reddit.com/login/', timeout=30000)
    input('\n  Log in as u/thetackleroom, then press ENTER here... ')

    for sub in SUBS:
        print(f'  r/{sub}...', end=' ', flush=True)
        page.goto(f'https://www.reddit.com/r/{sub}/', timeout=15000)
        page.wait_for_timeout(2500)
        try:
            btn = page.locator('button:has-text("Join")').first
            if btn.is_visible(timeout=3000):
                btn.click()
                page.wait_for_timeout(1500)
                print('joined')
            else:
                print('already joined')
        except:
            print('skipped')
        time.sleep(2)

    print('\n  All done.')
    input('  Press ENTER to close browser... ')
    browser.close()
