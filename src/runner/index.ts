/**
 * @bliss/retrotick-runner — run an original Win32 game inside a host element.
 * Framework-agnostic: the emulator UI is a self-contained Preact island.
 */
import { mountGame as mountGameImpl } from './mount';
import { registerXpFonts as registerXpFontsImpl } from './fonts';
import type { MountGameFn, RegisterXpFontsFn } from './types';
export { LunaFrame, LUNA_CSS } from './luna-entry';

export type { MountOptions, GameHandle, RunnerFonts, LunaFrameExport, MountGameFn, RegisterXpFontsFn } from './types';

export const mountGame: MountGameFn = mountGameImpl;

/** Register the XP font files (Tahoma, Microsoft Sans Serif, Trebuchet MS Bold) with the FontFace API. */
export const registerXpFonts: RegisterXpFontsFn = registerXpFontsImpl;
