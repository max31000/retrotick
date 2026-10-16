// Built-in ToolbarWindow32 behavior (after Wine's comctl32/toolbar.c, classic look):
// buttons with bitmap-strip images, check/group states, layout and WM_COMMAND on click.
import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import type { BitmapInfo } from '../gdi32/types';
import { WM_PAINT, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_COMMAND, SYS_COLORS, COLOR_BTNFACE,
  COLOR_BTNSHADOW, COLOR_BTNHIGHLIGHT, COLOR_3DDKSHADOW, WM_LBUTTONDBLCLK } from '../types';
import * as T from '../constants-toolbar';
import { CCS_NORESIZE, CCS_NOPARENTALIGN, CCS_BOTTOM } from '../constants-ctl';
import { getClientSize, clientStyle } from './_helpers';

interface TbButton { iBitmap: number; idCommand: number; fsState: number; fsStyle: number; dwData: number; iString: number }
interface TbState {
  buttons: TbButton[];
  images: { canvas: OffscreenCanvas; count: number }[];
  bmpW: number; bmpH: number; btnW: number; btnH: number;
  notify: number; indent: number; strings: string[]; pressed: number; imageList: number; exStyle: number;
}

function state(wnd: WindowInfo): TbState {
  const w = wnd as WindowInfo & { _toolbar?: TbState };
  if (!w._toolbar) {
    w._toolbar = {
      buttons: [], images: [], bmpW: T.TB_DEFAULT_BITMAP_W, bmpH: T.TB_DEFAULT_BITMAP_H,
      btnW: T.TB_DEFAULT_BUTTON_W, btnH: T.TB_DEFAULT_BUTTON_H, notify: 0, indent: 0, strings: [], pressed: -1, imageList: 0, exStyle: 0,
    };
  }
  return w._toolbar;
}

const css = (c: number) => `rgb(${c & 0xFF},${(c >> 8) & 0xFF},${(c >> 16) & 0xFF})`;

/** Button rectangles in client coordinates (single row unless TBSTATE_WRAP). */
function layout(s: TbState): { left: number; top: number; right: number; bottom: number }[] {
  let x = s.indent, y = 0;
  return s.buttons.map(b => {
    if (b.fsState & T.TBSTATE_HIDDEN) return { left: x, top: y, right: x, bottom: y };
    const w = b.fsStyle & T.TBSTYLE_SEP ? (b.iBitmap > 0 ? b.iBitmap : T.TB_DEFAULT_SEP_W) : s.btnW;
    const r = { left: x, top: y, right: x + w, bottom: y + s.btnH };
    x += w;
    if (b.fsState & T.TBSTATE_WRAP) { x = s.indent; y += s.btnH; }
    return r;
  });
}

function readButton(emu: Emulator, p: number): TbButton {
  const m = emu.memory;
  return { iBitmap: m.readI32(p), idCommand: m.readI32(p + 4), fsState: m.readU8(p + 8), fsStyle: m.readU8(p + 9), dwData: m.readU32(p + 12), iString: m.readI32(p + 16) };
}

function writeButton(emu: Emulator, p: number, b: TbButton): void {
  const m = emu.memory;
  m.writeU32(p, b.iBitmap >>> 0); m.writeU32(p + 4, b.idCommand >>> 0); m.writeU8(p + 8, b.fsState); m.writeU8(p + 9, b.fsStyle);
  m.writeU16(p + 10, 0); m.writeU32(p + 12, b.dwData); m.writeU32(p + 16, b.iString >>> 0);
}

/** Total images added so far = index of the next one. */
const imageCount = (s: TbState) => s.images.reduce((n, i) => n + i.count, 0);

function addBitmap(emu: Emulator, s: TbState, nButtons: number, p: number): number {
  const first = imageCount(s);
  if (!p) return -1;
  const hInst = emu.memory.readU32(p), nID = emu.memory.readU32(p + 4);
  let hbm = 0;
  if (hInst === 0) hbm = nID;
  else if (hInst !== T.HINST_COMMCTRL) hbm = emu.loadBitmapResourceFromModule(hInst, nID);
  const bmp = hbm ? emu.handles.get<BitmapInfo>(hbm) : null;
  const canvas = new OffscreenCanvas(Math.max(1, bmp?.width ?? nButtons * s.bmpW), Math.max(1, bmp?.height ?? s.bmpH));
  if (bmp) canvas.getContext('2d')!.drawImage(bmp.canvas, 0, 0);
  s.images.push({ canvas, count: Math.max(nButtons, 0) });
  return first;
}

