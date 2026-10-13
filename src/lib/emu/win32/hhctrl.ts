import type { Emulator } from '../emulator';

// HHCTRL.OCX — HTML Help. Programs LoadLibrary it and GetProcAddress HtmlHelpA/W (exported by
// name and as ordinals 14/15). CHM viewing is not supported, so every call reports failure
// (NULL window handle), which callers treat as "help unavailable".
export function registerHhctrl(emu: Emulator): void {
  const hh = emu.registerDll('HHCTRL.OCX');
  // HWND HtmlHelp(HWND hwndCaller, LPCTSTR pszFile, UINT uCommand, DWORD_PTR dwData)
  hh.register('HtmlHelpA', 4, () => 0);
  hh.register('HtmlHelpW', 4, () => 0);
  hh.register('ord_14', 4, () => 0);
  hh.register('ord_15', 4, () => 0);
}
