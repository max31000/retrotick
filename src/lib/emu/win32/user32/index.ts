import type { Emulator } from '../../emulator';
import { registerRegisterClass } from './register-class';
import { registerCreateWindow } from './create-window';
import { registerMessage } from './message';
import { registerWndProc } from './wndproc';
import { registerPaint } from './paint';
import { registerDialog } from './dialog';
import { registerTimer } from './timer';
import { registerRect } from './rect';
import { registerMenu } from './menu';
import { registerResource } from './resource';
import { registerInput } from './input';
import { registerWindowLong } from './window-long';
import { registerText } from './text';
import { registerScroll } from './scroll';
import { registerFocus } from './focus';
import { registerMisc } from './misc';
import { registerClipboard } from './clipboard';
import { registerDde } from './dde';

export type { WindowInfo, WndClassInfo } from './types';

export function registerUser32(emu: Emulator): void {
  registerRegisterClass(emu);
  registerCreateWindow(emu);
  registerMessage(emu);
  registerWndProc(emu);
  registerPaint(emu);
  registerDialog(emu);
  registerTimer(emu);
  registerRect(emu);
  registerMenu(emu);
  registerResource(emu);
  registerInput(emu);
  registerWindowLong(emu);
  registerText(emu);
  registerScroll(emu);
  registerFocus(emu);
  registerMisc(emu);
  registerClipboard(emu);
  registerDde(emu);
}
