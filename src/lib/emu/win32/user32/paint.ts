import type { Emulator } from '../../emulator';
import { brushFillStyle, isPatternBrush } from '../gdi32/pattern';
import type { WindowInfo } from './types';
import {
  SYS_COLORS,
  COLOR_BTNHIGHLIGHT, COLOR_3DLIGHT, COLOR_BTNSHADOW, COLOR_3DDKSHADOW,
} from '../types';

export function registerPaint(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');

  // DC operations
  user32.register('GetDC', 1, () => {
    const hwnd = emu.readArg(0);
    const dc = emu.getWindowDC(hwnd);
    return dc;
  });

  user32.register('GetDCEx', 3, () => {
    const hwnd = emu.readArg(0);
    return emu.getWindowDC(hwnd);
  });

  user32.register('GetWindowDC', 1, () => {
    const hwnd = emu.readArg(0);
    return emu.getWindowDC(hwnd);
  });

  user32.register('ReleaseDC', 2, () => {
    const hwnd = emu.readArg(0);
    const hdc = emu.readArg(1);
    emu.releaseChildDC(hdc);
    // WS_CLIPCHILDREN: repaint child windows that may have been painted over
    const WS_CLIPCHILDREN = 0x02000000;
    if (hwnd === emu.mainWindow || hwnd === 0) {
      const wnd = emu.handles.get<WindowInfo>(hwnd || emu.mainWindow);
      if (wnd && (wnd.style & WS_CLIPCHILDREN) && wnd.childList && wnd.childList.length > 0) {
        emu.repaintChildWindows(hwnd || emu.mainWindow);
      }
    }
    return 1;
  });





  // FillRect (USER32, not GDI32)
  user32.register('FillRect', 3, () => {
    const hdc = emu.readArg(0);
    const rectPtr = emu.readArg(1);
    const hBrush = emu.readArg(2);

    const dc = emu.getDC(hdc);
    if (!dc) return 0;

    const left = emu.memory.readI32(rectPtr);
    const top = emu.memory.readI32(rectPtr + 4);
    const right = emu.memory.readI32(rectPtr + 8);
    const bottom = emu.memory.readI32(rectPtr + 12);

    // FillRect supports system color index + 1 as hBrush (e.g. COLOR_BTNFACE+1 = 16)
    let color: number | null = null;
    if (hBrush > 0 && hBrush <= 30) {
      color = SYS_COLORS[hBrush - 1] ?? null;
    }
    if (color === null) {
      const brush = emu.getBrush(hBrush);
      if (brush && isPatternBrush(brush)) {
        dc.ctx.fillStyle = brushFillStyle(emu, dc, brush);
        dc.ctx.fillRect(left, top, right - left, bottom - top);
        emu.syncDCToCanvas(hdc);
        return 1;
      }
      if (brush && !brush.isNull) color = brush.color;
    }
    if (color !== null) {
      const r = color & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = (color >> 16) & 0xFF;
      dc.ctx.fillStyle = `rgb(${r},${g},${b})`;
      dc.ctx.fillRect(left, top, right - left, bottom - top);
      emu.syncDCToCanvas(hdc);
    }
    return 1;
  });

  user32.register('FrameRect', 3, () => {
    const hdc = emu.readArg(0);
    const rectPtr = emu.readArg(1);
    const hBrush = emu.readArg(2);

    const dc = emu.getDC(hdc);
    if (!dc) return 0;

    const left = emu.memory.readI32(rectPtr);
    const top = emu.memory.readI32(rectPtr + 4);
    const right = emu.memory.readI32(rectPtr + 8);
    const bottom = emu.memory.readI32(rectPtr + 12);

    const brush = emu.getBrush(hBrush);
    if (brush && !brush.isNull) {
      const r = brush.color & 0xFF;
      const g = (brush.color >> 8) & 0xFF;
      const b = (brush.color >> 16) & 0xFF;
      dc.ctx.strokeStyle = `rgb(${r},${g},${b})`;
      dc.ctx.lineWidth = 1;
      dc.ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, bottom - top - 1);
      emu.syncDCToCanvas(hdc);
    }
    return 1;
  });

  user32.register('InvertRect', 2, () => {
    const hdc = emu.readArg(0);
    const rectPtr = emu.readArg(1);

    const dc = emu.getDC(hdc);
    if (!dc) return 0;

    const left = emu.memory.readI32(rectPtr);
    const top = emu.memory.readI32(rectPtr + 4);
    const right = emu.memory.readI32(rectPtr + 8);
    const bottom = emu.memory.readI32(rectPtr + 12);

    const w = right - left, h = bottom - top;
    if (w > 0 && h > 0) {
      const imgData = dc.ctx.getImageData(left, top, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i]; d[i+1] = 255 - d[i+1]; d[i+2] = 255 - d[i+2];
      }
      dc.ctx.putImageData(imgData, left, top);
      emu.syncDCToCanvas(hdc);
    }
    return 1;
  });

  user32.register('DrawEdge', 4, () => {
    const hdc = emu.readArg(0);
    const rectPtr = emu.readArg(1);
    const edgeType = emu.readArg(2);
    const grfFlags = emu.readArg(3);

    const dc = emu.getDC(hdc);
    if (!dc) return 0;

    let left = emu.memory.readI32(rectPtr);
    let top = emu.memory.readI32(rectPtr + 4);
    let right = emu.memory.readI32(rectPtr + 8);
    let bottom = emu.memory.readI32(rectPtr + 12);

    const ctx = dc.ctx;

    // BDR flags
    const BDR_RAISEDOUTER = 0x0001;
    const BDR_SUNKENOUTER = 0x0002;
    const BDR_RAISEDINNER = 0x0004;
    const BDR_SUNKENINNER = 0x0008;
    // BF flags
    const BF_LEFT   = 0x0001;
    const BF_TOP    = 0x0002;
    const BF_RIGHT  = 0x0004;
    const BF_BOTTOM = 0x0008;
    const BF_ADJUST = 0x2000;

    const sysColor = (idx: number) => {
      const c = SYS_COLORS[idx] ?? 0;
      return `rgb(${c & 0xFF},${(c >> 8) & 0xFF},${(c >> 16) & 0xFF})`;
    };

    // Determine outer and inner colors based on edge type
    // Outer edge
    let outerTL: string | null = null; // top-left color
    let outerBR: string | null = null; // bottom-right color
    if (edgeType & BDR_RAISEDOUTER) {
      outerTL = sysColor(COLOR_3DLIGHT);
      outerBR = sysColor(COLOR_3DDKSHADOW);
    } else if (edgeType & BDR_SUNKENOUTER) {
      outerTL = sysColor(COLOR_3DDKSHADOW);
      outerBR = sysColor(COLOR_3DLIGHT);
    }

    // Inner edge
    let innerTL: string | null = null;
    let innerBR: string | null = null;
    if (edgeType & BDR_RAISEDINNER) {
      innerTL = sysColor(COLOR_BTNHIGHLIGHT);
      innerBR = sysColor(COLOR_BTNSHADOW);
    } else if (edgeType & BDR_SUNKENINNER) {
      innerTL = sysColor(COLOR_BTNSHADOW);
      innerBR = sysColor(COLOR_BTNHIGHLIGHT);
    }

    // Draw outer edge
    if (outerTL && outerBR) {
      if (grfFlags & BF_TOP) { ctx.fillStyle = outerTL; ctx.fillRect(left, top, right - left, 1); }
      if (grfFlags & BF_LEFT) { ctx.fillStyle = outerTL; ctx.fillRect(left, top, 1, bottom - top); }
      if (grfFlags & BF_BOTTOM) { ctx.fillStyle = outerBR; ctx.fillRect(left, bottom - 1, right - left, 1); }
      if (grfFlags & BF_RIGHT) { ctx.fillStyle = outerBR; ctx.fillRect(right - 1, top, 1, bottom - top); }
      if (grfFlags & BF_TOP) top++;
      if (grfFlags & BF_LEFT) left++;
      if (grfFlags & BF_BOTTOM) bottom--;
      if (grfFlags & BF_RIGHT) right--;
    }

    // Draw inner edge
    if (innerTL && innerBR) {
      if (grfFlags & BF_TOP) { ctx.fillStyle = innerTL; ctx.fillRect(left, top, right - left, 1); }
      if (grfFlags & BF_LEFT) { ctx.fillStyle = innerTL; ctx.fillRect(left, top, 1, bottom - top); }
      if (grfFlags & BF_BOTTOM) { ctx.fillStyle = innerBR; ctx.fillRect(left, bottom - 1, right - left, 1); }
      if (grfFlags & BF_RIGHT) { ctx.fillStyle = innerBR; ctx.fillRect(right - 1, top, 1, bottom - top); }
      if (grfFlags & BF_TOP) top++;
      if (grfFlags & BF_LEFT) left++;
      if (grfFlags & BF_BOTTOM) bottom--;
      if (grfFlags & BF_RIGHT) right--;
    }

    // BF_ADJUST: write back the adjusted rect
    if (grfFlags & BF_ADJUST) {
      emu.memory.writeU32(rectPtr, left);
      emu.memory.writeU32(rectPtr + 4, top);
      emu.memory.writeU32(rectPtr + 8, right);
      emu.memory.writeU32(rectPtr + 12, bottom);
    }

    emu.syncDCToCanvas(hdc);
    return 1;
  });

  user32.register('DrawFrameControl', 4, () => 1);
  user32.register('DrawFocusRect', 2, () => 1);
  user32.register('DrawIcon', 4, () => 1);

  // DrawIconEx(hdc, xLeft, yTop, hIcon, cxWidth, cyWidth, istepIfAniCur, hbrFlickerFreeDraw, diFlags)
  user32.register('DrawIconEx', 9, () => 1);
  user32.register('DrawAnimatedRects', 4, () => 1);

  user32.register('CreateCursor', 7, () => emu.handles.alloc('cursor', {}));

  // GetUpdateRect(hWnd, lpRect, bErase) → BOOL


  // ScrollWindowEx(hWnd, dx, dy, prcScroll, prcClip, hrgnUpdate, prcUpdate, flags) → int
  // Return SIMPLEREGION (1)

  // InvalidateRgn(hWnd, hRgn, bErase) → BOOL
}
