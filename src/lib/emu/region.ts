// Rectangle-list regions (GDI HRGN semantics) used for window update regions and clipping.
// A region is a list of non-overlapping half-open rectangles [left,right) x [top,bottom),
// kept in y-x banded order like Wine's region code. Boolean operations decompose both
// operands onto the grid of their edge coordinates, which is exact and fast enough for
// the small regions GUI code produces.

export interface Rect { left: number; top: number; right: number; bottom: number }

export type RegionOp = 'and' | 'or' | 'xor' | 'diff';

export class Region {
  rects: Rect[];

  constructor(rects: Rect[] = []) {
    this.rects = rects.filter(r => r.right > r.left && r.bottom > r.top).map(r => ({ ...r }));
    if (this.rects.length > 1) this.rects = normalize(this.rects);
  }

  static fromRect(left: number, top: number, right: number, bottom: number): Region {
    return new Region([{ left, top, right, bottom }]);
  }

  clone(): Region { return new Region(this.rects); }

  isEmpty(): boolean { return this.rects.length === 0; }

  /** NULLREGION(1) / SIMPLEREGION(2) / COMPLEXREGION(3) */
  complexity(): number { return this.rects.length === 0 ? 1 : this.rects.length === 1 ? 2 : 3; }

  bounds(): Rect {
    if (this.rects.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const x of this.rects) {
      if (x.left < l) l = x.left; if (x.top < t) t = x.top;
      if (x.right > r) r = x.right; if (x.bottom > b) b = x.bottom;
    }
    return { left: l, top: t, right: r, bottom: b };
  }

  containsPoint(x: number, y: number): boolean {
    for (const r of this.rects) if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return true;
    return false;
  }

  intersectsRect(q: Rect): boolean {
    for (const r of this.rects) {
      if (r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom) return true;
    }
    return false;
  }

  offset(dx: number, dy: number): void {
    for (const r of this.rects) { r.left += dx; r.right += dx; r.top += dy; r.bottom += dy; }
  }

  equals(o: Region): boolean {
    if (o.rects.length !== this.rects.length) return false;
    for (let i = 0; i < this.rects.length; i++) {
      const a = this.rects[i], b = o.rects[i];
      if (a.left !== b.left || a.top !== b.top || a.right !== b.right || a.bottom !== b.bottom) return false;
    }
    return true;
  }

  combine(other: Region, op: RegionOp): Region {
    // Fast paths
    if (op === 'or') {
      if (this.isEmpty()) return other.clone();
      if (other.isEmpty()) return this.clone();
    } else if (op === 'and') {
      if (this.isEmpty() || other.isEmpty()) return new Region();
    } else if (op === 'diff') {
      if (this.isEmpty() || other.isEmpty()) return this.clone();
    } else if (op === 'xor') {
      if (this.isEmpty()) return other.clone();
      if (other.isEmpty()) return this.clone();
    }
    return combineGrid(this.rects, other.rects, op);
  }

  union(o: Region): Region { return this.combine(o, 'or'); }
  intersect(o: Region): Region { return this.combine(o, 'and'); }
  subtract(o: Region): Region { return this.combine(o, 'diff'); }
}

interface Band { top: number; bottom: number; spans: number[] } // spans: [l0, r0, l1, r1, ...]

/** Group banded rects (normalized output order) into bands. */
function toBands(rects: Rect[]): Band[] {
  const bands: Band[] = [];
  for (const r of rects) {
    const last = bands[bands.length - 1];
    if (last && last.top === r.top && last.bottom === r.bottom) last.spans.push(r.left, r.right);
    else bands.push({ top: r.top, bottom: r.bottom, spans: [r.left, r.right] });
  }
  return bands;
}

/** Combine two sorted disjoint span lists (1-D boolean op). */
function combineSpans(a: number[], b: number[], op: RegionOp): number[] {
  const out: number[] = [];
  let i = 0, j = 0, inA = false, inB = false, on = false;
  while (i < a.length || j < b.length) {
    const x = Math.min(i < a.length ? a[i] : Infinity, j < b.length ? b[j] : Infinity);
    while (i < a.length && a[i] === x) { inA = !inA; i++; }
    while (j < b.length && b[j] === x) { inB = !inB; j++; }
    const now = op === 'and' ? inA && inB : op === 'or' ? inA || inB : op === 'xor' ? inA !== inB : inA && !inB;
    if (now !== on) { out.push(x); on = now; }
  }
  return out;
}

function sameSpans(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Banded sweep over both regions (like Wine's REGION_RegionOp): O((bands) x (spans)). */
function combineBands(A: Band[], B: Band[], op: RegionOp): Rect[] {
  const ys: number[] = [];
  for (const x of A) ys.push(x.top, x.bottom);
  for (const x of B) ys.push(x.top, x.bottom);
  ys.sort((p, q) => p - q);
  const out: Band[] = [];
  let ia = 0, ib = 0;
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k], y1 = ys[k + 1];
    if (y1 <= y0) continue;
    while (ia < A.length && A[ia].bottom <= y0) ia++;
    while (ib < B.length && B[ib].bottom <= y0) ib++;
    const sa = ia < A.length && A[ia].top <= y0 ? A[ia].spans : [];
    const sb = ib < B.length && B[ib].top <= y0 ? B[ib].spans : [];
    const spans = combineSpans(sa, sb, op);
    if (!spans.length) continue;
    const prev = out[out.length - 1];
    if (prev && prev.bottom === y0 && sameSpans(prev.spans, spans)) prev.bottom = y1;
    else out.push({ top: y0, bottom: y1, spans });
  }
  const rects: Rect[] = [];
  for (const band of out) {
    for (let i = 0; i < band.spans.length; i += 2) rects.push({ left: band.spans[i], top: band.top, right: band.spans[i + 1], bottom: band.bottom });
  }
  return rects;
}

function combineGrid(a: Rect[], b: Rect[], op: RegionOp): Region {
  const reg = new Region();
  reg.rects = combineBands(toBands(a), toBands(b), op);
  return reg;
}

/** Normalize an arbitrary (possibly overlapping, unordered) rect list into banded form. */
function normalize(rects: Rect[]): Rect[] {
  const ys: number[] = [];
  for (const r of rects) ys.push(r.top, r.bottom);
  ys.sort((p, q) => p - q);
  const sorted = rects.slice().sort((p, q) => p.top - q.top);
  const bands: Band[] = [];
  let active: Rect[] = [];
  let next = 0;
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k], y1 = ys[k + 1];
    if (y1 <= y0) continue;
    while (next < sorted.length && sorted[next].top <= y0) active.push(sorted[next++]);
    active = active.filter(r => r.bottom > y0);
    if (!active.length) continue;
    const xs = active.map(r => [r.left, r.right]).sort((p, q) => p[0] - q[0]);
    const spans: number[] = [];
    for (const [l, r] of xs) {
      if (spans.length && l <= spans[spans.length - 1]) spans[spans.length - 1] = Math.max(spans[spans.length - 1], r);
      else spans.push(l, r);
    }
    const prev = bands[bands.length - 1];
    if (prev && prev.bottom === y0 && sameSpans(prev.spans, spans)) prev.bottom = y1;
    else bands.push({ top: y0, bottom: y1, spans });
  }
  return combineBands(bands, [], 'or');
}

export function rectIntersect(a: Rect, b: Rect): Rect | null {
  const l = Math.max(a.left, b.left), t = Math.max(a.top, b.top);
  const r = Math.min(a.right, b.right), bt = Math.min(a.bottom, b.bottom);
  return r > l && bt > t ? { left: l, top: t, right: r, bottom: bt } : null;
}
