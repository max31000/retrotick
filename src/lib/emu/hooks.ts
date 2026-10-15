/**
 * Host observation/automation hooks.
 *
 * Generic, application-agnostic extension points for an embedding page: it can watch
 * what the emulated program shows (dialogs, message boxes, drawn text, window titles)
 * or stores (registry writes) and answer modal UI on the user's behalf. Nothing here
 * knows about any particular program — per-application interpretation belongs to the host.
 */
import type { Emulator } from './emulator';

/** A modal dialog about to be created (DialogBoxParam / DialogBoxIndirectParam). */
export interface DialogCreateInfo {
  /** Resource id (number), resource name (string) or `@0x…` for an in-memory template */
  template: number | string;
  /** Caption from the template */
  title: string;
  hwndParent: number;
}

/** A modal dialog after WM_INITDIALOG (controls hold what the dialog procedure put in them). */
export interface DialogInitInfo extends DialogCreateInfo {
  hwnd: number;
  /** Text of every child control by control id, as set up by the template and WM_INITDIALOG */
  controls: Record<number, string>;
  /** Check state (BST_*) of every button control that has one */
  checked: Record<number, number>;
}

/** Press a button of an initialised dialog without showing it; `values` are typed into controls first. */
export interface DialogPress {
  press: number;
  values?: Record<number, string>;
  /** Button check states (BST_*) to set first */
  check?: Record<number, number>;
  /** Controls to click (WM_COMMAND BN_CLICKED to the dialog procedure) before `press`, in order */
  clicks?: number[];
}

export interface MessageBoxInfo {
  /** Id for `Emulator.dismissMessageBox(id, result)` */
  id: number;
  caption: string;
  text: string;
  /** MB_* flags */
  type: number;
}

export interface RegistryWriteInfo {
  /** Full key path, lower-case, e.g. `hkey_current_user\software\microsoft\winmine` */
  path: string;
  name: string;
  /** REG_* type */
  type: number;
  /** REG_DWORD → number, REG_SZ/REG_EXPAND_SZ → string, otherwise the raw bytes */
  value: number | string | Uint8Array;
}

export interface TextDrawInfo {
  /** Window the DC belongs to (0 for memory DCs) */
  hwnd: number;
  api: 'TextOut' | 'ExtTextOut' | 'DrawText';
  text: string;
  /** Reference point (TextOut/ExtTextOut) or rectangle origin (DrawText), client coordinates */
  x: number;
  y: number;
}

export interface WindowTextInfo {
  hwnd: number;
  text: string;
  /** True for the program's main window */
  isMain: boolean;
}

export interface EmulatorHooks {
  /** Return `{ result }` to skip the dialog entirely: DialogBox returns `result`, the dialog procedure never runs. */
  dialogCreate?(d: DialogCreateInfo): { result: number } | void;
  /** Return `{ press }` to click a button of the initialised dialog; it is never shown. */
  dialogInit?(d: DialogInitInfo): DialogPress | void;
  /** Return `{ result }` to answer at once, `{ hidden: true }` to keep the box pending without UI
   *  (answer later with `Emulator.dismissMessageBox(id, result)`). */
  messageBox?(m: MessageBoxInfo): { result: number } | { hidden: true } | void;
  registryWrite?(r: RegistryWriteInfo): void;
  textDraw?(t: TextDrawInfo): void;
  windowText?(w: WindowTextInfo): void;
  /**
   * Called after the emulator has run: after the first run that follows host input
   * (keyboard/mouse/menu messages) and otherwise at most every `pollIntervalMs` while the
   * program is running. Meant for cheap state polling (e.g. reading memory); keep it fast.
   */
  poll?(): void;
  /** Minimum interval between time-based `poll` calls, ms (default 100) */
  pollIntervalMs?: number;
}

/** Messages that count as host input for `EmulatorHooks.poll`. */
export function isInputMessage(msg: number): boolean {
  return (msg >= 0x0100 && msg <= 0x0109) // WM_KEYDOWN … WM_UNICHAR
    || (msg >= 0x0200 && msg <= 0x020E) // WM_MOUSEMOVE … WM_MOUSEHWHEEL
    || msg === 0x0111 || msg === 0x0112; // WM_COMMAND / WM_SYSCOMMAND (menus, accelerators)
}

const DEFAULT_POLL_INTERVAL_MS = 100;

/** State for `runPollHook` kept on the emulator. */
export interface PollState { inputSeq: number; seenInputSeq: number; last: number }

/** Call `hooks.poll` if input arrived since the last call or the interval elapsed. */
export function runPollHook(hooks: EmulatorHooks, st: PollState, now: number): void {
  const poll = hooks.poll;
  if (!poll) return;
  const interval = hooks.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (st.seenInputSeq === st.inputSeq && now - st.last < interval) return;
  st.seenInputSeq = st.inputSeq;
  st.last = now;
  try { poll(); } catch (err) { console.warn('[HOOK] poll:', err); }
}

const REG_SZ = 1;
const REG_EXPAND_SZ = 2;
const REG_DWORD = 4;

