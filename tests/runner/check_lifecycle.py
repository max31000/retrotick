"""Runner lifecycle checks (runner-demo.html, Minesweeper):

1. Persistence across exit: switch to «Любитель» (intermediate), close the game,
   mount it again in the same namespace -> the board is still intermediate
   (settings written by the game while exiting are flushed before unmount).
2. Unmount right after mount (emulator still initialising): no emulator keeps
   running and the host is emptied.

  python tests/runner/check_lifecycle.py --assets M:/Projects/bliss/assets/xp-ru
Chromium runs with --mute-audio.
"""
import argparse
import os
import sys

from playwright.sync_api import sync_playwright

NS_DB = "retrotick-runner:demo:winmine.exe"


def canvas_size(page):
    return page.evaluate("() => { const c = document.querySelector('#host canvas'); return c ? [c.width, c.height] : null; }")


def start(page):
    page.evaluate("() => window.__runnerDemo.start('winmine.exe').then(() => true)")
    page.wait_for_function("() => document.querySelectorAll('#host .bliss-luna-menu-title').length > 0", timeout=20000)
    page.wait_for_timeout(1200)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assets", required=True)
    ap.add_argument("--url", default="http://127.0.0.1:5291/runner-demo.html")
    args = ap.parse_args()
    files = [os.path.join(args.assets, f) for f in ["winmine.exe", "tahoma.ttf", "micross.ttf", "trebucbd.ttf"]]
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--mute-audio"])
        try:
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto(args.url)
            page.evaluate(f"() => new Promise(r => {{ const q = indexedDB.deleteDatabase('{NS_DB}'); q.onsuccess = q.onerror = q.onblocked = () => r(true); }})")
            page.set_input_files("#files", files)

            # 1. persistence
            start(page)
            beginner = canvas_size(page)
            page.locator(".bliss-luna-menu-title").first.dispatch_event("pointerdown")
            page.locator(".bliss-luna-menu-popup .bliss-luna-menu-entry", has_text="Любитель").dispatch_event("pointerup")
            page.wait_for_timeout(150)  # well inside the 500 ms save debounce: only the unmount flush can persist it
            intermediate = canvas_size(page)
            page.locator("#host .bliss-luna-btn-close").click()
            page.wait_for_function("() => window.__runnerDemo.events.some(e => e.type === 'exit')", timeout=8000)
            start(page)  # immediately after unmount: must read what the exit wrote
            again = canvas_size(page)
            persisted = intermediate != beginner and again == intermediate
            print("beginner", beginner, "intermediate", intermediate, "after remount", again, "->", persisted)
            ok &= persisted
            page.evaluate("() => window.__runnerDemo.unmount()")

            # 2. unmount while the emulator is still initialising
            page.evaluate("() => window.__runnerDemo.start('winmine.exe').then(h => { h.unmount(); return true; })")
            page.wait_for_timeout(2500)
            state = page.evaluate("""() => ({
                running: (window.__retrotickEmus || []).filter(e => e.running).length,
                hostChildren: document.getElementById('host').children.length,
            })""")
            clean = state["running"] == 0 and state["hostChildren"] == 0
            print("after early unmount", state, "->", clean)
            ok &= clean
        finally:
            browser.close()
    print("ALL OK" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
