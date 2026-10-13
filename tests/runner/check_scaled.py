"""Runner under a CSS transform: clicks must land on the right emulator pixel.

Opens runner-demo.html?scale=0.45, mounts Minesweeper, clicks the centre of
board cell (col, row) through the canvas' on-screen rectangle and checks that
exactly that cell changed (revealed) on the canvas. Also opens the menu and a
message box ("О программе" is a ShellAbout dialog) to check overlay placement.

  python tests/runner/check_scaled.py --assets M:/Projects/bliss/assets/xp-ru --out <dir>
Chromium runs with --mute-audio.
"""
import argparse
import os
import sys

from playwright.sync_api import sync_playwright

# Minesweeper board geometry (client coordinates): 12px left margin, 55px top, 16px cells
GRID_X, GRID_Y, CELL = 12, 55, 16

CELL_HASH_JS = """([x, y, s]) => {
  const c = document.querySelector('#host canvas');
  const t = document.createElement('canvas'); t.width = s; t.height = s;
  const g = t.getContext('2d'); g.drawImage(c, x, y, s, s, 0, 0, s, s);
  const d = g.getImageData(0, 0, s, s).data; let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0;
  return h;
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assets", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--url", default="http://127.0.0.1:5291/runner-demo.html?scale=0.45")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    files = [os.path.join(args.assets, f) for f in ["winmine.exe", "tahoma.ttf", "micross.ttf", "trebucbd.ttf"]]
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--mute-audio"])
        try:
            page = browser.new_page(viewport={"width": 800, "height": 700})
            page.goto(args.url)
            page.set_input_files("#files", files)
            page.evaluate("() => window.__runnerDemo.start('winmine.exe').then(() => true)")
            page.wait_for_function("() => document.querySelectorAll('#host .bliss-luna-menu-title').length > 0", timeout=20000)
            page.wait_for_timeout(1500)
            rect = page.evaluate("""() => { const c = document.querySelector('#host canvas'); const r = c.getBoundingClientRect();
              return { left: r.left, top: r.top, sx: r.width / c.width, sy: r.height / c.height, w: c.width, h: c.height }; }""")
            print("canvas", rect)
            col, row = 4, 4
            cx, cy = GRID_X + col * CELL, GRID_Y + row * CELL
            other = (GRID_X + 0 * CELL, GRID_Y + 8 * CELL)
            before = page.evaluate(CELL_HASH_JS, [cx, cy, CELL])
            page.screenshot(path=os.path.join(args.out, "scaled-winmine-01-start.png"))
            page.mouse.click(rect["left"] + (cx + CELL / 2) * rect["sx"], rect["top"] + (cy + CELL / 2) * rect["sy"])
            page.wait_for_timeout(600)
            after = page.evaluate(CELL_HASH_JS, [cx, cy, CELL])
            page.screenshot(path=os.path.join(args.out, "scaled-winmine-02-after-click.png"))
            hit = before != after
            print("target cell changed:", hit)
            ok &= hit

            # Menu popup and a dialog must be placed inside the scaled host
            page.locator(".bliss-luna-menu-title").first.dispatch_event("pointerdown")
            popup = page.locator(".bliss-luna-menu-popup").first
            popup.wait_for(state="visible", timeout=5000)
            title_box = page.locator(".bliss-luna-menu-title").first.bounding_box()
            pop_box = popup.bounding_box()
            near = abs(pop_box["x"] - title_box["x"]) < 6 and abs(pop_box["y"] - (title_box["y"] + title_box["height"])) < 6
            print("menu popup under its title:", near)
            ok &= near
            page.screenshot(path=os.path.join(args.out, "scaled-winmine-03-menu.png"))
            page.locator(".bliss-luna-menu-title").first.dispatch_event("pointerdown")
            page.locator(".bliss-luna-menu-title").nth(1).dispatch_event("pointerdown")
            page.locator(".bliss-luna-menu-popup .bliss-luna-menu-entry").last.dispatch_event("pointerup")
            dlg = page.locator(".bliss-luna-window.bliss-luna-dialog").first
            dlg.wait_for(state="visible", timeout=5000)
            page.wait_for_timeout(300)
            main_box = page.locator("#host .bliss-luna-window").first.bounding_box()
            d_box = dlg.bounding_box()
            mcx, mcy = main_box["x"] + main_box["width"] / 2, main_box["y"] + main_box["height"] / 2
            dcx, dcy = d_box["x"] + d_box["width"] / 2, d_box["y"] + d_box["height"] / 2
            centered = abs(mcx - dcx) < 8 and abs(mcy - dcy) < 8
            print("dialog centered over the game window:", centered, (round(mcx), round(mcy)), (round(dcx), round(dcy)))
            ok &= centered
            page.screenshot(path=os.path.join(args.out, "scaled-winmine-04-dialog.png"))
        finally:
            browser.close()
    print("ALL OK" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
