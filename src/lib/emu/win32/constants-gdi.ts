// Shared GDI constants for paths, world transforms, ICM and charsets (wingdi.h).

// --- Graphics modes (SetGraphicsMode) ---
export const GM_COMPATIBLE = 1;
export const GM_ADVANCED = 2;

// --- ModifyWorldTransform modes ---
export const MWT_IDENTITY = 1;
export const MWT_LEFTMULTIPLY = 2;
export const MWT_RIGHTMULTIPLY = 3;

// --- XFORM: six FLOATs (eM11, eM12, eM21, eM22, eDx, eDy) ---
export const XFORM_SIZE = 24;

// --- SetICMMode ---
export const ICM_OFF = 1;
export const ICM_ON = 2;
export const ICM_QUERY = 3;
export const ICM_DONE_OUTSIDEDC = 4;

// --- GetRandomRgn iNum ---
export const SYSRGN = 4;

// --- Font charsets ---
export const ANSI_CHARSET = 0;
export const DEFAULT_CHARSET = 1;
export const SHIFTJIS_CHARSET = 128;
export const HANGUL_CHARSET = 129;
export const GB2312_CHARSET = 134;
export const CHINESEBIG5_CHARSET = 136;
export const GREEK_CHARSET = 161;
export const TURKISH_CHARSET = 162;
export const VIETNAMESE_CHARSET = 163;
export const HEBREW_CHARSET = 177;
export const ARABIC_CHARSET = 178;
export const BALTIC_CHARSET = 186;
export const RUSSIAN_CHARSET = 204;
export const THAI_CHARSET = 222;
export const EASTEUROPE_CHARSET = 238;

/** Charset GDI realizes for DEFAULT_CHARSET on a system with the given ANSI code page. */
export const CODEPAGE_CHARSET: Record<number, number> = {
  874: THAI_CHARSET, 932: SHIFTJIS_CHARSET, 936: GB2312_CHARSET, 949: HANGUL_CHARSET,
  950: CHINESEBIG5_CHARSET, 1250: EASTEUROPE_CHARSET, 1251: RUSSIAN_CHARSET, 1252: ANSI_CHARSET,
  1253: GREEK_CHARSET, 1254: TURKISH_CHARSET, 1255: HEBREW_CHARSET, 1256: ARABIC_CHARSET,
  1257: BALTIC_CHARSET, 1258: VIETNAMESE_CHARSET,
};

// --- FONTSIGNATURE: fsUsb[4] + fsCsb[2] DWORDs ---
export const FONTSIGNATURE_SIZE = 24;

// --- GetPath: error/no path ---
export const GDI_ERROR = 0xFFFFFFFF;

// --- ICONINFO offsets (winuser.h) ---
export const ICONINFO_FICON = 0;
export const ICONINFO_XHOTSPOT = 4;
export const ICONINFO_YHOTSPOT = 8;
export const ICONINFO_HBMMASK = 12;
export const ICONINFO_HBMCOLOR = 16;

// --- Special locale identifiers (winnt.h) ---
export const LOCALE_NEUTRAL = 0x0000;
export const LOCALE_INVARIANT = 0x007F;
export const LOCALE_USER_DEFAULT = 0x0400;
export const LOCALE_SYSTEM_DEFAULT = 0x0800;
export const SUBLANG_NEUTRAL = 0x00;
export const SUBLANG_DEFAULT = 0x01;

// --- Brush styles / hatch styles (wingdi.h) ---
export const BS_SOLID = 0;
export const BS_NULL = 1;
export const BS_HATCHED = 2;
export const BS_PATTERN = 3;
export const BS_DIBPATTERN = 5;
export const BS_DIBPATTERNPT = 6;
export const HS_HORIZONTAL = 0;
export const HS_VERTICAL = 1;
export const HS_FDIAGONAL = 2;
export const HS_BDIAGONAL = 3;
export const HS_CROSS = 4;
export const HS_DIAGCROSS = 5;
export const HATCH_SIZE = 8;

// --- Pen styles (wingdi.h) ---
export const PS_STYLE_MASK = 0x0000000F;
export const PS_INSIDEFRAME = 6;
export const PS_TYPE_MASK = 0x000F0000;
export const PS_GEOMETRIC = 0x00010000;

// --- Binary raster operations (SetROP2) ---
export const R2_BLACK = 1;
export const R2_NOT = 6;
export const R2_XORPEN = 7;
export const R2_NOP = 11;
export const R2_COPYPEN = 13;
export const R2_WHITE = 16;
