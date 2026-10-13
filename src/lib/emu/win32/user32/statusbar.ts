// Built-in msctls_statusbar32 behavior, following Wine's comctl32/status.c.
// The control sizes itself: unless CCS_NORESIZE is set, the rect passed to
// CreateWindowEx is ignored and WM_SIZE docks the bar to the bottom of its parent
// with a height computed from the font metrics.
import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { getClientSize } from './_helpers';
import { WM_SIZE, WS_CHILD } from '../types';
import {
  SB_SETTEXTA, SB_SETTEXTW, SB_GETTEXTA, SB_GETTEXTW, SB_GETTEXTLENGTHA, SB_GETTEXTLENGTHW,
  SB_SETPARTS, SB_GETPARTS, SB_GETBORDERS, SB_SETMINHEIGHT, SB_SIMPLE, SB_ISSIMPLE, SB_GETRECT,
  SB_SIMPLEID, SB_HORZ_BORDER, SB_VERT_BORDER, SB_HORZ_GAP, CCS_NORESIZE, SIZE_RESTORED, SIZE_MAXIMIZED,
} from '../constants-ctl';

// DEFAULT_GUI_FONT on XP (Tahoma 8pt @ 96 dpi): tmHeight 13, tmInternalLeading 3
const DEFAULT_FONT_HEIGHT = 13;
const DEFAULT_FONT_INTERNAL_LEADING = 3;
const SM_CYSIZE_DEFAULT = 18;  // GetSystemMetrics(SM_CYSIZE)
const SM_CYBORDER_DEFAULT = 1; // GetSystemMetrics(SM_CYBORDER)

interface StatusState {
  height: number;
  minHeight: number;
  simple: boolean;
  simpleText: string;
  simpleStyle: number;
  styles: number[];
}

function state(wnd: WindowInfo): StatusState {
  const w = wnd as WindowInfo & { _sb?: StatusState };
  if (!w._sb) {
    const minHeight = SM_CYSIZE_DEFAULT & ~1;
    w._sb = { height: 0, minHeight, simple: false, simpleText: '', simpleStyle: 0, styles: [] };
    w._sb.height = computeHeight(w._sb);
    if (!wnd.statusParts) wnd.statusParts = [-1];
    if (!wnd.statusTexts) wnd.statusTexts = [];
  }
  return w._sb;
}

function computeHeight(s: StatusState): number {
  const margin = DEFAULT_FONT_INTERNAL_LEADING || 2;
  return Math.max(DEFAULT_FONT_HEIGHT + margin + 2 * SM_CYBORDER_DEFAULT, s.minHeight) + SB_VERT_BORDER;
}

/** Status bar height that the control will use (for layout before it is sized). */
export function statusBarHeight(wnd: WindowInfo): number {
  return state(wnd).height;
}

/** Text shown by the bar (simple mode shows only the simple text). */
export function statusBarDisplay(wnd: WindowInfo): { texts: string[]; parts: number[] } {
  const s = state(wnd);
  if (s.simple) return { texts: [s.simpleText], parts: [-1] };
  return { texts: wnd.statusTexts || [], parts: wnd.statusParts || [-1] };
}

function partBounds(wnd: WindowInfo, part: number): { l: number; t: number; r: number; b: number } {
  const s = state(wnd);
  const w = wnd.width, h = wnd.height;
  if (s.simple || part === SB_SIMPLEID) return { l: SB_HORZ_BORDER, t: SB_VERT_BORDER, r: w, b: h };
  const parts = wnd.statusParts || [-1];
  let left = 0, right = 0;
  for (let i = 0; i <= part && i < parts.length; i++) {
    left = i === 0 ? 0 : right + SB_HORZ_GAP;
    right = parts[i] === -1 ? w : parts[i];
  }
  return { l: left, t: SB_VERT_BORDER, r: right, b: h };
}

function dockToParent(emu: Emulator, wnd: WindowInfo): void {
  const s = state(wnd);
  if ((wnd.style & CCS_NORESIZE) || !(wnd.style & WS_CHILD)) return;
  const parent = emu.handles.get<WindowInfo>(wnd.parent);
  if (!parent) return;
  const { cw, ch } = getClientSize(parent.style, parent.hMenu !== 0, parent.width, parent.height, emu.isNE);
  wnd.x = 0;
  wnd.y = ch - s.height;
  wnd.width = cw;
  wnd.height = s.height;
}

