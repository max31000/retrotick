// Font enumeration (EnumFontFamiliesEx / EnumFontFamilies / EnumFonts) over the TrueType
// families of a standard Windows XP installation that the browser can render.
import type { Emulator } from '../../emulator';
import {
  ANSI_CHARSET, DEFAULT_CHARSET, RUSSIAN_CHARSET, EASTEUROPE_CHARSET, GREEK_CHARSET, TURKISH_CHARSET,
  BALTIC_CHARSET, TRUETYPE_FONTTYPE, FF_SWISS, FF_ROMAN, FF_MODERN, VARIABLE_PITCH, FIXED_PITCH,
  TMPF_FIXED_PITCH, TMPF_VECTOR, TMPF_TRUETYPE, NTM_REGULAR, LF_FULLFACESIZE, ENUM_TM_SIZE_A, ENUM_TM_SIZE_W,
  ENUMLOGFONTEX_SIZE_A, ENUMLOGFONTEX_SIZE_W,
} from '../constants-gdi';
import { LF_FACESIZE, LOGFONTA_SIZE, LOGFONTW_SIZE } from '../constants-user';

interface Family { face: string; family: number; fixed: boolean; avgW: number; maxW: number }

/** Core XP TrueType families (WGL4 coverage: Western, Cyrillic, Central European, Greek...). */
const FAMILIES: Family[] = [
  { face: 'Arial', family: FF_SWISS, fixed: false, avgW: 6, maxW: 21 },
  { face: 'Courier New', family: FF_MODERN, fixed: true, avgW: 7, maxW: 8 },
  { face: 'Microsoft Sans Serif', family: FF_SWISS, fixed: false, avgW: 6, maxW: 21 },
  { face: 'Tahoma', family: FF_SWISS, fixed: false, avgW: 6, maxW: 23 },
  { face: 'Times New Roman', family: FF_ROMAN, fixed: false, avgW: 6, maxW: 22 },
  { face: 'Trebuchet MS', family: FF_SWISS, fixed: false, avgW: 6, maxW: 20 },
  { face: 'Verdana', family: FF_SWISS, fixed: false, avgW: 7, maxW: 23 },
];

const CHARSETS = [ANSI_CHARSET, RUSSIAN_CHARSET, EASTEUROPE_CHARSET, GREEK_CHARSET, TURKISH_CHARSET, BALTIC_CHARSET];

const SCRIPT_NAMES: Record<number, [string, string]> = {
  [ANSI_CHARSET]: ['Western', 'Западноевропейский'],
  [RUSSIAN_CHARSET]: ['Cyrillic', 'Кириллический'],
  [EASTEUROPE_CHARSET]: ['Central European', 'Центральноевропейский'],
  [GREEK_CHARSET]: ['Greek', 'Греческий'],
  [TURKISH_CHARSET]: ['Turkish', 'Турецкий'],
  [BALTIC_CHARSET]: ['Baltic', 'Балтийский'],
};
const LANG_RUSSIAN = 0x19;

function writeStr(emu: Emulator, p: number, s: string, maxChars: number, wide: boolean): void {
  const n = Math.min(s.length, maxChars - 1);
  if (wide) {
    for (let i = 0; i < n; i++) emu.memory.writeU16(p + i * 2, s.charCodeAt(i));
    emu.memory.writeU16(p + n * 2, 0);
  } else {
    emu.memory.writeCString(p, s.slice(0, n));
  }
}

function readFace(emu: Emulator, p: number, wide: boolean): string {
  return wide ? emu.memory.readUTF16String(p) : emu.memory.readCString(p);
}

