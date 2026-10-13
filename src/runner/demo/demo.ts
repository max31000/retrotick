// Dev-only demo for the runner (runner-demo.html): pick the folder with the
// original XP files and start any of the games. Not part of any build.
import { mountGame, type GameHandle } from '../index';

const GAMES = ['sol.exe', 'winmine.exe', 'freecell.exe', 'spider.exe', 'mshearts.exe'];
const DLLS = ['cards.dll', 'mfc42u.dll', 'nddeapi.dll'];

interface DemoState {
  files: Map<string, File>;
  handle: GameHandle | null;
  events: { type: string; detail?: string; time: number }[];
  start(exe: string): Promise<GameHandle>;
  unmount(): void;
}

const host = document.getElementById('host')!;
const logEl = document.getElementById('log')!;
const gamesEl = document.getElementById('games')!;
const unmountBtn = document.getElementById('unmount') as HTMLButtonElement;

// ?scale=0.45 renders the host under a CSS transform (as the Bliss page does on phones)
const scale = Number(new URLSearchParams(location.search).get('scale') || '1');
if (scale > 0 && scale !== 1) {
  const h = host.getBoundingClientRect().height;
  Object.assign(host.style, {
    transform: `scale(${scale})`, transformOrigin: '0 0', overflow: 'visible',
    width: `${100 / scale}%`, height: `${Math.round(h / scale)}px`, minHeight: '0',
  });
  document.body.style.overflow = 'hidden';
}

const state: DemoState = {
  files: new Map(),
  handle: null,
  events: [],
  start,
  unmount,
};
(window as unknown as { __runnerDemo: DemoState }).__runnerDemo = state;

function log(type: string, detail?: string) {
  state.events.push({ type, detail, time: performance.now() });
  logEl.textContent += `${type}${detail ? ': ' + detail : ''}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function fileUrl(name: string): string {
  const f = state.files.get(name);
  return f ? URL.createObjectURL(f) : '';
}

function unmount() {
  state.handle?.unmount();
  state.handle = null;
  unmountBtn.disabled = true;
}

async function start(exeName: string): Promise<GameHandle> {
  unmount();
  const exe = state.files.get(exeName);
  if (!exe) throw new Error(`${exeName} not loaded`);
  const files: Record<string, ArrayBuffer> = {};
  for (const dll of DLLS) {
    const f = state.files.get(dll);
    if (f) files[dll] = await f.arrayBuffer();
  }
  log('mount', exeName);
  const handle = await mountGame(host, {
    exe: await exe.arrayBuffer(),
    exeName,
    files,
    fonts: { tahoma: fileUrl('tahoma.ttf'), micross: fileUrl('micross.ttf'), trebucbd: fileUrl('trebucbd.ttf') },
    persistNamespace: `demo:${exeName}`,
    onExit: () => { log('exit', exeName); unmount(); },
    onTitleChange: (t) => log('title', t),
    onMinimize: () => log('minimize', exeName),
  });
  state.handle = handle;
  unmountBtn.disabled = false;
  return handle;
}

function renderButtons() {
  gamesEl.textContent = '';
  for (const g of GAMES) {
    if (!state.files.has(g)) continue;
    const b = document.createElement('button');
    b.textContent = g;
    b.onclick = () => { start(g).catch(e => log('error', String(e))); };
    gamesEl.appendChild(b);
  }
}

function onPick(e: Event) {
  const list = (e.target as HTMLInputElement).files;
  if (!list) return;
  for (const f of Array.from(list)) state.files.set(f.name.toLowerCase(), f);
  log('files', Array.from(state.files.keys()).join(', '));
  renderButtons();
}

document.getElementById('dir')!.addEventListener('change', onPick);
document.getElementById('files')!.addEventListener('change', onPick);
unmountBtn.addEventListener('click', unmount);
