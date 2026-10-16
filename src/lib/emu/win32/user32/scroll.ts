import type { Emulator } from '../../emulator';
import { scrollStateOf, clampScrollPos, updateScrollBarVisibility, showScrollBar, paintScrollBars } from './nc-scroll';
import {
  SB_HORZ, SB_VERT, SB_BOTH, SIF_RANGE, SIF_PAGE, SIF_POS, SIF_DISABLENOSCROLL, SIF_TRACKPOS,
} from '../constants-ctl';

export function registerScroll(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');
  const { memory } = emu;
  const getState = (hwnd: number, nBar: number) => scrollStateOf(emu, hwnd, nBar);

  // SetScrollPos(hWnd, nBar, nPos, bRedraw) -> int oldPos
  user32.register('SetScrollPos', 4, () => {
    const hwnd = emu.readArg(0), nBar = emu.readArg(1), nPos = emu.readArg(2);
    const state = getState(hwnd, nBar);
    const old = state.nPos;
    state.nPos = nPos | 0;
    clampScrollPos(state);
    paintScrollBars(emu, hwnd);
    return old;
  });

  // GetScrollPos(hWnd, nBar) -> int
  user32.register('GetScrollPos', 2, () => {
    const hwnd = emu.readArg(0), nBar = emu.readArg(1);
    return getState(hwnd, nBar).nPos;
  });

  // SetScrollInfo(hWnd, nBar, lpsi, bRedraw) -> int new position
  user32.register('SetScrollInfo', 4, () => {
    const hwnd = emu.readArg(0), nBar = emu.readArg(1), lpsi = emu.readArg(2);
    const fMask = memory.readU32(lpsi + 4);
    const state = getState(hwnd, nBar);
    if (fMask & SIF_RANGE) {
      state.nMin = memory.readI32(lpsi + 8);
      state.nMax = memory.readI32(lpsi + 12);
    }
    if (fMask & SIF_PAGE) state.nPage = memory.readU32(lpsi + 16);
    if (fMask & SIF_POS) state.nPos = memory.readI32(lpsi + 20);
    if (fMask & (SIF_RANGE | SIF_PAGE | SIF_POS)) clampScrollPos(state);
    if (fMask & (SIF_RANGE | SIF_PAGE)) updateScrollBarVisibility(emu, hwnd, nBar, !!(fMask & SIF_DISABLENOSCROLL));
    else paintScrollBars(emu, hwnd);
    return state.nPos;
  });

  // GetScrollInfo(hWnd, nBar, lpsi) -> BOOL
  user32.register('GetScrollInfo', 3, () => {
    const hwnd = emu.readArg(0), nBar = emu.readArg(1), lpsi = emu.readArg(2);
    const fMask = memory.readU32(lpsi + 4);
    const state = getState(hwnd, nBar);
    if (fMask & SIF_RANGE) {
      memory.writeU32(lpsi + 8, state.nMin);
      memory.writeU32(lpsi + 12, state.nMax);
    }
    if (fMask & SIF_PAGE) memory.writeU32(lpsi + 16, state.nPage);
    if (fMask & SIF_POS) memory.writeU32(lpsi + 20, state.nPos);
    if (fMask & SIF_TRACKPOS) memory.writeU32(lpsi + 24, state.nTrackPos);
    return 1;
  });

  // SetScrollRange(hWnd, nBar, nMinPos, nMaxPos, bRedraw) -> BOOL
  user32.register('SetScrollRange', 5, () => {
    const hwnd = emu.readArg(0), nBar = emu.readArg(1), nMinPos = emu.readArg(2), nMaxPos = emu.readArg(3);
    const state = getState(hwnd, nBar);
    state.nMin = nMinPos | 0;
    state.nMax = nMaxPos | 0;
    clampScrollPos(state);
    updateScrollBarVisibility(emu, hwnd, nBar, false);
    return 1;
  });

  // GetScrollRange(hWnd, nBar, lpMinPos, lpMaxPos) -> BOOL
  user32.register('GetScrollRange', 4, () => {
    const hwnd = emu.readArg(0), nBar = emu.readArg(1), lpMinPos = emu.readArg(2), lpMaxPos = emu.readArg(3);
    const state = getState(hwnd, nBar);
    memory.writeU32(lpMinPos, state.nMin);
    memory.writeU32(lpMaxPos, state.nMax);
    return 1;
  });

  // ShowScrollBar(hWnd, wBar, bShow) -> BOOL
  user32.register('ShowScrollBar', 3, () => {
    const hwnd = emu.readArg(0), bar = emu.readArg(1), show = emu.readArg(2) !== 0;
    if (bar === SB_HORZ || bar === SB_BOTH) showScrollBar(emu, hwnd, SB_HORZ, show);
    if (bar === SB_VERT || bar === SB_BOTH) showScrollBar(emu, hwnd, SB_VERT, show);
    paintScrollBars(emu, hwnd);
    return 1;
  });
  user32.register('EnableScrollBar', 3, () => 1);
}
