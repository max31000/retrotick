// GDI clipping APIs: SaveDC/RestoreDC, IntersectClipRect, ExcludeClipRect, SelectClipRgn,
// ExtSelectClipRgn, OffsetClipRgn, GetClipBox, GetClipRgn, RectVisible, PtVisible.
import type { Emulator } from '../../emulator';
import type { DCInfo } from './types';
import type { WindowInfo } from '../user32/types';
import { Region, type Rect } from '../../region';
import { clientRect, clientOffsetInDC } from '../user32/update-region';
import { getRegion, setRegion, readRect, writeRect } from './region';
import {
  saveDC, restoreDC, setClipRegion, narrowClipRegion, effectiveClip, infiniteRegion,
} from './dc-clip';
import { originOffset } from './viewport';
import { RGN_ERROR, NULLREGION, RGN_AND, RGN_OR, RGN_XOR, RGN_DIFF, RGN_COPY } from '../constants-ctl';

/** Drawing surface of a DC in its coordinates: client area for window DCs, bitmap for memory DCs. */
export function dcSurface(emu: Emulator, dc: DCInfo): Rect {
  if (dc.hwnd) {
    const wnd = emu.handles.get<WindowInfo>(dc.hwnd);
    if (wnd) {
      const c = clientRect(emu, wnd);
      const off = clientOffsetInDC(emu, dc.hwnd, wnd);
      return { left: c.left + off.x, top: c.top + off.y, right: c.right + off.x, bottom: c.bottom + off.y };
    }
  }
  return { left: 0, top: 0, right: dc.canvas.width, bottom: dc.canvas.height };
}

export function registerClipApi(emu: Emulator): void {
  const gdi32 = emu.registerDll('GDI32.DLL');
  const dcOf = (i: number) => emu.getDC(emu.readArg(i));
  const resultType = (dc: DCInfo) => effectiveClip(dc, dcSurface(emu, dc)).complexity();

  gdi32.register('SaveDC', 1, () => {
    const dc = dcOf(0);
    return dc ? saveDC(dc) : 0;
  });
  gdi32.register('RestoreDC', 2, () => {
    const dc = dcOf(0);
    return dc && restoreDC(dc, emu.readArg(1) | 0) ? 1 : 0;
  });

  gdi32.register('IntersectClipRect', 5, () => {
    const dc = dcOf(0);
    if (!dc) return RGN_ERROR;
    const a = (i: number) => emu.readArg(i) | 0;
    narrowClipRegion(dc, Region.fromRect(a(1), a(2), a(3), a(4)));
    return resultType(dc);
  });

  gdi32.register('ExcludeClipRect', 5, () => {
    const dc = dcOf(0);
    if (!dc) return RGN_ERROR;
    const a = (i: number) => emu.readArg(i) | 0;
    narrowClipRegion(dc, infiniteRegion().subtract(Region.fromRect(a(1), a(2), a(3), a(4))));
    return resultType(dc);
  });

  // ExtSelectClipRgn(hdc, hrgn, mode); the region is in device units: the DC clips in logical
  // (canvas) space, so shift it by the window/viewport origin offset
  const extSelect = (dc: DCInfo, hrgn: number, mode: number): number => {
    if (!hrgn) {
      if (mode !== RGN_COPY) return RGN_ERROR;
      setClipRegion(dc, null);
      return resultType(dc);
    }
    const devRgn = getRegion(emu, hrgn);
    if (!devRgn) return RGN_ERROR;
    const o = originOffset(dc);
    const rgn = devRgn.clone();
    if (o.x || o.y) rgn.offset(-o.x, -o.y);
    const cur = dc.clipRgn ?? new Region([dcSurface(emu, dc)]);
    switch (mode) {
      case RGN_COPY: setClipRegion(dc, rgn); break;
      case RGN_AND: narrowClipRegion(dc, rgn); break;
      case RGN_OR: setClipRegion(dc, dc.clipRgn ? cur.union(rgn) : null); break;
      case RGN_XOR: setClipRegion(dc, cur.combine(rgn, 'xor')); break;
      case RGN_DIFF: narrowClipRegion(dc, infiniteRegion().subtract(rgn)); break;
      default: return RGN_ERROR;
    }
    return resultType(dc);
  };
  gdi32.register('SelectClipRgn', 2, () => {
    const dc = dcOf(0);
    return dc ? extSelect(dc, emu.readArg(1), RGN_COPY) : RGN_ERROR;
  });
  gdi32.register('ExtSelectClipRgn', 3, () => {
    const dc = dcOf(0);
    return dc ? extSelect(dc, emu.readArg(1), emu.readArg(2)) : RGN_ERROR;
  });

  gdi32.register('OffsetClipRgn', 3, () => {
    const dc = dcOf(0);
    if (!dc) return RGN_ERROR;
    if (dc.clipRgn) {
      const r = dc.clipRgn.clone();
      r.offset(emu.readArg(1) | 0, emu.readArg(2) | 0);
      setClipRegion(dc, r);
    }
    return resultType(dc);
  });

  gdi32.register('GetClipBox', 2, () => {
    const dc = dcOf(0);
    const p = emu.readArg(1);
    if (!dc) return RGN_ERROR;
    const vis = effectiveClip(dc, dcSurface(emu, dc));
    if (p) writeRect(emu, p, vis.bounds());
    return vis.isEmpty() ? NULLREGION : vis.complexity();
  });

  // GetClipRgn(hdc, hrgn) → 1 if a clip region exists (copied), 0 if none, -1 on error
  gdi32.register('GetClipRgn', 2, () => {
    const dc = dcOf(0);
    if (!dc) return 0xFFFFFFFF;
    if (!dc.clipRgn) return 0;
    const dev = dc.clipRgn.clone();
    const o = originOffset(dc);
    if (o.x || o.y) dev.offset(o.x, o.y);
    return setRegion(emu, emu.readArg(1), dev) ? 1 : 0xFFFFFFFF;
  });

  gdi32.register('RectVisible', 2, () => {
    const dc = dcOf(0);
    if (!dc) return 0;
    return effectiveClip(dc, dcSurface(emu, dc)).intersectsRect(readRect(emu, emu.readArg(1))) ? 1 : 0;
  });
  gdi32.register('PtVisible', 3, () => {
    const dc = dcOf(0);
    if (!dc) return 0xFFFFFFFF;
    return effectiveClip(dc, dcSurface(emu, dc)).containsPoint(emu.readArg(1) | 0, emu.readArg(2) | 0) ? 1 : 0;
  });
}
