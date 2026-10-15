# @bliss/retrotick-runner

Runs an original Win32 game (e.g. Windows XP `sol.exe`) inside a host element using the
RetroTick emulator. Framework-agnostic: the emulator UI is a self-contained Preact island
rendered into a child of the host, so it works under React, Vue or plain DOM.

No Microsoft files are included — the host supplies the executable, DLLs and fonts.

## mountGame

```ts
import { mountGame } from '@bliss/retrotick-runner';

const handle = await mountGame(hostDiv, {
  exe: await (await fetch(solUrl)).arrayBuffer(),
  exeName: 'sol.exe',
  files: { 'cards.dll': cardsDllBuffer },
  lcid: 0x419,                       // default: ru-RU (ANSI 1251 / OEM 866)
  fonts: { tahoma: tahomaUrl, micross: microssUrl, trebucbd: trebucbdUrl },
  persistNamespace: 'sol',           // IndexedDB: registry, INI files, D:\ (default: exeName)
  onExit: () => navigate('/'),       // close button, «Выход», ExitProcess
  onTitleChange: (t) => (document.title = t),
  audioContext: sharedCtx,           // optional; default: own context, closed on unmount
  volume: 0.5,                       // optional initial volume 0..1 (default 1)
});
handle.focus();     // keyboard focus into the game (done automatically after mount)
handle.setVolume(0.3); // master volume 0..1, applied live (handle.volume reads it back)
handle.unmount();   // stop the emulator and clean up
```

### Audio / volume

All emulated audio (PlaySound/sndPlaySound, waveOut, DOS sound devices) goes through one
`GainNode` owned by the runner; `volume` / `setVolume(v)` control it (clamped to 0..1,
non-finite values ignored). That gain connects to `audioOutput` when given (any node of the
same `AudioContext`, e.g. a host-wide master `GainNode` or an analyser), otherwise to
`audioContext.destination`. The gain is disconnected on `unmount()`.

Behaviour: one top-level window in the Windows XP Luna frame, centered in the host
(`host` should have a size, e.g. `position: relative; height: 100%`); the emulated
screen size defaults to the host size (`screen` overrides it). Maximize is disabled and the
window cannot be moved or resized. While focus is inside the game, F1–F12, Space and the
arrow keys are not passed to the browser. No desktop, taskbar or missing-DLL popups.

Options beyond contract C1: `theme: 'win2k'` (debug), `onMinimize()` (default: no-op),
`audioOutput`, `volume` and `GameHandle.setVolume()` / `volume` (since 0.3.0); `hooks`,
`GameHandle.setInputBlocked()`, `answerMessageBox()`, `peek()`, `readRegistry()` (since 0.4.0).
Other exports: `registerXpFonts(fonts)`, `LunaFrame`, `LUNA_CSS`.

Notes: the Luna system colours are applied to the emulator's global colour table while a
game is mounted (one game per page at a time). Modal dialogs are `position: fixed`, so don't
put the host inside a CSS `transform` (use `zoom` or scale the canvas instead).

## Hooks (observe / answer the program) — since 0.4.0

Generic extension points; what a dialog id or a drawn string *means* is up to the host.
They are installed before the program starts; the `hooks` object is used by reference, so
the host may add or replace handlers later.

```ts
const handle = await mountGame(host, {
  ...,
  hooks: {
    dialogCreate: (d) => (d.template === 700 ? { result: 1 } : undefined),     // skip a dialog
    dialogInit: (d) => (d.template === 600                                     // answer it unseen
      ? { press: 100, values: { 602: userName } } : undefined),
    messageBox: (m) => (m.text === 'Сдать заново?' ? { hidden: true } : undefined),
    textDraw: (t) => { /* TextOut / ExtTextOut / DrawText: { hwnd, text, x, y } */ },
    windowText: (w) => { /* SetWindowText */ },
    registryWrite: (r) => { /* RegSetValueEx: { path, name, type, value } */ },
    poll: () => { /* after input was processed, else every pollIntervalMs: e.g. handle.peek(...) */ },
    pollIntervalMs: 100,
  },
});
handle.answerMessageBox(id, 6 /* IDYES */);   // for { hidden: true }
handle.peek(0x0100579c, 4);                    // read-only memory copy
handle.readRegistry('HKEY_CURRENT_USER\\Software\\Microsoft\\Solitaire', 'Параметры');
handle.setInputBlocked(true);                  // host modal above the game: no keyboard/mouse input
```

| Hook / method | Semantics |
|---|---|
| `dialogCreate(d)` | modal dialog about to be created; `{ result }` skips it (DialogBox returns `result`) |
| `dialogInit(d)` | after WM_INITDIALOG, before showing; `DialogPress` answers it unseen |
| `messageBox(m)` | `{ result }` answers at once; `{ hidden: true }` keeps it pending without UI (the program waits) until `answerMessageBox(m.id, result)`; answering an unknown or already answered id is a no-op |
| `textDraw(t)` | after TextOut / ExtTextOut / DrawText(Ex) |
| `windowText(w)` | after SetWindowText |
| `registryWrite(r)` | after RegSetValueEx |
| `poll()` | after the first emulator run following host input (key, mouse, menu/accelerator command), otherwise at most every `pollIntervalMs` (default 100) while the program runs; an idle program is not polled. Errors are caught and logged |
| `setInputBlocked(b)` | all DOM input inside the runner root (canvas, menu bar, dialogs) is swallowed and nothing is posted to the program; keys held at that moment get WM_KEYUP; timers, audio and `answerMessageBox` keep working. `inputBlocked` reads it back |
| `peek(addr, len)` | read-only copy of emulated memory (empty before start) |
| `readRegistry(path, name)` | current value: REG_DWORD → number, REG_SZ → string (UTF-16), other → bytes; null if absent |

