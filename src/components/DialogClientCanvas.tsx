import { useCallback } from 'preact/hooks';
import type { Emulator } from '../lib/emu/emulator';
import type { WindowInfo } from '../lib/emu/win32/user32/index';
import { invalidateWindow } from '../lib/emu/win32/user32/update-region';

/**
 * Client-area canvas of a dialog shown in the DOM overlay. The dialog's own painting
 * (WM_PAINT / WM_ERASEBKGND / GetDC) goes here instead of the main window canvas, so it
 * neither shows up under the overlay nor stays behind when the dialog closes.
 */
export function DialogClientCanvas({ hwnd, width, height, emuRef }: {
  hwnd: number; width: number; height: number; emuRef: { current: Emulator | null };
}) {
  const ref = useCallback((el: HTMLCanvasElement | null) => {
    const emu = emuRef.current;
    const wnd = emu?.handles.get<WindowInfo>(hwnd);
    if (!emu || !wnd) return;
    const oldDC = emu.windowDCs.get(hwnd);
    if (oldDC) { emu.handles.free(oldDC); emu.windowDCs.delete(hwnd); }
    if (el) {
      el.width = width;
      el.height = height;
      wnd.domCanvas = el;
      invalidateWindow(emu, wnd, null, true);
      emu.postMessage(hwnd, 0, 0, 0); // WM_NULL wakes a parked message loop
    } else if (wnd.domCanvas) {
      wnd.domCanvas = undefined;
    }
  }, [hwnd, width, height]);
  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', left: 0, top: 0, width: `${width}px`, height: `${height}px`, pointerEvents: 'none' }}
    />
  );
}