function imageSource(s: TbState, index: number): { canvas: OffscreenCanvas; x: number } | null {
  let i = index;
  for (const img of s.images) {
    if (i < img.count) return { canvas: img.canvas, x: i * s.bmpW };
    i -= img.count;
  }
  return null;
}

function frame(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, r: { left: number; top: number; right: number; bottom: number }, sunken: boolean): void {
  const w = r.right - r.left, h = r.bottom - r.top;
  const [tl, br, outerBr] = sunken
    ? [SYS_COLORS[COLOR_3DDKSHADOW], SYS_COLORS[COLOR_BTNHIGHLIGHT], SYS_COLORS[COLOR_BTNHIGHLIGHT]]
    : [SYS_COLORS[COLOR_BTNHIGHLIGHT], SYS_COLORS[COLOR_BTNSHADOW], SYS_COLORS[COLOR_3DDKSHADOW]];
  ctx.fillStyle = css(tl); ctx.fillRect(r.left, r.top, w - 1, 1); ctx.fillRect(r.left, r.top, 1, h - 1);
  ctx.fillStyle = css(outerBr); ctx.fillRect(r.left, r.bottom - 1, w, 1); ctx.fillRect(r.right - 1, r.top, 1, h);
  ctx.fillStyle = css(br); ctx.fillRect(r.left + 1, r.bottom - 2, w - 2, 1); ctx.fillRect(r.right - 2, r.top + 1, 1, h - 2);
}

function paint(emu: Emulator, hwnd: number, wnd: WindowInfo): void {
  const s = state(wnd);
  const hdc = emu.beginPaint(hwnd);
  const dc = emu.getDC(hdc);
  if (dc) {
    const ctx = dc.ctx;
    ctx.fillStyle = css(SYS_COLORS[COLOR_BTNFACE]);
    ctx.fillRect(0, 0, wnd.width, wnd.height);
    const rects = layout(s);
    s.buttons.forEach((b, i) => {
      const r = rects[i];
      if (b.fsState & T.TBSTATE_HIDDEN || r.right <= r.left) return;
      if (b.fsStyle & T.TBSTYLE_SEP) return;
      const down = !!(b.fsState & (T.TBSTATE_CHECKED | T.TBSTATE_PRESSED)) || s.pressed === i;
      if (b.fsState & T.TBSTATE_CHECKED && s.pressed !== i) {
        ctx.fillStyle = css(SYS_COLORS[COLOR_BTNHIGHLIGHT]);
        ctx.fillRect(r.left + 1, r.top + 1, r.right - r.left - 2, r.bottom - r.top - 2);
      }
      frame(ctx, r, down);
      const src = imageSource(s, b.iBitmap);
      if (src) {
        const off = down ? 1 : 0;
        const x = r.left + Math.floor((r.right - r.left - s.bmpW) / 2) + off;
        const y = r.top + Math.floor((r.bottom - r.top - s.bmpH) / 2) + off;
        const enabled = !!(b.fsState & T.TBSTATE_ENABLED);
        ctx.globalAlpha = enabled ? 1 : 0.35;
        ctx.drawImage(src.canvas, src.x, 0, s.bmpW, s.bmpH, x, y, s.bmpW, s.bmpH);
        ctx.globalAlpha = 1;
      }
    });
  }
  emu.endPaint(hwnd, hdc);
}

function hitTest(s: TbState, x: number, y: number): number {
  const rects = layout(s);
  return rects.findIndex((r, i) => !(s.buttons[i].fsStyle & T.TBSTYLE_SEP) && x >= r.left && x < r.right && y >= r.top && y < r.bottom);
}

