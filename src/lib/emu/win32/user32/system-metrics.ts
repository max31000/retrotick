// GetSystemMetrics values and the NONCLIENTMETRICS / icon-title font blocks of
// SystemParametersInfo, shared so every caller sees one consistent set of metrics.
import type { Emulator } from '../../emulator';
import { getLocalePreset } from '../../../regional-settings';
import {
  SM_CXSCREEN, SM_CYSCREEN, SM_CYMENU, SM_CYCAPTION, SM_CXBORDER, SM_CYBORDER,
  SM_CXFRAME, SM_CYFRAME, SM_CXEDGE, SM_CYEDGE, SM_CXFIXEDFRAME, SM_CYFIXEDFRAME,
  SM_CXSIZE, SM_CYSIZE,
  SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
  SM_CXDOUBLECLK, SM_CYDOUBLECLK, SM_CXDRAG, SM_CYDRAG, SM_CMOUSEBUTTONS,
  DEFAULT_DRAG_CX, DEFAULT_DRAG_CY, DEFAULT_MOUSE_BUTTONS,
} from '../types';
import {
  SM_CXVSCROLL, SM_CYHSCROLL, SM_CYVTHUMB, SM_CXHTHUMB, SM_CXICON, SM_CYICON, SM_CXCURSOR, SM_CYCURSOR,
  SM_CXFULLSCREEN, SM_CYFULLSCREEN, SM_CYVSCROLL, SM_CXHSCROLL, SM_CXMIN, SM_CYMIN, SM_CXMINTRACK,
  SM_CYMINTRACK, SM_CXICONSPACING, SM_CYICONSPACING, SM_CXMINSPACING, SM_CYMINSPACING, SM_CXSMICON,
  SM_CYSMICON, SM_CYSMCAPTION, SM_CXSMSIZE, SM_CYSMSIZE, SM_CXMENUSIZE, SM_CYMENUSIZE, SM_CXMINIMIZED,
  SM_CYMINIMIZED, SM_CXMAXTRACK, SM_CYMAXTRACK, SM_CXMAXIMIZED, SM_CYMAXIMIZED, SM_CXMENUCHECK,
  SM_CYMENUCHECK, SM_CMONITORS, SM_SAMEDISPLAYFORMAT,
  METRIC_SCROLL_SIZE, METRIC_ICON_SIZE, METRIC_SMALL_ICON_SIZE, METRIC_ICON_SPACING, METRIC_SM_CAPTION,
  METRIC_SM_SIZE_CX, METRIC_SM_SIZE_CY, METRIC_MENU_SIZE, METRIC_MENU_CHECK, METRIC_MIN_TRACK_CX,
  METRIC_MIN_TRACK_CY, METRIC_MINIMIZED_CX, METRIC_MINIMIZED_CY,
  LOGFONTA_SIZE, LOGFONTW_SIZE, LF_FACESIZE, NONCLIENTMETRICSA_SIZE, NONCLIENTMETRICSW_SIZE,
  FW_NORMAL_WEIGHT, FW_BOLD_WEIGHT,
} from '../constants-user';
import { CODEPAGE_CHARSET, ANSI_CHARSET } from '../constants-gdi';

const CAPTION_HEIGHT = 18;
const MENU_HEIGHT = 19;
const FRAME_SIZE = 4;
const CAPTION_BUTTON_SIZE = 18;

export function getSystemMetric(emu: Emulator, idx: number): number {
  const sw = emu.screenWidth, sh = emu.screenHeight;
  switch (idx) {
    case SM_CXSCREEN: case SM_CXVIRTUALSCREEN: return sw;
    case SM_CYSCREEN: case SM_CYVIRTUALSCREEN: return sh;
    case SM_XVIRTUALSCREEN: case SM_YVIRTUALSCREEN: return 0;
    case SM_CYMENU: return MENU_HEIGHT;
    case SM_CYCAPTION: return CAPTION_HEIGHT;
    case SM_CXBORDER: case SM_CYBORDER: return 1;
    case SM_CXEDGE: case SM_CYEDGE: return 2;
    case SM_CXFRAME: case SM_CYFRAME: return FRAME_SIZE;
    case SM_CXFIXEDFRAME: case SM_CYFIXEDFRAME: return 3;
    case SM_CXSIZE: case SM_CYSIZE: return CAPTION_BUTTON_SIZE;
    case SM_CXDOUBLECLK: return emu.doubleClickCx;
    case SM_CYDOUBLECLK: return emu.doubleClickCy;
    case SM_CXDRAG: return DEFAULT_DRAG_CX;
    case SM_CYDRAG: return DEFAULT_DRAG_CY;
    case SM_CMOUSEBUTTONS: return DEFAULT_MOUSE_BUTTONS;
    case SM_CXVSCROLL: case SM_CYHSCROLL: case SM_CYVSCROLL: case SM_CXHSCROLL:
    case SM_CYVTHUMB: case SM_CXHTHUMB: return METRIC_SCROLL_SIZE;
    case SM_CXICON: case SM_CYICON: case SM_CXCURSOR: case SM_CYCURSOR: return METRIC_ICON_SIZE;
    case SM_CXSMICON: case SM_CYSMICON: return METRIC_SMALL_ICON_SIZE;
    case SM_CXICONSPACING: case SM_CYICONSPACING: return METRIC_ICON_SPACING;
    // Client area of a maximized window on the work area (whole screen here)
    case SM_CXFULLSCREEN: return sw;
    case SM_CYFULLSCREEN: return sh - CAPTION_HEIGHT;
    case SM_CXMIN: case SM_CXMINTRACK: return METRIC_MIN_TRACK_CX;
    case SM_CYMIN: case SM_CYMINTRACK: return METRIC_MIN_TRACK_CY;
    case SM_CXMINSPACING: case SM_CXMINIMIZED: return METRIC_MINIMIZED_CX;
    case SM_CYMINSPACING: case SM_CYMINIMIZED: return METRIC_MINIMIZED_CY;
    case SM_CYSMCAPTION: return METRIC_SM_CAPTION;
    case SM_CXSMSIZE: return METRIC_SM_SIZE_CX;
    case SM_CYSMSIZE: return METRIC_SM_SIZE_CY;
    case SM_CXMENUSIZE: case SM_CYMENUSIZE: return METRIC_MENU_SIZE;
    case SM_CXMENUCHECK: case SM_CYMENUCHECK: return METRIC_MENU_CHECK;
    case SM_CXMAXTRACK: return sw + 2 * (FRAME_SIZE + 2);
    case SM_CYMAXTRACK: return sh + 2 * (FRAME_SIZE + 2);
    case SM_CXMAXIMIZED: return sw + 2 * FRAME_SIZE;
    case SM_CYMAXIMIZED: return sh + 2 * FRAME_SIZE;
    case SM_CMONITORS: case SM_SAMEDISPLAYFORMAT: return 1;
    default: return 0;
  }
}

