// Standard (non-client) scroll bars of child windows: WS_HSCROLL / WS_VSCROLL bars that
// SetScrollInfo shows and hides (Wine dlls/user32/scroll.c semantics), drawn in the window's
// non-client area and driven by the mouse (WM_HSCROLL / WM_VSCROLL).
import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { getClientSize, getNonClientMetrics } from './_helpers';
import {
  WS_CHILD, WS_HSCROLL, WS_VSCROLL, WM_HSCROLL, WM_VSCROLL, WM_SIZE, SYS_COLORS,
  COLOR_SCROLLBAR, COLOR_BTNFACE, COLOR_BTNSHADOW, COLOR_BTNTEXT, COLOR_BTNHIGHLIGHT, COLOR_3DDKSHADOW,
} from '../types';
import { METRIC_SCROLL_SIZE } from '../constants-user';
import { getWindowOrigin } from '../../emu-window';
import {
  SB_HORZ, SB_VERT, SB_LINEUP, SB_LINEDOWN, SB_PAGEUP, SB_PAGEDOWN, SB_THUMBPOSITION, SB_THUMBTRACK,
  SB_ENDSCROLL, SCROLL_MIN_THUMB, SIZE_RESTORED,
} from '../constants-ctl';

export interface ScrollState { nMin: number; nMax: number; nPage: number; nPos: number; nTrackPos: number }

const states = new WeakMap<Emulator, Map<string, ScrollState>>();

export function scrollStateOf(emu: Emulator, hwnd: number, bar: number): ScrollState {
  let m = states.get(emu);
  if (!m) { m = new Map(); states.set(emu, m); }
  const key = `${hwnd}:${bar}`;
  let s = m.get(key);
  if (!s) { s = { nMin: 0, nMax: 0, nPage: 0, nPos: 0, nTrackPos: 0 }; m.set(key, s); }
  return s;
}

/** Clamp nPos into [nMin, nMax - max(nPage - 1, 0)]. */
export function clampScrollPos(s: ScrollState): void {
  const hi = s.nMax - Math.max(s.nPage - 1, 0);
  if (s.nPos > hi) s.nPos = hi;
  if (s.nPos < s.nMin) s.nPos = s.nMin;
}

/** Child windows with their own window procedure get emulated standard scroll bars. */
function hasNcScrollBars(emu: Emulator, hwnd: number, wnd: WindowInfo | null): wnd is WindowInfo {
  return !!wnd && !!wnd.wndProc && hwnd !== emu.mainWindow && !!(wnd.style & WS_CHILD);
}

/** Show or hide a bar (SB_HORZ / SB_VERT); resizes the client area like SetWindowPos(SWP_FRAMECHANGED). */
export function showScrollBar(emu: Emulator, hwnd: number, bar: number, show: boolean): void {
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  if (!hasNcScrollBars(emu, hwnd, wnd)) return;
  const bit = bar === SB_HORZ ? WS_HSCROLL : WS_VSCROLL;
  if (!!(wnd.style & bit) === show) return;
  const before = getClientSize(wnd.style, false, wnd.width, wnd.height, emu.isNE);
  wnd.style = show ? (wnd.style | bit) >>> 0 : (wnd.style & ~bit) >>> 0;
  const after = getClientSize(wnd.style, false, wnd.width, wnd.height, emu.isNE);
  wnd.needsPaint = true;
  if (before.cw !== after.cw || before.ch !== after.ch) {
    emu.callWndProc(wnd.wndProc, hwnd, WM_SIZE, SIZE_RESTORED, ((after.ch & 0xFFFF) << 16) | (after.cw & 0xFFFF));
  }
}

/** After a range/page change: a bar is visible while the range exceeds the page. */
export function updateScrollBarVisibility(emu: Emulator, hwnd: number, bar: number, disableNoScroll: boolean): void {
  if (bar !== SB_HORZ && bar !== SB_VERT) return;
  const s = scrollStateOf(emu, hwnd, bar);
  const needed = s.nMin < s.nMax && (s.nPage === 0 || s.nPage <= s.nMax - s.nMin);
  if (needed || !disableNoScroll) showScrollBar(emu, hwnd, bar, needed || disableNoScroll);
  paintScrollBars(emu, hwnd);
}

interface BarGeom { x: number; y: number; len: number; vert: boolean }

