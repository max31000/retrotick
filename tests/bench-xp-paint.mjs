// Benchmark: cost of repainting an XP program's main window headlessly (mock canvas, so this
// measures the emulator's JS-side GDI work, not browser rasterization).
// Usage: BLISS_ASSETS=<dir> npx tsx tests/bench-xp-paint.mjs [exe] [frames]
import { existsSync } from 'fs';
import { startExe, tickUntilIdle, pump } from './lib/headless-harness.mjs';
const dir = process.env.BLISS_ASSETS;
if (!dir || !existsSync(dir)) { console.log('[TEST] SKIP: set BLISS_ASSETS'); process.exit(2); }
const exe = process.argv[2] || 'winmine.exe';
const frames = Number(process.argv[3] || 300);
const { emu, restore } = await startExe({ dir, exe, companions: ['cards.dll', 'mfc42u.dll', 'mfc42loc.dll', 'gdiplus.dll'], lcid: 0x419 });
tickUntilIdle(emu, 40000);
await pump(emu, 300);
const counts = new Map();
for (const n of ['GDI32.DLL:Rectangle', 'GDI32.DLL:LineTo', 'GDI32.DLL:PatBlt', 'GDI32.DLL:BitBlt', 'GDI32.DLL:Polyline', 'GDI32.DLL:SetPixel']) {
  const d = emu.apiDefs.get(n); if (!d) continue; const h = d.handler;
  d.handler = (e) => { counts.set(n, (counts.get(n) || 0) + 1); return h(e); };
}
const WM_PAINT = 0x000F;
const t0 = performance.now();
for (let i = 0; i < frames; i++) {
  emu.postMessage(emu.mainWindow, WM_PAINT, 0, 0);
  let guard = 0;
  do { emu.tick(); } while (!emu.waitingForMessage && !emu.halted && ++guard < 1000);
}
const ms = (performance.now() - t0) / frames;
restore();
console.log(`[TEST] ${exe}: ${ms.toFixed(3)} ms/paint over ${frames} paints; calls/paint ${[...counts].map(([k, v]) => k.split(':')[1] + '=' + (v / frames).toFixed(1)).join(' ')}`);
process.exit(emu.halted ? 1 : 0);
