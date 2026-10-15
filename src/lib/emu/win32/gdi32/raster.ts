// Pixel-exact GDI rasterization: shapes become pixel masks that are combined with the
// destination through the DC's binary raster operation (SetROP2), like GDI does.
// Canvas paths would anti-alias and ignore ROP2 (XOR rubber bands could not be undone).
import type { Emulator } from '../../emulator';
import type { DCInfo, PenInfo, BrushInfo } from './types';
import { PS_NULL } from '../types';
import { PS_STYLE_MASK, PS_INSIDEFRAME, R2_NOP, R2_COPYPEN } from '../constants-gdi';
import { blitImageData } from './scratch';
import { brushPixels, patternAt, colorRefOf, type BrushPixels } from './pattern';

/** Bounding-box pixel mask in DC coordinates. */
export class Mask {
  readonly bits: Uint8Array;
  constructor(readonly x: number, readonly y: number, readonly w: number, readonly h: number) {
    this.bits = new Uint8Array(Math.max(0, w * h));
  }
  set(x: number, y: number): void {
    const lx = x - this.x, ly = y - this.y;
    if (lx >= 0 && ly >= 0 && lx < this.w && ly < this.h) this.bits[ly * this.w + lx] = 1;
  }
  span(y: number, x0: number, x1: number): void {
    const ly = y - this.y;
    if (ly < 0 || ly >= this.h) return;
    const a = Math.max(0, x0 - this.x), b = Math.min(this.w, x1 - this.x);
    if (b > a) this.bits.fill(1, ly * this.w + a, ly * this.w + b);
  }
  get(x: number, y: number): boolean {
    const lx = x - this.x, ly = y - this.y;
    return lx >= 0 && ly >= 0 && lx < this.w && ly < this.h && this.bits[ly * this.w + lx] === 1;
  }
  /** Remove every pixel set in `other`. */
  subtract(other: Mask): void {
    for (let ly = 0; ly < this.h; ly++) {
      for (let lx = 0; lx < this.w; lx++) {
        const i = ly * this.w + lx;
        if (this.bits[i] && other.get(lx + this.x, ly + this.y)) this.bits[i] = 0;
      }
    }
  }
}

/** Binary raster operation on 0x00BBGGRR values (R2_* codes 1..16). */
export function rop2Apply(rop2: number, pen: number, dst: number): number {
  const t = (rop2 - 1) & 0xF;
  let r = 0;
  if (t & 1) r |= ~pen & ~dst;
  if (t & 2) r |= ~pen & dst;
  if (t & 4) r |= pen & ~dst;
  if (t & 8) r |= pen & dst;
  return r & 0xFFFFFF;
}

// ---- shapes -------------------------------------------------------------------------

/** Filled ellipse inscribed in [l, r) x [t, b) as spans. */
export function ellipseSpans(m: Mask, l: number, t: number, r: number, b: number): void {
  if (r <= l || b <= t) return;
  const cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2;
  for (let y = t; y < b; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const q = 1 - dy * dy;
    if (q < 0) continue;
    const hw = rx * Math.sqrt(q);
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    if (x1 > x0) m.span(y, x0, x1);
  }
}

/** Filled rounded rectangle [l, r) x [t, b) with corner ellipse ew x eh. */
export function roundRectSpans(m: Mask, l: number, t: number, r: number, b: number, ew: number, eh: number): void {
  const rx = Math.min(Math.abs(ew), r - l) / 2, ry = Math.min(Math.abs(eh), b - t) / 2;
  for (let y = t; y < b; y++) {
    let inset = 0;
    const yc = y + 0.5;
    const dyTop = t + ry - yc, dyBot = yc - (b - ry);
    const dy = dyTop > 0 ? dyTop : dyBot > 0 ? dyBot : 0;
    if (dy > 0 && ry > 0) {
      const q = 1 - (dy / ry) * (dy / ry);
      inset = q <= 0 ? rx : rx - rx * Math.sqrt(q);
    }
    const x0 = Math.round(l + inset), x1 = Math.round(r - inset);
    if (x1 > x0) m.span(y, x0, x1);
  }
}

/** Polygon interior (pixel centres), ALTERNATE (even-odd) or WINDING fill. */
export function polygonSpans(m: Mask, pts: [number, number][], winding: boolean): void {
  if (pts.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
    const yc = y + 0.5;
    const xs: { x: number; d: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) {
        xs.push({ x: x0 + (yc - y0) * (x1 - x0) / (y1 - y0), d: y1 > y0 ? 1 : -1 });
      }
    }
    xs.sort((a, c) => a.x - c.x);
    let wind = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      wind += xs[i].d;
      const inside = winding ? wind !== 0 : (i % 2) === 0;
      if (inside) m.span(y, Math.round(xs[i].x), Math.round(xs[i + 1].x));
    }
  }
}

