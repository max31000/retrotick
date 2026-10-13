// Mouse button synthesis: chords from PointerEvent.buttons diffs, double-click detection with
// CS_DBLCLKS. Unit part needs nothing; the integration part (optional) uses BLISS_ASSETS to load
// sol.exe (class has CS_DBLCLKS) and winmine.exe (chord), and checks the emulator survives.
// Usage: [BLISS_ASSETS=<dir>] npx tsx tests/test-mouse-buttons.mjs
import { existsSync } from 'fs';
import { diffButtons, DoubleClickTracker, buttonMessage, mkFlagsFromButtons } from '../src/lib/emu/mouse-buttons.ts';
import { startExe, tickUntilIdle, pump } from './lib/headless-harness.mjs';

const WM_LBUTTONDOWN = 0x201, WM_LBUTTONUP = 0x202, WM_LBUTTONDBLCLK = 0x203;
const WM_RBUTTONDOWN = 0x204, WM_RBUTTONUP = 0x205;
const CS_DBLCLKS = 0x0008;
let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ' (want ' + JSON.stringify(want) + ')'}
`);
};

// --- chord: L down (pointerdown buttons=1), R down (pointermove buttons=3), L up (pointermove 2), R up (pointerup 0)
const seq = [0, 1, 3, 2, 0];
const msgs = [];
for (let i = 1; i < seq.length; i++) {
  for (const t of diffButtons(seq[i - 1], seq[i])) msgs.push((t.bit === 1 ? 'L' : t.bit === 2 ? 'R' : 'M') + (t.pressed ? 'down' : 'up'));
}
eq('chord transitions', msgs, ['Ldown', 'Rdown', 'Lup', 'Rup']);
eq('MK flags for L+R', mkFlagsFromButtons(3), 0x0003);
eq('MK flags for middle', mkFlagsFromButtons(4), 0x0010);

// --- double click detection
const owner = (style) => ({
  doubleClickTime: 500, doubleClickCx: 4, doubleClickCy: 4, dblClickTracker: new DoubleClickTracker(),
  handles: { get: () => ({ classInfo: { style } }) },
});
const P = { bit: 1, pressed: true }, R = { bit: 1, pressed: false };
{
  const o = owner(CS_DBLCLKS);
  eq('1st press', buttonMessage(o, P, 7, 10, 10, 0), WM_LBUTTONDOWN);
  eq('release', buttonMessage(o, R, 7, 10, 10, 50), WM_LBUTTONUP);
  eq('2nd press within time/rect -> DBLCLK', buttonMessage(o, P, 7, 11, 11, 200), WM_LBUTTONDBLCLK);
  eq('3rd press -> DOWN (sequence restarts)', buttonMessage(o, P, 7, 11, 11, 300), WM_LBUTTONDOWN);
  eq('late press -> DOWN', buttonMessage(o, P, 7, 11, 11, 900), WM_LBUTTONDOWN);
  eq('far press -> DOWN', buttonMessage(o, P, 7, 20, 11, 1000), WM_LBUTTONDOWN);
  eq('other window -> DOWN', buttonMessage(o, P, 8, 20, 11, 1100), WM_LBUTTONDOWN);
  eq('right after left -> RDOWN', buttonMessage(o, { bit: 2, pressed: true }, 8, 20, 11, 1150), WM_RBUTTONDOWN);
}
{
  const o = owner(0);
  buttonMessage(o, P, 7, 10, 10, 0);
  eq('no CS_DBLCLKS -> second DOWN', buttonMessage(o, P, 7, 10, 10, 100), WM_LBUTTONDOWN);
}

// --- integration with real class styles (optional)
const dir = process.env.BLISS_ASSETS;
if (dir && existsSync(dir)) {
  for (const [exe, companions] of [['sol.exe', ['cards.dll']], ['winmine.exe', []]]) {
    const { emu, restore } = await startExe({ dir, exe, companions, lcid: 0x0419 });
    tickUntilIdle(emu);
    const hwnd = emu.mainWindow;
    const style = emu.handles.get(hwnd)?.classInfo?.style ?? 0;
    const t0 = 10000;
    buttonMessage(emu, P, hwnd, 100, 100, t0);
    const second = buttonMessage(emu, P, hwnd, 100, 100, t0 + 100);
    eq(`${exe} 2nd click (CS_DBLCLKS=${!!(style & CS_DBLCLKS)})`, second, (style & CS_DBLCLKS) ? WM_LBUTTONDBLCLK : WM_LBUTTONDOWN);
    if (exe === 'winmine.exe') {
      // Chord on a cell: L down, R down, L up, R up — must not crash the emulator
      const lp = (60 << 16) | 30;
      emu.postMessage(hwnd, WM_LBUTTONDOWN, 1, lp);
      emu.postMessage(hwnd, WM_RBUTTONDOWN, 3, lp);
      emu.postMessage(hwnd, WM_LBUTTONUP, 2, lp);
      emu.postMessage(hwnd, WM_RBUTTONUP, 0, lp);
      await pump(emu, 300);
      eq('winmine survives chord', emu.halted, false);
    }
    restore();
  }
} else {
  console.log('SKIP integration (BLISS_ASSETS not set)');
}
console.log(fail ? `[TEST] FAIL (${fail})` : '[TEST] SUCCESS');
process.exit(fail ? 1 : 0);
