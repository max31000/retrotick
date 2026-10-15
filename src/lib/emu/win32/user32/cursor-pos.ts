// Cursor position in screen coordinates (GetCursorPos / GetMessagePos / WindowFromPoint).
// The emulator tracks the mouse in main-window client coordinates (emu.cursorPos); the main
// window's client origin on the emulated screen converts between the two.
import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { getNonClientMetrics } from './_helpers';

/** Screen position of the main window's client-area origin. */
export function mainClientOrigin(emu: Emulator): { x: number; y: number } {
  const main = emu.handles.get<WindowInfo>(emu.mainWindow);
  if (!main) return { x: 0, y: 0 };
  const { bw, captionH, menuH } = getNonClientMetrics(main.style, main.hMenu !== 0, emu.isNE);
  return { x: (main.x || 0) + bw, y: (main.y || 0) + bw + captionH + menuH };
}

export function registerCursorPos(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');

  user32.register('GetCursorPos', 1, () => {
    const ptr = emu.readArg(0);
    if (!ptr) return 0;
    const o = mainClientOrigin(emu);
    emu.memory.writeU32(ptr, (o.x + emu.cursorPos.x) | 0);
    emu.memory.writeU32(ptr + 4, (o.y + emu.cursorPos.y) | 0);
    return 1;
  });

  user32.register('SetCursorPos', 2, () => {
    const o = mainClientOrigin(emu);
    emu.cursorPos = { x: (emu.readArg(0) | 0) - o.x, y: (emu.readArg(1) | 0) - o.y };
    return 1;
  });

  // GetMessagePos: screen position of the cursor (the emulator queues input as it happens)
  user32.register('GetMessagePos', 0, () => {
    const o = mainClientOrigin(emu);
    const x = (o.x + emu.cursorPos.x) & 0xFFFF, y = (o.y + emu.cursorPos.y) & 0xFFFF;
    return ((y << 16) | x) >>> 0;
  });

  // WindowFromPoint(POINT pt) — POINT passed by value (x, y)
  user32.register('WindowFromPoint', 2, () => {
    const sx = emu.readArg(0) | 0, sy = emu.readArg(1) | 0;
    const main = emu.handles.get<WindowInfo>(emu.mainWindow);
    if (!main) return 0;
    const o = mainClientOrigin(emu);
    const cx = sx - o.x, cy = sy - o.y;
    const cw = emu.canvas?.width ?? 0, ch = emu.canvas?.height ?? 0;
    if (cx >= 0 && cy >= 0 && cx < cw && cy < ch) return emu.windowFromPoint(cx, cy).hwnd;
    const inFrame = sx >= main.x && sy >= main.y && sx < main.x + main.width && sy < main.y + main.height;
    return inFrame ? emu.mainWindow : 0;
  });
}