/** Bar rectangles in window (DC) coordinates. */
function barGeometry(emu: Emulator, wnd: WindowInfo): { h: BarGeom | null; v: BarGeom | null } {
  const { bw, captionH } = getNonClientMetrics(wnd.style, false, emu.isNE);
  const { cw, ch } = getClientSize(wnd.style, false, wnd.width, wnd.height, emu.isNE);
  const top = bw + captionH;
  return {
    v: wnd.style & WS_VSCROLL ? { x: bw + cw, y: top, len: ch, vert: true } : null,
    h: wnd.style & WS_HSCROLL ? { x: bw, y: top + ch, len: cw, vert: false } : null,
  };
}

/** Thumb start (offset along the bar) and length; null when there is nothing to scroll. */
function thumbOf(s: ScrollState, len: number): { start: number; size: number } | null {
  const S = METRIC_SCROLL_SIZE;
  const track = len - 2 * S;
  const range = s.nMax - s.nMin + 1;
  if (track < SCROLL_MIN_THUMB || range <= 0 || (s.nPage && s.nPage >= range)) return null;
  const size = s.nPage ? Math.max(SCROLL_MIN_THUMB, Math.floor(track * s.nPage / range)) : S;
  const span = range - Math.max(s.nPage, 1);
  const start = S + (span > 0 ? Math.round((track - size) * (s.nPos - s.nMin) / span) : 0);
  return { start, size };
}

const css = (c: number) => `rgb(${c & 0xFF},${(c >> 8) & 0xFF},${(c >> 16) & 0xFF})`;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function raised(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = css(SYS_COLORS[COLOR_BTNFACE]); ctx.fillRect(x, y, w, h);
  ctx.fillStyle = css(SYS_COLORS[COLOR_BTNHIGHLIGHT]); ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = css(SYS_COLORS[COLOR_BTNSHADOW]); ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  ctx.fillStyle = css(SYS_COLORS[COLOR_3DDKSHADOW]); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
}

/** Arrow glyph pointing in direction d (0 up, 1 down, 2 left, 3 right) centred in a button. */
function arrow(ctx: Ctx, x: number, y: number, d: number): void {
  ctx.fillStyle = css(SYS_COLORS[COLOR_BTNTEXT]);
  const cx = x + 7, cy = y + 7;
  for (let i = 0; i < 4; i++) {
    const half = d === 0 || d === 2 ? i : 3 - i;
    if (d < 2) ctx.fillRect(cx - half, cy - 2 + i, 2 * half + 1, 1);
    else ctx.fillRect(cx - 2 + i, cy - half, 1, 2 * half + 1);
  }
}

function drawBar(ctx: Ctx, g: BarGeom, s: ScrollState): void {
  const S = METRIC_SCROLL_SIZE;
  const [w, h] = g.vert ? [S, g.len] : [g.len, S];
  ctx.fillStyle = css(SYS_COLORS[COLOR_SCROLLBAR]);
  ctx.fillRect(g.x, g.y, w, h);
  if (g.len < 2 * S) return;
  if (g.vert) {
    raised(ctx, g.x, g.y, S, S); arrow(ctx, g.x, g.y, 0);
    raised(ctx, g.x, g.y + g.len - S, S, S); arrow(ctx, g.x, g.y + g.len - S, 1);
  } else {
    raised(ctx, g.x, g.y, S, S); arrow(ctx, g.x, g.y, 2);
    raised(ctx, g.x + g.len - S, g.y, S, S); arrow(ctx, g.x + g.len - S, g.y, 3);
  }
  const t = thumbOf(s, g.len);
  if (t) {
    if (g.vert) raised(ctx, g.x, g.y + t.start, S, t.size);
    else raised(ctx, g.x + t.start, g.y, t.size, S);
  }
}

/** Draw the window's visible standard scroll bars (and the size box between them). */
export function paintScrollBars(emu: Emulator, hwnd: number): void {
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  if (!hasNcScrollBars(emu, hwnd, wnd) || !wnd.visible || !(wnd.style & (WS_HSCROLL | WS_VSCROLL))) return;
  const hdc = emu.getWindowDC(hwnd);
  const dc = emu.getDC(hdc);
  if (!dc) return;
  const g = barGeometry(emu, wnd);
  if (g.v) drawBar(dc.ctx, g.v, scrollStateOf(emu, hwnd, SB_VERT));
  if (g.h) drawBar(dc.ctx, g.h, scrollStateOf(emu, hwnd, SB_HORZ));
  if (g.v && g.h) {
    dc.ctx.fillStyle = css(SYS_COLORS[COLOR_BTNFACE]);
    dc.ctx.fillRect(g.v.x, g.h.y, METRIC_SCROLL_SIZE, METRIC_SCROLL_SIZE);
  }
  emu.releaseChildDC(hdc);
  emu.screenDirty = true;
}

