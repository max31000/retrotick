/**
 * System-level look of Windows XP for the runner: Luna "Normal color" system
 * colours (GetSysColor) and the Russian XP strings of the shell-drawn UI
 * (MessageBox buttons, system menu, ShellAbout).
 */
import {
  SYS_COLORS, COLOR_SCROLLBAR, COLOR_BACKGROUND, COLOR_ACTIVECAPTION, COLOR_INACTIVECAPTION,
  COLOR_MENU, COLOR_WINDOW, COLOR_WINDOWFRAME, COLOR_MENUTEXT, COLOR_WINDOWTEXT, COLOR_CAPTIONTEXT,
  COLOR_ACTIVEBORDER, COLOR_INACTIVEBORDER, COLOR_APPWORKSPACE, COLOR_HIGHLIGHT, COLOR_HIGHLIGHTTEXT,
  COLOR_BTNFACE, COLOR_BTNSHADOW, COLOR_GRAYTEXT, COLOR_BTNTEXT, COLOR_INACTIVECAPTIONTEXT,
  COLOR_BTNHIGHLIGHT, COLOR_3DDKSHADOW, COLOR_3DLIGHT, COLOR_INFOTEXT, COLOR_INFOBK,
} from '../lib/emu/win32/types';
import type { UiTheme } from '../components/win2k/theme';

/** RGB → COLORREF (0x00BBGGRR) */
const rgb = (r: number, g: number, b: number) => (b << 16) | (g << 8) | r;

/** Windows XP Luna (blue) system colours — HKCU\Control Panel\Colors of the default XP theme. */
export const LUNA_SYS_COLORS: Record<number, number> = {
  [COLOR_SCROLLBAR]: rgb(212, 208, 200),
  [COLOR_BACKGROUND]: rgb(0, 78, 152),
  [COLOR_ACTIVECAPTION]: rgb(0, 84, 227),
  [COLOR_INACTIVECAPTION]: rgb(122, 150, 223),
  [COLOR_MENU]: rgb(255, 255, 255),
  [COLOR_WINDOW]: rgb(255, 255, 255),
  [COLOR_WINDOWFRAME]: rgb(0, 0, 0),
  [COLOR_MENUTEXT]: rgb(0, 0, 0),
  [COLOR_WINDOWTEXT]: rgb(0, 0, 0),
  [COLOR_CAPTIONTEXT]: rgb(255, 255, 255),
  [COLOR_ACTIVEBORDER]: rgb(212, 208, 200),
  [COLOR_INACTIVEBORDER]: rgb(212, 208, 200),
  [COLOR_APPWORKSPACE]: rgb(128, 128, 128),
  [COLOR_HIGHLIGHT]: rgb(49, 106, 197),
  [COLOR_HIGHLIGHTTEXT]: rgb(255, 255, 255),
  [COLOR_BTNFACE]: rgb(236, 233, 216),
  [COLOR_BTNSHADOW]: rgb(172, 168, 153),
  [COLOR_GRAYTEXT]: rgb(172, 168, 153),
  [COLOR_BTNTEXT]: rgb(0, 0, 0),
  [COLOR_INACTIVECAPTIONTEXT]: rgb(216, 228, 248),
  [COLOR_BTNHIGHLIGHT]: rgb(255, 255, 255),
  [COLOR_3DDKSHADOW]: rgb(113, 111, 100),
  [COLOR_3DLIGHT]: rgb(241, 239, 226),
  [COLOR_INFOTEXT]: rgb(0, 0, 0),
  [COLOR_INFOBK]: rgb(255, 255, 225),
};

let lunaRefs = 0;
let savedColors: Record<number, number> | null = null;

/**
 * Switch the emulator's (module-global, shared by every emulator on the page)
 * system colour table to the Luna scheme. Reference-counted: the original
 * table is saved on the first apply and restored when the last user releases
 * it. Returns the release function (idempotent).
 */
export function applyLunaSysColors(): () => void {
  if (lunaRefs++ === 0) {
    savedColors = { ...SYS_COLORS };
    Object.assign(SYS_COLORS, LUNA_SYS_COLORS);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lunaRefs === 0 && savedColors) {
      Object.assign(SYS_COLORS, savedColors);
      savedColors = null;
    }
  };
}

const LANG_RUSSIAN = 0x19;
const PRIMARY_LANG_MASK = 0x3FF;

/** Theme for the given locale: Luna visuals plus shell strings of that XP language (Russian only for now). */
export function lunaThemeFor(lcid: number, name: 'luna' | 'win2k' = 'luna'): UiTheme {
  if ((lcid & PRIMARY_LANG_MASK) !== LANG_RUSSIAN) return { name };
  return {
    name,
    strings: {
      ok: 'ОК',
      cancel: 'Отмена',
      yes: 'Да',
      no: 'Нет',
      abort: 'Прервать',
      retry: 'Повтор',
      ignore: 'Пропустить',
      restore: 'Восс&тановить',
      sysMove: '&Переместить',
      sysSize: '&Размер',
      minimize: 'С&вернуть',
      sysMaximize: 'Разв&ернуть',
      close: '&Закрыть',
    },
    aboutTitle: 'О программе {0}',
    aboutMemory: 'Физическая память, доступная Windows: {0} КБ',
  };
}
