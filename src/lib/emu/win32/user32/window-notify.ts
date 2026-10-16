import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { getClientSize, clientStyle, getNonClientMetrics } from './_helpers';
import { WM_SIZE, WM_MOVE, WS_CHILD, WS_POPUP } from '../types';
import { SIZE_RESTORED } from '../constants-ctl';


/**
 * After WM_CREATE, CreateWindowEx sends WM_SIZE and WM_MOVE to child and popup windows
 * (overlapped windows get them when first shown) — see Wine win32u/window.c (WIN_NEED_SIZE).
 * Built-in controls without a guest procedure receive them through the built-in thunk.
 */
export function sendCreateSizeMessages(emu: Emulator, hwnd: number): void {
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  if (!wnd || !(wnd.style & (WS_CHILD | WS_POPUP))) return;
  const proc = wnd.wndProc || emu._builtinWndProcW;
  if (!proc) return;
  const { cw, ch } = getClientSize(clientStyle(emu, wnd), wnd.hMenu !== 0 && !(wnd.style & WS_CHILD), wnd.width, wnd.height, emu.isNE);
  const { bw, captionH, menuH } = getNonClientMetrics(wnd.style, wnd.hMenu !== 0 && !(wnd.style & WS_CHILD), emu.isNE);
  emu.callWndProc(proc, hwnd, WM_SIZE, SIZE_RESTORED, ((ch & 0xFFFF) << 16) | (cw & 0xFFFF));
  const after = emu.handles.get<WindowInfo>(hwnd);
  if (!after) return;
  const cx = (after.x + bw) & 0xFFFF;
  const cy = (after.y + bw + captionH + menuH) & 0xFFFF;
  emu.callWndProc(after.wndProc || proc, hwnd, WM_MOVE, 0, (cy << 16) | cx);
}
