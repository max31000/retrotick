/**
 * `@bliss/retrotick-runner/luna` — the Luna frame/menu stylesheet only.
 * Imports nothing from the emulator, so it stays a few KB.
 */
import { LUNA_CSS as CSS, injectLunaCss } from '../components/win2k/luna/luna-css';
import type { LunaFrameExport } from './types';

export type { LunaFrameExport } from './types';

export const LUNA_CSS: string = CSS;

export const LunaFrame: LunaFrameExport = {
  css: CSS,
  inject: (doc?: Document) => injectLunaCss(doc),
};
