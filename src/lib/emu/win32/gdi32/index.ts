import type { Emulator } from '../../emulator';
import { registerDC } from './dc';
import { registerSelect } from './select';
import { registerBitmap } from './bitmap';
import { registerDraw } from './draw';
import { registerText } from './text';
import { registerTextOut } from './text-out';
import { registerBrush } from './brush';
import { registerRegion } from './region';
import { registerPalette } from './palette';
import { registerMetafile } from './metafile';
import { registerClipApi } from './clip-api';

export type { DCInfo, BitmapInfo, PenInfo, BrushInfo } from './types';

export function registerGdi32(emu: Emulator): void {
  registerDC(emu);
  registerSelect(emu);
  registerBitmap(emu);
  registerDraw(emu);
  registerText(emu);
  registerTextOut(emu);
  registerBrush(emu);
  registerRegion(emu);
  registerPalette(emu);
  registerMetafile(emu);
  registerClipApi(emu);
}
