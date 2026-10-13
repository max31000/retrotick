// TextOut / ExtTextOut (A and W) with text alignment, opaque background and clipping,
// plus SetTextAlign/GetTextAlign and GetTextExtentPoint32W.
import type { Emulator } from '../../emulator';
import { fillTextBitmap } from '../../emu-render';
import { OPAQUE } from '../types';
import { colorToCSS, getDCFont } from './_helpers';
import { applyFont, fontPixelSize, measureTextWidth } from '../../../gdi';
import {
  TA_UPDATECP, TA_RIGHT, TA_CENTER, TA_BOTTOM, TA_BASELINE, TA_HORZ_MASK, TA_VERT_MASK,
  ETO_OPAQUE, ETO_CLIPPED, GDI_ERROR,
} from '../constants-ctl';

/** Cell height (tmHeight) reported for the DC's font — shared with GetTextMetrics. */
export function fontCellHeight(emu: Emulator, hdc: number): number {
  const f = getDCFont(emu, hdc);
  const px = fontPixelSize(f);
  return f.height < 0 ? Math.round(px * 1.2) : px;
}

/** Ascent consistent with GetTextMetrics (tmAscent = 80 % of the cell). */
export function fontAscent(emu: Emulator, hdc: number): number {
  return Math.round(fontCellHeight(emu, hdc) * 0.8);
}

interface Rect { left: number; top: number; right: number; bottom: number }

function readRect(emu: Emulator, p: number): Rect | null {
  if (!p) return null;
  return {
    left: emu.memory.readI32(p), top: emu.memory.readI32(p + 4),
    right: emu.memory.readI32(p + 8), bottom: emu.memory.readI32(p + 12),
  };
}

/** Core of ExtTextOut: draws `text` honoring DC text alignment, background mode,
 *  ETO_OPAQUE/ETO_CLIPPED and TA_UPDATECP. */
export function extTextOut(emu: Emulator, hdc: number, x: number, y: number, options: number, rect: Rect | null, text: string): boolean {
  const dc = emu.getDC(hdc);
  if (!dc) return false;
  const ctx = dc.ctx;
  const align = dc.textAlign ?? 0;
  if (align & TA_UPDATECP) { x = dc.penPosX; y = dc.penPosY; }

  const font = getDCFont(emu, hdc);
  const width = text ? measureTextWidth(ctx, font, text) : 0;
  const height = fontCellHeight(emu, hdc);
  const ascent = fontAscent(emu, hdc);

  let left = x;
  const h = align & TA_HORZ_MASK;
  if (h === TA_CENTER) left = x - Math.floor(width / 2);
  else if (h === TA_RIGHT) left = x - width;
  let top = y;
  const v = align & TA_VERT_MASK;
  if (v === TA_BASELINE) top = y - ascent;
  else if (v === TA_BOTTOM) top = y - height;

  const clipped = !!(options & ETO_CLIPPED) && rect;
  if (clipped) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    ctx.clip();
  }
  if ((options & ETO_OPAQUE) && rect) {
    ctx.fillStyle = colorToCSS(dc.bkColor);
    ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  }
  if (text) {
    applyFont(ctx, font);
    if (dc.bkMode === OPAQUE && !(options & ETO_OPAQUE)) {
      ctx.fillStyle = colorToCSS(dc.bkColor);
      ctx.fillRect(left, top, width, height);
    }
    ctx.fillStyle = colorToCSS(dc.textColor);
    ctx.textBaseline = 'top';
    fillTextBitmap(ctx, text, left, top);
  }
  if (clipped) ctx.restore();

  if (align & TA_UPDATECP) {
    if (h === TA_RIGHT) dc.penPosX = x - width;
    else if (h !== TA_CENTER) dc.penPosX = x + width;
  }
  emu.syncDCToCanvas(hdc);
  return true;
}

export function registerTextOut(emu: Emulator): void {
  const gdi32 = emu.registerDll('GDI32.DLL');
  const readW = (p: number, n: number): string => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(emu.memory.readU16(p + i * 2));
    return s;
  };
  const readA = (p: number, n: number): string => (p && n > 0 ? emu.memory.readBytesMBCS(p, n) : '');

  // TextOut(hdc, x, y, lpString, c)
  gdi32.register('TextOutA', 5, () =>
    extTextOut(emu, emu.readArg(0), emu.readArg(1) | 0, emu.readArg(2) | 0, 0, null, readA(emu.readArg(3), emu.readArg(4) | 0)) ? 1 : 0);
  gdi32.register('TextOutW', 5, () => {
    const p = emu.readArg(3), n = emu.readArg(4) | 0;
    return extTextOut(emu, emu.readArg(0), emu.readArg(1) | 0, emu.readArg(2) | 0, 0, null, p && n > 0 ? readW(p, n) : '') ? 1 : 0;
  });

  // ExtTextOut(hdc, x, y, options, lprect, lpString, c, lpDx)
  gdi32.register('ExtTextOutA', 8, () =>
    extTextOut(emu, emu.readArg(0), emu.readArg(1) | 0, emu.readArg(2) | 0, emu.readArg(3),
      readRect(emu, emu.readArg(4)), readA(emu.readArg(5), emu.readArg(6) | 0)) ? 1 : 0);
  gdi32.register('ExtTextOutW', 8, () => {
    const p = emu.readArg(5), n = emu.readArg(6) | 0;
    return extTextOut(emu, emu.readArg(0), emu.readArg(1) | 0, emu.readArg(2) | 0, emu.readArg(3),
      readRect(emu, emu.readArg(4)), p && n > 0 ? readW(p, n) : '') ? 1 : 0;
  });

  gdi32.register('SetTextAlign', 2, () => {
    const dc = emu.getDC(emu.readArg(0));
    if (!dc) return GDI_ERROR;
    const prev = dc.textAlign ?? 0;
    dc.textAlign = emu.readArg(1);
    return prev;
  });
  gdi32.register('GetTextAlign', 1, () => {
    const dc = emu.getDC(emu.readArg(0));
    return dc ? (dc.textAlign ?? 0) : GDI_ERROR;
  });

  // GetTextExtentPoint32W(hdc, lpString, c, lpSize)
  gdi32.register('GetTextExtentPoint32W', 4, () => {
    const hdc = emu.readArg(0), p = emu.readArg(1), n = emu.readArg(2) | 0, sizePtr = emu.readArg(3);
    if (!sizePtr) return 0;
    const dc = emu.getDC(hdc);
    const text = p && n > 0 ? readW(p, n) : '';
    const h = fontCellHeight(emu, hdc);
    const w = dc ? measureTextWidth(dc.ctx, getDCFont(emu, hdc), text) : n * Math.ceil(h * 0.6);
    emu.memory.writeU32(sizePtr, w);
    emu.memory.writeU32(sizePtr + 4, h);
    return 1;
  });
}
