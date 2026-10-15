// Audio routing: every node the emulator creates must end up in emu.audioOutput
// (the host's volume node), never directly in the context destination.
// Fake AudioContext that records connect() calls; no binaries, no browser.
// Usage: npx tsx tests/test-audio-routing.mjs
import { registerWinmm } from '../src/lib/emu/win32/winmm.ts';
import { DosAudio } from '../src/lib/emu/dos/audio.ts';
import { PCSpeaker } from '../src/lib/emu/dos/pc-speaker.ts';
import { createMasterGain } from '../src/runner/audio.ts';

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ' (want ' + JSON.stringify(want) + ')'}`);
};

// ---- fake Web Audio ------------------------------------------------------------
const param = () => ({ value: 1, setValueAtTime() {}, setTargetAtTime() {} });
class FakeCtx {
  constructor() {
    this.connects = []; // [sourceKind, destination node]
    this.destination = this.node('destination');
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.audioWorklet = { addModule: async () => {} };
  }
  node(kind, extra = {}) {
    const ctx = this;
    return {
      kind, context: ctx, ...extra,
      connect(dest) { ctx.connects.push([kind, dest]); return dest; },
      disconnect() {},
    };
  }
  createGain() { return this.node('gain', { gain: param() }); }
  createBiquadFilter() { return this.node('biquad', { frequency: param(), gain: param(), Q: param() }); }
  createOscillator() { return this.node('oscillator', { frequency: param(), start() {} }); }
  createBufferSource() { return this.node('bufferSource', { start() {}, stop() {} }); }
  createScriptProcessor() { return this.node('scriptProcessor'); }
  createMediaStreamSource() { return this.node('mediaStream'); }
  createBuffer(ch, n, rate) {
    const data = Array.from({ length: ch }, () => new Float32Array(n));
    return { duration: n / rate, getChannelData: (c) => data[c] };
  }
  resume() { return Promise.resolve(); }
}
globalThis.AudioContext = FakeCtx;
globalThis.AudioWorkletNode = class {
  constructor(ctx, name) { Object.assign(this, ctx.node(`worklet:${name}`), { port: { postMessage() {} } }); }
};
Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  configurable: true,
  value: { getUserMedia: async () => ({ getTracks: () => [] }) },
});
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- fake emulator for WINMM ----------------------------------------------------
function fakeEmu(ctx, output) {
  const mem = new Uint8Array(0x10000);
  const dv = new DataView(mem.buffer);
  const handlers = {};
  const handles = new Map();
  let nextHandle = 0x100;
  let args = [];
  const emu = {
    audioContext: ctx,
    audioOutput: output,
    audioStopHooks: new Set(),
    additionalFiles: new Map(),
    registerDll: () => ({ register: (name, _n, fn) => { handlers[name] = fn; } }),
    readArg: (i) => args[i] >>> 0,
    postMessage() {},
    memory: {
      readU8: (a) => mem[a], readU16: (a) => dv.getUint16(a, true), readU32: (a) => dv.getUint32(a, true),
      writeU32: (a, v) => dv.setUint32(a, v >>> 0, true),
      readCString: () => '', readUTF16String: () => '',
    },
    handles: { alloc: (_t, d) => { handles.set(nextHandle, d); return nextHandle++; }, get: (h) => handles.get(h) ?? null },
  };
  registerWinmm(emu);
  return { emu, mem, dv, call: (name, ...a) => { args = a; return handlers[name](emu); } };
}

function writeWav(mem, dv, at) {
  const samples = 64;
  mem.set([0x52, 0x49, 0x46, 0x46], at); // RIFF
  dv.setUint32(at + 4, 36 + samples * 2, true);
  mem.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], at + 8); // WAVEfmt
  dv.setUint32(at + 16, 16, true);
  dv.setUint16(at + 20, 1, true); // PCM
  dv.setUint16(at + 22, 1, true); // mono
  dv.setUint32(at + 24, 22050, true);
  dv.setUint32(at + 28, 44100, true);
  dv.setUint16(at + 32, 2, true);
  dv.setUint16(at + 34, 16, true);
  mem.set([0x64, 0x61, 0x74, 0x61], at + 36); // data
  dv.setUint32(at + 40, samples * 2, true);
}

function writeFormat(dv, at) {
  dv.setUint16(at, 1, true); dv.setUint16(at + 2, 1, true);
  dv.setUint32(at + 4, 22050, true); dv.setUint16(at + 14, 16, true);
}

const toDest = (ctx) => ctx.connects.filter(([, d]) => d === ctx.destination).map(([k]) => k);
const toOut = (ctx, out) => ctx.connects.filter(([, d]) => d === out).map(([k]) => k);

// ---- WINMM: PlaySound, waveOut, waveIn -----------------------------------------
{
  const ctx = new FakeCtx();
  const out = ctx.createGain();
  const { mem, dv, call } = fakeEmu(ctx, out);
  writeWav(mem, dv, 0x1000);
  eq('PlaySoundA(SND_MEMORY) ok', call('PlaySoundA', 0x1000, 0, 0x0004), 1);
  eq('sndPlaySoundA(SND_MEMORY) ok', call('sndPlaySoundA', 0x1000, 0x0004), 1);
  writeFormat(dv, 0x2000);
  eq('waveOutOpen ok', call('waveOutOpen', 0x3000, 0, 0x2000, 0, 0, 0), 0);
  const hwo = dv.getUint32(0x3000, true);
  dv.setUint32(0x4000, 0x5000, true); dv.setUint32(0x4004, 256, true); // WAVEHDR lpData, length
  eq('waveOutWrite ok', call('waveOutWrite', hwo, 0x4000, 32), 0);
  eq('waveInOpen ok', call('waveInOpen', 0x3010, 0, 0x2000, 0, 0, 0), 0);
  eq('waveInStart ok', call('waveInStart', dv.getUint32(0x3010, true)), 0);
  await tick(); await tick();
  eq('winmm → audioOutput', toOut(ctx, out), ['bufferSource', 'bufferSource', 'bufferSource', 'scriptProcessor']);
  eq('winmm never → destination', toDest(ctx), []);
}
{
  const ctx = new FakeCtx();
  const { mem, dv, call } = fakeEmu(ctx, undefined);
  writeWav(mem, dv, 0x1000);
  call('PlaySoundA', 0x1000, 0, 0x0004);
  eq('no audioOutput: PlaySound → destination', toDest(ctx), ['bufferSource']);
}

// ---- DOS: OPL worklet, PC speaker (square + guitar) -----------------------------
{
  const ctx = new FakeCtx();
  const out = ctx.createGain();
  const dos = new DosAudio();
  dos.init(ctx, out);
  await tick(); await tick();
  const routed = toOut(ctx, out).sort();
  eq('DOS worklet + speaker → audioOutput', routed, ['gain', 'gain', 'worklet:opl-processor'].sort());
  eq('DOS never → destination', toDest(ctx), []);
  dos.ctx = null; // stop the fill interval
}
{
  const ctx = new FakeCtx();
  const out = ctx.createGain();
  const spk = new PCSpeaker(ctx, out);
  spk.guitarMode = false;
  spk.update(0x03, 1193); // ~1 kHz square
  eq('PC speaker square → audioOutput', toOut(ctx, out), ['gain']);
  eq('PC speaker oscillator → its gain', ctx.connects.some(([k]) => k === 'oscillator'), true);
  eq('PC speaker never → destination', toDest(ctx), []);
}

// ---- runner master gain: output of another context falls back to the destination --
{
  const ctx = new FakeCtx();
  const other = new FakeCtx();
  const foreign = other.createGain();
  // Real Web Audio throws InvalidAccessError for a node of another context.
  const realGain = ctx.createGain.bind(ctx);
  ctx.createGain = () => {
    const g = realGain();
    const connect = g.connect;
    g.connect = (d) => { if (d.context !== ctx) throw new Error('InvalidAccessError'); return connect(d); };
    return g;
  };
  const warn = console.warn; console.warn = () => {};
  const master = createMasterGain(ctx, foreign, 0.4);
  console.warn = warn;
  eq('foreign audioOutput → own destination', toDest(ctx), ['gain']);
  master.setVolume(0.2);
  eq('setVolume still works', master.node?.gain.value, 0.2);
}

console.log(fail ? `[TEST] FAIL (${fail})` : '[TEST] SUCCESS');
process.exit(fail ? 1 : 0);