function click(emu: Emulator, hwnd: number, wnd: WindowInfo, s: TbState, i: number): void {
  const b = s.buttons[i];
  if (b.fsStyle & T.TBSTYLE_CHECK) {
    if (b.fsStyle & T.TBSTYLE_GROUP) {
      // Radio group: the contiguous run of group buttons around i
      let a = i, z = i;
      while (a > 0 && s.buttons[a - 1].fsStyle & T.TBSTYLE_GROUP) a--;
      while (z < s.buttons.length - 1 && s.buttons[z + 1].fsStyle & T.TBSTYLE_GROUP) z++;
      for (let k = a; k <= z; k++) s.buttons[k].fsState &= ~T.TBSTATE_CHECKED;
      b.fsState |= T.TBSTATE_CHECKED;
    } else {
      b.fsState ^= T.TBSTATE_CHECKED;
    }
  }
  const target = s.notify || wnd.parent;
  const pw = emu.handles.get<WindowInfo>(target);
  if (pw?.wndProc) emu.callWndProc(pw.wndProc, target, WM_COMMAND, b.idCommand & 0xFFFF, hwnd);
  else if (target) emu.postMessage(target, WM_COMMAND, b.idCommand & 0xFFFF, hwnd);
}

/** TB_AUTOSIZE: height of the button rows; unless CCS_NORESIZE, the width of the parent's client
 *  area at its top (or bottom with CCS_BOTTOM) edge. */
function autoSize(emu: Emulator, wnd: WindowInfo, s: TbState): void {
  const rects = layout(s);
  wnd.height = Math.max(s.btnH, ...rects.map(r => r.bottom)) + T.TB_AUTOSIZE_PAD;
  if (wnd.style & CCS_NORESIZE) return;
  const parent = emu.handles.get<WindowInfo>(wnd.parent);
  if (!parent) return;
  const { cw, ch } = getClientSize(clientStyle(emu, parent), parent.hMenu !== 0, parent.width, parent.height, emu.isNE);
  wnd.width = cw;
  if (!(wnd.style & CCS_NOPARENTALIGN)) { wnd.x = 0; wnd.y = (wnd.style & CCS_BOTTOM) === CCS_BOTTOM ? ch - wnd.height : 0; }
}

function indexOfCommand(s: TbState, id: number): number {
  return s.buttons.findIndex(b => b.idCommand === id);
}

function invalidate(wnd: WindowInfo): void {
  wnd.needsPaint = true;
}

