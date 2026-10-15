/**
 * Public types of `@bliss/retrotick-runner` (contract C1). This file has no
 * runtime imports so that its declarations can be shipped as-is.
 */

export interface RunnerFonts {
  /** URL of tahoma.ttf (menus, MessageBox text, GDI "Tahoma") */
  tahoma: string;
  /** URL of micross.ttf (dialogs: "MS Shell Dlg" / "Microsoft Sans Serif" / "MS Sans Serif") */
  micross: string;
  /** URL of trebucbd.ttf (Luna caption: "Trebuchet MS" bold) */
  trebucbd: string;
}

export interface MountOptions {
  /** The executable image */
  exe: ArrayBuffer;
  /** File name of the executable, e.g. 'sol.exe' */
  exeName: string;
  /** Companion files placed next to the executable ('cards.dll', 'mfc42u.dll', ...) */
  files: Record<string, ArrayBuffer>;
  /** Locale of the emulated system. Default 0x419 (ru-RU, ANSI 1251, OEM 866). */
  lcid?: number;
  /** Non-client theme. Default 'luna'. ('win2k' is accepted for debugging.) */
  theme?: 'luna' | 'win2k';
  /** XP font files; registered with the FontFace API before the game starts. */
  fonts?: RunnerFonts;
  /** Emulated screen size (GetSystemMetrics, CW_USEDEFAULT). Default: the host element's size. */
  screen?: { width: number; height: number };
  /** Shared AudioContext. When omitted the runner creates one and closes it on unmount. */
  audioContext?: AudioContext;
  /**
   * Node the game's audio is routed to (through the runner's own volume gain).
   * Must belong to the same AudioContext. Default: the context's destination.
   */
  audioOutput?: AudioNode;
  /** Initial volume, 0..1 (values outside are clamped). Default 1. */
  volume?: number;
  /** IndexedDB namespace for registry, INI files and D:\ files. Default: exeName. */
  persistNamespace?: string;
  /** Called once when the game window is closed (caption button, «Выход», ExitProcess). */
  onExit?(): void;
  /** Called whenever the main window title changes. */
  onTitleChange?(title: string): void;
  /** Called when the caption «Свернуть» button is pressed (extension; default: no-op). */
  onMinimize?(): void;
  /** Observe/answer what the program shows or stores (installed before the program starts). */
  hooks?: GameHooks;
}

/** A modal dialog about to be created (DialogBoxParam / DialogBoxIndirectParam). */
export interface DialogCreateInfo {
  /** Resource id (number), resource name (string) or `@0x…` for an in-memory template */
  template: number | string;
  title: string;
  hwndParent: number;
}

/** A modal dialog after WM_INITDIALOG, before it is shown. */
export interface DialogInitInfo extends DialogCreateInfo {
  hwnd: number;
  /** Text of every child control by control id */
  controls: Record<number, string>;
  /** Check state (0/1/2) of every button that has one */
  checked: Record<number, number>;
}

/** Answer an initialised dialog without showing it. */
export interface DialogPress {
  /** Button whose WM_COMMAND is sent last (normally IDOK = 1) */
  press: number;
  /** Control texts to set first (e.g. a name edit box) */
  values?: Record<number, string>;
  /** Button check states to set first */
  check?: Record<number, number>;
  /** Controls to click before `press`, in order (radio buttons tracked by the dialog procedure) */
  clicks?: number[];
}

export interface MessageBoxInfo {
  /** Pass to `GameHandle.answerMessageBox` */
  id: number;
  caption: string;
  text: string;
  /** MB_* flags */
  type: number;
}

export interface RegistryWriteInfo {
  /** Lower-case key path, e.g. `hkey_current_user\software\microsoft\winmine` */
  path: string;
  name: string;
  type: number;
  /** REG_DWORD → number, REG_SZ → string, otherwise raw bytes */
  value: number | string | Uint8Array;
}

export interface TextDrawInfo {
  hwnd: number;
  api: 'TextOut' | 'ExtTextOut' | 'DrawText';
  text: string;
  x: number;
  y: number;
}

export interface WindowTextInfo {
  hwnd: number;
  text: string;
  isMain: boolean;
}

/** Generic observation/automation hooks; per-game meaning is up to the host. */
export interface GameHooks {
  /** `{ result }` skips the dialog: DialogBox returns `result`, the dialog procedure never runs. */
  dialogCreate?(d: DialogCreateInfo): { result: number } | void;
  /** `{ press, … }` clicks a button of the initialised dialog; it is never shown. */
  dialogInit?(d: DialogInitInfo): DialogPress | void;
  /** `{ result }` answers at once; `{ hidden: true }` keeps it pending without UI until `answerMessageBox`. */
  messageBox?(m: MessageBoxInfo): { result: number } | { hidden: true } | void;
  registryWrite?(r: RegistryWriteInfo): void;
  textDraw?(t: TextDrawInfo): void;
  windowText?(w: WindowTextInfo): void;
}

export interface GameHandle {
  /** Stop the emulator and remove everything the runner added to the host. */
  unmount(): void;
  /** Move keyboard focus into the game. */
  focus(): void;
  /** Set the game's master volume, 0..1 (clamped; non-finite values are ignored). Applies immediately. */
  setVolume(volume: number): void;
  /** Current master volume, 0..1. */
  readonly volume: number;
  /** The underlying RetroTick `Emulator` instance (for diagnostics/tests). */
  readonly emulator: unknown;
  /** Answer a message box kept pending by `hooks.messageBox` (`{ hidden: true }`) — IDOK=1, IDYES=6, IDNO=7… */
  answerMessageBox(id: number, result: number): void;
  /** Read-only copy of emulated memory (`length` bytes at linear address `address`); empty before start. */
  peek(address: number, length: number): Uint8Array;
  /** Current registry value (path like `HKEY_CURRENT_USER\Software\Microsoft\Solitaire`), or null. */
  readRegistry(path: string, name: string): number | string | Uint8Array | null;
}

export type MountGameFn = (host: HTMLElement, opts: MountOptions) => Promise<GameHandle>;

export interface LunaFrameExport {
  /** The Luna stylesheet (all classes prefixed `bliss-luna-`). */
  readonly css: string;
  /** Inject the stylesheet into a document once (idempotent). */
  inject(doc?: Document): void;
}

export type RegisterXpFontsFn = (fonts: RunnerFonts, doc?: Document) => Promise<void>;
