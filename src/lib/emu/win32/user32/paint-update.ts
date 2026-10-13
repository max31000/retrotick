// USER32 painting entry points built on window update regions:
// BeginPaint/EndPaint, InvalidateRect/Rgn, ValidateRect/Rgn, GetUpdateRect/Rgn,
// UpdateWindow, RedrawWindow, ScrollWindow/ScrollWindowEx/ScrollDC.
import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { WM_PAINT, SIZEOF_PAINTSTRUCT } from '../types';
import { Region, type Rect } from '../../region';
import { getUpdateRegion, invalidateWindow, validateWindow, clientRect } from './update-region';
import { getRegion, setRegion, readRect, writeRect } from '../gdi32/region';
import { pushVisClip, popVisClip } from '../gdi32/dc-clip';
import { sendEraseBackground, toDCCoords } from '../../emu-paint';
import { dcGetImageData, dcPutImageData } from '../../emu-window';
import {
  RGN_ERROR, NULLREGION, RDW_INVALIDATE, RDW_ERASE, RDW_VALIDATE, RDW_NOERASE, RDW_ALLCHILDREN,
  RDW_NOCHILDREN, RDW_UPDATENOW, RDW_ERASENOW, RDW_INTERNALPAINT, SW_SCROLLCHILDREN, SW_INVALIDATE, SW_ERASE,
} from '../constants-ctl';

const WS_CHILD = 0x40000000;
const WS_CLIPCHILDREN = 0x02000000;

/** Send WM_PAINT now if the window has an update region; validates windows whose
 *  handler does not (avoids WM_PAINT storms, like DefWindowProc would). */
export function updateWindowNow(emu: Emulator, hwnd: number): void {
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  if (!wnd || !wnd.needsPaint || !wnd.wndProc) return;
  const serial = wnd.paintSerial ?? 0;
  const r = emu.callWndProc(wnd.wndProc, hwnd, WM_PAINT, 0, 0);
  if (r !== undefined && (wnd.paintSerial ?? 0) === serial && wnd.needsPaint) validateWindow(emu, wnd, null);
}

/** WM_ERASEBKGND now for a pending erase, DC clipped to the update region. */
function eraseNow(emu: Emulator, hwnd: number, wnd: WindowInfo): void {
  const rgn = getUpdateRegion(emu, wnd);
  if (!rgn || !wnd.needsErase) return;
  wnd.needsErase = false;
  const hdc = emu.getWindowDC(hwnd);
  const dc = emu.getDC(hdc);
  if (dc) pushVisClip(dc, toDCCoords(emu, hwnd, wnd, rgn));
  sendEraseBackground(emu, hwnd, wnd, hdc);
  if (dc) popVisClip(dc);
  emu.releaseChildDC(hdc);
}

function topLevelWindows(emu: Emulator): [number, WindowInfo][] {
  return (emu.handles.findByType('window') as [number, WindowInfo][])
    .filter(([, w]) => w && w.visible && !(w.style & WS_CHILD));
}

function childrenOf(emu: Emulator, wnd: WindowInfo): [number, WindowInfo][] {
  const out: [number, WindowInfo][] = [];
  for (const h of wnd.childList ?? []) {
    const c = emu.handles.get<WindowInfo>(h);
    if (c && c.visible) out.push([h, c]);
  }
  return out;
}

/** Invalidate/validate `wnd` and (optionally) its children; `rgn` in wnd client coords. */
function redraw(emu: Emulator, hwnd: number, wnd: WindowInfo, rgn: Region | null, flags: number, depth = 0): void {
  if (flags & RDW_INVALIDATE) invalidateWindow(emu, wnd, rgn, !!(flags & RDW_ERASE));
  if (flags & RDW_INTERNALPAINT && !wnd.needsPaint) invalidateWindow(emu, wnd, null, false);
  if (flags & RDW_VALIDATE) validateWindow(emu, wnd, rgn);
  if (flags & RDW_NOERASE) wnd.needsErase = false;
  const recurse = (flags & RDW_ALLCHILDREN) || (!(flags & RDW_NOCHILDREN) && !(wnd.style & WS_CLIPCHILDREN));
  if (recurse && depth < 32) {
    for (const [ch, c] of childrenOf(emu, wnd)) {
      let crgn: Region | null = null;
      if (rgn) {
        crgn = rgn.intersect(Region.fromRect(c.x, c.y, c.x + c.width, c.y + c.height));
        if (crgn.isEmpty()) continue;
        crgn.offset(-c.x, -c.y);
      }
      redraw(emu, ch, c, crgn, flags, depth + 1);
    }
  }
  if (flags & RDW_ERASENOW) eraseNow(emu, hwnd, wnd);
  if (flags & RDW_UPDATENOW) updateWindowNow(emu, hwnd);
}

