// Window update regions (invalid areas), following Win32 semantics:
// InvalidateRect/Rgn accumulate into the region, ValidateRect/Rgn subtract from it,
// BeginPaint takes the region (rcPaint = its bounding box) and validates it.
//
// Compatibility with code that sets `wnd.needsPaint = true` directly: while needsPaint is
// set and `updateRgn` is undefined, the whole client area is invalid.
import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { Region, type Rect } from '../../region';
import { getClientSize, getNonClientMetrics } from './_helpers';
import { WS_CHILD } from '../types';


type Tracked = WindowInfo & { _np?: boolean };

/** Turn `needsPaint` into an accessor so that legacy direct assignments
 *  (`wnd.needsPaint = true/false`) mean "whole client invalid" / "valid" and
 *  never leave a stale partial region behind. */
function track(wnd: WindowInfo): Tracked {
  const t = wnd as Tracked;
  if (Object.prototype.hasOwnProperty.call(t, '_np')) return t;
  const cur = !!t.needsPaint;
  delete t.needsPaint;
  Object.defineProperty(t, '_np', { value: cur, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(t, 'needsPaint', {
    get(this: Tracked) { return this._np; },
    set(this: Tracked, v: boolean) { this._np = !!v; this.updateRgn = undefined; },
    enumerable: true, configurable: true,
  });
  return t;
}

export function clientRect(emu: Emulator, wnd: WindowInfo): Rect {
  const isChild = !!(wnd.style & WS_CHILD);
  const { cw, ch } = getClientSize(wnd.style, !isChild && wnd.hMenu !== 0, wnd.width, wnd.height, emu.isNE);
  return { left: 0, top: 0, right: cw, bottom: ch };
}

/**
 * Offset of the client area origin in the window's DC coordinates. The main window and
 * windows with their own canvas have client-origin DCs; children and popups that share the
 * main canvas get window-origin DCs (see getWindowDC), so their client area is inset by the
 * non-client frame. Single source of truth for paint, scroll and clip coordinate mapping.
 */
export function clientOffsetInDC(emu: Emulator, hwnd: number, wnd: WindowInfo): { x: number; y: number } {
  if (hwnd === emu.mainWindow || wnd.domCanvas) return { x: 0, y: 0 };
  const isChild = !!(wnd.style & WS_CHILD);
  const { bw, captionH, menuH } = getNonClientMetrics(wnd.style, !isChild && wnd.hMenu !== 0, emu.isNE);
  return { x: bw, y: bw + captionH + menuH };
}

/** Current update region (client coordinates), or null when the window is valid. */
export function getUpdateRegion(emu: Emulator, wnd: WindowInfo): Region | null {
  if (!wnd.needsPaint) return null;
  const client = new Region([clientRect(emu, wnd)]);
  return wnd.updateRgn ? wnd.updateRgn.intersect(client) : client;
}

/** Add `rgn` (client coordinates; null = whole client area) to the update region. */
export function invalidateWindow(emu: Emulator, wnd: WindowInfo, rgn: Region | null, erase: boolean): void {
  const t = track(wnd);
  const client = new Region([clientRect(emu, wnd)]);
  const add = rgn ? rgn.intersect(client) : client;
  if (add.isEmpty()) return;
  let next: Region | undefined;
  if (!t._np) next = rgn ? add : undefined;
  else next = t.updateRgn && rgn ? t.updateRgn.union(add) : undefined;
  t._np = true;
  t.updateRgn = next;
  wnd._paintQueued = false;
  if (erase) wnd.needsErase = true;
}

/** Remove `rgn` (null = everything) from the update region. */
export function validateWindow(emu: Emulator, wnd: WindowInfo, rgn: Region | null): void {
  wnd.paintSerial = (wnd.paintSerial ?? 0) + 1;
  if (!rgn) {
    wnd._paintQueued = false;
    wnd.needsPaint = false;
    wnd.needsErase = false;
    wnd.updateRgn = undefined;
    return;
  }
  const cur = getUpdateRegion(emu, wnd);
  if (!cur) return;
  const rest = cur.subtract(rgn);
  if (rest.isEmpty()) validateWindow(emu, wnd, null);
  else track(wnd).updateRgn = rest;
}

/** Invalidate the parts of a window that intersect `screenRect` given in the coordinate
 *  space of the main canvas (used when a window drawn on the shared canvas uncovers others). */
export function invalidateCanvasArea(emu: Emulator, wnd: WindowInfo, area: Rect, origin: { x: number; y: number }): void {
  const r = Region.fromRect(area.left - origin.x, area.top - origin.y, area.right - origin.x, area.bottom - origin.y);
  invalidateWindow(emu, wnd, r, true);
}
