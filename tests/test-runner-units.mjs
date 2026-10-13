// Unit tests of runner helpers (no binaries, no browser).
// Usage: npx tsx tests/test-runner-units.mjs
import { shouldGuardKey } from '../src/runner/keyboard.ts';
import { applyLunaSysColors, LUNA_SYS_COLORS } from '../src/runner/luna-system.ts';
import { SYS_COLORS, COLOR_BTNFACE } from '../src/lib/emu/win32/types.ts';
import { toFixedCoords } from '../src/components/win2k/fixed-origin.ts';

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ' (want ' + JSON.stringify(want) + ')'}`);
};

// --- keyboard guard: F-keys always, Space/arrows only outside text inputs
const canvas = { tagName: 'CANVAS', isContentEditable: false };
const input = { tagName: 'INPUT', isContentEditable: false };
const textarea = { tagName: 'TEXTAREA', isContentEditable: false };
const editable = { tagName: 'DIV', isContentEditable: true };
eq('F2 on canvas', shouldGuardKey('F2', canvas), true);
eq('F5 in input', shouldGuardKey('F5', input), true);
eq('Space on canvas', shouldGuardKey(' ', canvas), true);
eq('ArrowDown on canvas', shouldGuardKey('ArrowDown', canvas), true);
eq('Space in input', shouldGuardKey(' ', input), false);
eq('ArrowLeft in textarea', shouldGuardKey('ArrowLeft', textarea), false);
eq('Space in contentEditable', shouldGuardKey(' ', editable), false);
eq('letter on canvas', shouldGuardKey('a', canvas), false);

// --- Luna system colours: reference-counted apply/restore
const original = SYS_COLORS[COLOR_BTNFACE];
const releaseA = applyLunaSysColors();
eq('luna face after first apply', SYS_COLORS[COLOR_BTNFACE], LUNA_SYS_COLORS[COLOR_BTNFACE]);
const releaseB = applyLunaSysColors();
releaseA();
eq('still luna while second user holds it', SYS_COLORS[COLOR_BTNFACE], LUNA_SYS_COLORS[COLOR_BTNFACE]);
releaseA(); // double release is a no-op
eq('double release ignored', SYS_COLORS[COLOR_BTNFACE], LUNA_SYS_COLORS[COLOR_BTNFACE]);
releaseB();
eq('original restored after last release', SYS_COLORS[COLOR_BTNFACE], original);

// --- fixed-position mapping under a scaled containing block
eq('viewport → scaled local', toFixedCoords({ left: 100, top: 50, scaleX: 0.5, scaleY: 0.5 }, 150, 100), { x: 100, y: 100 });

console.log(fail ? `[TEST] FAIL (${fail})` : '[TEST] SUCCESS');
process.exit(fail ? 1 : 0);
