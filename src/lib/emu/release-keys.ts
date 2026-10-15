import type { Emulator } from './emulator';
import { WM_KEYUP } from './win32/types';

/** lParam of a key release: repeat 1, previous state down, transition up */
const KEYUP_LPARAM = 1 | (3 << 30);

/**
 * Release every key the program believes is held (host focus left the page, the tab was hidden,
 * or input got blocked): WM_KEYUP for each, then the key state tables are cleared so
 * GetKeyState/GetAsyncKeyState report them up. Returns the released virtual-key codes.
 */
export function releaseHeldKeys(emu: Emulator): number[] {
  const held = [...emu.keyStates];
  const target = emu.focusedWindow || emu.mainWindow;
  if (target) for (const vk of held) emu.postMessage(target, WM_KEYUP, vk, KEYUP_LPARAM);
  emu.keyStates.clear();
  emu.msgKeyState = null;
  return held;
}
