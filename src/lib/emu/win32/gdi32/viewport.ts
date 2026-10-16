// Window / viewport origins (MM_TEXT): device = logical - window origin + viewport origin.
// The offset is applied to the DC's canvas transform, so every drawing call honours it.
import type { Emulator } from '../../emulator';
import type { DCInfo } from './types';

function shift(dc: DCInfo, update: () => void): void {
  const before = (dc.viewportOrgX ?? 0) - (dc.windowOrgX ?? 0);
  const beforeY = (dc.viewportOrgY ?? 0) - (dc.windowOrgY ?? 0);
  update();
  const dx = (dc.viewportOrgX ?? 0) - (dc.windowOrgX ?? 0) - before;
  const dy = (dc.viewportOrgY ?? 0) - (dc.windowOrgY ?? 0) - beforeY;
  if (dx || dy) dc.ctx.translate(dx, dy);
}

/** Back to the default origins (common DCs on GetDC/BeginPaint), undoing their canvas offset. */
export function resetOrigins(dc: DCInfo, transformAlreadyReset = false): void {
  const dx = (dc.viewportOrgX ?? 0) - (dc.windowOrgX ?? 0), dy = (dc.viewportOrgY ?? 0) - (dc.windowOrgY ?? 0);
  if (!transformAlreadyReset && (dx || dy)) dc.ctx.translate(-dx, -dy);
  dc.viewportOrgX = dc.viewportOrgY = dc.windowOrgX = dc.windowOrgY = 0;
}

/** Device offset of logical coordinates (viewport origin - window origin). */
export function originOffset(dc: DCInfo): { x: number; y: number } {
  return { x: (dc.viewportOrgX ?? 0) - (dc.windowOrgX ?? 0), y: (dc.viewportOrgY ?? 0) - (dc.windowOrgY ?? 0) };
}

export function registerViewport(emu: Emulator): void {
  const gdi32 = emu.registerDll('GDI32.DLL');
  const writePoint = (p: number, x: number, y: number) => {
    if (p) { emu.memory.writeU32(p, x >>> 0); emu.memory.writeU32(p + 4, y >>> 0); }
  };

  // Set*OrgEx(hdc, x, y, lpPrevPoint) / Offset*OrgEx(hdc, dx, dy, lpPrevPoint)
  const origin = (viewport: boolean, offset: boolean) => () => {
    const dc = emu.getDC(emu.readArg(0));
    if (!dc) return 0;
    const x = emu.readArg(1) | 0, y = emu.readArg(2) | 0;
    const ox = (viewport ? dc.viewportOrgX : dc.windowOrgX) ?? 0, oy = (viewport ? dc.viewportOrgY : dc.windowOrgY) ?? 0;
    writePoint(emu.readArg(3), ox, oy);
    shift(dc, () => {
      const nx = offset ? ox + x : x, ny = offset ? oy + y : y;
      if (viewport) { dc.viewportOrgX = nx; dc.viewportOrgY = ny; } else { dc.windowOrgX = nx; dc.windowOrgY = ny; }
    });
    return 1;
  };
  gdi32.register('SetViewportOrgEx', 4, origin(true, false));
  gdi32.register('OffsetViewportOrgEx', 4, origin(true, true));
  gdi32.register('SetWindowOrgEx', 4, origin(false, false));
  gdi32.register('OffsetWindowOrgEx', 4, origin(false, true));

  gdi32.register('GetViewportOrgEx', 2, () => {
    const dc = emu.getDC(emu.readArg(0));
    if (!dc) return 0;
    writePoint(emu.readArg(1), dc.viewportOrgX ?? 0, dc.viewportOrgY ?? 0);
    return 1;
  });
  gdi32.register('GetWindowOrgEx', 2, () => {
    const dc = emu.getDC(emu.readArg(0));
    if (!dc) return 0;
    writePoint(emu.readArg(1), dc.windowOrgX ?? 0, dc.windowOrgY ?? 0);
    return 1;
  });
}