/** Copy pixels of `area` by (dx,dy) on a DC, limited to `clip`. Returns the exposed region. */
function scrollPixels(emu: Emulator, hdc: number, area: Rect, clip: Rect, dx: number, dy: number): Region {
  const dc = emu.getDC(hdc);
  const src = new Region([area]).intersect(new Region([clip]));
  const moved = src.clone(); moved.offset(dx, dy);
  const dest = moved.intersect(new Region([clip]));
  if (dc && !src.isEmpty()) {
    const b = area;
    const w = b.right - b.left, h = b.bottom - b.top;
    if (w > 0 && h > 0) {
      try {
        const img = dcGetImageData(dc, b.left, b.top, w, h);
        dc.ctx.save();
        dc.ctx.beginPath();
        for (const r of dest.rects) dc.ctx.rect(r.left, r.top, r.right - r.left, r.bottom - r.top);
        dc.ctx.clip();
        dcPutImageData(dc, img, b.left + dx, b.top + dy);
        dc.ctx.restore();
        emu.syncDCToCanvas(hdc);
      } catch { /* mock canvases in headless tests */ }
    }
  }
  return src.union(dest).subtract(dest);
}

export function registerPaintUpdate(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');
  const wndOf = (h: number) => emu.handles.get<WindowInfo>(h);

  user32.register('BeginPaint', 2, () => {
    const hwnd = emu.readArg(0);
    const ps = emu.readArg(1);
    const hdc = emu.beginPaint(hwnd);
    const wnd = wndOf(hwnd);
    if (ps) {
      emu.memory.writeU32(ps, hdc);
      emu.memory.writeU32(ps + 4, wnd?.paintFErase ? 1 : 0);
      writeRect(emu, ps + 8, wnd?.paintRect ?? { left: 0, top: 0, right: 0, bottom: 0 });
      for (let i = 24; i < SIZEOF_PAINTSTRUCT; i++) emu.memory.writeU8(ps + i, 0);
    }
    return hdc;
  });

  user32.register('EndPaint', 2, () => {
    emu.endPaint(emu.readArg(0), 0);
    return 1;
  });

  // InvalidateRect(hWnd, lpRect, bErase); hWnd NULL = all windows
  user32.register('InvalidateRect', 3, () => {
    const hwnd = emu.readArg(0), p = emu.readArg(1), erase = !!emu.readArg(2);
    const rgn = p ? new Region([readRect(emu, p)]) : null;
    if (!hwnd) {
      for (const [, w] of topLevelWindows(emu)) invalidateWindow(emu, w, null, true);
      return 1;
    }
    const wnd = wndOf(hwnd);
    if (!wnd) return 0;
    invalidateWindow(emu, wnd, rgn, erase);
    return 1;
  });

  user32.register('InvalidateRgn', 3, () => {
    const hwnd = emu.readArg(0), h = emu.readArg(1), erase = !!emu.readArg(2);
    const wnd = wndOf(hwnd);
    if (!wnd) return 0;
    invalidateWindow(emu, wnd, h ? getRegion(emu, h) : null, erase);
    return 1;
  });

  user32.register('ValidateRect', 2, () => {
    const hwnd = emu.readArg(0), p = emu.readArg(1);
    if (!hwnd) return 1;
    const wnd = wndOf(hwnd);
    if (!wnd) return 0;
    validateWindow(emu, wnd, p ? new Region([readRect(emu, p)]) : null);
    return 1;
  });

  user32.register('ValidateRgn', 2, () => {
    const wnd = wndOf(emu.readArg(0));
    if (!wnd) return 0;
    const h = emu.readArg(1);
    validateWindow(emu, wnd, h ? getRegion(emu, h) : null);
    return 1;
  });

  // GetUpdateRect(hWnd, lpRect, bErase) → nonzero if the update region is not empty
  user32.register('GetUpdateRect', 3, () => {
    const hwnd = emu.readArg(0), p = emu.readArg(1), erase = emu.readArg(2);
    const wnd = wndOf(hwnd);
    const rgn = wnd ? getUpdateRegion(emu, wnd) : null;
    if (p) writeRect(emu, p, rgn ? rgn.bounds() : { left: 0, top: 0, right: 0, bottom: 0 });
    if (!wnd || !rgn) return 0;
    if (erase) eraseNow(emu, hwnd, wnd);
    return 1;
  });

  // GetUpdateRgn(hWnd, hRgn, bErase) → region type
  user32.register('GetUpdateRgn', 3, () => {
    const hwnd = emu.readArg(0), h = emu.readArg(1), erase = emu.readArg(2);
    const wnd = wndOf(hwnd);
    if (!wnd) return RGN_ERROR;
    const rgn = getUpdateRegion(emu, wnd) ?? new Region();
    if (!setRegion(emu, h, rgn.clone())) return RGN_ERROR;
    if (erase && !rgn.isEmpty()) eraseNow(emu, hwnd, wnd);
    return rgn.isEmpty() ? NULLREGION : rgn.complexity();
  });

  user32.register('UpdateWindow', 1, () => {
    const hwnd = emu.readArg(0);
    if (!wndOf(hwnd)) return 0;
    updateWindowNow(emu, hwnd);
    return 1;
  });

  // RedrawWindow(hWnd, lprcUpdate, hrgnUpdate, flags)
  user32.register('RedrawWindow', 4, () => {
    const hwnd = emu.readArg(0), p = emu.readArg(1), h = emu.readArg(2), flags = emu.readArg(3);
    const rgn = h ? getRegion(emu, h) : p ? new Region([readRect(emu, p)]) : null;
    if (!hwnd) {
      for (const [th, w] of topLevelWindows(emu)) redraw(emu, th, w, null, flags);
      return 1;
    }
    const wnd = wndOf(hwnd);
    if (!wnd) return 0;
    redraw(emu, hwnd, wnd, rgn ? rgn.clone() : null, flags);
    return 1;
  });

  const scrollWindow = (hwnd: number, dx: number, dy: number, pScroll: number, pClip: number, flags: number): Region | null => {
    const wnd = wndOf(hwnd);
    if (!wnd) return null;
    const client = clientRect(emu, wnd);
    const area = pScroll ? readRect(emu, pScroll) : client;
    const clip = pClip ? readRect(emu, pClip) : client;
    const hdc = emu.getWindowDC(hwnd);
    const exposed = scrollPixels(emu, hdc, area, clip, dx, dy);
    emu.releaseChildDC(hdc);
    // The pending update region inside the scrolled area moves with the pixels
    const pending = getUpdateRegion(emu, wnd);
    if (pending && wnd.updateRgn) {
      const inArea = pending.intersect(new Region([area]));
      inArea.offset(dx, dy);
      invalidateWindow(emu, wnd, inArea.intersect(new Region([clip])), false);
    }
    if (flags & SW_SCROLLCHILDREN) {
      for (const [, c] of childrenOf(emu, wnd)) { c.x += dx; c.y += dy; }
      emu.notifyControlOverlays();
    }
    if (flags & SW_INVALIDATE) invalidateWindow(emu, wnd, exposed, !!(flags & SW_ERASE));
    return exposed;
  };

  // ScrollWindowEx(hWnd, dx, dy, prcScroll, prcClip, hrgnUpdate, prcUpdate, flags)
  user32.register('ScrollWindowEx', 8, () => {
    const exposed = scrollWindow(emu.readArg(0), emu.readArg(1) | 0, emu.readArg(2) | 0, emu.readArg(3), emu.readArg(4), emu.readArg(7));
    if (!exposed) return RGN_ERROR;
    const hrgn = emu.readArg(5), prc = emu.readArg(6);
    if (hrgn) setRegion(emu, hrgn, exposed.clone());
    if (prc) writeRect(emu, prc, exposed.bounds());
    return exposed.isEmpty() ? NULLREGION : exposed.complexity();
  });

  // ScrollWindow(hWnd, XAmount, YAmount, lpRect, lpClipRect): children move when lpRect is NULL
  user32.register('ScrollWindow', 5, () => {
    const pScroll = emu.readArg(3);
    const flags = SW_INVALIDATE | SW_ERASE | (pScroll ? 0 : SW_SCROLLCHILDREN);
    return scrollWindow(emu.readArg(0), emu.readArg(1) | 0, emu.readArg(2) | 0, pScroll, emu.readArg(4), flags) ? 1 : 0;
  });

  // ScrollDC(hDC, dx, dy, lprcScroll, lprcClip, hrgnUpdate, lprcUpdate)
  user32.register('ScrollDC', 7, () => {
    const hdc = emu.readArg(0), dx = emu.readArg(1) | 0, dy = emu.readArg(2) | 0;
    const dc = emu.getDC(hdc);
    if (!dc) return 0;
    const surface = { left: 0, top: 0, right: dc.canvas.width, bottom: dc.canvas.height };
    const area = emu.readArg(3) ? readRect(emu, emu.readArg(3)) : surface;
    const clip = emu.readArg(4) ? readRect(emu, emu.readArg(4)) : area;
    const exposed = scrollPixels(emu, hdc, area, clip, dx, dy);
    if (emu.readArg(5)) setRegion(emu, emu.readArg(5), exposed.clone());
    if (emu.readArg(6)) writeRect(emu, emu.readArg(6), exposed.bounds());
    return 1;
  });
}
