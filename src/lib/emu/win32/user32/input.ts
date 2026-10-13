import type { Emulator } from '../../emulator';
import { layoutForLcid } from '../../../regional-settings';

export function registerInput(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');

  // Mouse capture
  user32.register('SetCapture', 1, () => {
    const hwnd = emu.readArg(0);
    console.log(`[SetCapture] hwnd=0x${hwnd.toString(16)}`);
    emu.capturedWindow = hwnd;
    return 0;
  });

  user32.register('ReleaseCapture', 0, () => {
    emu.capturedWindow = 0;
    return 1;
  });

  user32.register('GetCapture', 0, () => {
    return emu.capturedWindow;
  });

  user32.register('GetCursorPos', 1, () => {
    const ptr = emu.readArg(0);
    emu.memory.writeU32(ptr, 0);
    emu.memory.writeU32(ptr + 4, 0);
    return 1;
  });

  user32.register('SetCursor', 1, () => {
    const hCursor = emu.readArg(0);
    const prev = emu.currentCursor;
    const cursorInfo2 = emu.handles.get<{ css?: string }>(hCursor);
    console.log(`[SetCursor] hCursor=0x${hCursor.toString(16)} css=${cursorInfo2?.css}`);
    emu.currentCursor = hCursor;
    const cursorInfo = emu.handles.get<{ css?: string }>(hCursor);
    if (emu.canvas) {
      const css = cursorInfo?.css || 'default';
      emu.canvas.style.cursor = css;
      if (emu.canvas.parentElement) {
        emu.canvas.parentElement.style.cursor = css;
      }
    }
    return prev;
  });
  user32.register('GetCursor', 0, () => emu.currentCursor);
  user32.register('ShowCursor', 1, () => 1);
  // GetKeyState reflects the state as of the last input message retrieved from the queue
  user32.register('GetKeyState', 1, () => {
    const vk = emu.readArg(0) & 0xFF;
    return (emu.msgKeyState ?? emu.keyStates).has(vk) ? 0x8000 : 0;
  });
  user32.register('GetAsyncKeyState', 1, () => {
    const vk = emu.readArg(0) & 0xFF;
    return emu.keyStates.has(vk) ? 0x8000 : 0;
  });
  // GetKeyboardState(lpKeyState) — fills 256-byte array with key states
  user32.register('GetKeyboardState', 1, () => {
    const ptr = emu.readArg(0);
    for (let i = 0; i < 256; i++) {
      emu.memory.writeU8(ptr + i, (emu.msgKeyState ?? emu.keyStates).has(i) ? 0x80 : 0);
    }
    return 1;
  });

  user32.register('GetKeyNameTextA', 3, () => 0);
  user32.register('GetKeyNameTextW', 3, () => 0);

  // GetKeyboardLayout(idThread) — return HKL for configured layout
  user32.register('GetKeyboardLayout', 1, () => {
    const layout = layoutForLcid(emu.configuredLcid);
    return layout.hkl;
  });

  // LoadKeyboardLayoutA/W(pwszKLID, Flags) — return current HKL
  user32.register('LoadKeyboardLayoutW', 2, () => {
    const layout = layoutForLcid(emu.configuredLcid);
    return layout.hkl;
  });
  user32.register('LoadKeyboardLayoutA', 2, () => {
    const layout = layoutForLcid(emu.configuredLcid);
    return layout.hkl;
  });

  // ActivateKeyboardLayout(HKL, Flags) — return previous HKL
  user32.register('ActivateKeyboardLayout', 2, () => {
    const layout = layoutForLcid(emu.configuredLcid);
    return layout.hkl;
  });

  // GetKeyboardLayoutList(nBuff, lpList) - returns count of keyboard layouts
  user32.register('GetKeyboardLayoutList', 2, () => {
    const nBuff = emu.readArg(0);
    const lpList = emu.readArg(1);
    const layout = layoutForLcid(emu.configuredLcid);
    if (nBuff > 0 && lpList) {
      emu.memory.writeU32(lpList, layout.hkl);
    }
    return 1; // one layout
  });

  // GetKeyboardType(nTypeFlag): 0=type(4=enhanced), 1=subtype(0), 2=numFuncKeys(12)
  user32.register('GetKeyboardType', 1, () => {
    const nTypeFlag = emu.readArg(0);
    if (nTypeFlag === 0) return 4;   // IBM enhanced (101/102-key)
    if (nTypeFlag === 1) return 0;   // subtype (OEM dependent)
    if (nTypeFlag === 2) return 12;  // number of function keys
    return 0;
  });

  // GetKeyboardLayoutNameW(pwszKLID) → BOOL — writes "00000409" etc
}