/** Thin (1-pixel) line; the end point is excluded like LineTo. */
export function thinLine(m: Mask, x0: number, y0: number, x1: number, y1: number, includeLast: boolean): void {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (x0 === x1 && y0 === y1) { if (includeLast) m.set(x0, y0); break; }
    m.set(x0, y0);
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

/** Wide geometric line: a round pen of diameter `width` swept along the segment. */
export function wideLine(m: Mask, x0: number, y0: number, x1: number, y1: number, width: number): void {
  const r = width / 2;
  const stamp = (cx: number, cy: number) => {
    for (let y = Math.floor(cy - r + 0.5); y < cy + r; y++) {
      const dy = y + 0.5 - (cy + 0.5);
      const q = r * r - dy * dy;
      if (q < 0) continue;
      const hw = Math.sqrt(q);
      m.span(y, Math.round(cx + 0.5 - hw), Math.round(cx + 0.5 + hw));
    }
  };
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    stamp(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

/** Polyline outline with the pen's width (closed when `close`). */
export function penPath(m: Mask, pts: [number, number][], width: number, close: boolean): void {
  const n = pts.length;
  const segs = close ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    if (width <= 1) thinLine(m, ax, ay, bx, by, false);
    else wideLine(m, ax, ay, bx, by, width);
  }
}

// ---- painting -----------------------------------------------------------------------

export function penWidth(pen: PenInfo | null): number {
  return pen ? Math.max(1, pen.width | 0) : 1;
}

export function penVisible(pen: PenInfo | null): pen is PenInfo {
  return !!pen && (pen.style & PS_STYLE_MASK) !== PS_NULL;
}

export function isInsideFrame(pen: PenInfo | null): boolean {
  return !!pen && (pen.style & PS_STYLE_MASK) === PS_INSIDEFRAME;
}

type Source = { solid: number } | { pattern: BrushPixels };

/** Combine the masked pixels with the destination through the DC's ROP2. */
export function paintMask(emu: Emulator, dc: DCInfo, m: Mask, src: Source): void {
  if (m.w <= 0 || m.h <= 0 || dc.rop2 === R2_NOP) return;
  const rop2 = dc.rop2 || R2_COPYPEN;
  // Fast path: a solid colour copied as is needs no read-back — fill the mask's row runs
  if (rop2 === R2_COPYPEN && 'solid' in src && src.solid >= 0) {
    dc.ctx.fillStyle = `rgb(${src.solid & 0xFF},${(src.solid >> 8) & 0xFF},${(src.solid >> 16) & 0xFF})`;
    for (let ly = 0; ly < m.h; ly++) {
      const row = ly * m.w;
      for (let lx = 0; lx < m.w; lx++) {
        if (!m.bits[row + lx]) continue;
        let end = lx + 1;
        while (end < m.w && m.bits[row + end]) end++;
        dc.ctx.fillRect(m.x + lx, m.y + ly, end - lx, 1);
        lx = end;
      }
    }
    return;
  }
  const tf = dc.ctx.getTransform();
  const ox = Math.round(tf.e), oy = Math.round(tf.f);
  const cw = dc.canvas.width, ch = dc.canvas.height;
  // Clamp the box to the canvas (device coordinates)
  const x0 = Math.max(m.x, -ox), y0 = Math.max(m.y, -oy);
  const x1 = Math.min(m.x + m.w, cw - ox), y1 = Math.min(m.y + m.h, ch - oy);
  if (x1 <= x0 || y1 <= y0) return;
  const w = x1 - x0, h = y1 - y0;
  const img = dc.ctx.getImageData(x0 + ox, y0 + oy, w, h);
  const d = img.data;
  let any = false;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = ((y - y0) * w + (x - x0)) * 4;
      const c = m.bits[(y - m.y) * m.w + (x - m.x)] ? ('solid' in src ? src.solid : patternAt(src.pattern, x, y)) : -1;
      // Untouched pixels become fully transparent so drawing the block back leaves them alone
      // (re-drawing a partially transparent pixel onto itself would change it)
      if (c < 0) { d[i + 3] = 0; continue; }
      const dst = d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
      const v = rop2Apply(rop2, c, dst);
      d[i] = v & 0xFF; d[i + 1] = (v >> 8) & 0xFF; d[i + 2] = (v >> 16) & 0xFF; d[i + 3] = 255;
      any = true;
    }
  }
  if (any) blitImageData(dc, img, x0, y0);
}

/** Fill `fill` with the DC brush and `outline` with the DC pen (outline wins on overlap). */
export function paintShape(emu: Emulator, dc: DCInfo, fill: Mask | null, outline: Mask | null,
  brush: BrushInfo | null, pen: PenInfo | null): void {
  if (fill && outline) fill.subtract(outline);
  const bp = fill ? brushPixels(emu, dc, brush) : null;
  if (fill && bp) paintMask(emu, dc, fill, bp.w === 1 && bp.h === 1 ? { solid: bp.px[0] } : { pattern: bp });
  if (outline && penVisible(pen)) paintMask(emu, dc, outline, { solid: colorRefOf(emu, dc, pen.color) });
}
