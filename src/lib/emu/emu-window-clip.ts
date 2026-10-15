// Child-window clipping for DCs that share the main canvas.
import type { Emulator } from './emulator';
import type { WindowInfo } from './win32/user32/index';
import { getNonClientMetrics } from './win32/user32/_helpers';
import { getWindowOrigin, trackChildDC } from './emu-window';
import type { DCInfo } from './win32/gdi32/types';
import { OPAQUE } from './win32/types';
import { WS_CHILD } from './win32/types';

/** Rect of a child window's DC (window origin) that is not clipped away by the client
 *  areas of its ancestors — a child never draws outside its parents (Windows clips
 *  children to the parent's client area). Returned in the window's own coordinates. */
export function visibleWindowRect(emu: Emulator, hwnd: number, origin: { x: number; y: number }): { x: number; y: number; w: number; h: number } {
  const wnd = emu.handles.get<WindowInfo>(hwnd)!;
  let l = origin.x, t = origin.y, r = origin.x + wnd.width, b = origin.y + wnd.height;
  let cur = wnd;
  while (cur.parent && (cur.style & WS_CHILD)) {
    const parent = emu.handles.get<WindowInfo>(cur.parent);
    if (!parent) break;
    let pl: number, pt: number, pr: number, pb: number;
    if (parent.hwnd === emu.mainWindow) {
      pl = 0; pt = 0; pr = emu.canvas?.width ?? r; pb = emu.canvas?.height ?? b;
    } else {
      const po = getWindowOrigin(emu, parent.hwnd);
      const { bw, captionH } = getNonClientMetrics(parent.style, !!parent.hMenu, emu.isNE);
      pl = po.x + bw; pt = po.y + bw + captionH;
      pr = po.x + parent.width - bw; pb = po.y + parent.height - bw;
    }
    l = Math.max(l, pl); t = Math.max(t, pt); r = Math.min(r, pr); b = Math.min(b, pb);
    if (parent.hwnd === emu.mainWindow) break;
    cur = parent;
  }
  return { x: l - origin.x, y: t - origin.y, w: Math.max(0, r - l), h: Math.max(0, b - t) };
}

const mainWindowDCs = new WeakMap<Emulator, number>();

/**
 * GetWindowDC for the main window: origin at the window's top-left corner (non-client area
 * included). The main canvas only holds the client area, so non-client drawing falls outside it.
 */
export function mainWindowNonClientDC(emu: Emulator, hwnd: number): number {
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  if (!wnd || !emu.canvas || !emu.canvasCtx) return 0;
  const { bw, captionH, menuH } = getNonClientMetrics(wnd.style, wnd.hMenu !== 0, emu.isNE);
  let hdc = mainWindowDCs.get(emu) ?? 0;
  let dc = hdc ? emu.getDC(hdc) : null;
  if (!dc) {
    const info: DCInfo = {
      canvas: emu.canvas, ctx: emu.canvasCtx, hwnd,
      selectedBitmap: 0, selectedPen: 0x80000007, selectedBrush: 0x80000000, selectedFont: 0, selectedPalette: 0,
      textColor: 0, bkColor: 0xFFFFFF, bkMode: OPAQUE, penPosX: 0, penPosY: 0, rop2: 13,
    };
    hdc = emu.handles.alloc('dc', info);
    mainWindowDCs.set(emu, hdc);
    dc = info;
  }
  dc.hwnd = hwnd;
  dc.ctx.save();
  dc.ctx.setTransform(1, 0, 0, 1, -bw, -(bw + captionH + menuH));
  trackChildDC(hdc);
  return hdc;
}
