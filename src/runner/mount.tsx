/**
 * mountGame(): runs one Win32 program inside a host element as an isolated
 * Preact island — no desktop, taskbar or file browser; a single top-level
 * window in the Luna frame, centered in the host.
 */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { parsePE } from '../lib/pe';
import type { PEInfo } from '../lib/pe/types';
import type { Emulator } from '../lib/emu/emulator';
import { EmulatorView } from '../components/EmulatorView';
import { ThemeContext, type UiTheme } from '../components/win2k/theme';
import { injectLunaCss } from '../components/win2k/luna/luna-css';
import type { EmulatorStorage } from '../lib/emulator-storage';
import { registerXpFonts } from './fonts';
import { createRunnerStorage } from './storage';
import { applyLunaSysColors, lunaThemeFor } from './luna-system';
import { installKeyboardGuard } from './keyboard';
import type { GameHandle, MountOptions } from './types';

const DEFAULT_LCID = 0x419;
const FALLBACK_SCREEN = { width: 1024, height: 768 };

interface RunnerAppProps {
  root: HTMLElement;
  exe: ArrayBuffer;
  peInfo: PEInfo;
  files: Map<string, ArrayBuffer>;
  exeName: string;
  lcid: number;
  screen: { width: number; height: number };
  storage: EmulatorStorage;
  audioContext: AudioContext | null;
  onExit: () => void;
  onTitleChange?: (title: string) => void;
  onMinimize?: () => void;
  allowMaximize?: boolean;
  onEmulator: (emu: Emulator) => void;
}

function RunnerApp(p: RunnerAppProps) {
  const [focused, setFocused] = useState(() => p.root.contains(p.root.ownerDocument.activeElement));
  useEffect(() => {
    const onIn = () => setFocused(true);
    const onOut = (e: FocusEvent) => {
      if (e.relatedTarget && p.root.contains(e.relatedTarget as Node)) return;
      const left = e.target as Node;
      // A focused control removed with its dialog (e.g. the edit box of a closed
      // dialog) drops focus to <body>: keep the game focused instead.
      setTimeout(() => {
        const active = p.root.ownerDocument.activeElement;
        if (!left.isConnected && (!active || active === p.root.ownerDocument.body)) p.root.focus({ preventScroll: true });
        else if (!p.root.contains(active)) setFocused(false);
      }, 0);
    };
    p.root.addEventListener('focusin', onIn);
    p.root.addEventListener('focusout', onOut);
    return () => {
      p.root.removeEventListener('focusin', onIn);
      p.root.removeEventListener('focusout', onOut);
    };
  }, [p.root]);

  return (
    <EmulatorView
      arrayBuffer={p.exe}
      peInfo={p.peInfo}
      additionalFiles={p.files}
      exeName={p.exeName}
      onStop={p.onExit}
      onTitleChange={p.onTitleChange}
      onMinimize={p.onMinimize}
      onSetupEmulator={p.onEmulator}
      audioContext={p.audioContext}
      lcid={p.lcid}
      screenSize={p.screen}
      storage={p.storage}
      focused={focused}
      embedded
      allowMaximize={p.allowMaximize}
    />
  );
}

function hostScreen(host: HTMLElement): { width: number; height: number } {
  const w = Math.round(host.clientWidth);
  const h = Math.round(host.clientHeight);
  return w > 0 && h > 0 ? { width: w, height: h } : FALLBACK_SCREEN;
}

function createAudioContext(): AudioContext | null {
  try {
    return new AudioContext();
  } catch (e) {
    console.warn('[runner] AudioContext unavailable:', e);
    return null;
  }
}

export async function mountGame(host: HTMLElement, opts: MountOptions): Promise<GameHandle> {
  const doc = host.ownerDocument;
  const themeName = opts.theme ?? 'luna';
  injectLunaCss(doc);
  if (opts.fonts) {
    try { await registerXpFonts(opts.fonts, doc); } catch (e) { console.warn('[runner] font registration failed:', e); }
  }

  const peInfo = parsePE(opts.exe);
  const lcid = opts.lcid ?? DEFAULT_LCID;
  const theme: UiTheme = lunaThemeFor(lcid, themeName);
  const files = new Map(Object.entries(opts.files ?? {}));
  const storage = createRunnerStorage(opts.persistNamespace ?? opts.exeName);
  const ownAudio = opts.audioContext ? null : createAudioContext();
  const audioContext = opts.audioContext ?? ownAudio;

  const root = doc.createElement('div');
  root.className = `bliss-runner${themeName === 'luna' ? ' bliss-luna-root' : ''}`;
  root.tabIndex = 0;
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', opts.exeName);
  Object.assign(root.style, {
    position: 'relative', width: '100%', height: '100%', minHeight: '100%', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none',
  });
  // 'safe' keeps the caption reachable when the window is larger than the host (ignored where unsupported)
  root.style.alignItems = 'safe center';
  root.style.justifyContent = 'safe center';
  host.appendChild(root);

  const restoreColors = themeName === 'luna' ? applyLunaSysColors() : () => { /* win2k: keep */ };
  const removeKeyboardGuard = installKeyboardGuard(root, audioContext);

  let emulator: Emulator | null = null;
  let exited = false;
  let unmounted = false;
  const onExit = () => {
    if (exited) return;
    exited = true;
    opts.onExit?.();
  };

  const handle: GameHandle = {
    unmount() {
      if (unmounted) return;
      unmounted = true;
      render(null, root);
      root.remove();
      removeKeyboardGuard();
      restoreColors();
      storage.close().catch(() => { /* best effort */ });
      ownAudio?.close().catch(() => { /* already closed */ });
      emulator = null;
    },
    focus() {
      root.focus({ preventScroll: true });
    },
    get emulator() { return emulator; },
  };

  await new Promise<void>((resolve) => {
    render(
      <ThemeContext.Provider value={theme}>
        <RunnerApp
          root={root}
          exe={opts.exe}
          peInfo={peInfo}
          files={files}
          exeName={opts.exeName}
          lcid={lcid}
          screen={opts.screen ?? hostScreen(host)}
          storage={storage}
          audioContext={audioContext}
          onExit={onExit}
          onTitleChange={opts.onTitleChange}
          onMinimize={opts.onMinimize}
          allowMaximize={opts.allowMaximize}
          onEmulator={(emu) => { emulator = emu; resolve(); }}
        />
      </ThemeContext.Provider>,
      root,
    );
    // EmulatorView creates the emulator in a passive effect; never hang if it fails.
    setTimeout(resolve, 1000);
  });

  handle.focus();
  return handle;
}
