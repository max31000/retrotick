// BeginPaint / EndPaint: update region → rcPaint, erase via WM_ERASEBKGND when pending,
// painting clipped to the update region, and invalidation of windows sharing the canvas.
import type { Emulator } from './emulator';
import type { WindowInfo } from './win32/user32/index';
import { SYS_COLORS, COLOR_BTNFACE, WM_ERASEBKGND, WS_CLIPCHILDREN } from './win32/types';
import { renderChildControls } from './emu-render';
import { Region, type Rect } from './region';
import { getUpdateRegion, validateWindow, clientRect, invalidateWindow, clientOffsetInDC } from './win32/user32/update-region';
import { pushVisClip, popVisClip } from './win32/gdi32/dc-clip';
import { getWindowDC, getDC, releaseChildDC, getBrush, isDescendantOfMain } from './emu-window';

// Track DCs that have WS_CLIPCHILDREN state saved
const clipChildrenDCSet = new Set<number>();

function applyClipChildren(emu: Emulator, hwnd: number, wnd: WindowInfo | null, hdc: number): void {
  if (!wnd || !(wnd.style & WS_CLIPCHILDREN) || !wnd.childList || hwnd !== emu.mainWindow) return;
  const dc = getDC(emu, hdc);
  if (!dc) return;
  const childRects: { x: number; y: number; w: number; h: number }[] = [];
  for (const childHwnd of wnd.childList) {
    const child = emu.handles.get<WindowInfo>(childHwnd);
    if (!child || !child.visible) continue;
    childRects.push({ x: child.x, y: child.y, w: child.width, h: child.height });
  }
  if (childRects.length === 0) return;
  dc.ctx.save();
  clipChildrenDCSet.add(hdc);
  // Canvas rect minus child rects (evenodd)
  dc.ctx.beginPath();
  dc.ctx.rect(0, 0, dc.canvas.width, dc.canvas.height);
  for (const r of childRects) {
    dc.ctx.moveTo(r.x, r.y);
    dc.ctx.lineTo(r.x, r.y + r.h);
    dc.ctx.lineTo(r.x + r.w, r.y + r.h);
    dc.ctx.lineTo(r.x + r.w, r.y);
    dc.ctx.closePath();
  }
  dc.ctx.clip('evenodd');
}

/** Erase the background like DefWindowProc for built-in windows without a window procedure. */
function eraseWithClassBrush(emu: Emulator, wnd: WindowInfo, hdc: number): void {
  const dc = getDC(emu, hdc);
  const isDialog = wnd.classInfo.className === '#32770' || !!wnd.dlgProc;
  let bgColor: number | null = null;
  if (isDialog) bgColor = SYS_COLORS[COLOR_BTNFACE];
  else if (wnd.classInfo.hbrBackground) {
    const brush = getBrush(emu, wnd.classInfo.hbrBackground);
    if (brush && !brush.isNull) bgColor = brush.color;
  }
  if (dc && bgColor !== null) {
    const r = bgColor & 0xFF, g = (bgColor >> 8) & 0xFF, b = (bgColor >> 16) & 0xFF;
    dc.ctx.fillStyle = `rgb(${r},${g},${b})`;
    dc.ctx.fillRect(0, 0, wnd.width, wnd.height);
  }
}

/** Send WM_ERASEBKGND with a DC clipped to `rgn`; returns TRUE when the window erased. */
export function sendEraseBackground(emu: Emulator, hwnd: number, wnd: WindowInfo, hdc: number): boolean {
  if (wnd.wndProc) return !!emu.callWndProc(wnd.wndProc, hwnd, WM_ERASEBKGND, hdc, 0);
  eraseWithClassBrush(emu, wnd, hdc);
  return true;
}

/** Child and popup DCs that share the main canvas have their origin at the window's
 *  top-left corner (not the client area), so map a client-coordinate region onto them.
 *  A whole-client update covers the whole window, borders included. */
export function toDCCoords(emu: Emulator, hwnd: number, wnd: WindowInfo, rgn: Region): Region {
  const off = clientOffsetInDC(emu, hwnd, wnd);
  if (!off.x && !off.y && (hwnd === emu.mainWindow || wnd.domCanvas)) return rgn;
  const client = clientRect(emu, wnd);
  if (rgn.equals(new Region([client]))) return Region.fromRect(0, 0, wnd.width, wnd.height);
  const r = rgn.clone();
  r.offset(off.x, off.y);
  return r;
}

export function beginPaint(emu: Emulator, hwnd: number): number {
  const hdc = getWindowDC(emu, hwnd);
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  // BeginPaint called with nothing invalid (e.g. a WM_PAINT sent by the emulator itself):
  // paint the whole client area rather than clipping everything away.
  const rgn = wnd ? (getUpdateRegion(emu, wnd) ?? new Region([clientRect(emu, wnd)])) : null;
  const pendingErase = !!wnd?.needsErase;
  if (wnd) {
    validateWindow(emu, wnd, null);
    wnd._paintQueued = false;
    wnd.painting = true;
    wnd.paintRect = rgn!.bounds();
    wnd.paintFErase = false;
  }
  emu._dispatchPaintUsedBeginPaint = true;

  // WS_CLIPCHILDREN must be applied before erasing so child areas are protected
  applyClipChildren(emu, hwnd, wnd, hdc);
  const dc = getDC(emu, hdc);
  if (dc && rgn && wnd) pushVisClip(dc, toDCCoords(emu, hwnd, wnd, rgn));

  // Like Windows, erase only when the update region was invalidated with erase pending;
  // the window erases itself via WM_ERASEBKGND (clipped to the update region).
  if (wnd && pendingErase) {
    const erased = sendEraseBackground(emu, hwnd, wnd, hdc);
    // PAINTSTRUCT.fErase: TRUE when the window did not erase its background
    wnd.paintFErase = !erased;
  }
  return hdc;
}

export function endPaint(emu: Emulator, hwnd: number): void {
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  const hdc = emu.windowDCs.get(hwnd);
  const dc = hdc ? getDC(emu, hdc) : null;
  if (dc) popVisClip(dc);
  if (hdc && clipChildrenDCSet.has(hdc)) {
    if (dc) dc.ctx.restore();
    clipChildrenDCSet.delete(hdc);
  }
  if (wnd) wnd.painting = false;
  if (hdc) releaseChildDC(emu, hdc);

  renderChildControls(emu, hwnd);
  const painted = wnd?.paintRect;

  // Popup windows share the main canvas: repaint those the main window painted over.
  if (hwnd === emu.mainWindow && painted) invalidateOverlappingPopups(emu, painted);
}

/** Invalidate visible popup windows (drawn on the main canvas) that intersect `area`
 *  (main canvas coordinates). */
export function invalidateOverlappingPopups(emu: Emulator, area: Rect): void {
  for (const [h, w] of emu.handles.findByType('window') as [number, WindowInfo][]) {
    if (!w || !w.visible || h === emu.mainWindow || isDescendantOfMain(emu, h) || !w.wndProc) continue;
    const l = Math.max(area.left, w.x), t = Math.max(area.top, w.y);
    const r = Math.min(area.right, w.x + w.width), b = Math.min(area.bottom, w.y + w.height);
    if (r <= l || b <= t) continue;
    invalidateWindow(emu, w, Region.fromRect(l - w.x, t - w.y, r - w.x, b - w.y), true);
  }
}
