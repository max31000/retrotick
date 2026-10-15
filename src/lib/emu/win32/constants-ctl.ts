// Shared constants for common controls, regions and window update handling
// (commctrl.h, wingdi.h, winuser.h). Kept out of types.ts, which is at its size limit.

// --- Status bar (commctrl.h) ---
export const SB_SETTEXTA = 0x0401;
export const SB_GETTEXTA = 0x0402;
export const SB_GETTEXTLENGTHA = 0x0403;
export const SB_SETPARTS = 0x0404;
export const SB_GETPARTS = 0x0406;
export const SB_GETBORDERS = 0x0407;
export const SB_SETMINHEIGHT = 0x0408;
export const SB_SIMPLE = 0x0409;
export const SB_GETRECT = 0x040A;
export const SB_SETTEXTW = 0x040B;
export const SB_GETTEXTLENGTHW = 0x040C;
export const SB_GETTEXTW = 0x040D;
export const SB_ISSIMPLE = 0x040E;
export const SB_SIMPLEID = 0x00FF;
export const SBT_NOBORDERS = 0x0100;
export const SBT_POPOUT = 0x0200;
// Wine comctl32/status.c defaults
export const SB_HORZ_BORDER = 0;
export const SB_VERT_BORDER = 2;
export const SB_HORZ_GAP = 2;

// --- Common control styles (commctrl.h) ---
export const CCS_TOP = 0x0001;
export const CCS_NOMOVEY = 0x0002;
export const CCS_BOTTOM = 0x0003;
export const CCS_NORESIZE = 0x0004;
export const CCS_NOPARENTALIGN = 0x0008;

// --- WM_SIZE wParam (winuser.h) ---
export const SIZE_RESTORED = 0;
export const SIZE_MAXIMIZED = 2;

// --- Region types / CombineRgn modes (wingdi.h) ---
export const RGN_ERROR = 0;
export const NULLREGION = 1;
export const SIMPLEREGION = 2;
export const COMPLEXREGION = 3;
export const RGN_AND = 1;
export const RGN_OR = 2;
export const RGN_XOR = 3;
export const RGN_DIFF = 4;
export const RGN_COPY = 5;

// --- RedrawWindow flags (winuser.h) ---
export const RDW_INVALIDATE = 0x0001;
export const RDW_INTERNALPAINT = 0x0002;
export const RDW_ERASE = 0x0004;
export const RDW_VALIDATE = 0x0008;
export const RDW_NOINTERNALPAINT = 0x0010;
export const RDW_NOERASE = 0x0020;
export const RDW_NOCHILDREN = 0x0040;
export const RDW_ALLCHILDREN = 0x0080;
export const RDW_UPDATENOW = 0x0100;
export const RDW_ERASENOW = 0x0200;
export const RDW_FRAME = 0x0400;
export const RDW_NOFRAME = 0x0800;

// --- ScrollWindowEx flags ---
export const SW_SCROLLCHILDREN = 0x0001;
export const SW_INVALIDATE = 0x0002;
export const SW_ERASE = 0x0004;

// --- Text alignment / ExtTextOut options (wingdi.h) ---
export const TA_UPDATECP = 0x0001;
export const TA_RIGHT = 0x0002;
export const TA_CENTER = 0x0006;
export const TA_BOTTOM = 0x0008;
export const TA_BASELINE = 0x0018;
export const TA_HORZ_MASK = 0x0006;
export const TA_VERT_MASK = 0x0018;
export const ETO_OPAQUE = 0x0002;
export const ETO_CLIPPED = 0x0004;
export const GDI_ERROR = 0xFFFFFFFF;

// --- Character messages (winuser.h) ---
export const WM_DEADCHAR = 0x0103;
export const WM_SYSCHAR = 0x0106;
export const WM_SYSDEADCHAR = 0x0107;

// --- DrawText formats (winuser.h) ---
export const DT_BOTTOM = 0x0008;

// --- Window-menu commands (winuser.h): SC_SIZE is the lowest SC_* value ---
export const SC_FIRST = 0xF000;

// --- Scroll bars (winuser.h) ---
export const SB_HORZ = 0;
export const SB_VERT = 1;
export const SB_CTL = 2;
export const SB_BOTH = 3;
export const SB_LINEUP = 0;
export const SB_LINEDOWN = 1;
export const SB_PAGEUP = 2;
export const SB_PAGEDOWN = 3;
export const SB_THUMBPOSITION = 4;
export const SB_THUMBTRACK = 5;
export const SB_ENDSCROLL = 8;
export const SIF_RANGE = 0x0001;
export const SIF_PAGE = 0x0002;
export const SIF_POS = 0x0004;
export const SIF_DISABLENOSCROLL = 0x0008;
export const SIF_TRACKPOS = 0x0010;
export const SCROLL_MIN_THUMB = 8;

// --- Common dialog extended errors (cderr.h) ---
export const PDERR_NODEFAULTPRN = 0x1008;
