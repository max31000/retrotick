// Unit test: DC clip layer stack (SaveDC/RestoreDC, clip regions, BeginPaint clip) stays
// balanced against the canvas save/restore stack (no binaries needed).
// Usage: npx tsx tests/test-dc-clip.mjs
const { Region } = await import('../src/lib/emu/region.ts');
const clip = await import('../src/lib/emu/win32/gdi32/dc-clip.ts');

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ' (want ' + JSON.stringify(want) + ')'}`);
};
const mkCtx = () => {
  const c = { depth: 0, clips: 0, save() { this.depth++; }, restore() { if (this.depth > 0) this.depth--; },
    beginPath() {}, rect() {}, clip() { this.clips++; } };
  return c;
};
const R = (l, t, r, b) => Region.fromRect(l, t, r, b);
const dc = { ctx: mkCtx(), canvas: { width: 100, height: 100 } };

clip.pushVisClip(dc, R(0, 0, 50, 50));
eq('vis pushes one layer', dc.ctx.depth, 1);
eq('SaveDC level 1', clip.saveDC(dc), 1);
clip.setClipRegion(dc, R(10, 10, 20, 20));
eq('clip layer on top of save', dc.ctx.depth, 3);
clip.setClipRegion(dc, R(0, 0, 5, 5));
eq('replacing top clip reuses its layer', dc.ctx.depth, 3);
clip.narrowClipRegion(dc, R(0, 0, 3, 3));
eq('narrowing keeps depth', dc.ctx.depth, 3);
eq('clip region tracked', dc.clipRgn.bounds(), { left: 0, top: 0, right: 3, bottom: 3 });
eq('RestoreDC(-1) ok', clip.restoreDC(dc, -1), true);
eq('RestoreDC pops clip + save', dc.ctx.depth, 1);
eq('clip region restored (none)', dc.clipRgn, null);
eq('effective clip = vis', clip.effectiveClip(dc, { left: 0, top: 0, right: 100, bottom: 100 }).bounds(), { left: 0, top: 0, right: 50, bottom: 50 });
clip.saveDC(dc); clip.saveDC(dc);
clip.popVisClip(dc);
eq('EndPaint pops leaked saves and vis', dc.ctx.depth, 0);
eq('RestoreDC with nothing saved fails', clip.restoreDC(dc, -1), false);
clip.setClipRegion(dc, R(0, 0, 10, 10)); clip.saveDC(dc);
clip.resetDCLayers(dc);
eq('ReleaseDC resets everything', [dc.ctx.depth, dc.clipRgn], [0, null]);

console.log(fail ? `[TEST] FAIL (${fail})` : '[TEST] SUCCESS');
process.exit(fail ? 1 : 0);