// ---- mouse ----------------------------------------------------------------------------

interface ScrollDrag { hwnd: number; bar: number; thumb: boolean; grab: number; startPos: number }
const drags = new WeakMap<Emulator, ScrollDrag>();

const msgFor = (bar: number) => (bar === SB_VERT ? WM_VSCROLL : WM_HSCROLL);

/**
 * Left button pressed at canvas point (cx, cy) over window `hwnd`. Returns true when the press
 * hit one of the window's standard scroll bars (the click is then consumed and not sent as
 * WM_LBUTTONDOWN). Bars are located in window coordinates (frame/border included).
 */
export function scrollBarPress(emu: Emulator, hwnd: number, cx: number, cy: number): boolean {
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  if (!hasNcScrollBars(emu, hwnd, wnd)) return false;
  const origin = getWindowOrigin(emu, hwnd);
  const wx = cx - origin.x, wy = cy - origin.y;
  const g = barGeometry(emu, wnd);
  const S = METRIC_SCROLL_SIZE;
  for (const [bar, geo] of [[SB_VERT, g.v], [SB_HORZ, g.h]] as const) {
    if (!geo) continue;
    const [w, h] = geo.vert ? [S, geo.len] : [geo.len, S];
    if (wx < geo.x || wy < geo.y || wx >= geo.x + w || wy >= geo.y + h) continue;
    const along = geo.vert ? wy - geo.y : wx - geo.x;
    const s = scrollStateOf(emu, hwnd, bar);
    const t = thumbOf(s, geo.len);
    let code: number;
    if (along < S) code = SB_LINEUP;
    else if (along >= geo.len - S) code = SB_LINEDOWN;
    else if (t && along >= t.start && along < t.start + t.size) {
      drags.set(emu, { hwnd, bar, thumb: true, grab: along - t.start, startPos: s.nPos });
      s.nTrackPos = s.nPos;
      return true;
    } else code = t && along < t.start ? SB_PAGEUP : SB_PAGEDOWN;
    drags.set(emu, { hwnd, bar, thumb: false, grab: 0, startPos: s.nPos });
    emu.postMessage(hwnd, msgFor(bar), code, 0);
    return true;
  }
  // The size box between the bars swallows clicks too
  return !!(g.v && g.h && wx >= g.v.x && wy >= g.h.y && wx < g.v.x + S && wy < g.h.y + S);
}

/** Whether a scroll bar is being tracked with the mouse. */
export function scrollBarTracking(emu: Emulator): boolean {
  return drags.has(emu);
}

/** Mouse moved to canvas point (cx, cy) while a scroll bar is tracked; returns true when consumed. */
export function scrollBarMove(emu: Emulator, cx: number, cy: number): boolean {
  const d = drags.get(emu);
  if (!d) return false;
  if (!d.thumb) return true;
  const wnd = emu.handles.get<WindowInfo>(d.hwnd);
  if (!wnd) return true;
  const origin = getWindowOrigin(emu, d.hwnd);
  const wx = cx - origin.x, wy = cy - origin.y;
  const geo = barGeometry(emu, wnd)[d.bar === SB_VERT ? 'v' : 'h'];
  const s = scrollStateOf(emu, d.hwnd, d.bar);
  const t = geo && thumbOf(s, geo.len);
  if (!geo || !t) return true;
  const S = METRIC_SCROLL_SIZE;
  const along = (geo.vert ? wy - geo.y : wx - geo.x) - d.grab;
  const free = geo.len - 2 * S - t.size;
  const span = s.nMax - s.nMin + 1 - Math.max(s.nPage, 1);
  const pos = free > 0 ? s.nMin + Math.round(Math.min(Math.max(along - S, 0), free) * span / free) : s.nMin;
  if (pos !== s.nTrackPos) {
    s.nTrackPos = pos;
    emu.postMessage(d.hwnd, msgFor(d.bar), ((pos & 0xFFFF) << 16) | SB_THUMBTRACK, 0);
  }
  return true;
}

/** Button released; returns true when a scroll bar was being tracked. */
export function scrollBarRelease(emu: Emulator): boolean {
  const d = drags.get(emu);
  if (!d) return false;
  drags.delete(emu);
  const s = scrollStateOf(emu, d.hwnd, d.bar);
  if (d.thumb) emu.postMessage(d.hwnd, msgFor(d.bar), ((s.nTrackPos & 0xFFFF) << 16) | SB_THUMBPOSITION, 0);
  emu.postMessage(d.hwnd, msgFor(d.bar), SB_ENDSCROLL, 0);
  return true;
}
