import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { WM_SETFOCUS, WM_KILLFOCUS } from '../types';

/**
 * SetFocus semantics (Wine dlls/user32/focus.c): the window losing focus gets WM_KILLFOCUS
 * (wParam = new focus), then the new one gets WM_SETFOCUS (wParam = previous focus).
 * Returns the previous focus window, or 0 if hwnd is not a window.
 */
export function setFocusWindow(emu: Emulator, hwnd: number): number {
  const prev = emu.focusedWindow;
  const wnd = hwnd ? emu.handles.get<WindowInfo>(hwnd) : null;
  if (hwnd && (!wnd || emu.handles.getType(hwnd) !== 'window')) return 0;
  if (hwnd === prev) return prev;
  emu.focusedWindow = hwnd;
  const prevWnd = prev ? emu.handles.get<WindowInfo>(prev) : null;
  if (prevWnd?.wndProc && emu.handles.getType(prev) === 'window') emu.callWndProc(prevWnd.wndProc, prev, WM_KILLFOCUS, hwnd, 0);
  // The WM_KILLFOCUS handler may have moved the focus elsewhere
  if (wnd?.wndProc && emu.focusedWindow === hwnd) emu.callWndProc(wnd.wndProc, hwnd, WM_SETFOCUS, prev, 0);
  return prev;
}

export function registerFocus(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');

  user32.register('GetFocus', 0, () => {
    // If focus is on a child window, return it directly
    const focusedHwnd = emu.focusedWindow;
    if (focusedHwnd) {
      const wnd = emu.handles.get<WindowInfo>(focusedHwnd);
      if (wnd && (wnd.style & 0x40000000)) return focusedHwnd; // WS_CHILD
    }
    // If focus is on a top-level window or not set, return the first visible child
    // (in real Windows, SetFocus on a parent propagates to a child)
    const parentHwnd = focusedHwnd || emu.mainWindow;
    const parentWnd = emu.handles.get<WindowInfo>(parentHwnd);
    if (parentWnd?.childList) {
      for (const childHwnd of parentWnd.childList) {
        const child = emu.handles.get<WindowInfo>(childHwnd);
        if (child?.visible) return childHwnd;
      }
    }
    return focusedHwnd;
  });

  user32.register('SetFocus', 1, () => setFocusWindow(emu, emu.readArg(0)));

  user32.register('GetActiveWindow', 0, () => emu.mainWindow || 0);
  user32.register('SetActiveWindow', 1, () => emu.readArg(0));
  user32.register('GetForegroundWindow', 0, () => emu.mainWindow || 0);
  user32.register('SetForegroundWindow', 1, () => 1);
}
