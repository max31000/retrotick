// DC clipping on top of the canvas save/restore stack.
//
// Canvas clips can only be narrowed, and widened only by ctx.restore(). Every ctx.save()
// made on behalf of a DC is recorded in dc.layers so SaveDC/RestoreDC, the BeginPaint
// update-region clip ('vis') and the application clip region ('clip') can be unwound in
// the right order. Regions are kept in DC logical coordinates.
import type { DCInfo } from './types';
import { Region, type Rect } from '../../region';

export interface DCLayer {
  kind: 'save' | 'clip' | 'vis';
  /** For 'save': the app clip region to restore on RestoreDC. */
  clipRgn?: Region | null;
  /** For 'save': window/viewport origins (the canvas transform is restored with the layer). */
  org?: [number, number, number, number];
}

const HUGE = 1 << 27;
const INFINITE: Rect = { left: -HUGE, top: -HUGE, right: HUGE, bottom: HUGE };

function layers(dc: DCInfo): DCLayer[] {
  if (!dc.layers) dc.layers = [];
  return dc.layers;
}

function clipToRects(dc: DCInfo, rgn: Region): void {
  const ctx = dc.ctx;
  ctx.beginPath();
  for (const r of rgn.rects) ctx.rect(r.left, r.top, r.right - r.left, r.bottom - r.top);
  ctx.clip();
}

/** Push the update-region clip for BeginPaint (region in DC coordinates). */
export function pushVisClip(dc: DCInfo, rgn: Region): void {
  dc.ctx.save();
  layers(dc).push({ kind: 'vis' });
  clipToRects(dc, rgn);
  dc.visRgn = rgn;
}

/** Pop everything down to and including the BeginPaint clip (EndPaint). */
export function popVisClip(dc: DCInfo): void {
  const ls = layers(dc);
  const idx = ls.map(l => l.kind).lastIndexOf('vis');
  if (idx < 0) return;
  while (ls.length > idx) {
    const l = ls.pop()!;
    dc.ctx.restore();
    if (l.kind === 'save') {
      dc.clipRgn = l.clipRgn ?? null;
      if (l.org) [dc.viewportOrgX, dc.viewportOrgY, dc.windowOrgX, dc.windowOrgY] = l.org;
    }
  }
  dc.clipRgn = null;
  dc.visRgn = null;
}

/** Pop all layers (DC released): clip region and saved states are discarded. */
export function resetDCLayers(dc: DCInfo): void {
  const ls = layers(dc);
  while (ls.length) { ls.pop(); dc.ctx.restore(); }
  dc.clipRgn = null;
  dc.visRgn = null;
}

/** SaveDC: returns the new save level. */
export function saveDC(dc: DCInfo): number {
  dc.ctx.save();
  layers(dc).push({
    kind: 'save', clipRgn: dc.clipRgn ? dc.clipRgn.clone() : null,
    org: [dc.viewportOrgX ?? 0, dc.viewportOrgY ?? 0, dc.windowOrgX ?? 0, dc.windowOrgY ?? 0],
  });
  return layers(dc).filter(l => l.kind === 'save').length;
}

/** RestoreDC(n): n > 0 restores to the state saved by SaveDC call #n, n < 0 is relative. */
export function restoreDC(dc: DCInfo, n: number): boolean {
  const ls = layers(dc);
  const level = ls.filter(l => l.kind === 'save').length;
  const target = n < 0 ? level + n : n - 1; // number of saves that remain
  if (target < 0 || target >= level) return false;
  let saves = level;
  while (ls.length && saves > target) {
    const l = ls.pop()!;
    dc.ctx.restore();
    if (l.kind === 'save') {
      saves--;
      dc.clipRgn = l.clipRgn ?? null;
      if (l.org) [dc.viewportOrgX, dc.viewportOrgY, dc.windowOrgX, dc.windowOrgY] = l.org;
    }
    if (l.kind === 'vis') dc.visRgn = null;
  }
  return true;
}

/** Replace the application clip region (null removes it). If an older clip layer is
 *  buried under saved states the canvas clip can only be narrowed, as canvas allows. */
export function setClipRegion(dc: DCInfo, rgn: Region | null): void {
  const ls = layers(dc);
  if (ls.length && ls[ls.length - 1].kind === 'clip') { ls.pop(); dc.ctx.restore(); }
  dc.clipRgn = rgn ? rgn.clone() : null;
  if (!rgn) return;
  dc.ctx.save();
  ls.push({ kind: 'clip' });
  clipToRects(dc, rgn);
}

/** Narrow the application clip region (IntersectClipRect / ExcludeClipRect / RGN_AND...). */
export function narrowClipRegion(dc: DCInfo, rgn: Region): void {
  const next = (dc.clipRgn ?? new Region([INFINITE])).intersect(rgn);
  const ls = layers(dc);
  if (ls.length && ls[ls.length - 1].kind === 'clip') {
    // Narrowing an existing top clip layer: just intersect further.
    dc.clipRgn = next;
    clipToRects(dc, rgn);
    return;
  }
  setClipRegion(dc, next);
}

export function infiniteRegion(): Region { return new Region([INFINITE]); }

/** Effective visible region (app clip ∩ paint region ∩ surface), in DC coordinates. */
export function effectiveClip(dc: DCInfo, surface: Rect): Region {
  let r = new Region([surface]);
  if (dc.clipRgn) r = r.intersect(dc.clipRgn);
  if (dc.visRgn) r = r.intersect(dc.visRgn);
  return r;
}
