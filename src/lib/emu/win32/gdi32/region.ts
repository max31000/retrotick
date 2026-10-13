import type { Emulator } from '../../emulator';
import { Region, type Rect, type RegionOp } from '../../region';
import { SYS_COLORS } from '../types';
import { colorToCSS } from './_helpers';
import {
  RGN_ERROR, RGN_AND, RGN_OR, RGN_XOR, RGN_DIFF, RGN_COPY,
} from '../constants-ctl';

interface RegionHandle { rgn?: Region }

const RDH_RECTANGLES = 1;
const SIZEOF_RGNDATAHEADER = 32;
const ALTERNATE = 1;

/** Region object behind an HRGN (created empty for handles allocated without one). */
export function getRegion(emu: Emulator, h: number): Region | null {
  const obj = emu.handles.get<RegionHandle>(h);
  if (!obj || emu.handles.getType(h) !== 'region') return null;
  if (!obj.rgn) obj.rgn = new Region();
  return obj.rgn;
}

export function setRegion(emu: Emulator, h: number, rgn: Region): boolean {
  const obj = emu.handles.get<RegionHandle>(h);
  if (!obj) return false;
  obj.rgn = rgn;
  return true;
}

export function allocRegion(emu: Emulator, rgn: Region): number {
  return emu.handles.alloc('region', { rgn } as RegionHandle);
}

export function readRect(emu: Emulator, p: number): Rect {
  return {
    left: emu.memory.readI32(p), top: emu.memory.readI32(p + 4),
    right: emu.memory.readI32(p + 8), bottom: emu.memory.readI32(p + 12),
  };
}

export function writeRect(emu: Emulator, p: number, r: Rect): void {
  emu.memory.writeU32(p, r.left >>> 0); emu.memory.writeU32(p + 4, r.top >>> 0);
  emu.memory.writeU32(p + 8, r.right >>> 0); emu.memory.writeU32(p + 12, r.bottom >>> 0);
}

function rectRegion(l: number, t: number, r: number, b: number): Region {
  return Region.fromRect(Math.min(l, r), Math.min(t, b), Math.max(l, r), Math.max(t, b));
}

/** Scanline approximation of an ellipse inscribed in (l,t,r,b) — GDI semantics (right/bottom exclusive). */
function ellipseRegion(l: number, t: number, r: number, b: number): Region {
  const rects: Rect[] = [];
  const w = r - l, h = b - t;
  if (w <= 0 || h <= 0) return new Region();
  const cx = l + w / 2, cy = t + h / 2, rx = w / 2, ry = h / 2;
  for (let y = t; y < b; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const k = 1 - dy * dy;
    if (k <= 0) continue;
    const dx = rx * Math.sqrt(k);
    const x0 = Math.round(cx - dx), x1 = Math.round(cx + dx);
    if (x1 > x0) rects.push({ left: x0, top: y, right: x1, bottom: y + 1 });
  }
  return new Region(rects);
}

function roundRectRegion(l: number, t: number, r: number, b: number, ew: number, eh: number): Region {
  const rects: Rect[] = [];
  const rx = Math.min(ew, r - l) / 2, ry = Math.min(eh, b - t) / 2;
  for (let y = t; y < b; y++) {
    let inset = 0;
    const yc = y + 0.5;
    const dyTop = t + ry - yc, dyBot = yc - (b - ry);
    const dy = dyTop > 0 ? dyTop : dyBot > 0 ? dyBot : 0;
    if (dy > 0 && ry > 0) inset = rx - rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry)));
    const x0 = Math.round(l + inset), x1 = Math.round(r - inset);
    if (x1 > x0) rects.push({ left: x0, top: y, right: x1, bottom: y + 1 });
  }
  return new Region(rects);
}

/** Scanline polygon fill (ALTERNATE = even-odd, WINDING = nonzero). */
function polygonRegion(polys: { x: number; y: number }[][], mode: number): Region {
  let minY = Infinity, maxY = -Infinity;
  for (const p of polys) for (const v of p) { if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y; }
  const rects: Rect[] = [];
  for (let y = minY; y < maxY; y++) {
    const yc = y + 0.5;
    const xs: { x: number; d: number }[] = [];
    for (const p of polys) {
      for (let i = 0; i < p.length; i++) {
        const a = p[i], c = p[(i + 1) % p.length];
        if ((a.y <= yc && c.y > yc) || (c.y <= yc && a.y > yc)) {
          xs.push({ x: a.x + (yc - a.y) * (c.x - a.x) / (c.y - a.y), d: c.y > a.y ? 1 : -1 });
        }
      }
    }
    xs.sort((m, n) => m.x - n.x);
    let wind = 0;
    for (let i = 0; i + 1 < xs.length; i++) {
      wind += xs[i].d;
      const on = mode === ALTERNATE ? (i % 2 === 0) : wind !== 0;
      if (!on) continue;
      const x0 = Math.round(xs[i].x), x1 = Math.round(xs[i + 1].x);
      if (x1 > x0) rects.push({ left: x0, top: y, right: x1, bottom: y + 1 });
    }
  }
  return new Region(rects);
}

