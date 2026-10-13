// Unit test: GDI regions and window update-region semantics (no binaries needed).
// Usage: npx tsx tests/test-update-region.mjs
const { Region } = await import('../src/lib/emu/region.ts');
const { invalidateWindow, validateWindow, getUpdateRegion } = await import('../src/lib/emu/win32/user32/update-region.ts');

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ' (want ' + JSON.stringify(want) + ')'}`);
};
const R = (l, t, r, b) => Region.fromRect(l, t, r, b);

eq('union of overlapping', R(0, 0, 10, 10).union(R(5, 5, 15, 15)).bounds(), { left: 0, top: 0, right: 15, bottom: 15 });
eq('union area rects', R(0, 0, 10, 10).union(R(10, 0, 20, 10)).rects, [{ left: 0, top: 0, right: 20, bottom: 10 }]);
eq('intersect', R(0, 0, 10, 10).intersect(R(5, 5, 15, 15)).rects, [{ left: 5, top: 5, right: 10, bottom: 10 }]);
eq('diff hole complexity', R(0, 0, 30, 30).subtract(R(10, 10, 20, 20)).complexity(), 3);
eq('diff empty', R(0, 0, 10, 10).subtract(R(0, 0, 10, 10)).isEmpty(), true);
eq('xor', R(0, 0, 10, 10).combine(R(0, 0, 10, 5), 'xor').rects, [{ left: 0, top: 5, right: 10, bottom: 10 }]);
eq('point in', R(0, 0, 10, 10).containsPoint(9, 9), true);
eq('point out (exclusive right)', R(0, 0, 10, 10).containsPoint(10, 5), false);

// A child window 100x50 (WS_CHILD, no border): client = window
const emu = { isNE: false };
const wnd = { style: 0x40000000, hMenu: 0, width: 100, height: 50 };
eq('valid initially', getUpdateRegion(emu, wnd), null);
invalidateWindow(emu, wnd, R(10, 10, 20, 20), false);
eq('partial invalidate', getUpdateRegion(emu, wnd).bounds(), { left: 10, top: 10, right: 20, bottom: 20 });
eq('erase not pending', !!wnd.needsErase, false);
invalidateWindow(emu, wnd, R(30, 10, 40, 20), true);
eq('accumulates', getUpdateRegion(emu, wnd).bounds(), { left: 10, top: 10, right: 40, bottom: 20 });
eq('erase pending', wnd.needsErase, true);
validateWindow(emu, wnd, R(0, 0, 25, 50));
eq('partial validate', getUpdateRegion(emu, wnd).rects, [{ left: 30, top: 10, right: 40, bottom: 20 }]);
invalidateWindow(emu, wnd, R(-50, -50, 500, 500), false);
eq('clipped to client', getUpdateRegion(emu, wnd).bounds(), { left: 0, top: 0, right: 100, bottom: 50 });
validateWindow(emu, wnd, null);
eq('validated', getUpdateRegion(emu, wnd), null);
invalidateWindow(emu, wnd, R(1, 1, 2, 2), false);
wnd.needsPaint = true; // legacy direct assignment means "whole client"
eq('legacy needsPaint = full client', getUpdateRegion(emu, wnd).bounds(), { left: 0, top: 0, right: 100, bottom: 50 });

console.log(fail ? `[TEST] FAIL (${fail})` : '[TEST] SUCCESS');
process.exit(fail ? 1 : 0);
