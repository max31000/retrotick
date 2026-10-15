// Edit control painting into a caller-supplied DC (WM_PAINT with wParam = HDC, WM_PRINTCLIENT).
// Built-in edits are DOM inputs on screen; programs that render an edit into their own DC
// (e.g. to merge typed text into a bitmap) get the text drawn with GDI here.
import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import type { BrushInfo } from '../gdi32/types';
import { getClientSize } from './_helpers';
import { extTextOut, fontCellHeight } from '../gdi32/text-out';
import { brushFillStyle } from '../gdi32/pattern';
import { getDCFont } from '../gdi32/_helpers';
import { measureTextWidth } from '../../../gdi';
import { WM_CTLCOLOREDIT, WM_CTLCOLORSTATIC, SYS_COLORS } from '../types';
import { ES_MULTILINE, ES_AUTOHSCROLL, ES_READONLY, ES_CENTER, ES_RIGHT, EDIT_MARGIN, COLOR_MAX_SYSBRUSH } from '../constants-ctl';

/** Split into display lines: hard breaks, then word wrap at `width` for wrapping multi-line edits. */
function layoutLines(text: string, wrap: boolean, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r\n|\r|\n/)) {
    if (!wrap || measure(para) <= width) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(/(?<=\s)/)) {
      if (line && measure(line + word) > width) { out.push(line.trimEnd()); line = ''; }
      let w = word;
      // A word longer than the line is broken between characters
      while (!line && w.length > 1 && measure(w) > width) {
        let n = w.length;
        while (n > 1 && measure(w.slice(0, n)) > width) n--;
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      line += w;
    }
    out.push(line);
  }
  return out;
}

export function paintEditInto(emu: Emulator, hwnd: number, wnd: WindowInfo, hdc: number): void {
  const dc = emu.getDC(hdc);
  if (!dc) return;
  const { cw, ch } = getClientSize(wnd.style, false, wnd.width, wnd.height, emu.isNE);
  // The parent chooses colours (and the background brush) through WM_CTLCOLOREDIT/STATIC
  const parent = emu.handles.get<WindowInfo>(wnd.parent);
  const msg = wnd.style & ES_READONLY ? WM_CTLCOLORSTATIC : WM_CTLCOLOREDIT;
  const hbr = parent?.wndProc ? (emu.callWndProc(parent.wndProc, wnd.parent, msg, hdc, hwnd) ?? 0) : 0;
  const brush = hbr > 0 && hbr <= COLOR_MAX_SYSBRUSH ? { color: SYS_COLORS[hbr - 1], isNull: false } as BrushInfo : emu.getBrush(hbr);
  if (brush && !brush.isNull) {
    dc.ctx.fillStyle = brushFillStyle(emu, dc, brush);
    dc.ctx.fillRect(0, 0, cw, ch);
  }
  const savedFont = dc.selectedFont, savedAlign = dc.textAlign;
  if (wnd.hFont) dc.selectedFont = wnd.hFont;
  dc.textAlign = 0;
  const font = getDCFont(emu, hdc);
  const measure = (s: string) => measureTextWidth(dc.ctx, font, s);
  const wrap = !!(wnd.style & ES_MULTILINE) && !(wnd.style & ES_AUTOHSCROLL);
  const lines = layoutLines(wnd.title || '', wrap, cw - 2 * EDIT_MARGIN, measure);
  const lh = fontCellHeight(emu, hdc);
  lines.forEach((line, i) => {
    let x = EDIT_MARGIN;
    if (wnd.style & ES_CENTER) x = Math.floor((cw - measure(line)) / 2);
    else if (wnd.style & ES_RIGHT) x = cw - EDIT_MARGIN - measure(line);
    if (line) extTextOut(emu, hdc, x, i * lh, 0, null, line);
  });
  dc.selectedFont = savedFont;
  dc.textAlign = savedAlign;
  emu.syncDCToCanvas(hdc);
}
