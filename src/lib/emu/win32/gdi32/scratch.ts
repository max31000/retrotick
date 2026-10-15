// Shared scratch canvas for writing computed pixels back through drawImage (which, unlike
// putImageData, honours the DC's clip region and transform). Reused across calls and grown
// on demand instead of allocating an OffscreenCanvas per drawing operation.
import type { DCInfo } from './types';

let scratch: OffscreenCanvas | null = null;
let scratchCtx: OffscreenCanvasRenderingContext2D | null = null;

/** Draw `img` onto the DC at logical (x, y). Pixels with alpha 0 leave the destination as is. */
export function blitImageData(dc: DCInfo, img: ImageData, x: number, y: number): void {
  const w = img.width, h = img.height;
  if (!scratch || scratch.width < w || scratch.height < h) {
    scratch = new OffscreenCanvas(Math.max(w, scratch?.width ?? 0), Math.max(h, scratch?.height ?? 0));
    scratchCtx = scratch.getContext('2d')!;
  }
  scratchCtx!.putImageData(img, 0, 0);
  dc.ctx.drawImage(scratch, 0, 0, w, h, x, y, w, h);
}
