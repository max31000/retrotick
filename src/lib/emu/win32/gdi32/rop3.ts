// Generic ternary raster operations (BitBlt / PatBlt): the ROP3 index byte is a truth
// table over pattern (bit 2), source (bit 1) and destination (bit 0), applied bitwise.
import type { Emulator } from '../../emulator';
import type { DCInfo, BrushInfo } from './types';
import { brushPixels, patternAt } from './pattern';
import { blitImageData } from './scratch';

/** ROP3 truth-table byte of a raster operation code. */
export const rop3Index = (rop: number): number => (rop >>> 16) & 0xFF;
/** Whether the operation reads the source / the pattern. */
export const ropUsesSource = (rop: number): boolean => ((rop3Index(rop) >> 2) ^ rop3Index(rop)) & 0x33 ? true : false;
export const ropUsesPattern = (rop: number): boolean => ((rop3Index(rop) >> 4) ^ rop3Index(rop)) & 0x0F ? true : false;

export function rop3Apply(idx: number, p: number, s: number, d: number): number {
  let r = 0;
  for (let k = 0; k < 8; k++) {
    if (!(idx & (1 << k))) continue;
    r |= ((k & 4) ? p : ~p) & ((k & 2) ? s : ~s) & ((k & 1) ? d : ~d);
  }
  return r & 0xFFFFFF;
}

/**
 * Apply `rop` to a w x h block of `dc` at (x, y) in DC coordinates. `src` holds source pixels
 * already converted to the destination format (or null when the ROP ignores the source).
 */
export function bltRop3(emu: Emulator, dc: DCInfo, x: number, y: number, w: number, h: number,
  rop: number, src: Uint8ClampedArray | null, brush: BrushInfo | null): void {
  const idx = rop3Index(rop);
  const tf = dc.ctx.getTransform();
  const ox = Math.round(tf.e), oy = Math.round(tf.f);
  const dst = dc.ctx.getImageData(x + ox, y + oy, w, h);
  const d = dst.data;
  const pat = ropUsesPattern(rop) ? brushPixels(emu, dc, brush) : null;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4;
      const dv = d[o] | (d[o + 1] << 8) | (d[o + 2] << 16);
      const sv = src ? (src[o] | (src[o + 1] << 8) | (src[o + 2] << 16)) : 0;
      let pv = pat ? patternAt(pat, x + i, y + j) : 0;
      if (pv < 0) pv = dv; // transparent hatch background leaves the destination
      const v = rop3Apply(idx, pv, sv, dv);
      d[o] = v & 0xFF; d[o + 1] = (v >> 8) & 0xFF; d[o + 2] = (v >> 16) & 0xFF; d[o + 3] = 255;
    }
  }
  blitImageData(dc, dst, x, y);
}