/** Fill region rectangles with a brush (or a system color index + 1, like FillRect). */
export function fillRegionWithBrush(emu: Emulator, hdc: number, rgn: Region, hBrush: number): boolean {
  const dc = emu.getDC(hdc);
  if (!dc) return false;
  let color: number | null = null;
  if (hBrush > 0 && hBrush <= 30) color = SYS_COLORS[hBrush - 1] ?? null;
  if (color === null) {
    const brush = emu.getBrush(hBrush);
    if (brush && !brush.isNull) color = brush.color;
  }
  if (color === null) return true;
  dc.ctx.fillStyle = colorToCSS(color);
  for (const r of rgn.rects) dc.ctx.fillRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
  emu.syncDCToCanvas(hdc);
  return true;
}

const opFromMode = (mode: number): RegionOp | 'copy' | null =>
  mode === RGN_AND ? 'and' : mode === RGN_OR ? 'or' : mode === RGN_XOR ? 'xor' : mode === RGN_DIFF ? 'diff' : mode === RGN_COPY ? 'copy' : null;

export function registerRegion(emu: Emulator): void {
  const gdi32 = emu.registerDll('GDI32.DLL');
  const arg = (i: number) => emu.readArg(i) | 0;

  gdi32.register('CreateRectRgn', 4, () => allocRegion(emu, rectRegion(arg(0), arg(1), arg(2), arg(3))));
  gdi32.register('CreateRectRgnIndirect', 1, () => {
    const r = readRect(emu, emu.readArg(0));
    return allocRegion(emu, rectRegion(r.left, r.top, r.right, r.bottom));
  });
  gdi32.register('CreateEllipticRgn', 4, () => allocRegion(emu, ellipseRegion(arg(0), arg(1), arg(2), arg(3))));
  gdi32.register('CreateEllipticRgnIndirect', 1, () => {
    const r = readRect(emu, emu.readArg(0));
    return allocRegion(emu, ellipseRegion(r.left, r.top, r.right, r.bottom));
  });
  gdi32.register('CreateRoundRectRgn', 6, () =>
    allocRegion(emu, roundRectRegion(arg(0), arg(1), arg(2), arg(3), arg(4), arg(5))));

  const readPts = (p: number, n: number) => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) pts.push({ x: emu.memory.readI32(p + i * 8), y: emu.memory.readI32(p + i * 8 + 4) });
    return pts;
  };
  // CreatePolygonRgn(lppt, cPoints, iMode)
  gdi32.register('CreatePolygonRgn', 3, () => allocRegion(emu, polygonRegion([readPts(emu.readArg(0), arg(1))], arg(2))));
  // CreatePolyPolygonRgn(lppt, lpPolyCounts, nCount, iMode)
  gdi32.register('CreatePolyPolygonRgn', 4, () => {
    let p = emu.readArg(0);
    const counts = emu.readArg(1), n = arg(2);
    const polys: { x: number; y: number }[][] = [];
    for (let i = 0; i < n; i++) {
      const c = emu.memory.readI32(counts + i * 4);
      polys.push(readPts(p, c));
      p += c * 8;
    }
    return allocRegion(emu, polygonRegion(polys, arg(3)));
  });

  // CombineRgn(hrgnDst, hrgnSrc1, hrgnSrc2, iMode)
  gdi32.register('CombineRgn', 4, () => {
    const dst = emu.readArg(0);
    const a = getRegion(emu, emu.readArg(1));
    const op = opFromMode(arg(3));
    if (!a || !op || !emu.handles.get(dst)) return RGN_ERROR;
    let result: Region;
    if (op === 'copy') result = a.clone();
    else {
      const b = getRegion(emu, emu.readArg(2));
      if (!b) return RGN_ERROR;
      result = a.combine(b, op);
    }
    setRegion(emu, dst, result);
    return result.complexity();
  });

  gdi32.register('SetRectRgn', 5, () => setRegion(emu, emu.readArg(0), rectRegion(arg(1), arg(2), arg(3), arg(4))) ? 1 : 0);

  gdi32.register('OffsetRgn', 3, () => {
    const rgn = getRegion(emu, emu.readArg(0));
    if (!rgn) return RGN_ERROR;
    rgn.offset(arg(1), arg(2));
    return rgn.complexity();
  });

  gdi32.register('GetRgnBox', 2, () => {
    const rgn = getRegion(emu, emu.readArg(0));
    if (!rgn) return RGN_ERROR;
    const lprc = emu.readArg(1);
    if (lprc) writeRect(emu, lprc, rgn.bounds());
    return rgn.complexity();
  });

  gdi32.register('PtInRegion', 3, () => (getRegion(emu, emu.readArg(0))?.containsPoint(arg(1), arg(2)) ? 1 : 0));
  gdi32.register('RectInRegion', 2, () => {
    const rgn = getRegion(emu, emu.readArg(0));
    return rgn && rgn.intersectsRect(readRect(emu, emu.readArg(1))) ? 1 : 0;
  });
  gdi32.register('EqualRgn', 2, () => {
    const a = getRegion(emu, emu.readArg(0)), b = getRegion(emu, emu.readArg(1));
    if (!a || !b) return RGN_ERROR;
    return a.equals(b) ? 1 : 0;
  });

  // FillRgn(hdc, hrgn, hbr) / PaintRgn(hdc, hrgn) / InvertRgn(hdc, hrgn) / FrameRgn(hdc, hrgn, hbr, w, h)
  gdi32.register('FillRgn', 3, () => {
    const rgn = getRegion(emu, emu.readArg(1));
    return rgn && fillRegionWithBrush(emu, emu.readArg(0), rgn, emu.readArg(2)) ? 1 : 0;
  });
  gdi32.register('PaintRgn', 2, () => {
    const hdc = emu.readArg(0);
    const rgn = getRegion(emu, emu.readArg(1));
    const dc = emu.getDC(hdc);
    return rgn && dc && fillRegionWithBrush(emu, hdc, rgn, dc.selectedBrush) ? 1 : 0;
  });
  gdi32.register('InvertRgn', 2, () => {
    const hdc = emu.readArg(0);
    const rgn = getRegion(emu, emu.readArg(1));
    const dc = emu.getDC(hdc);
    if (!rgn || !dc) return 0;
    const prev = dc.ctx.globalCompositeOperation;
    dc.ctx.globalCompositeOperation = 'difference';
    dc.ctx.fillStyle = '#ffffff';
    for (const r of rgn.rects) dc.ctx.fillRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
    dc.ctx.globalCompositeOperation = prev;
    emu.syncDCToCanvas(hdc);
    return 1;
  });
  gdi32.register('FrameRgn', 5, () => {
    const rgn = getRegion(emu, emu.readArg(1));
    if (!rgn) return 0;
    const w = Math.max(1, arg(3)), h = Math.max(1, arg(4));
    // Interior = points whose (w,h)-neighbourhood lies inside the region
    let inner = rgn.clone();
    for (const [dx, dy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) {
      const s = rgn.clone(); s.offset(dx, dy); inner = inner.intersect(s);
    }
    return fillRegionWithBrush(emu, emu.readArg(0), rgn.subtract(inner), emu.readArg(2)) ? 1 : 0;
  });

  // GetRegionData(hrgn, nCount, lpRgnData) → bytes needed / written
  gdi32.register('GetRegionData', 3, () => {
    const rgn = getRegion(emu, emu.readArg(0));
    if (!rgn) return 0;
    const size = SIZEOF_RGNDATAHEADER + rgn.rects.length * 16;
    const n = emu.readArg(1), p = emu.readArg(2);
    if (!p) return size;
    if (n < size) return 0;
    emu.memory.writeU32(p, SIZEOF_RGNDATAHEADER);
    emu.memory.writeU32(p + 4, RDH_RECTANGLES);
    emu.memory.writeU32(p + 8, rgn.rects.length);
    emu.memory.writeU32(p + 12, rgn.rects.length * 16);
    writeRect(emu, p + 16, rgn.bounds());
    rgn.rects.forEach((r, i) => writeRect(emu, p + SIZEOF_RGNDATAHEADER + i * 16, r));
    return size;
  });

  // ExtCreateRegion(lpXform, nCount, lpRgnData) — transforms are ignored
  gdi32.register('ExtCreateRegion', 3, () => {
    const p = emu.readArg(2);
    if (!p) return 0;
    const hdr = emu.memory.readU32(p) || SIZEOF_RGNDATAHEADER;
    const count = emu.memory.readU32(p + 8);
    const rects: Rect[] = [];
    for (let i = 0; i < count; i++) rects.push(readRect(emu, p + hdr + i * 16));
    return allocRegion(emu, new Region(rects));
  });

}