interface LogFontSpec { height: number; weight: number; face: string }
const UI_FONT: LogFontSpec = { height: -11, weight: FW_NORMAL_WEIGHT, face: 'Tahoma' };
const SM_CAPTION_FONT: LogFontSpec = { height: -11, weight: FW_BOLD_WEIGHT, face: 'Tahoma' };
const CAPTION_FONT: LogFontSpec = { height: -13, weight: FW_BOLD_WEIGHT, face: 'Trebuchet MS' };

function uiCharset(emu: Emulator): number {
  return CODEPAGE_CHARSET[getLocalePreset(emu.configuredLcid).ansiCodePage] ?? ANSI_CHARSET;
}

/** Write a LOGFONTA/W at p. */
export function writeLogFont(emu: Emulator, p: number, wide: boolean, f: LogFontSpec): void {
  const size = wide ? LOGFONTW_SIZE : LOGFONTA_SIZE;
  for (let i = 0; i < size; i += 4) emu.memory.writeU32(p + i, 0);
  emu.memory.writeU32(p, f.height >>> 0);
  emu.memory.writeU32(p + 16, f.weight);
  emu.memory.writeU8(p + 23, uiCharset(emu));
  const n = Math.min(f.face.length, LF_FACESIZE - 1);
  for (let i = 0; i < n; i++) {
    if (wide) emu.memory.writeU16(p + 28 + i * 2, f.face.charCodeAt(i));
    else emu.memory.writeU8(p + 28 + i, f.face.charCodeAt(i));
  }
}

/** SPI_GETICONTITLELOGFONT */
export function writeIconTitleFont(emu: Emulator, p: number, wide: boolean): boolean {
  if (!p) return false;
  writeLogFont(emu, p, wide, UI_FONT);
  return true;
}

/** SPI_GETNONCLIENTMETRICS: cbSize must be at least the XP structure size. */
export function writeNonClientMetrics(emu: Emulator, p: number, wide: boolean): boolean {
  if (!p) return false;
  const need = wide ? NONCLIENTMETRICSW_SIZE : NONCLIENTMETRICSA_SIZE;
  const cb = emu.memory.readU32(p);
  if (cb < need) return false;
  const lf = wide ? LOGFONTW_SIZE : LOGFONTA_SIZE;
  const m = emu.memory;
  m.writeU32(p + 4, 1);                                // iBorderWidth
  m.writeU32(p + 8, METRIC_SCROLL_SIZE);               // iScrollWidth
  m.writeU32(p + 12, METRIC_SCROLL_SIZE);              // iScrollHeight
  m.writeU32(p + 16, CAPTION_BUTTON_SIZE);             // iCaptionWidth
  m.writeU32(p + 20, CAPTION_BUTTON_SIZE);             // iCaptionHeight
  let o = p + 24;
  writeLogFont(emu, o, wide, CAPTION_FONT); o += lf;   // lfCaptionFont
  m.writeU32(o, METRIC_SM_SIZE_CX); m.writeU32(o + 4, METRIC_SM_SIZE_CY); o += 8;
  writeLogFont(emu, o, wide, SM_CAPTION_FONT); o += lf; // lfSmCaptionFont
  m.writeU32(o, METRIC_MENU_SIZE); m.writeU32(o + 4, METRIC_MENU_SIZE); o += 8;
  writeLogFont(emu, o, wide, UI_FONT); o += lf;        // lfMenuFont
  writeLogFont(emu, o, wide, UI_FONT); o += lf;        // lfStatusFont
  writeLogFont(emu, o, wide, UI_FONT); o += lf;        // lfMessageFont
  if (cb >= need + 4) m.writeU32(o, 0);                // iPaddedBorderWidth (Vista+)
  return true;
}
