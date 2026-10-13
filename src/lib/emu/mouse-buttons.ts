// Mouse button state → Win32 button messages.
//
// Browsers report chorded button changes (a second button pressed or released while another is
// held) as `pointermove`, not `pointerdown`/`pointerup`, so button messages are synthesized from
// the difference between successive `PointerEvent.buttons` masks. Double clicks are detected the
// way the Windows message queue does it (cf. Wine's process_mouse_message): same button, same
// target window, within GetDoubleClickTime() and inside the SM_CXDOUBLECLK x SM_CYDOUBLECLK
// rectangle; the DBLCLK message is only delivered if the target's class has CS_DBLCLKS,
// otherwise the second press stays a plain DOWN.
import {
  WM_LBUTTONDOWN, WM_LBUTTONUP, WM_LBUTTONDBLCLK, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_RBUTTONDBLCLK,
  WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MBUTTONDBLCLK, MK_LBUTTON, MK_RBUTTON, MK_MBUTTON, CS_DBLCLKS,
} from './win32/types';

/** PointerEvent.buttons bits */
export const BUTTON_BIT_LEFT = 1;
export const BUTTON_BIT_RIGHT = 2;
export const BUTTON_BIT_MIDDLE = 4;
/** PointerEvent.button (0 = left, 1 = middle, 2 = right) → PointerEvent.buttons bit */
export const POINTER_BUTTON_TO_BIT: Record<number, number> = { 0: BUTTON_BIT_LEFT, 1: BUTTON_BIT_MIDDLE, 2: BUTTON_BIT_RIGHT };

interface ButtonDef { bit: number; down: number; up: number; dbl: number; mk: number }

const BUTTONS: ButtonDef[] = [
  { bit: BUTTON_BIT_LEFT, down: WM_LBUTTONDOWN, up: WM_LBUTTONUP, dbl: WM_LBUTTONDBLCLK, mk: MK_LBUTTON },
  { bit: BUTTON_BIT_RIGHT, down: WM_RBUTTONDOWN, up: WM_RBUTTONUP, dbl: WM_RBUTTONDBLCLK, mk: MK_RBUTTON },
  { bit: BUTTON_BIT_MIDDLE, down: WM_MBUTTONDOWN, up: WM_MBUTTONUP, dbl: WM_MBUTTONDBLCLK, mk: MK_MBUTTON },
];

export interface ButtonTransition { bit: number; pressed: boolean }

/** MK_* flags for a PointerEvent.buttons mask. */
export function mkFlagsFromButtons(buttons: number): number {
  let flags = 0;
  for (const b of BUTTONS) if (buttons & b.bit) flags |= b.mk;
  return flags;
}

/** Button presses/releases between two PointerEvent.buttons masks (left, right, middle order). */
export function diffButtons(prev: number, next: number): ButtonTransition[] {
  const out: ButtonTransition[] = [];
  for (const b of BUTTONS) {
    const was = (prev & b.bit) !== 0, is = (next & b.bit) !== 0;
    if (was !== is) out.push({ bit: b.bit, pressed: is });
  }
  return out;
}

export function buttonUpMessage(bit: number): number {
  return BUTTONS.find(b => b.bit === bit)!.up;
}

export interface DoubleClickSettings { time: number; cx: number; cy: number }

/** Per-queue double-click state. */
export class DoubleClickTracker {
  private last: { bit: number; hwnd: number; x: number; y: number; time: number } | null = null;

  /**
   * Message for a button press at screen point (x, y) targeting hwnd.
   * `classDblClks` = target window class has CS_DBLCLKS.
   */
  pressMessage(bit: number, hwnd: number, x: number, y: number, time: number,
    classDblClks: boolean, cfg: DoubleClickSettings): number {
    const def = BUTTONS.find(b => b.bit === bit)!;
    const l = this.last;
    const isDouble = !!l && l.bit === bit && l.hwnd === hwnd
      && time - l.time < cfg.time
      && Math.abs(x - l.x) < cfg.cx / 2 + 1 && Math.abs(y - l.y) < cfg.cy / 2 + 1;
    if (isDouble && classDblClks) {
      this.last = null; // a third press starts a new click sequence
      return def.dbl;
    }
    this.last = { bit, hwnd, x, y, time };
    return def.down;
  }

  reset(): void { this.last = null; }
}

/** The parts of the emulator the button logic needs (kept structural for testability). */
export interface MouseQueueOwner {
  doubleClickTime: number;
  doubleClickCx: number;
  doubleClickCy: number;
  dblClickTracker: DoubleClickTracker;
  handles: { get<T>(h: number): T | null };
}

/**
 * Win32 message for a button transition delivered to `hwnd`. (x, y) are in a single coordinate
 * space shared by all clicks (e.g. canvas/screen pixels), `time` in milliseconds.
 */
export function buttonMessage(owner: MouseQueueOwner, t: ButtonTransition, hwnd: number,
  x: number, y: number, time: number): number {
  if (!t.pressed) return buttonUpMessage(t.bit);
  const wnd = owner.handles.get<{ classInfo?: { style: number } }>(hwnd);
  const classDblClks = ((wnd?.classInfo?.style ?? 0) & CS_DBLCLKS) !== 0;
  return owner.dblClickTracker.pressMessage(t.bit, hwnd, x, y, time, classDblClks,
    { time: owner.doubleClickTime, cx: owner.doubleClickCx, cy: owner.doubleClickCy });
}