/** Build ENUMLOGFONTEX + NEWTEXTMETRICEX for one family/charset; returns their addresses. */
function buildRecords(emu: Emulator, f: Family, charset: number, wide: boolean): { lf: number; tm: number } {
  const lfSize = wide ? ENUMLOGFONTEX_SIZE_W : ENUMLOGFONTEX_SIZE_A;
  const tmSize = wide ? ENUM_TM_SIZE_W : ENUM_TM_SIZE_A;
  const lf = emu.allocHeap(lfSize), tm = emu.allocHeap(tmSize);
  for (let i = 0; i < lfSize; i += 4) emu.memory.writeU32(lf + i, 0);
  for (let i = 0; i < tmSize; i += 4) emu.memory.writeU32(tm + i, 0);
  const height = 16, ascent = 13;
  // LOGFONT
  emu.memory.writeU32(lf, height);
  emu.memory.writeU32(lf + 4, f.avgW);
  emu.memory.writeU32(lf + 16, 400);
  emu.memory.writeU8(lf + 23, charset);
  emu.memory.writeU8(lf + 24, 3);  // OUT_STROKE_PRECIS (TrueType)
  emu.memory.writeU8(lf + 25, 2);  // CLIP_STROKE_PRECIS
  emu.memory.writeU8(lf + 26, 1);  // DRAFT_QUALITY
  emu.memory.writeU8(lf + 27, (f.fixed ? FIXED_PITCH : VARIABLE_PITCH) | f.family);
  const cs = wide ? 2 : 1;
  writeStr(emu, lf + 28, f.face, LF_FACESIZE, wide);
  const lfEnd = wide ? LOGFONTW_SIZE : LOGFONTA_SIZE;
  writeStr(emu, lf + lfEnd, f.face, LF_FULLFACESIZE, wide);                        // elfFullName
  const ru = (emu.configuredLcid & 0x3FF) === LANG_RUSSIAN;
  writeStr(emu, lf + lfEnd + LF_FULLFACESIZE * cs, ru ? 'Обычный' : 'Regular', LF_FACESIZE, wide);   // elfStyle
  const names = SCRIPT_NAMES[charset] ?? ['', ''];
  writeStr(emu, lf + lfEnd + (LF_FULLFACESIZE + LF_FACESIZE) * cs, ru ? names[1] : names[0], LF_FACESIZE, wide); // elfScript
  // NEWTEXTMETRIC: TEXTMETRIC (A: 56 bytes, W: 60 bytes) + ntmFlags, ntmSizeEM, ntmCellHeight, ntmAvgWidth
  const m = emu.memory;
  m.writeU32(tm, height); m.writeU32(tm + 4, ascent); m.writeU32(tm + 8, height - ascent);
  m.writeU32(tm + 20, f.avgW); m.writeU32(tm + 24, f.maxW); m.writeU32(tm + 28, 400);
  m.writeU32(tm + 36, 96); m.writeU32(tm + 40, 96);                               // tmDigitizedAspectX/Y
  const chars = 44;                                                                // tmFirstChar..tmBreakChar
  if (wide) { m.writeU16(tm + chars, 0x20); m.writeU16(tm + chars + 2, 0xFFFC); m.writeU16(tm + chars + 4, 0x1F); m.writeU16(tm + chars + 6, 0x20); }
  else { m.writeU8(tm + chars, 0x20); m.writeU8(tm + chars + 1, 0xFF); m.writeU8(tm + chars + 2, 0x1F); m.writeU8(tm + chars + 3, 0x20); }
  const after = wide ? 52 : 48;                                                    // tmItalic...
  m.writeU8(tm + after + 3, (f.fixed ? 0 : TMPF_FIXED_PITCH) | TMPF_VECTOR | TMPF_TRUETYPE | f.family);
  m.writeU8(tm + after + 4, charset);
  const ntm = wide ? 60 : 56;
  m.writeU32(tm + ntm, NTM_REGULAR); m.writeU32(tm + ntm + 4, 2048); m.writeU32(tm + ntm + 8, height); m.writeU32(tm + ntm + 12, f.avgW);
  return { lf, tm };
}

/** Enumerate matching (family, charset) pairs through the callback; returns its last result. */
function enumerate(emu: Emulator, proc: number, lParam: number, face: string, charset: number,
  perFamilyOnly: boolean, wide: boolean): number {
  if (!proc) return 0;
  let ret = 1;
  const fams = face ? FAMILIES.filter(f => f.face.toLowerCase() === face.toLowerCase()) : FAMILIES;
  for (const f of fams) {
    const sets = charset === DEFAULT_CHARSET ? (perFamilyOnly ? [ANSI_CHARSET] : CHARSETS)
      : CHARSETS.includes(charset) ? [charset] : [];
    for (const c of sets) {
      const { lf, tm } = buildRecords(emu, f, c, wide);
      ret = emu.callCallback(proc, [lf, tm, TRUETYPE_FONTTYPE, lParam]) ?? 0;
      if (ret === 0) return 0;
    }
  }
  return ret;
}

export function registerFontEnum(emu: Emulator): void {
  const gdi32 = emu.registerDll('GDI32.DLL');

  // EnumFontFamiliesEx(hdc, lpLogfont, proc, lParam, dwFlags)
  const enumEx = (wide: boolean) => () => {
    const plf = emu.readArg(1);
    const face = plf ? readFace(emu, plf + 28, wide) : '';
    const charset = plf ? emu.memory.readU8(plf + 23) : DEFAULT_CHARSET;
    return enumerate(emu, emu.readArg(2), emu.readArg(3), face, charset, false, wide);
  };
  gdi32.register('EnumFontFamiliesExA', 5, enumEx(false));
  gdi32.register('EnumFontFamiliesExW', 5, enumEx(true));

  // EnumFontFamilies(hdc, lpszFamily, proc, lParam) / EnumFonts(hdc, lpFaceName, proc, lParam)
  const enumFam = (wide: boolean) => () => {
    const p = emu.readArg(1);
    return enumerate(emu, emu.readArg(2), emu.readArg(3), p ? readFace(emu, p, wide) : '', DEFAULT_CHARSET, true, wide);
  };
  gdi32.register('EnumFontFamiliesA', 4, enumFam(false));
  gdi32.register('EnumFontFamiliesW', 4, enumFam(true));
  gdi32.register('EnumFontsA', 4, enumFam(false));
  gdi32.register('EnumFontsW', 4, enumFam(true));
}
