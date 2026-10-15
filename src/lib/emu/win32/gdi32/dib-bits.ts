// GetDIBits: device-independent copy of a bitmap's pixels (bottom-up unless biHeight < 0).
import type { Emulator } from '../../emulator';
import type { BitmapInfo, DCInfo } from './types';
import { BI_RGB, DIB_RGB_COLORS } from '../types';
import { BITMAPINFOHEADER_SIZE, SCREEN_BPP, HALFTONE_LEVELS } from '../constants-gdi';

/** Current pixels of a bitmap: the working canvas of a memory DC it is selected into, if any. */
function bitmapPixels(emu: Emulator, hbm: number, bmp: BitmapInfo): Uint8ClampedArray {
  for (const [, dc] of emu.handles.findByType<DCInfo>('dc')) {
    if (dc.selectedBitmap === hbm && dc.canvas.width === bmp.width && dc.canvas.height === bmp.height) {
      return (dc.ctx as OffscreenCanvasRenderingContext2D).getImageData(0, 0, bmp.width, bmp.height).data;
    }
  }
  return bmp.ctx.getImageData(0, 0, bmp.width, bmp.height).data;
}

const stride = (w: number, bpp: number) => (((w * bpp + 31) >> 5) << 2);

/** Colour table for an indexed DIB: black/white for 1 bpp, a 6x6x6 cube + greys for 4/8 bpp. */
function colorTable(bpp: number): [number, number, number][] {
  if (bpp === 1) return [[0, 0, 0], [255, 255, 255]];
  if (bpp === 4) {
    return [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
      [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
  }
  const t: [number, number, number][] = [];
  const step = 255 / (HALFTONE_LEVELS - 1);
  for (let r = 0; r < HALFTONE_LEVELS; r++) for (let g = 0; g < HALFTONE_LEVELS; g++) for (let b = 0; b < HALFTONE_LEVELS; b++) {
    t.push([Math.round(r * step), Math.round(g * step), Math.round(b * step)]);
  }
  while (t.length < 256) { const v = Math.round((t.length - 216) * 255 / 39); t.push([v, v, v]); }
  return t;
}

function nearest(table: [number, number, number][], r: number, g: number, b: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < table.length; i++) {
    const [tr, tg, tb] = table[i];
    const d = (tr - r) ** 2 + (tg - g) ** 2 + (tb - b) ** 2;
    if (d < bd) { bd = d; best = i; if (d === 0) break; }
  }
  return best;
}

export function registerDibBits(emu: Emulator): void {
  const gdi32 = emu.registerDll('GDI32.DLL');

  // GetDIBits(hdc, hbm, uStartScan, cScanLines, lpvBits, lpbmi, uUsage) → scan lines copied
  gdi32.register('GetDIBits', 7, () => {
    const hbm = emu.readArg(1);
    const start = emu.readArg(2), lines = emu.readArg(3), bits = emu.readArg(4), bmi = emu.readArg(5);
    const bmp = emu.handles.get<BitmapInfo>(hbm);
    const m = emu.memory;
    if (!bmp || !bmi) return 0;
    let bpp = m.readU16(bmi + 14);
    if (!bits && bpp === 0) {
      // Fill in the header only
      bpp = bmp.monochrome ? 1 : SCREEN_BPP;
      m.writeU32(bmi, BITMAPINFOHEADER_SIZE);
      m.writeU32(bmi + 4, bmp.width); m.writeU32(bmi + 8, bmp.height);
      m.writeU16(bmi + 12, 1); m.writeU16(bmi + 14, bpp);
      m.writeU32(bmi + 16, BI_RGB); m.writeU32(bmi + 20, stride(bmp.width, bpp) * bmp.height);
      for (let o = 24; o < BITMAPINFOHEADER_SIZE; o += 4) m.writeU32(bmi + o, 0);
      return 1;
    }
    const width = Math.abs(m.readI32(bmi + 4)) || bmp.width;
    const height = m.readI32(bmi + 8) || bmp.height;
    const topDown = height < 0;
    const absH = Math.abs(height);
    if (m.readU32(bmi + 16) !== BI_RGB || ![1, 4, 8, 16, 24, 32].includes(bpp)) return 0;
    const st = stride(width, bpp);
    m.writeU32(bmi + 20, st * absH);
    const table = bpp <= 8 ? colorTable(bpp) : null;
    if (table && emu.readArg(6) === DIB_RGB_COLORS) {
      const hs = m.readU32(bmi) || BITMAPINFOHEADER_SIZE;
      table.forEach(([r, g, b], i) => m.writeU32(bmi + hs + i * 4, (r << 16) | (g << 8) | b));
    }
    if (!bits) return absH;
    const px = bitmapPixels(emu, hbm, bmp);
    const count = Math.max(0, Math.min(lines, absH - start));
    const cache = new Map<number, number>();
    for (let row = 0; row < count; row++) {
      const scan = start + row;                       // DIB scan line (0 = bottom unless top-down)
      const y = topDown ? scan : absH - 1 - scan;     // bitmap row
      const out = bits + row * st;
      for (let i = 0; i < st; i++) m.writeU8(out + i, 0);
      if (y < 0 || y >= bmp.height) continue;
      for (let x = 0; x < Math.min(width, bmp.width); x++) {
        const i = (y * bmp.width + x) * 4;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        if (bpp === 32) { m.writeU8(out + x * 4, b); m.writeU8(out + x * 4 + 1, g); m.writeU8(out + x * 4 + 2, r); }
        else if (bpp === 24) { m.writeU8(out + x * 3, b); m.writeU8(out + x * 3 + 1, g); m.writeU8(out + x * 3 + 2, r); }
        else if (bpp === 16) m.writeU16(out + x * 2, ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
        else {
          const key = (r << 16) | (g << 8) | b;
          let idx = cache.get(key);
          if (idx === undefined) { idx = bpp === 1 ? (r + g + b >= 384 ? 1 : 0) : nearest(table!, r, g, b); cache.set(key, idx); }
          const bitPos = x * bpp, o = out + (bitPos >> 3), shift = 8 - bpp - (bitPos & 7);
          m.writeU8(o, m.readU8(o) | (idx << shift));
        }
      }
    }
    return count;
  });
}