/** Handle a status bar message; returns null when the message is not a status bar message. */
export function handleStatusBarMessage(emu: Emulator, wnd: WindowInfo, message: number, wParam: number, lParam: number): number | null {
  const s = state(wnd);
  const mem = emu.memory;
  const textOf = (part: number): { text: string; style: number } | null => {
    if (s.simple) return { text: s.simpleText, style: s.simpleStyle };
    const n = (wnd.statusParts || [-1]).length;
    if (part < 0 || part >= n) return null;
    return { text: (wnd.statusTexts || [])[part] || '', style: s.styles[part] || 0 };
  };
  switch (message) {
    case WM_SIZE:
      if (wParam === SIZE_RESTORED || wParam === SIZE_MAXIMIZED) dockToParent(emu, wnd);
      return 0;
    case SB_SETPARTS: {
      const count = wParam;
      if (!count || !lParam) return 0;
      const parts: number[] = [];
      for (let i = 0; i < count; i++) parts.push(mem.readI32(lParam + i * 4));
      wnd.statusParts = parts;
      if (!wnd.statusTexts) wnd.statusTexts = [];
      wnd.statusTexts.length = Math.min(wnd.statusTexts.length, count);
      emu.notifyControlOverlays();
      return 1;
    }
    case SB_GETPARTS: {
      const parts = wnd.statusParts || [-1];
      if (lParam) for (let i = 0; i < Math.min(wParam, parts.length); i++) mem.writeU32(lParam + i * 4, parts[i] >>> 0);
      return parts.length;
    }
    case SB_SETTEXTA:
    case SB_SETTEXTW: {
      const part = wParam & 0xFF;
      const style = wParam & 0xFF00;
      const text = lParam ? (message === SB_SETTEXTW ? mem.readUTF16String(lParam) : mem.readCString(lParam)) : '';
      if (part === SB_SIMPLEID) { s.simpleText = text; s.simpleStyle = style; }
      else {
        if (!wnd.statusTexts) wnd.statusTexts = [];
        wnd.statusTexts[part] = text;
        s.styles[part] = style;
      }
      emu.notifyControlOverlays();
      return 1;
    }
    case SB_GETTEXTA:
    case SB_GETTEXTW: {
      const t = textOf(wParam);
      if (!t) return 0;
      if (lParam) {
        if (message === SB_GETTEXTW) mem.writeUTF16String(lParam, t.text);
        else mem.writeCString(lParam, t.text);
      }
      return ((t.style << 16) | (t.text.length & 0xFFFF)) >>> 0;
    }
    case SB_GETTEXTLENGTHA:
    case SB_GETTEXTLENGTHW: {
      const t = textOf(wParam);
      if (!t) return 0;
      return ((t.style << 16) | (t.text.length & 0xFFFF)) >>> 0;
    }
    case SB_GETBORDERS:
      if (!lParam) return 0;
      mem.writeU32(lParam, SB_HORZ_BORDER);
      mem.writeU32(lParam + 4, SB_VERT_BORDER);
      mem.writeU32(lParam + 8, SB_HORZ_GAP);
      return 1;
    case SB_SETMINHEIGHT:
      s.minHeight = Math.max(wParam | 0, SM_CYSIZE_DEFAULT & ~1);
      s.height = computeHeight(s);
      return 1;
    case SB_SIMPLE:
      s.simple = !!wParam;
      emu.notifyControlOverlays();
      return 0;
    case SB_ISSIMPLE:
      return s.simple ? 1 : 0;
    case SB_GETRECT: {
      const n = (wnd.statusParts || [-1]).length;
      if (!s.simple && (wParam < 0 || wParam >= n)) return 0;
      if (!lParam) return 0;
      const r = partBounds(wnd, wParam);
      mem.writeU32(lParam, r.l); mem.writeU32(lParam + 4, r.t);
      mem.writeU32(lParam + 8, r.r); mem.writeU32(lParam + 12, r.b);
      return 1;
    }
  }
  if (message >= 0x0400 && message < 0x0500) return 0;
  return null;
}
