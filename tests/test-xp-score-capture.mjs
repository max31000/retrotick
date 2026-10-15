// Headless: capture game results through the generic host hooks (emu.hooks, see src/lib/emu/hooks.ts)
// and replace the native record UI. The per-game "adapters" below stand in for logic that lives in
// the embedding web app — the emulator itself knows nothing about these programs.
//
// Usage: BLISS_ASSETS=<dir with winmine.exe, sol.exe, cards.dll> npx tsx tests/test-xp-score-capture.mjs
//        SOL_WAIT_MS=33000 additionally earns Solitaire's time bonus (needs > 30 s of game time).
import { resolveAssetsDir, startExe, tickUntilIdle, pump } from './lib/headless-harness.mjs';
import { RegistryStore } from '../src/lib/registry-store.ts';

const dir = resolveAssetsDir();
const out = (s) => process.stdout.write(s + '\n');
const WM_CLOSE = 0x0010, WM_COMMAND = 0x0111, WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101;
const WM_LBUTTONDOWN = 0x0201, WM_LBUTTONUP = 0x0202, MK_LBUTTON = 1, VK_ESCAPE = 0x1B, IDNO = 7;
let failures = 0;
const check = (ok, msg) => { out(`[TEST] ${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };

async function boot(exe, companions = []) {
  const { emu, restore } = await startExe({ dir, exe, companions, lcid: 0x419, beforeRun(e) { e.registryStore = new RegistryStore(); } });
  tickUntilIdle(emu, 20000);
  await pump(emu, 500);
  return { emu, restore };
}

// ---------------------------------------------------------------- Minesweeper
// Adapter: dialog 600 (name entry, shown only for a new best time of a standard level) is answered
// with the site user's name; dialog 700 ("Чемпионы по категориям") that follows is read and closed.
function winmineAdapter(emu, playerName, events) {
  let pendingLevel = null;
  const LEVELS = [['новичк', 'beginner', 701], ['любител', 'intermediate', 703], ['профессионал', 'expert', 705]];
  emu.hooks.dialogInit = (d) => {
    if (d.template === 600) {
      const lvl = LEVELS.find(([kw]) => (d.controls[601] || '').includes(kw));
      pendingLevel = lvl ?? null;
      return { press: 100, values: { 602: playerName } };
    }
    if (d.template === 700 && pendingLevel) {
      const [, level, ctl] = pendingLevel;
      pendingLevel = null;
      const time = parseInt(d.controls[ctl], 10);
      events.push({ game: 'winmine', level, timeSec: time, name: d.controls[ctl + 1], memTime: emu.memory.readU32(0x100579C) });
      return { press: 1 };
    }
  };
  emu.hooks.registryWrite = (r) => events.push({ reg: `${r.path}\\${r.name}`, value: r.value });
}

async function winmineWin(emu, delayMs) {
  const m = emu.memory;
  // Test-only shortcut equivalent to the xyzzy cheat: the XP winmine board lives at 0x1005340
  // (32 bytes per row, 0x80 = mine, 0x10 = border); width/height at 0x1005334/0x1005338.
  const W = m.readU32(0x1005334), H = m.readU32(0x1005338);
  const cells = [];
  for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) if (!(m.readU8(0x1005340 + y * 32 + x) & 0x80)) cells.push([x, y]);
  const click = async ([x, y]) => {
    const lp = (((y - 1) * 16 + 55 + 8) << 16) | ((x - 1) * 16 + 12 + 8);
    emu.postMessage(emu.mainWindow, WM_LBUTTONDOWN, MK_LBUTTON, lp);
    emu.postMessage(emu.mainWindow, WM_LBUTTONUP, 0, lp);
    await pump(emu, 15);
  };
  await click(cells[0]);
  await pump(emu, delayMs);
  for (const c of cells.slice(1)) {
    const v = m.readU8(0x1005340 + c[1] * 32 + c[0]);
    if (!(v & 0x40)) await click(c); // 0x40 = already opened
  }
  await pump(emu, 400);
}

{
  const { emu, restore } = await boot('winmine.exe');
  const events = [];
  winmineAdapter(emu, 'Вася', events);
  await winmineWin(emu, 0);
  const rec = events.find(e => e.game);
  check(!!rec && rec.level === 'beginner' && rec.timeSec === rec.memTime && rec.name === 'Вася',
    `winmine record captured: ${JSON.stringify(rec)}`);
  check(!emu.dialogState && emu.messageBoxes.length === 0, 'winmine: no native dialog left on screen');
  // Second game, slower than the stored best: the program shows no dialog at all
  events.length = 0;
  emu.postMessage(emu.mainWindow, WM_KEYDOWN, 0x71 /* VK_F2 */, 0);
  emu.postMessage(emu.mainWindow, WM_KEYUP, 0x71, 0);
  await pump(emu, 300);
  await winmineWin(emu, 2300);
  const t2 = emu.memory.readU32(0x100579C);
  check(!events.some(e => e.game), `winmine: slower win (${t2} s) → no record dialog, no event (memory peek needed to see every win)`);
  emu.postMessage(emu.mainWindow, WM_CLOSE, 0, 0);
  await pump(emu, 500);
  const regs = events.filter(e => e.reg && /time1|name1/i.test(e.reg));
  check(regs.length === 2 && regs.some(r => r.value === rec?.timeSec), `winmine writes records only on exit: ${JSON.stringify(regs)}`);
  restore();
}

// ---------------------------------------------------------------- Solitaire
// Adapter: the status line is drawn with DrawText ("Время: N", score value, "Счет: "); a win draws
// "[Премия: N  ]Нажмите клавишу Esc…" (TextOut) and, once the card cascade stops, asks "Сдать заново?".
function solAdapter(emu, events) {
  const st = { prev: '', score: null, time: null, bonus: null, won: false };
  emu.hooks.textDraw = (t) => {
    const s = t.text;
    if (s.startsWith('Время: ')) st.time = parseInt(s.slice(7), 10);
    else if (s === 'Счет: ') st.score = st.prev.trim();
    // The cascade prompt (string 106) is drawn on every win; standard scoring prefixes the time bonus (string 107)
    else if (s.includes('Нажмите клавишу Esc')) { st.won = true; st.bonus = s.startsWith('Премия: ') ? parseInt(s.slice(8), 10) : null; }
    st.prev = s;
  };
  emu.hooks.messageBox = (mb) => {
    if (mb.text === 'Сдать заново?' && st.won) {
      events.push({ game: 'sol', score: st.score, timeSec: st.time, bonus: st.bonus });
      st.won = false;
      return { result: IDNO }; // web app shows its own dialog instead (or { hidden: true } and answer later)
    }
  };
  emu.hooks.registryWrite = (r) => events.push({ reg: `${r.path}\\${r.name}`, value: r.value });
}

{
  const { emu, restore } = await boot('sol.exe', ['cards.dll']);
  const events = [];
  solAdapter(emu, events);
  const hwnd = emu.mainWindow;
  // Click the stock twice: the first move starts the game clock
  for (let i = 0; i < 2; i++) {
    const lp = (50 << 16) | 40;
    emu.postMessage(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lp);
    emu.postMessage(hwnd, WM_LBUTTONUP, 0, lp);
    await pump(emu, 300);
  }
  await pump(emu, Number(process.env.SOL_WAIT_MS || 2500));
  emu.postMessage(hwnd, WM_COMMAND, 1010, 0); // hidden accelerator Alt+Shift+2 (force win)
  await pump(emu, 2500);
  emu.postMessage(hwnd, WM_KEYDOWN, VK_ESCAPE, 0); // stop the cascade
  emu.postMessage(hwnd, WM_KEYUP, VK_ESCAPE, 0);
  await pump(emu, 1500);
  const win = events.find(e => e.game);
  check(!!win && win.timeSec > 0 && win.score !== null && win.bonus !== null, `sol win captured: ${JSON.stringify(win)}`);
  check(emu.messageBoxes.length === 0 && !emu.halted, 'sol: "Сдать заново?" answered by the host, program still running');
  // Options dialog answered by the host: shows which registry values carry the game mode
  // (300/301 draw one/three, 302/303/304 standard/Vegas/none, 305 timed, 306 status bar, 307 outline, 308 keep Vegas score)
  const variants = [{}, { 300: 1, 301: 0 }, { 302: 0, 303: 1 }, { 305: 0 }, { 308: 1 }, { 303: 0, 304: 1 }, { 306: 0 }, { 307: 1 }];
  for (const v of variants) {
    events.length = 0;
    let seen = null;
    emu.hooks.dialogInit = (d) => {
      if (d.template !== 103) return undefined;
      seen = Object.entries(d.checked).filter(([, c]) => c).map(([id]) => id).join(',');
      return { press: 1, check: v, clicks: Object.keys(v).filter(id => v[id]).map(Number) };
    };
    emu.postMessage(hwnd, WM_COMMAND, 1003, 0);
    await pump(emu, 600);
    const regs = events.filter(e => e.reg).map(e => `${e.reg.replace(/.*\\/, '')}=0x${e.value.toString(16)}`);
    out(`[TEST] sol options: checked before={${seen}} set=${JSON.stringify(v)} → ${regs.join(' ')}`);
    if (v === variants[0]) check(regs.length > 0, 'sol options dialog answered by the host and stored in the registry');
  }
  restore();
}

// ---------------------------------------------------------------- FreeCell
// Adapter: deal number from the title ("Расклад "Солитера" #N"), win = template "YouWin"
// (statistics won/wins/streak/stype are written to the registry just before it).
{
  const events = [];
  let deal = null;
  const hooks = {
    windowText: (w) => { const m = w.isMain && /#(\d+)/.exec(w.text); if (m) deal = Number(m[1]); },
    registryWrite: (r) => events.push({ reg: r.name, value: r.value instanceof Uint8Array ? new DataView(r.value.buffer).getUint32(0, true) : r.value }),
    dialogInit: (d) => {
      if (d.template === 'YouWin') { events.push({ game: 'freecell', deal, won: true }); return { press: 7 /* «Нет» */ }; }
    },
    // Hidden Ctrl+Shift+F10 cheat (test only): Abort = win on the next move
    messageBox: (mb) => (mb.text.startsWith('Choose Abort to Win') ? { result: 3 } : undefined),
  };
  const { emu, restore } = await startExe({ dir, exe: 'freecell.exe', companions: ['cards.dll'], lcid: 0x419, beforeRun(e) { e.registryStore = new RegistryStore(); e.hooks = hooks; } });
  tickUntilIdle(emu, 20000);
  await pump(emu, 800);
  const hwnd = emu.mainWindow;
  emu.postMessage(hwnd, WM_COMMAND, 102, 0); // new game (F2)
  await pump(emu, 1500);
  emu.postMessage(hwnd, WM_COMMAND, 114, 0); // Ctrl+Shift+F10
  await pump(emu, 500);
  for (const [x, y] of [[60, 300], [300, 30]]) { // pick a column card, drop it on a free cell
    emu.postMessage(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, (y << 16) | x);
    emu.postMessage(hwnd, WM_LBUTTONUP, 0, (y << 16) | x);
    await pump(emu, 300);
  }
  await pump(emu, 5000); // auto-play to the foundations
  const win = events.find(e => e.game);
  check(!!win && win.deal > 0 && !emu.dialogState, `freecell win captured: ${JSON.stringify(win)} stats=${JSON.stringify(events.filter(e => e.reg))}`);
  restore();
}

out(failures ? `[TEST] FAIL (${failures})` : '[TEST] SUCCESS');
process.exit(failures ? 1 : 0);
