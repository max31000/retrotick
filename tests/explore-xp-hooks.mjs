// Exploration: log every host-hook event while running a scripted sequence.
// EXE=freecell.exe STEPS="cmd:102 wait:800 cmd:114 wait:500" npx tsx tests/tmp-explore-hooks.mjs
import { resolveAssetsDir, startExe, tickUntilIdle, pump } from './lib/headless-harness.mjs';
import { RegistryStore } from '../src/lib/registry-store.ts';
const dir = resolveAssetsDir();
const exe = process.env.EXE;
const out = (s) => process.stdout.write(s + '\n');
let phase = 'init';
const mbAnswers = [];
let lastText = '';
const textSeen = new Set();
const hooks = {
  dialogCreate: (d) => { out(`[${phase}] dialogCreate ${JSON.stringify(d)}`); },
  dialogInit: (d) => { out(`[${phase}] dialogInit ${d.template} "${d.title}" ${JSON.stringify(d.controls)} checked=${JSON.stringify(d.checked)}`); const p = process.env.PRESS ? JSON.parse(process.env.PRESS)[d.template] : undefined; return p !== undefined ? { press: p } : undefined; },
  messageBox: (m) => { out(`[${phase}] messageBox ${JSON.stringify(m)}`); const r = mbAnswers.shift(); return r !== undefined ? { result: r } : { hidden: true }; },
  registryWrite: (r) => out(`[${phase}] reg ${r.path}\\${r.name} = ${JSON.stringify(r.value instanceof Uint8Array ? [...r.value] : r.value)}`),
  windowText: (w) => out(`[${phase}] windowText main=${w.isMain} ${JSON.stringify(w.text)}`),
  textDraw: (t) => { const k = `${t.api}:${t.text}`; if (process.env.ALLTEXT || !textSeen.has(k)) { textSeen.add(k); out(`[${phase}] text ${t.api} hwnd=${t.hwnd} (${t.x},${t.y}) ${JSON.stringify(t.text)}`); } },
};
const { emu, restore } = await startExe({ dir, exe, companions: ['cards.dll', 'mfc42u.dll', 'nddeapi.dll'], lcid: 0x419, beforeRun(e) { e.registryStore = new RegistryStore(); e.hooks = hooks; if (process.env.PRESET_REG) { const [sub, name, val] = process.env.PRESET_REG.split("|"); const k = e.registryStore.createKey(0x80000001, sub); const d = new Uint8Array(4); new DataView(d.buffer).setUint32(0, Number(val), true); e.registryStore.setValue(k.handle, name, 4, d); } } });
tickUntilIdle(emu, 20000);
await pump(emu, 1000);
const hwnd = () => emu.mainWindow;
for (const step of (process.env.STEPS || '').split(/\s+/).filter(Boolean)) {
  const [op, arg] = step.split(':');
  phase = step;
  if (op === 'cmd') emu.postMessage(hwnd(), 0x0111, Number(arg), 0);
  else if (op === 'mb') mbAnswers.push(Number(arg));
  else if (op === 'mbnow') { const m = emu.messageBoxes[0]; if (m) emu.dismissMessageBox(m.id, Number(arg)); }
  else if (op === 'key') { emu.postMessage(hwnd(), 0x0100, Number(arg), 0); emu.postMessage(hwnd(), 0x0101, Number(arg), 0); }
  else if (op === 'click' || op === 'dbl') {
    const [x, y] = arg.split(',').map(Number); const lp = (y << 16) | x;
    emu.postMessage(hwnd(), 0x0201, 1, lp); emu.postMessage(hwnd(), 0x0202, 0, lp);
    if (op === 'dbl') { emu.postMessage(hwnd(), 0x0203, 1, lp); emu.postMessage(hwnd(), 0x0202, 0, lp); }
  }
  else if (op === 'wait') { await pump(emu, Number(arg)); continue; }
  else if (op === 'peek') { const [a, n] = arg.split(','); out(`[peek] ${a}: ${[...Array(Number(n))].map((_, i) => emu.memory.readU8(Number(a) + i).toString(16).padStart(2, '0')).join(' ')}`); continue; }
  await pump(emu, 200);
}
out(`[end] dialog=${emu.dialogState ? JSON.stringify(emu.dialogState.info.title) : 'none'} mbs=${JSON.stringify(emu.messageBoxes.map(m => m.text))} halted=${emu.halted} ${emu.haltReason || ''}`);
restore();
process.exit(0);
