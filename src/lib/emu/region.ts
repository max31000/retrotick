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

function uniqSorted(v: number[]): number[] {
  v.sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of v) if (out.length === 0 || out[out.length - 1] !== x) out.push(x);
  return out;
}

function inside(rects: Rect[], x: number, y: number): boolean {
  for (const r of rects) if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return true;
  return false;
}

function combineGrid(a: Rect[], b: Rect[], op: RegionOp): Region {
  const xs: number[] = [], ys: number[] = [];
  for (const r of a) { xs.push(r.left, r.right); ys.push(r.top, r.bottom); }
  for (const r of b) { xs.push(r.left, r.right); ys.push(r.top, r.bottom); }
  const ux = uniqSorted(xs), uy = uniqSorted(ys);
  const out: Rect[] = [];
  for (let j = 0; j + 1 < uy.length; j++) {
    const y0 = uy[j], y1 = uy[j + 1];
    let spanStart: number | null = null;
    for (let i = 0; i + 1 < ux.length; i++) {
      const x0 = ux[i];
      const ia = inside(a, x0, y0), ib = inside(b, x0, y0);
      const on = op === 'and' ? ia && ib : op === 'or' ? ia || ib : op === 'xor' ? ia !== ib : ia && !ib;
      if (on && spanStart === null) spanStart = x0;
      if (!on && spanStart !== null) { out.push({ left: spanStart, top: y0, right: x0, bottom: y1 }); spanStart = null; }
    }
    if (spanStart !== null) out.push({ left: spanStart, top: y0, right: ux[ux.length - 1], bottom: y1 });
  }
  const reg = new Region();
  reg.rects = mergeBands(out);
  return reg;
}

/** Merge vertically adjacent bands that have identical spans. Input is band-ordered. */
function mergeBands(rects: Rect[]): Rect[] {
  // group by band (top,bottom)
  const bands: { top: number; bottom: number; spans: Rect[] }[] = [];
  for (const r of rects) {
    const last = bands[bands.length - 1];
    if (last && last.top === r.top && last.bottom === r.bottom) last.spans.push(r);
    else bands.push({ top: r.top, bottom: r.bottom, spans: [r] });
  }
  const merged: typeof bands = [];
  for (const band of bands) {
    const prev = merged[merged.length - 1];
    if (prev && prev.bottom === band.top && prev.spans.length === band.spans.length
        && prev.spans.every((s, i) => s.left === band.spans[i].left && s.right === band.spans[i].right)) {
      prev.bottom = band.bottom;
      for (const s of prev.spans) s.bottom = band.bottom;
    } else {
      merged.push({ top: band.top, bottom: band.bottom, spans: band.spans.map(s => ({ ...s })) });
    }
  }
  const out: Rect[] = [];
  for (const b of merged) for (const s of b.spans) out.push({ left: s.left, top: b.top, right: s.right, bottom: b.bottom });
  return out;
}

function normalize(rects: Rect[]): Rect[] {
  return combineGrid(rects, [], 'or').rects;
}

export function rectIntersect(a: Rect, b: Rect): Rect | null {
  const l = Math.max(a.left, b.left), t = Math.max(a.top, b.top);
  const r = Math.min(a.right, b.right), bt = Math.min(a.bottom, b.bottom);
  return r > l && bt > t ? { left: l, top: t, right: r, bottom: bt } : null;
}
