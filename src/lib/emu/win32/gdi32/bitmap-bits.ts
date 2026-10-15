// Device-dependent bitmap bits (CreateBitmap / CreateBitmapIndirect / SetBitmapBits):
// scanlines are top-down and padded to a WORD boundary (MSDN "Bitmap Storage").
import type { Emulator } from '../../emulator';
import type { BitmapInfo } from './types';

/** Bytes per DDB scanline. */
export function ddbStride(width: number, bpp: number): number {
  return (((width * bpp + 15) >> 4) << 1);
}

/** Decode DDB bits at `ptr` into the bitmap's canvas. Supports 1, 16, 24 and 32 bpp. */
export function writeDdbBits(emu: Emulator, bmp: BitmapInfo, bpp: number, ptr: number, maxBytes = Infinity): boolean {
  const { width: w, height: h } = bmp;
  const stride = ddbStride(w, bpp);
  if (![1, 16, 24, 32].includes(bpp) || !ptr) return false;
  const img = bmp.ctx.createImageData(w, h);
  const d = img.data;
  const rows = Math.min(h, Math.floor(maxBytes / stride));
  for (let y = 0; y < rows; y++) {
    const row = ptr + y * stride;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r: number, g: number, b: number;
      if (bpp === 1) {
        const bit = (emu.memory.readU8(row + (x >> 3)) >> (7 - (x & 7))) & 1;
        r = g = b = bit ? 255 : 0;
      } else if (bpp === 16) {
        const v = emu.memory.readU16(row + x * 2); // RGB 5-5-5
        r = ((v >> 10) & 0x1F) * 255 / 31; g = ((v >> 5) & 0x1F) * 255 / 31; b = (v & 0x1F) * 255 / 31;
      } else {
        const o = row + x * (bpp >> 3);
        b = emu.memory.readU8(o); g = emu.memory.readU8(o + 1); r = emu.memory.readU8(o + 2);
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  bmp.ctx.putImageData(img, 0, 0);
  return true;
}
