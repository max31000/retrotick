// Shared headless harness for running a PE executable in Node with mock canvas objects.
// Files are loaded from a directory given by an env var (default BLISS_ASSETS) or a CLI arg,
// so no proprietary binaries are referenced from committed code.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const noop = () => {};

export function installDomMocks() {
  const mockCtx = {
    fillRect: noop, clearRect: noop, strokeRect: noop,
    fillText: noop, strokeText: noop, measureText: () => ({ width: 8 }),
    drawImage: noop, putImageData: noop, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w || 1, height: h || 1 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    setTransform: noop, resetTransform: noop, transform: noop,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, arcTo: noop, rect: noop, ellipse: noop,
    fill: noop, stroke: noop, clip: noop, setLineDash: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    font: '', textAlign: 'left', textBaseline: 'top',
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true, shadowBlur: 0, shadowColor: 'transparent',
    canvas: null,
  };
  const mockCanvas = {
    width: 800, height: 600,
    getContext: () => mockCtx,
    toDataURL: () => 'data:image/png;base64,',
    addEventListener: noop, removeEventListener: noop,
    style: { cursor: 'default' },
    parentElement: { style: { cursor: 'default' } },
  };
  mockCtx.canvas = mockCanvas;
  globalThis.document = { createElement: () => mockCanvas, title: '' };
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { ...mockCtx, canvas: this }; }
  };
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  globalThis.Image = class { set src(_) {} };
  // Patch (don't replace) URL: the module loader still needs the real constructor
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = noop;
  return mockCanvas;
}

export function readToArrayBuffer(path) {
  const b = readFileSync(path);
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return ab;
}

/** Resolve the assets directory from argv[2] or the given env var. Exits with code 2 if absent. */
export function resolveAssetsDir(envVar = 'BLISS_ASSETS') {
  const dir = process.argv[2] || process.env[envVar];
  if (!dir || !existsSync(dir)) {
    console.log(`[TEST] SKIP: set ${envVar}=<dir> or pass the directory as first argument`);
    process.exit(2);
  }
  return dir;
}

/**
 * Load and start an exe headlessly. Returns { emu, warnings }.
 * opts: { dir, exe, companions: string[], lcid?, maxTicks?, cmdLine? }
 */
export async function startExe(opts) {
  const { Emulator } = await import('../../src/lib/emu/emulator.ts');
  const { parsePE, extractMenus } = await import('../../src/lib/pe/index.ts');
  const canvas = installDomMocks();

  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => { warnings.push(a.join(' ')); if (process.env.HARNESS_VERBOSE) origWarn(...a); };
  const origLog = console.log;
  if (!process.env.HARNESS_VERBOSE) {
    console.log = (...a) => { const s = a.join(' '); if (s.startsWith('[TEST]') || s.startsWith('[WILD') || s.startsWith('[HALT]')) origLog(...a); };
  }

  const exeBuf = readToArrayBuffer(join(opts.dir, opts.exe));
  const peInfo = parsePE(exeBuf);
  const emu = new Emulator();
  emu.screenWidth = 1024;
  emu.screenHeight = 768;
  if (opts.lcid !== undefined) emu.configuredLcid = opts.lcid;
  for (const c of opts.companions || []) {
    const p = join(opts.dir, c);
    if (existsSync(p)) emu.additionalFiles.set(c, readToArrayBuffer(p));
  }
  emu.exeName = opts.exe;
  if (opts.cmdLine) emu.commandLine = opts.cmdLine;
  if (process.env.HARNESS_TRACE) emu.traceApi = true;
  await emu.load(exeBuf, peInfo, canvas);
  const menus = extractMenus(peInfo, exeBuf);
  if (menus.length > 0) emu.menuItems = menus[0].menu.items;
  emu.run();

  const restore = () => { console.warn = origWarn; console.log = origLog; };
  return { emu, warnings, restore };
}

/** Tick until the emulator waits for a message (or halts). Returns ticks used. */
export function tickUntilIdle(emu, maxTicks = 5000) {
  let ticks = 0;
  while (!emu.waitingForMessage && !emu.halted && ticks < maxTicks) {
    emu.tick();
    ticks++;
  }
  return ticks;
}

/** Let timers/queued messages run for roughly `ms` of wall time (yielding to the event loop). */
export async function pump(emu, ms = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end && !emu.halted) {
    emu.tick();
    await new Promise(r => setTimeout(r, 2));
  }
}

/** Summarise warnings: missing API definitions, unimplemented APIs. */
export function summarizeWarnings(warnings) {
  const noDef = [...new Set(warnings.filter(w => w.includes('No API definition')).map(w => w.replace(/.*No API definition for (\S+).*/, '$1')))];
  const unimpl = [...new Set(warnings.filter(w => w.startsWith('Unimplemented API')).map(w => w.replace('Unimplemented API: ', '')))];
  const missingDlls = warnings.filter(w => w.includes('Missing DLLs'));
  return { noDef, unimpl, missingDlls };
}

/** Standard "reach the message loop" check used by per-game tests. */
export async function runMessageLoopTest(opts) {
  const { emu, warnings, restore } = await startExe(opts);
  const ticks = tickUntilIdle(emu, opts.maxTicks ?? 5000);
  const reached = emu.waitingForMessage && !emu.halted;
  if (reached) await pump(emu, opts.pumpMs ?? 500);
  restore();
  const s = summarizeWarnings(warnings);
  if (s.noDef.length) console.log(`[TEST] No API definition: ${s.noDef.join(', ')}`);
  if (s.unimpl.length) console.log(`[TEST] Unimplemented: ${s.unimpl.join(', ')}`);
  for (const m of s.missingDlls) console.log(`[TEST] ${m}`);
  const mainWnd = emu.mainWindow ? emu.handles.get(emu.mainWindow) : null;
  console.log(`[TEST] ticks=${ticks} halted=${emu.halted} reason=${emu.haltReason || '-'} mainWindow=${mainWnd ? JSON.stringify(mainWnd.title) : 'none'}`);
  const ok = reached && !emu.halted && s.noDef.length === 0;
  console.log(ok ? '[TEST] SUCCESS: Reached message loop' : '[TEST] FAIL');
  return { emu, ok, summary: s };
}
