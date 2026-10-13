/**
 * `position: fixed` is relative to the viewport only when no ancestor creates
 * a containing block for fixed descendants (transform, perspective, filter,
 * contain, will-change). Embedders may scale the emulator with a CSS
 * transform; this finds that ancestor so viewport coordinates can be mapped
 * into its (scaled) local space.
 */
export interface FixedOrigin { left: number; top: number; scaleX: number; scaleY: number }

export const VIEWPORT_ORIGIN: FixedOrigin = { left: 0, top: 0, scaleX: 1, scaleY: 1 };

function createsFixedContainingBlock(el: Element): boolean {
  const cs = getComputedStyle(el);
  if (cs.transform && cs.transform !== 'none') return true;
  if (cs.perspective && cs.perspective !== 'none') return true;
  if (cs.filter && cs.filter !== 'none') return true;
  if (cs.backdropFilter && cs.backdropFilter !== 'none') return true;
  const contain = cs.contain || '';
  if (/paint|layout|strict|content/.test(contain)) return true;
  const wc = cs.willChange || '';
  return /transform|perspective|filter/.test(wc);
}

/** Origin and scale of the containing block that `position: fixed` children of `el` resolve against. */
export function fixedOriginOf(el: Element | null): FixedOrigin {
  for (let a = el?.parentElement ?? null; a && a !== document.documentElement; a = a.parentElement) {
    if (!createsFixedContainingBlock(a)) continue;
    const r = a.getBoundingClientRect();
    const he = a as HTMLElement;
    const scaleX = he.offsetWidth ? r.width / he.offsetWidth : 1;
    const scaleY = he.offsetHeight ? r.height / he.offsetHeight : 1;
    return { left: r.left + a.clientLeft * scaleX, top: r.top + a.clientTop * scaleY, scaleX: scaleX || 1, scaleY: scaleY || 1 };
  }
  return VIEWPORT_ORIGIN;
}

/** Map a viewport point to `left/top` values for a fixed element under `origin`. */
export function toFixedCoords(origin: FixedOrigin, x: number, y: number): { x: number; y: number } {
  return { x: (x - origin.left) / origin.scaleX, y: (y - origin.top) / origin.scaleY };
}
