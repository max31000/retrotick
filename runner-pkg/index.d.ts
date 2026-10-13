// Public API of @bliss/retrotick-runner. The implementation (src/runner/index.ts)
// is typed with the same aliases, so these declarations cannot drift from it.
import type { LunaFrameExport, MountGameFn, RegisterXpFontsFn } from './dist/types';

export type { MountOptions, GameHandle, RunnerFonts, LunaFrameExport, MountGameFn, RegisterXpFontsFn } from './dist/types';

export declare const mountGame: MountGameFn;
export declare const LunaFrame: LunaFrameExport;
export declare const LUNA_CSS: string;
export declare const registerXpFonts: RegisterXpFontsFn;