/** Decode registry data the way RegistryWriteInfo.value reports it. */
export function decodeRegValue(type: number, data: Uint8Array, wide: boolean): number | string | Uint8Array {
  if (type === REG_DWORD && data.length >= 4) return (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0;
  if (type === REG_SZ || type === REG_EXPAND_SZ) {
    let s = '';
    if (wide) {
      for (let i = 0; i + 1 < data.length; i += 2) {
        const c = data[i] | (data[i + 1] << 8);
        if (!c) break;
        s += String.fromCharCode(c);
      }
    } else {
      for (let i = 0; i < data.length && data[i]; i++) s += String.fromCharCode(data[i]);
    }
    return s;
  }
  return data;
}

/**
 * Wrap the handlers of observed APIs so that `emu.hooks` is notified after they run.
 * Called once after all API modules are registered; costs one property check per call
 * when no hook is set.
 */
export function installApiObservers(emu: Emulator): void {
  type Observed = 'textDraw' | 'windowText' | 'registryWrite';
  const wrap = (key: string, hook: Observed, after: (args: number[]) => void, nArgs: number) => {
    const def = emu.apiDefs.get(key);
    if (!def) return;
    const inner = def.handler;
    def.handler = (e: Emulator) => {
      // No hook for this API: no argument reads, no allocation
      if (!e.hooks[hook]) return inner(e);
      const args: number[] = [];
      for (let i = 0; i < nArgs; i++) args.push(e.readArg(i));
      const r = inner(e);
      try { after(args); } catch (err) { console.warn(`[HOOK] ${key}:`, err); }
      return r;
    };
  };
  const readW = (p: number, n: number): string => {
    if (!p) return '';
    if (n < 0) return emu.memory.readUTF16String(p);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(emu.memory.readU16(p + i * 2));
    return s;
  };
  const readA = (p: number, n: number): string => {
    if (!p) return '';
    if (n < 0) return emu.memory.readCString(p);
    return n > 0 ? emu.memory.readBytesMBCS(p, n) : '';
  };
  const dcWnd = (hdc: number) => emu.getDC(hdc)?.hwnd ?? 0;
  const text = (api: TextDrawInfo['api'], hdc: number, s: string, x: number, y: number) => {
    const h = emu.hooks.textDraw;
    if (h && s) h({ hwnd: dcWnd(hdc), api, text: s, x, y });
  };
  const rectOrigin = (p: number) => (p ? { x: emu.memory.readI32(p), y: emu.memory.readI32(p + 4) } : { x: 0, y: 0 });

  // TextOut(hdc, x, y, lpString, c)
  wrap('GDI32.DLL:TextOutW', 'textDraw', (a) => { if (emu.hooks.textDraw) text('TextOut', a[0], readW(a[3], a[4] | 0), a[1] | 0, a[2] | 0); }, 5);
  wrap('GDI32.DLL:TextOutA', 'textDraw', (a) => { if (emu.hooks.textDraw) text('TextOut', a[0], readA(a[3], a[4] | 0), a[1] | 0, a[2] | 0); }, 5);
  // ExtTextOut(hdc, x, y, options, lprect, lpString, c, lpDx)
  wrap('GDI32.DLL:ExtTextOutW', 'textDraw', (a) => { if (emu.hooks.textDraw) text('ExtTextOut', a[0], readW(a[5], a[6] | 0), a[1] | 0, a[2] | 0); }, 8);
  wrap('GDI32.DLL:ExtTextOutA', 'textDraw', (a) => { if (emu.hooks.textDraw) text('ExtTextOut', a[0], readA(a[5], a[6] | 0), a[1] | 0, a[2] | 0); }, 8);
  // DrawText(hdc, lpString, c, lprc, format) / DrawTextEx(…, lpdtp)
  for (const [key, wide] of [['USER32.DLL:DrawTextW', true], ['USER32.DLL:DrawTextExW', true], ['USER32.DLL:DrawTextA', false]] as const) {
    wrap(key, 'textDraw', (a) => {
      if (!emu.hooks.textDraw) return;
      const o = rectOrigin(a[3]);
      text('DrawText', a[0], wide ? readW(a[1], a[2] | 0) : readA(a[1], a[2] | 0), o.x, o.y);
    }, 5);
  }
  // SetWindowText(hwnd, lpString)
  for (const [key, wide] of [['USER32.DLL:SetWindowTextW', true], ['USER32.DLL:SetWindowTextA', false]] as const) {
    wrap(key, 'windowText', (a) => {
      const h = emu.hooks.windowText;
      if (h && a[1]) h({ hwnd: a[0], text: wide ? readW(a[1], -1) : readA(a[1], -1), isMain: a[0] === emu.mainWindow });
    }, 2);
  }
  // RegSetValueEx(hKey, lpValueName, Reserved, dwType, lpData, cbData)
  for (const [key, wide] of [['ADVAPI32.DLL:RegSetValueExW', true], ['ADVAPI32.DLL:RegSetValueExA', false]] as const) {
    wrap(key, 'registryWrite', (a) => {
      const h = emu.hooks.registryWrite;
      const path = emu.registryStore?.pathOf(a[0]);
      if (!h || path == null || !a[4]) return;
      const data = new Uint8Array(a[5]);
      for (let i = 0; i < data.length; i++) data[i] = emu.memory.readU8(a[4] + i);
      h({ path, name: wide ? readW(a[1], -1) : readA(a[1], -1), type: a[3], value: decodeRegValue(a[3], data, wide) });
    }, 6);
  }
}
