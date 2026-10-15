"""Playwright check of the embeddable runner (runner-demo.html).

For each XP game: mounts it, verifies the Luna frame, Cyrillic menu bar,
that a menu opens (Cyrillic items), and that the caption close button
ends in onExit. Screenshots go to --out.

Usage (dev server running: npx vite --host 127.0.0.1 --port 5291):
  python tests/runner/check_runner.py --assets M:/Projects/bliss/assets/xp-ru \
      --out M:/Projects/bliss/docs/prototype/runner [--browser chromium|firefox] [--games sol,winmine]

Audio is always muted: Chromium gets --mute-audio, Firefox media.volume_scale=0.0.
"""
import argparse
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

CYRILLIC = re.compile(r"[А-Яа-яЁё]")
GAMES = ["sol", "winmine", "freecell", "spider", "mshearts", "mspaint"]
SUPPORT = ["cards.dll", "mfc42u.dll", "mfc42loc.dll", "nddeapi.dll", "gdiplus.dll", "tahoma.ttf", "micross.ttf", "trebucbd.ttf"]


def launch(p, name):
    if name == "firefox":
        return p.firefox.launch(headless=True, firefox_user_prefs={"media.volume_scale": "0.0"})
    return p.chromium.launch(headless=True, args=["--mute-audio"])


def dismiss_dialogs(page, rounds=3):
    """Close start-up modal dialogs (Spider difficulty, Hearts name) with their default button."""
    for _ in range(rounds):
        windows = page.locator(".bliss-luna-window")
        if windows.count() < 2:
            return
        dlg = windows.nth(windows.count() - 1)
        field = dlg.locator("input, textarea")
        if field.count() > 0:
            field.first.fill("Игрок")
        btn = dlg.locator(".bliss-luna-button").first
        if btn.count() == 0:
            return
        btn.click()
        page.wait_for_timeout(700)


def check_game(page, game, out, prefix):
    result = {"game": game, "ok": False, "notes": []}
    page.evaluate("() => { window.__runnerDemo.events.length = 0; }")
    page.evaluate(f"() => window.__runnerDemo.start('{game}.exe').then(() => true)")
    main = page.locator("#host .bliss-luna-window").first
    main.wait_for(state="visible", timeout=20000)
    page.wait_for_function(
        "() => document.querySelectorAll('#host .bliss-luna-menu-title').length > 0", timeout=20000)
    page.wait_for_timeout(1500)
    title = main.locator(".bliss-luna-title").inner_text()
    menubar = [t.strip() for t in main.locator(".bliss-luna-menu-title").all_inner_texts()]
    result["title"] = title
    result["menubar"] = menubar
    page.screenshot(path=os.path.join(out, f"{prefix}{game}-01-start.png"))
    dismiss_dialogs(page)
    if not all(CYRILLIC.search(t) for t in menubar):
        result["notes"].append(f"non-Cyrillic menu bar: {menubar}")
    if not CYRILLIC.search(title):
        result["notes"].append(f"non-Cyrillic title: {title!r}")

    first = main.locator(".bliss-luna-menu-title").first
    first.dispatch_event("pointerdown")
    popup = page.locator(".bliss-luna-menu-popup").first
    popup.wait_for(state="visible", timeout=5000)
    items = [t.strip() for t in popup.locator(".bliss-luna-menu-entry").all_inner_texts()]
    result["menu"] = items
    hover = popup.locator(".bliss-luna-menu-entry").nth(0)
    hover.hover()
    page.wait_for_timeout(200)
    page.screenshot(path=os.path.join(out, f"{prefix}{game}-02-menu.png"))
    if not items or not CYRILLIC.search(" ".join(items)):
        result["notes"].append(f"menu items not Cyrillic: {items}")
    first.dispatch_event("pointerdown")  # close the menu again
    page.wait_for_timeout(200)

    # Busy games (Spider still dealing on a slow browser) may ignore an early close: retry a few times
    result["exit"] = False
    for attempt in range(3):
        main.locator(".bliss-luna-btn-close").click()
        page.wait_for_timeout(800)
        # Games may ask before closing (Spider: "Сохранить эту игру?") — answer "Нет"
        no_btn = page.locator(".bliss-luna-window .bliss-luna-button", has_text="Нет")
        if no_btn.count() > 0:
            page.screenshot(path=os.path.join(out, f"{prefix}{game}-03-close-prompt.png"))
            no_btn.first.click()
        try:
            page.wait_for_function(
                "() => window.__runnerDemo.events.some(e => e.type === 'exit')", timeout=6000)
            result["exit"] = True
            result["close_attempts"] = attempt + 1
            break
        except Exception:  # noqa: BLE001 - retry, then report
            pass
    if not result["exit"]:
        page.screenshot(path=os.path.join(out, f"{prefix}{game}-03-close-failed.png"))
        result["notes"].append("onExit not called after close")
        page.evaluate("() => window.__runnerDemo.unmount()")
    result["ok"] = result["exit"] and not result["notes"]
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assets", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--url", default="http://127.0.0.1:5291/runner-demo.html")
    ap.add_argument("--browser", default="chromium", choices=["chromium", "firefox"])
    ap.add_argument("--games", default=",".join(GAMES))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    games = [g for g in args.games.split(",") if g]
    files = [os.path.join(args.assets, f"{g}.exe") for g in games] + [os.path.join(args.assets, f) for f in SUPPORT]
    prefix = "" if args.browser == "chromium" else f"{args.browser}-"

    results = []
    errors = []
    with sync_playwright() as p:
        browser = launch(p, args.browser)
        try:
            for g in games:
                # A fresh page per game: a game that freezes the page cannot affect the next one
                page = browser.new_page(viewport={"width": 1280, "height": 900})
                # Never let a page grab the pointer (the browser runs on the owner's desktop)
                page.add_init_script("Element.prototype.requestPointerLock = function () {}; Document.prototype.exitPointerLock = function () {};")
                page.on("pageerror", lambda e, g=g: errors.append(f"{g}: {e}"))
                page.goto(args.url)
                page.set_input_files("#files", files)
                page.wait_for_function("() => window.__runnerDemo && window.__runnerDemo.files.size > 0")
                started = time.time()
                try:
                    r = check_game(page, g, args.out, prefix)
                except Exception as e:  # noqa: BLE001
                    r = {"game": g, "ok": False, "notes": [f"exception: {str(e).splitlines()[0]}"]}
                    try:
                        page.screenshot(path=os.path.join(args.out, f"{prefix}{g}-error.png"), timeout=5000)
                    except Exception:  # noqa: BLE001
                        r["notes"].append("page unresponsive")
                r["seconds"] = round(time.time() - started, 1)
                results.append(r)
                print(r, flush=True)
                page.close()
            if errors:
                print("page errors:", errors[:10])
        finally:
            browser.close()
    failed = [r["game"] for r in results if not r["ok"]]
    print("FAILED:" if failed else "ALL OK", failed if failed else "")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
