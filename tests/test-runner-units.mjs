// Unit tests of runner helpers (no binaries, no browser).
// Usage: npx tsx tests/test-runner-units.mjs
import { shouldGuardKey } from '../src/runner/keyboard.ts';
import { applyLunaSysColors, LUNA_SYS_COLORS } from '../src/runner/luna-system.ts';
import { SYS_COLORS, COLOR_BTNFACE } from '../src/lib/emu/win32/types.ts';
import { toFixedCoords } from '../src/components/win2k/fixed-origin.ts';
import { clampVolume, createMasterGain } from '../src/runner/audio.ts';
import { runPollHook, isInputMessage } from '../src/lib/emu/hooks.ts';
import { releaseHeldKeys } from '../src/lib/emu/release-keys.ts';

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

// --- master volume gain
eq('clamp 0.5', clampVolume(0.5), 0.5);
eq('clamp high', clampVolume(7), 1);
eq('clamp low', clampVolume(-1), 0);
eq('clamp NaN', clampVolume(NaN), null);
eq('clamp string', clampVolume('1'), null);
const connected = [];
const fakeGain = () => ({ gain: { value: 1 }, connect(n) { connected.push(n); }, disconnect() { this.gone = true; } });
const fakeCtx = { destination: 'DEST', createGain: fakeGain };
const g1 = createMasterGain(fakeCtx, undefined, 0.25);
eq('gain initial value', g1.node.gain.value, 0.25);
eq('gain connects to destination by default', connected[0], 'DEST');
g1.setVolume(0.8);
eq('setVolume updates gain', [g1.volume, g1.node.gain.value], [0.8, 0.8]);
g1.setVolume(Infinity);
eq('non-finite volume ignored', g1.volume, 0.8);
const outNode = { name: 'out' };
const g2 = createMasterGain(fakeCtx, outNode);
eq('gain connects to audioOutput', connected[1], outNode);
eq('default volume 1', g2.volume, 1);
const n2 = g2.node;
g2.dispose();
eq('dispose disconnects', [n2.gone, g2.node], [true, null]);
const g3 = createMasterGain(null, undefined, 0.3);
g3.setVolume(0.6);
eq('no AudioContext: volume tracked, no node', [g3.volume, g3.node], [0.6, null]);

// --- hooks.poll: after input, otherwise throttled by pollIntervalMs
{
  let n = 0;
  const hooks = { poll: () => { n++; }, pollIntervalMs: 100 };
  const st = { inputSeq: 0, seenInputSeq: 0, last: 0 };
  runPollHook(hooks, st, 1000); // interval elapsed since 0
  runPollHook(hooks, st, 1050); // throttled
  eq('poll throttled by interval', n, 1);
  st.inputSeq++;
  runPollHook(hooks, st, 1060); // input since the last call
  eq('poll right after input', n, 2);
  runPollHook(hooks, st, 1070);
  runPollHook(hooks, st, 1160);
  eq('poll again after the interval', n, 3);
  const bad = { poll: () => { throw new Error('x'); } };
  const warn = console.warn; console.warn = () => {};
  runPollHook(bad, { inputSeq: 1, seenInputSeq: 0, last: 0 }, 0);
  console.warn = warn;
  eq('poll errors are contained', true, true);
  eq('input messages', [0x100, 0x102, 0x201, 0x20A, 0x111, 0x0F, 0x113].map(isInputMessage), [true, true, true, true, true, false, false]);
}

// --- releaseHeldKeys: WM_KEYUP for held keys, key state tables cleared
{
  const posted = [];
  const emu = { keyStates: new Set([0x10, 0x41]), msgKeyState: new Set([0x10]), focusedWindow: 0, mainWindow: 7,
    postMessage: (h, m, w) => posted.push([h, m, w]) };
  eq('released keys', releaseHeldKeys(emu), [0x10, 0x41]);
  eq('WM_KEYUP posted to the main window', posted, [[7, 0x101, 0x10], [7, 0x101, 0x41]]);
  eq('key state cleared', [emu.keyStates.size, emu.msgKeyState], [0, null]);
  eq('nothing held: nothing posted', releaseHeldKeys(emu), []);
}

console.log(fail ? `[TEST] FAIL (${fail})` : '[TEST] SUCCESS');
process.exit(fail ? 1 : 0);
