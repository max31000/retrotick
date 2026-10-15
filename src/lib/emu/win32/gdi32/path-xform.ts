// GDI paths, world transforms, graphics mode, ICM and other advanced-DC APIs.
// RetroTick renders in GM_COMPATIBLE only: SetGraphicsMode(GM_ADVANCED) fails the way it did on
// Windows 9x, so world transforms stay identity (SetWorldTransform fails in GM_COMPATIBLE on NT
// too). Paths are not recorded; path APIs report failure so callers fall back to plain GDI calls.
import type { Emulator } from '../../emulator';
import { effectiveClip } from './dc-clip';
import { dcSurface } from './clip-api';
import { setRegion } from './region';
import { getLocalePreset } from '../../../regional-settings';
import {
  GM_COMPATIBLE, MWT_IDENTITY, MWT_LEFTMULTIPLY, MWT_RIGHTMULTIPLY, ICM_OFF, ICM_QUERY, SYSRGN,
  CODEPAGE_CHARSET, ANSI_CHARSET, DEFAULT_CHARSET, FONTSIGNATURE_SIZE, GDI_ERROR,
} from '../constants-gdi';
import { SIMPLEREGION } from '../constants-ctl';

type Xform = [number, number, number, number, number, number];
const IDENTITY: Xform = [1, 0, 0, 1, 0, 0];

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

function readXform(emu: Emulator, p: number): Xform {
  const out = [] as unknown as Xform;
  for (let i = 0; i < 6; i++) { u32[0] = emu.memory.readU32(p + i * 4); out[i] = f32[0]; }
  return out;
}

function writeXform(emu: Emulator, p: number, x: Xform): void {
  for (let i = 0; i < 6; i++) { f32[0] = x[i]; emu.memory.writeU32(p + i * 4, u32[0]); }
}

/** a × b in GDI's row-vector convention (apply a first, then b). */
function multiply(a: Xform, b: Xform): Xform {
  return [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

const isIdentity = (x: Xform) => x.every((v, i) => v === IDENTITY[i]);

export function registerPathXform(emu: Emulator): void {
  const gdi32 = emu.registerDll('GDI32.DLL');
  const dcOf = (i: number) => emu.getDC(emu.readArg(i));

  // --- Graphics mode / world transform ---
  gdi32.register('GetGraphicsMode', 1, () => (dcOf(0) ? GM_COMPATIBLE : 0));
  // Only GM_COMPATIBLE is supported: returns the previous mode, or 0 for GM_ADVANCED.
  gdi32.register('SetGraphicsMode', 2, () => (dcOf(0) && emu.readArg(1) === GM_COMPATIBLE ? GM_COMPATIBLE : 0));
  gdi32.register('GetWorldTransform', 2, () => {
    const p = emu.readArg(1);
    if (!dcOf(0) || !p) return 0;
    writeXform(emu, p, IDENTITY);
    return 1;
  });
  // In GM_COMPATIBLE only an identity transform can be "set" (Windows fails otherwise).
  gdi32.register('SetWorldTransform', 2, () => {
    const p = emu.readArg(1);
    return dcOf(0) && p && isIdentity(readXform(emu, p)) ? 1 : 0;
  });
  gdi32.register('ModifyWorldTransform', 3, () => {
    if (!dcOf(0)) return 0;
    const p = emu.readArg(1), mode = emu.readArg(2);
    if (mode === MWT_IDENTITY) return 1;
    if ((mode === MWT_LEFTMULTIPLY || mode === MWT_RIGHTMULTIPLY) && p) return isIdentity(readXform(emu, p)) ? 1 : 0;
    return 0;
  });
  gdi32.register('CombineTransform', 3, () => {
    const out = emu.readArg(0), p1 = emu.readArg(1), p2 = emu.readArg(2);
    if (!out || !p1 || !p2) return 0;
    writeXform(emu, out, multiply(readXform(emu, p1), readXform(emu, p2)));
    return 1;
  });

  // --- Paths (not recorded) ---
  for (const name of ['BeginPath', 'EndPath', 'AbortPath', 'CloseFigure', 'FlattenPath', 'WidenPath',
    'FillPath', 'StrokePath', 'StrokeAndFillPath']) {
    gdi32.register(name, 1, () => 0);
  }
  // GetPath(hdc, apt, aj, cpt) → point count, or -1 when the DC has no closed path
  gdi32.register('GetPath', 4, () => GDI_ERROR);
  // SetMiterLimit(hdc, limit, pOld): miter limit only affects paths; report the default (10.0)
  gdi32.register('SetMiterLimit', 3, () => {
    const pOld = emu.readArg(2);
    if (pOld) { f32[0] = 10; emu.memory.writeU32(pOld, u32[0]); }
    return dcOf(0) ? 1 : 0;
  });

  // --- Regions ---
  // GetRandomRgn(hdc, hrgn, SYSRGN): visible region of the DC (in DC coordinates here).
  gdi32.register('GetRandomRgn', 3, () => {
    const dc = dcOf(0);
    if (!dc) return 0xFFFFFFFF;
    if (emu.readArg(2) !== SYSRGN) {
      if (!dc.clipRgn) return 0;
      return setRegion(emu, emu.readArg(1), dc.clipRgn.clone()) ? 1 : 0xFFFFFFFF;
    }
    return setRegion(emu, emu.readArg(1), effectiveClip(dc, dcSurface(emu, dc)).clone()) ? 1 : 0xFFFFFFFF;
  });
  // SetMetaRgn(hdc): there is no separate meta region; the clip region already is the bound.
  gdi32.register('SetMetaRgn', 1, () => (dcOf(0) ? SIMPLEREGION : 0));

  // --- ICM / escapes / misc ---
  gdi32.register('SetICMMode', 2, () => {
    if (!dcOf(0)) return 0;
    const mode = emu.readArg(1);
    return mode === ICM_QUERY || mode === ICM_OFF ? ICM_OFF : 0; // ICM is never enabled
  });
  // ExtEscape: no driver escapes are supported (0 = not implemented)
  gdi32.register('ExtEscape', 6, () => 0);
  // PlgBlt (parallelogram blit) is not supported on this surface
  gdi32.register('PlgBlt', 10, () => 0);
  gdi32.register('GdiComment', 3, () => (dcOf(0) ? 1 : 0));

  // GetTextCharsetInfo(hdc, lpSig, dwFlags) → charset of the realized font
  gdi32.register('GetTextCharsetInfo', 3, () => {
    const sig = emu.readArg(1);
    if (sig) for (let i = 0; i < FONTSIGNATURE_SIZE; i += 4) emu.memory.writeU32(sig + i, 0);
    if (!dcOf(0)) return DEFAULT_CHARSET; // failure value
    return CODEPAGE_CHARSET[getLocalePreset(emu.configuredLcid).ansiCodePage] ?? ANSI_CHARSET;
  });
}