`dialogInit` receives `controls` (texts by id) and `checked` (button states) after
WM_INITDIALOG; `DialogPress` may also set `check` states and `clicks` (WM_COMMAND to the
dialog procedure, e.g. radio buttons) before the final `press`. Only modal dialogs
(DialogBoxParam/DialogBoxIndirectParam) are covered; MFC `DoModal` uses CreateDialogIndirect
and is not hooked yet. Example adapters: `tests/test-xp-score-capture.mjs`.

## LunaFrame (frame + menu bar for pages that draw their own window)

A light entry with no emulator code:

```ts
import { LunaFrame } from '@bliss/retrotick-runner/luna';   // ~4 KB gzip
LunaFrame.inject();                 // adds <style id="bliss-luna-css"> once
// or: import '@bliss/retrotick-runner/luna.css';
```

Markup (the runner itself renders exactly this structure):

```html
<div class="bliss-luna-root">                         <!-- fonts/cursor; optional -->
  <div class="bliss-luna-window">                     <!-- + bliss-luna-inactive, bliss-luna-dialog -->
    <div class="bliss-luna-titlebar">
      <span class="bliss-luna-title-icon"><img src="icon16.png" alt=""></span>
      <span class="bliss-luna-title">3D Пинбол для Windows — Space Cadet</span>
      <span class="bliss-luna-controls">
        <button class="bliss-luna-btn bliss-luna-btn-min" aria-label="Свернуть"></button>
        <button class="bliss-luna-btn bliss-luna-btn-max" disabled aria-label="Развернуть"></button>
        <button class="bliss-luna-btn bliss-luna-btn-close" aria-label="Закрыть"></button>
      </span>
    </div>
    <div class="bliss-luna-menubar">
      <div class="bliss-luna-menubar-cell">           <!-- position: relative anchor for the popup -->
        <div class="bliss-luna-menu-title bliss-luna-open">Игра</div>
        <div class="bliss-luna-menu-popup" style="left:0; top:100%">
          <div class="bliss-luna-menu-entry bliss-luna-hl">
            <span class="bliss-luna-menu-text">Новая игра</span><span class="bliss-luna-menu-accel">F2</span>
          </div>
          <div class="bliss-luna-menu-sep"></div>
          <div class="bliss-luna-menu-entry bliss-luna-disabled"><span class="bliss-luna-menu-text">Пауза</span></div>
          <div class="bliss-luna-menu-entry"><span class="bliss-luna-menu-check"></span><span class="bliss-luna-menu-text">Звук</span></div>
          <div class="bliss-luna-menu-entry"><span class="bliss-luna-menu-text">Параметры</span><span class="bliss-luna-menu-arrow"></span></div>
        </div>
      </div>
    </div>
    <div class="bliss-luna-client" style="width:640px; height:480px"><canvas></canvas></div>
  </div>
</div>
```

| Class | Meaning |
|---|---|
| `bliss-luna-window` | window frame (4px blue frame, rounded top); modifiers `bliss-luna-inactive` (inactive colours), `bliss-luna-dialog` (3px dialog frame, 29px caption) |
| `bliss-luna-titlebar`, `-title-icon`, `-title` | caption bar (30px), 16×16 icon, Trebuchet MS Bold 13px text |
| `bliss-luna-controls`, `bliss-luna-btn` + `-btn-min` / `-btn-max` / `-btn-restore` / `-btn-help` / `-btn-close` | 21×21 caption buttons; `disabled` (or `bliss-luna-disabled`) greys the glyph; `bliss-luna-pressed` forces the pressed look |
| `bliss-luna-menubar`, `-menubar-cell`, `-menu-title` (+ `bliss-luna-open`, `bliss-luna-disabled`) | menu bar (Tahoma 8pt, #ECE9D8) and its items; the open item is #316AC5 |
| `bliss-luna-menu-popup`, `-menu-entry` (+ `bliss-luna-hl`, `bliss-luna-disabled`, `bliss-luna-default`), `-menu-text`, `-menu-accel`, `-menu-check`, `-menu-arrow`, `-menu-sep` | white popup menu, #316AC5 highlight, check mark, submenu arrow, separator |
| `bliss-luna-client` | client area (face colour background) |
| `bliss-luna-button` (+ `bliss-luna-default`, `bliss-luna-pressed`, `bliss-luna-disabled`) | XP push button (put it in a 75×23 box) |
| `bliss-luna-check`, `bliss-luna-radio` (+ `bliss-luna-checked`, `bliss-luna-disabled`) | 13×13 check box / radio button |
| `bliss-luna-face` | dialog face colour #ECE9D8 |
| `bliss-luna-root` (+ `bliss-luna-cues`) | base font and cursor; mnemonic underlines (`<u>`) are hidden unless `bliss-luna-cues` is set (XP default "hide until Alt") |

CSS variables (on `:root`): `--bliss-luna-font-ui`, `--bliss-luna-font-dlg`, `--bliss-luna-font-caption`,
`--bliss-luna-face`, `--bliss-luna-highlight`, `--bliss-luna-graytext`.
Register the XP fonts (`registerXpFonts` from the main entry, or your own `@font-face` for
`Tahoma`, `Microsoft Sans Serif`, `Trebuchet MS` bold) for pixel-faithful text.

## Build

In the RetroTick repository: `npm run build:runner` (output `runner-pkg/dist`),
`npm run pack:runner` (→ `retrotick-runner-<version>.tgz` in the repository root).
Releases: pushing a tag `runner-vX.Y.Z` builds and attaches `retrotick-runner-X.Y.Z.tgz`.
