// Brush pixel sources: solid colours, hatch brushes and pattern (bitmap) brushes.
// A pattern is aligned to the DC origin (brush origin 0,0), like GDI on a fresh DC.
import type { Emulator } from '../../emulator';
import type { BrushInfo, DCInfo, PaletteInfo } from './types';
import { resolveColor } from './_helpers';
import { TRANSPARENT } from '../types';
import {
  BS_SOLID, BS_HATCHED, BS_PATTERN, HS_HORIZONTAL, HS_VERTICAL, HS_FDIAGONAL, HS_BDIAGONAL, HS_CROSS,
  HS_DIAGCROSS, HATCH_SIZE,
} from '../constants-gdi';

/** 0x00RRGGBB pixel values (canvas byte order packed as r | g<<8 | b<<16 like COLORREF). */
export interface BrushPixels {
  w: number;
  h: number;
  /** COLORREF per pattern pixel; -1 = transparent (hatch background in TRANSPARENT mode) */
  px: Int32Array;
}

export function colorRefOf(emu: Emulator, dc: DCInfo, color: number): number {
  const pal = emu.handles.get<PaletteInfo>(dc.selectedPalette) ?? undefined;
  const [r, g, b] = resolveColor(color, pal);
  return r | (g << 8) | (b << 16);
}

function hatchBit(style: number, x: number, y: number): boolean {
  switch (style) {
    case HS_HORIZONTAL: return y === HATCH_SIZE / 2 - 1;
    case HS_VERTICAL: return x === HATCH_SIZE / 2;
    case HS_FDIAGONAL: return x === y;
    case HS_BDIAGONAL: return x + y === HATCH_SIZE - 1;
    case HS_CROSS: return x === HATCH_SIZE / 2 || y === HATCH_SIZE / 2 - 1;
    case HS_DIAGCROSS: return x === y || x + y === HATCH_SIZE - 1;
    default: return false;
  }
}

/**
 * Pixels of a brush as used on `dc`, or null for a null brush. Monochrome pattern
 * brushes take the DC text colour for 0 bits and the background colour for 1 bits.
 */
export function brushPixels(emu: Emulator, dc: DCInfo, brush: BrushInfo | null): BrushPixels | null {
  if (!brush || brush.isNull) return null;
  if (brush.style === BS_HATCHED && brush.hatch !== undefined) {
    const fg = colorRefOf(emu, dc, brush.color);
    const bg = dc.bkMode === TRANSPARENT ? -1 : colorRefOf(emu, dc, dc.bkColor);
    const px = new Int32Array(HATCH_SIZE * HATCH_SIZE);
    for (let y = 0; y < HATCH_SIZE; y++) {
      for (let x = 0; x < HATCH_SIZE; x++) px[y * HATCH_SIZE + x] = hatchBit(brush.hatch, x, y) ? fg : bg;
    }
    return { w: HATCH_SIZE, h: HATCH_SIZE, px };
  }
  if (brush.style === BS_PATTERN && brush.patternBitmap) {
    const c = brush.patternBitmap;
    const w = c.width, h = c.height;
    const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const d = ctx.getImageData(0, 0, w, h).data;
    const px = new Int32Array(w * h);
    const fg = colorRefOf(emu, dc, dc.textColor), bg = colorRefOf(emu, dc, dc.bkColor);
    for (let i = 0; i < w * h; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (brush.patternMono) px[i] = r + g + b >= 128 * 3 ? bg : fg;
      else px[i] = r | (g << 8) | (b << 16);
    }
    return { w, h, px };
  }
  const px = new Int32Array(1);
  px[0] = colorRefOf(emu, dc, brush.color);
  return { w: 1, h: 1, px };
}

/** Pattern pixel at DC coordinates (x, y). */
export function patternAt(p: BrushPixels, x: number, y: number): number {
  if (p.w === 1 && p.h === 1) return p.px[0];
  const px = ((x % p.w) + p.w) % p.w, py = ((y % p.h) + p.h) % p.h;
  return p.px[py * p.w + px];
}

/** True for brushes that are not a single solid colour. */
export function isPatternBrush(brush: BrushInfo | null): boolean {
  return !!brush && !brush.isNull && ((brush.style === BS_HATCHED && brush.hatch !== undefined) ||
    (brush.style === BS_PATTERN && !!brush.patternBitmap));
}

/** Canvas fill style for a brush (CSS colour or a repeating pattern aligned to the DC origin). */
export function brushFillStyle(emu: Emulator, dc: DCInfo, brush: BrushInfo): string | CanvasPattern {
  if (!isPatternBrush(brush) || brush.style === BS_SOLID) {
    const c = colorRefOf(emu, dc, brush.color);
    return `rgb(${c & 0xFF},${(c >> 8) & 0xFF},${(c >> 16) & 0xFF})`;
  }
  const p = brushPixels(emu, dc, brush)!;
  const tile = new OffscreenCanvas(p.w, p.h);
  const tctx = tile.getContext('2d')!;
  const img = tctx.createImageData(p.w, p.h);
  for (let i = 0; i < p.px.length; i++) {
    const c = p.px[i];
    if (c < 0) continue; // transparent
    img.data[i * 4] = c & 0xFF; img.data[i * 4 + 1] = (c >> 8) & 0xFF; img.data[i * 4 + 2] = (c >> 16) & 0xFF;
    img.data[i * 4 + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  return dc.ctx.createPattern(tile, 'repeat') ?? 'rgb(0,0,0)';
}
