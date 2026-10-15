// LineTo, Polyline, Polygon, Rectangle, Ellipse and RoundRect rasterized pixel-exactly
// with the DC pen width, brush (solid, hatch or pattern) and ROP2 (see raster.ts).
import type { Emulator } from '../../emulator';
import type { DCInfo } from './types';
import {
  Mask, ellipseSpans, roundRectSpans, polygonSpans, penPath, paintShape, penWidth, penVisible,
  isInsideFrame,
} from './raster';

type Box = [number, number, number, number];

function norm(l: number, t: number, r: number, b: number): Box {
  return [Math.min(l, r), Math.min(t, b), Math.max(l, r), Math.max(t, b)];
}

/** Outer box of the pen outline and the inner (fill) box for a bounding box shape. */
function frameBoxes(emu: Emulator, dc: DCInfo, box: Box): { outer: Box; inner: Box; w: number; pen: boolean } {
  const pen = emu.getPen(dc.selectedPen);
  const visible = penVisible(pen);
  const [l, t, r, b] = box;
  if (!visible) return { outer: [l, t, r - 1, b - 1], inner: [l, t, r - 1, b - 1], w: 0, pen: false };
  const w = penWidth(pen);
  let outer: Box = [l, t, r, b];
  if (w > 1 && !isInsideFrame(pen)) {
    const half = w >> 1;
    outer = [l - half, t - half, r + (w - 1 - half), b + (w - 1 - half)];
  }
  const inner: Box = [outer[0] + w, outer[1] + w, outer[2] - w, outer[3] - w];
  return { outer, inner, w, pen: true };
}

function maskFor(box: Box): Mask {
  return new Mask(box[0], box[1], Math.max(0, box[2] - box[0]), Math.max(0, box[3] - box[1]));
}

function readPoints(emu: Emulator, ptr: number, count: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i++) pts.push([emu.memory.readI32(ptr + i * 8), emu.memory.readI32(ptr + i * 8 + 4)]);
  return pts;
}

function pointsBox(pts: [number, number][], pad: number): Box {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const [x, y] of pts) { l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x); b = Math.max(b, y); }
  return [l - pad, t - pad, r + pad + 1, b + pad + 1];
}

/** Draw a polyline with the DC pen (no fill). */
function strokePoints(emu: Emulator, dc: DCInfo, pts: [number, number][], close: boolean): void {
  const pen = emu.getPen(dc.selectedPen);
  if (!penVisible(pen) || pts.length < 2) return;
  const w = penWidth(pen);
  const m = maskFor(pointsBox(pts, w));
  penPath(m, pts, w, close);
  paintShape(emu, dc, null, m, null, pen);
}

export function registerDrawShapes(emu: Emulator): void {
  const gdi32 = emu.registerDll('GDI32.DLL');

  gdi32.register('LineTo', 3, () => {
    const hdc = emu.readArg(0);
    const x = emu.readArg(1) | 0, y = emu.readArg(2) | 0;
    const dc = emu.getDC(hdc);
    if (!dc) return 0;
    strokePoints(emu, dc, [[dc.penPosX, dc.penPosY], [x, y]], false);
    dc.penPosX = x;
    dc.penPosY = y;
    emu.syncDCToCanvas(hdc);
    return 1;
  });

  gdi32.register('Polyline', 3, () => {
    const hdc = emu.readArg(0);
    const count = emu.readArg(2);
    const dc = emu.getDC(hdc);
    if (!dc || count < 2) return 0;
    strokePoints(emu, dc, readPoints(emu, emu.readArg(1), count), false);
    emu.syncDCToCanvas(hdc);
    return 1;
  });

  gdi32.register('Polygon', 3, () => {
    const hdc = emu.readArg(0);
    const count = emu.readArg(2);
    const dc = emu.getDC(hdc);
    if (!dc || count < 2) return 0;
    const pts = readPoints(emu, emu.readArg(1), count);
    const pen = emu.getPen(dc.selectedPen);
    const w = penVisible(pen) ? penWidth(pen) : 0;
    const box = pointsBox(pts, w);
    const fill = maskFor(box);
    polygonSpans(fill, pts, false);
    let outline: Mask | null = null;
    if (w) { outline = maskFor(box); penPath(outline, pts, w, true); }
    paintShape(emu, dc, fill, outline, emu.getBrush(dc.selectedBrush), pen);
    emu.syncDCToCanvas(hdc);
    return 1;
  });

  /** Shared body of Rectangle / Ellipse / RoundRect. */
  const boxShape = (spans: (m: Mask, b: Box) => void, rectangular: boolean) => () => {
    const hdc = emu.readArg(0);
    const dc = emu.getDC(hdc);
    if (!dc) return 0;
    const box = norm(emu.readArg(1) | 0, emu.readArg(2) | 0, emu.readArg(3) | 0, emu.readArg(4) | 0);
    const f = frameBoxes(emu, dc, box);
    const fill = maskFor(f.outer);
    let outline: Mask | null = null;
    if (f.pen) {
      outline = maskFor(f.outer);
      if (rectangular) for (let y = f.outer[1]; y < f.outer[3]; y++) outline.span(y, f.outer[0], f.outer[2]);
      else spans(outline, f.outer);
      const inner = maskFor(f.outer);
      if (f.inner[2] > f.inner[0] && f.inner[3] > f.inner[1]) {
        if (rectangular) for (let y = f.inner[1]; y < f.inner[3]; y++) inner.span(y, f.inner[0], f.inner[2]);
        else spans(inner, f.inner);
      }
      outline.subtract(inner);
      fill.bits.set(inner.bits);
    } else if (rectangular) {
      for (let y = f.inner[1]; y < f.inner[3]; y++) fill.span(y, f.inner[0], f.inner[2]);
    } else {
      spans(fill, f.inner);
    }
    paintShape(emu, dc, fill, outline, emu.getBrush(dc.selectedBrush), emu.getPen(dc.selectedPen));
    emu.syncDCToCanvas(hdc);
    return 1;
  };

  gdi32.register('Rectangle', 5, boxShape(() => { /* rectangular */ }, true));
  gdi32.register('Ellipse', 5, boxShape((m, b) => ellipseSpans(m, b[0], b[1], b[2], b[3]), false));
  gdi32.register('RoundRect', 7, () => {
    const ew = emu.readArg(5) | 0, eh = emu.readArg(6) | 0;
    return boxShape((m, b) => roundRectSpans(m, b[0], b[1], b[2], b[3], ew, eh), false)();
  });
}
