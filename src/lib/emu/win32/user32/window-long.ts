import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { getClientSize } from './_helpers';

export function registerWindowLong(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');
  // Built-in controls have no guest window procedure; expose the callable thunk so
  // subclassing (SetWindowLong(GWL_WNDPROC) + CallWindowProc(old)) keeps native behavior.
  const builtinProc = (): number => emu._builtinWndProcW || 0;

  user32.register('GetWindowLongA', 2, () => {
    const hwnd = emu.readArg(0);
    const index = emu.readArg(1) | 0;
    const wnd = emu.handles.get<WindowInfo>(hwnd);
    if (!wnd) return 0;

    if (index === -16) return wnd.style; // GWL_STYLE
    if (index === -20) return wnd.exStyle; // GWL_EXSTYLE
    if (index === -21) return wnd.userData; // GWL_USERDATA
    if (index === -4) return wnd.wndProc || builtinProc(); // GWL_WNDPROC
    if (index === -12) return wnd.controlId ?? 0; // GWL_ID
    if (index === -6) return wnd.classInfo?.hInstance ?? emu.pe?.imageBase ?? 0; // GWL_HINSTANCE

    // Positive index: extra bytes
    if (index >= 0 && index + 4 <= wnd.extraBytes.length) {
      return (wnd.extraBytes[index] | (wnd.extraBytes[index + 1] << 8) |
        (wnd.extraBytes[index + 2] << 16) | (wnd.extraBytes[index + 3] << 24)) >>> 0;
    }
    return 0;
  });

  const setWindowLongImpl = (): number => {
    const hwnd = emu.readArg(0);
    const index = emu.readArg(1) | 0;
    const value = emu.readArg(2);
    const wnd = emu.handles.get<WindowInfo>(hwnd);
    if (!wnd) return 0;

    let old = 0;
    if (index === -4) { // GWL_WNDPROC
      old = wnd.wndProc || builtinProc();
      // Restoring the built-in control procedure returns the window to native handling
      wnd.wndProc = (value === emu._builtinWndProcA || value === emu._builtinWndProcW) ? 0 : value;
    }
    else if (index === -16) {
      old = wnd.style; wnd.style = value;
      if (hwnd === emu.mainWindow) {
        const { cw, ch } = getClientSize(wnd.style, wnd.hMenu !== 0, wnd.width, wnd.height);
        emu.setupCanvasSize(cw, ch);
        emu.onWindowChange?.(wnd);
      }
    }
    else if (index === -12) { old = wnd.controlId ?? 0; wnd.controlId = value; } // GWL_ID
    else if (index === -20) { old = wnd.exStyle; wnd.exStyle = value; }
    else if (index === -21) { old = wnd.userData; wnd.userData = value; }
    else if (index >= 0 && index + 4 <= wnd.extraBytes.length) {
      old = (wnd.extraBytes[index] | (wnd.extraBytes[index + 1] << 8) |
        (wnd.extraBytes[index + 2] << 16) | (wnd.extraBytes[index + 3] << 24)) >>> 0;
      wnd.extraBytes[index] = value & 0xFF;
      wnd.extraBytes[index + 1] = (value >> 8) & 0xFF;
      wnd.extraBytes[index + 2] = (value >> 16) & 0xFF;
      wnd.extraBytes[index + 3] = (value >> 24) & 0xFF;
    }
    return old;
  };

  // W versions are identical to A
  user32.register('GetWindowLongW', 2, emu.apiDefs.get('USER32.DLL:GetWindowLongA')?.handler!);
  // Subclassing through the A or W function sets the window's character set (IsWindowUnicode)
  const setLong = (wide: boolean) => () => {
    const wnd = emu.handles.get<WindowInfo>(emu.readArg(0));
    const index = emu.readArg(1) | 0;
    const r = setWindowLongImpl();
    if (wnd && index === -4) wnd.unicode = wide;
    return r;
  };
  user32.register('SetWindowLongA', 3, setLong(false));
  user32.register('SetWindowLongW', 3, setLong(true));

  const getPropKey = (namePtr: number, wide: boolean): string => {
    if (namePtr < 0x10000) return `#ATOM:${namePtr}`;
    return wide ? emu.memory.readUTF16String(namePtr) : emu.memory.readCString(namePtr);
  };

  user32.register('SetPropA', 3, () => {
    const hwnd = emu.readArg(0);
    const namePtr = emu.readArg(1);
    const value = emu.readArg(2);
    const wnd = emu.handles.get<WindowInfo>(hwnd);
    if (!wnd) return 0;
    if (!wnd.props) wnd.props = new Map();
    wnd.props.set(getPropKey(namePtr, false), value);
    return 1;
  });

  user32.register('GetPropA', 2, () => {
    const hwnd = emu.readArg(0);
    const namePtr = emu.readArg(1);
    const wnd = emu.handles.get<WindowInfo>(hwnd);
    return wnd?.props?.get(getPropKey(namePtr, false)) ?? 0;
  });

  user32.register('RemovePropA', 2, () => {
    const hwnd = emu.readArg(0);
    const namePtr = emu.readArg(1);
    const wnd = emu.handles.get<WindowInfo>(hwnd);
    const key = getPropKey(namePtr, false);
    const val = wnd?.props?.get(key) ?? 0;
    wnd?.props?.delete(key);
    return val;
  });

  user32.register('SetPropW', 3, () => {
    const hwnd = emu.readArg(0);
    const namePtr = emu.readArg(1);
    const value = emu.readArg(2);
    const wnd = emu.handles.get<WindowInfo>(hwnd);
    if (!wnd) return 0;
    if (!wnd.props) wnd.props = new Map();
    wnd.props.set(getPropKey(namePtr, true), value);
    return 1;
  });

  user32.register('GetPropW', 2, () => {
    const hwnd = emu.readArg(0);
    const namePtr = emu.readArg(1);
    const wnd = emu.handles.get<WindowInfo>(hwnd);
    return wnd?.props?.get(getPropKey(namePtr, true)) ?? 0;
  });

  user32.register('RemovePropW', 2, () => {
    const hwnd = emu.readArg(0);
    const namePtr = emu.readArg(1);
    const wnd = emu.handles.get<WindowInfo>(hwnd);
    const key = getPropKey(namePtr, true);
    const val = wnd?.props?.get(key) ?? 0;
    wnd?.props?.delete(key);
    return val;
  });

  user32.register('SetClassLongA', 3, () => 0);
  user32.register('SetClassLongW', 3, () => 0);
  user32.register('GetClassLongW', 2, () => 0);
  user32.register('GetClassLongA', 2, () => 0);
}
