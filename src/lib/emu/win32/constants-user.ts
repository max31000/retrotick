// Shared USER constants: system metrics and SystemParametersInfo (winuser.h).
// Kept out of types.ts, which is at its size limit.

// --- GetSystemMetrics indices not in types.ts ---
export const SM_CXVSCROLL = 2;
export const SM_CYHSCROLL = 3;
export const SM_CYVTHUMB = 9;
export const SM_CXHTHUMB = 10;
export const SM_CXICON = 11;
export const SM_CYICON = 12;
export const SM_CXCURSOR = 13;
export const SM_CYCURSOR = 14;
export const SM_CXFULLSCREEN = 16;
export const SM_CYFULLSCREEN = 17;
export const SM_CYVSCROLL = 20;
export const SM_CXHSCROLL = 21;
export const SM_CXMIN = 28;
export const SM_CYMIN = 29;
export const SM_CXMINTRACK = 34;
export const SM_CYMINTRACK = 35;
export const SM_CXICONSPACING = 38;
export const SM_CYICONSPACING = 39;
export const SM_CXMINSPACING = 47;
export const SM_CYMINSPACING = 48;
export const SM_CXSMICON = 49;
export const SM_CYSMICON = 50;
export const SM_CYSMCAPTION = 51;
export const SM_CXSMSIZE = 52;
export const SM_CYSMSIZE = 53;
export const SM_CXMENUSIZE = 54;
export const SM_CYMENUSIZE = 55;
export const SM_CXMINIMIZED = 57;
export const SM_CYMINIMIZED = 58;
export const SM_CXMAXTRACK = 59;
export const SM_CYMAXTRACK = 60;
export const SM_CXMAXIMIZED = 61;
export const SM_CYMAXIMIZED = 62;
export const SM_CXMENUCHECK = 71;
export const SM_CYMENUCHECK = 72;
export const SM_CMONITORS = 80;
export const SM_SAMEDISPLAYFORMAT = 81;

// --- Windows XP (classic metrics) values used by the emulator ---
export const METRIC_SCROLL_SIZE = 16;      // scroll bar arrow/thumb size
export const METRIC_ICON_SIZE = 32;
export const METRIC_SMALL_ICON_SIZE = 16;
export const METRIC_ICON_SPACING = 75;
export const METRIC_SM_CAPTION = 16;       // SM_CYSMCAPTION (tool windows)
export const METRIC_SM_SIZE_CX = 12;       // SM_CXSMSIZE
export const METRIC_SM_SIZE_CY = 15;       // SM_CYSMSIZE
export const METRIC_MENU_SIZE = 18;        // SM_CXMENUSIZE / SM_CYMENUSIZE
export const METRIC_MENU_CHECK = 13;
export const METRIC_MIN_TRACK_CX = 112;
export const METRIC_MIN_TRACK_CY = 27;
export const METRIC_MINIMIZED_CX = 160;
export const METRIC_MINIMIZED_CY = 24;

// --- SystemParametersInfo actions ---
export const SPI_GETICONTITLELOGFONT = 0x001F;
export const SPI_GETNONCLIENTMETRICS = 0x0029;
export const SPI_GETWORKAREA = 0x0030;

// --- NONCLIENTMETRICS layout (pre-Vista: no iPaddedBorderWidth) ---
export const LOGFONTA_SIZE = 60;
export const LOGFONTW_SIZE = 92;
export const LF_FACESIZE = 32;
export const NONCLIENTMETRICSA_SIZE = 340;
export const NONCLIENTMETRICSW_SIZE = 500;
export const FW_NORMAL_WEIGHT = 400;
export const FW_BOLD_WEIGHT = 700;