/** Toolbar message handling; null = not a toolbar message (falls through to DefWindowProc). */
export function handleToolbarMessage(emu: Emulator, hwnd: number, wnd: WindowInfo, msg: number, wParam: number, lParam: number): number | null {
  const s = state(wnd);
  const m = emu.memory;
  const byCmd = () => indexOfCommand(s, wParam | 0);
  const setStateBit = (bit: number, on: boolean) => {
    const i = byCmd(); if (i < 0) return 0;
    s.buttons[i].fsState = on ? s.buttons[i].fsState | bit : s.buttons[i].fsState & ~bit;
    invalidate(wnd); return 1;
  };
  switch (msg) {
    case WM_PAINT: paint(emu, hwnd, wnd); return 0;
    case WM_LBUTTONDOWN: case WM_LBUTTONDBLCLK: {
      const i = hitTest(s, (lParam << 16) >> 16, lParam >> 16);
      if (i >= 0 && s.buttons[i].fsState & T.TBSTATE_ENABLED) { s.pressed = i; emu.capturedWindow = hwnd; invalidate(wnd); }
      return 0;
    }
    case WM_MOUSEMOVE: return 0;
    case WM_LBUTTONUP: {
      const i = s.pressed;
      s.pressed = -1;
      if (emu.capturedWindow === hwnd) emu.capturedWindow = 0;
      invalidate(wnd);
      if (i >= 0 && hitTest(s, (lParam << 16) >> 16, lParam >> 16) === i) click(emu, hwnd, wnd, s, i);
      return 0;
    }
    case T.TB_BUTTONSTRUCTSIZE: return 0;
    case T.TB_SETBITMAPSIZE: s.bmpW = lParam & 0xFFFF || s.bmpW; s.bmpH = (lParam >>> 16) || s.bmpH; return 1;
    case T.TB_SETBUTTONSIZE: s.btnW = lParam & 0xFFFF || s.btnW; s.btnH = (lParam >>> 16) || s.btnH; return 1;
    case T.TB_GETBUTTONSIZE: return ((s.btnH & 0xFFFF) << 16) | (s.btnW & 0xFFFF);
    case T.TB_ADDBITMAP: return addBitmap(emu, s, wParam, lParam);
    case T.TB_REPLACEBITMAP: {
      // TBREPLACEBITMAP: hInstOld, nIDOld, hInstNew, nIDNew, nButtons
      if (!lParam) return 0;
      s.images = [];
      const tmp = emu.allocHeap(8);
      m.writeU32(tmp, m.readU32(lParam + 8)); m.writeU32(tmp + 4, m.readU32(lParam + 12));
      addBitmap(emu, s, m.readI32(lParam + 16), tmp);
      invalidate(wnd); return 1;
    }
    case T.TB_ADDBUTTONSA: case T.TB_ADDBUTTONSW:
      for (let k = 0; k < wParam; k++) s.buttons.push(readButton(emu, lParam + k * T.TBBUTTON_SIZE));
      invalidate(wnd); return 1;
    case T.TB_INSERTBUTTONA: case T.TB_INSERTBUTTONW: {
      const at = Math.min(Math.max(wParam | 0, 0), s.buttons.length);
      s.buttons.splice((wParam | 0) < 0 ? s.buttons.length : at, 0, readButton(emu, lParam));
      invalidate(wnd); return 1;
    }
    case T.TB_DELETEBUTTON:
      if (wParam >= s.buttons.length) return 0;
      s.buttons.splice(wParam, 1); invalidate(wnd); return 1;
    case T.TB_GETBUTTON:
      if (wParam >= s.buttons.length || !lParam) return 0;
      writeButton(emu, lParam, s.buttons[wParam]); return 1;
    case T.TB_BUTTONCOUNT: return s.buttons.length;
    case T.TB_COMMANDTOINDEX: return byCmd();
    case T.TB_GETITEMRECT: case T.TB_GETRECT: {
      const i = msg === T.TB_GETRECT ? byCmd() : wParam;
      const r = layout(s)[i];
      if (!r || !lParam) return 0;
      m.writeU32(lParam, r.left); m.writeU32(lParam + 4, r.top); m.writeU32(lParam + 8, r.right); m.writeU32(lParam + 12, r.bottom);
      return 1;
    }
    case T.TB_GETMAXSIZE: {
      const rs = layout(s);
      if (lParam) { m.writeU32(lParam, Math.max(0, ...rs.map(r => r.right))); m.writeU32(lParam + 4, Math.max(s.btnH, ...rs.map(r => r.bottom))); }
      return 1;
    }
    case T.TB_ENABLEBUTTON: return setStateBit(T.TBSTATE_ENABLED, (lParam & 0xFFFF) !== 0);
    case T.TB_CHECKBUTTON: return setStateBit(T.TBSTATE_CHECKED, (lParam & 0xFFFF) !== 0);
    case T.TB_PRESSBUTTON: return setStateBit(T.TBSTATE_PRESSED, (lParam & 0xFFFF) !== 0);
    case T.TB_HIDEBUTTON: return setStateBit(T.TBSTATE_HIDDEN, (lParam & 0xFFFF) !== 0);
    case T.TB_INDETERMINATE: return setStateBit(T.TBSTATE_INDETERMINATE, (lParam & 0xFFFF) !== 0);
    case T.TB_ISBUTTONENABLED: { const i = byCmd(); return i < 0 ? 0 : (s.buttons[i].fsState & T.TBSTATE_ENABLED ? 1 : 0); }
    case T.TB_ISBUTTONCHECKED: { const i = byCmd(); return i < 0 ? 0 : (s.buttons[i].fsState & T.TBSTATE_CHECKED ? 1 : 0); }
    case T.TB_ISBUTTONPRESSED: { const i = byCmd(); return i < 0 ? 0 : (s.buttons[i].fsState & T.TBSTATE_PRESSED ? 1 : 0); }
    case T.TB_ISBUTTONHIDDEN: { const i = byCmd(); return i < 0 ? 0 : (s.buttons[i].fsState & T.TBSTATE_HIDDEN ? 1 : 0); }
    case T.TB_GETSTATE: { const i = byCmd(); return i < 0 ? 0xFFFFFFFF : s.buttons[i].fsState; }
    case T.TB_SETSTATE: { const i = byCmd(); if (i < 0) return 0; s.buttons[i].fsState = lParam & 0xFF; invalidate(wnd); return 1; }
    case T.TB_CHANGEBITMAP: { const i = byCmd(); if (i < 0) return 0; s.buttons[i].iBitmap = lParam | 0; invalidate(wnd); return 1; }
    case T.TB_GETBITMAP: { const i = byCmd(); return i < 0 ? 0 : s.buttons[i].iBitmap; }
    case T.TB_SETCMDID: if (wParam >= s.buttons.length) return 0; s.buttons[wParam].idCommand = lParam | 0; return 1;
    case T.TB_GETBUTTONINFOA: case T.TB_GETBUTTONINFOW: case T.TB_SETBUTTONINFOA: case T.TB_SETBUTTONINFOW: {
      if (!lParam) return 0xFFFFFFFF;
      const mask = m.readU32(lParam + 4);
      const i = mask & T.TBIF_BYINDEX ? wParam : byCmd();
      const b = s.buttons[i];
      if (!b) return 0xFFFFFFFF;
      const set = msg === T.TB_SETBUTTONINFOA || msg === T.TB_SETBUTTONINFOW;
      if (set) {
        if (mask & T.TBIF_COMMAND) b.idCommand = m.readI32(lParam + 8);
        if (mask & T.TBIF_IMAGE) b.iBitmap = m.readI32(lParam + 12);
        if (mask & T.TBIF_STATE) b.fsState = m.readU8(lParam + 16);
        if (mask & T.TBIF_STYLE) b.fsStyle = m.readU8(lParam + 17);
        if (mask & T.TBIF_SIZE && b.fsStyle & T.TBSTYLE_SEP) b.iBitmap = m.readU16(lParam + 18);
        if (mask & T.TBIF_LPARAM) b.dwData = m.readU32(lParam + 20);
        invalidate(wnd); return 1;
      }
      if (mask & T.TBIF_COMMAND) m.writeU32(lParam + 8, b.idCommand >>> 0);
      if (mask & T.TBIF_IMAGE) m.writeU32(lParam + 12, b.iBitmap >>> 0);
      if (mask & T.TBIF_STATE) m.writeU8(lParam + 16, b.fsState);
      if (mask & T.TBIF_STYLE) m.writeU8(lParam + 17, b.fsStyle);
      if (mask & T.TBIF_SIZE) { const r = layout(s)[i]; m.writeU16(lParam + 18, r.right - r.left); }
      if (mask & T.TBIF_LPARAM) m.writeU32(lParam + 20, b.dwData);
      return i;
    }
    case T.TB_ADDSTRINGA: case T.TB_ADDSTRINGW: {
      if (!lParam || wParam) return s.strings.length; // resource strings are not loaded
      const first = s.strings.length;
      const wide = msg === T.TB_ADDSTRINGW;
      let p = lParam;
      for (;;) {
        const str = wide ? m.readUTF16String(p) : m.readCString(p);
        if (!str) break;
        s.strings.push(str);
        p += (str.length + 1) * (wide ? 2 : 1);
      }
      return first;
    }
    case T.TB_HITTEST: return lParam ? hitTest(s, m.readI32(lParam), m.readI32(lParam + 4)) : -1;
    case T.TB_SETPARENT: { const old = s.notify || wnd.parent; s.notify = wParam; return old; }
    case T.TB_SETINDENT: s.indent = wParam | 0; invalidate(wnd); return 1;
    case T.TB_SETIMAGELIST: { const old = s.imageList; s.imageList = lParam; return old; }
    case T.TB_GETIMAGELIST: return s.imageList;
    case T.TB_GETROWS: return 1 + s.buttons.filter(b => b.fsState & T.TBSTATE_WRAP).length;
    case T.TB_GETTOOLTIPS: case T.TB_GETHOTITEM: return msg === T.TB_GETHOTITEM ? 0xFFFFFFFF : 0;
    case T.TB_SETTOOLTIPS: case T.TB_SETROWS: case T.TB_SETMAXTEXTROWS: case T.TB_SETBUTTONWIDTH:
    case T.TB_SETHOTITEM: case T.TB_SETPADDING: case T.TB_GETPADDING: return 0;
    case T.TB_SETSTYLE: wnd.style = (wnd.style & 0xFFFF0000) | (lParam & 0xFFFF); return 0;
    case T.TB_GETSTYLE: return wnd.style & 0xFFFF;
    case T.TB_SETEXTENDEDSTYLE: { const old = s.exStyle; s.exStyle = lParam >>> 0; return old; }
    case T.TB_GETEXTENDEDSTYLE: return s.exStyle;
    case T.TB_AUTOSIZE: autoSize(emu, wnd, s); invalidate(wnd); return 0;
    default: return null;
  }
}
