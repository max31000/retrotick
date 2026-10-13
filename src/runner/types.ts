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
  /** IndexedDB namespace for registry, INI files and D:\ files. Default: exeName. */
  persistNamespace?: string;
  /** Called once when the game window is closed (caption button, «Выход», ExitProcess). */
  onExit?(): void;
  /** Called whenever the main window title changes. */
  onTitleChange?(title: string): void;
  /** Called when the caption «Свернуть» button is pressed (extension; default: no-op). */
  onMinimize?(): void;
}

export interface GameHandle {
  /** Stop the emulator and remove everything the runner added to the host. */
  unmount(): void;
  /** Move keyboard focus into the game. */
  focus(): void;
  /** The underlying RetroTick `Emulator` instance (for diagnostics/tests). */
  readonly emulator: unknown;
}

export type MountGameFn = (host: HTMLElement, opts: MountOptions) => Promise<GameHandle>;

export interface LunaFrameExport {
  /** The Luna stylesheet (all classes prefixed `bliss-luna-`). */
  readonly css: string;
  /** Inject the stylesheet into a document once (idempotent). */
  inject(doc?: Document): void;
}

export type RegisterXpFontsFn = (fonts: RunnerFonts, doc?: Document) => Promise<void>;
