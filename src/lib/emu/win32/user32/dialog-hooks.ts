// Host hooks for modal dialogs (see ../../hooks.ts): skip a dialog before it is created,
// or press one of its buttons right after WM_INITDIALOG without ever showing it.
import type { Emulator } from '../../emulator';
import type { WindowInfo } from './types';
import { WM_COMMAND } from '../types';

/** `dialogCreate` hook: the result DialogBox should return without creating the dialog, or undefined. */
export function hookDialogCreate(emu: Emulator, template: number | string, title: string, hwndParent: number): number | undefined {
  const r = emu.hooks.dialogCreate?.({ template, title, hwndParent });
  if (!r) return undefined;
  console.log(`[DLG] host skipped dialog ${template} → ${r.result}`);
  return r.result;
}

/**
 * `dialogInit` hook, called with the dialog created, initialised and registered as the
 * current modal dialog but not yet shown. When the host presses a button, the button's
 * WM_COMMAND goes to the dialog procedure (which normally reads the controls and calls
 * EndDialog) and the dialog's result is returned; otherwise undefined.
 */
export function hookDialogInit(
  emu: Emulator, wnd: WindowInfo, template: number | string, title: string, hwndParent: number,
  wndProc: number, restoreCpu: () => void,
): number | undefined {
  const hook = emu.hooks.dialogInit;
  const ds = emu.dialogState;
  if (!hook || !ds || ds.hwnd !== wnd.hwnd) return undefined;
  const child = (id: number) => {
    const h = wnd.children?.get(id);
    return h ? emu.handles.get<WindowInfo>(h) : null;
  };
  const controls: Record<number, string> = {};
  const checked: Record<number, number> = {};
  for (const id of wnd.children?.keys() ?? []) {
    const c = child(id);
    controls[id] = c?.title ?? '';
    if (c?.checked !== undefined) checked[id] = c.checked;
  }
  const press = hook({ template, title, hwndParent, hwnd: wnd.hwnd, controls, checked });
  if (!press) return undefined;

  for (const [id, val] of Object.entries(press.values ?? {})) {
    const c = child(Number(id));
    if (c) c.title = val;
  }
  for (const [id, state] of Object.entries(press.check ?? {})) {
    const c = child(Number(id));
    if (c) c.checked = state;
  }
  for (const id of [...(press.clicks ?? []), press.press]) {
    if (ds.ended) break;
    const btn = wnd.children?.get(id) ?? 0;
    emu.callWndProc(wndProc, wnd.hwnd, WM_COMMAND, id & 0xFFFF, btn);
    restoreCpu();
  }
  // EndDialog already ended it (and resolved nothing: the DialogBox call is still synchronous)
  if (!ds.ended) {
    ds.result = press.press;
    ds.ended = true;
    emu._endDialog(press.press);
  }
  console.log(`[DLG] host pressed ${press.press} in dialog ${template} → ${ds.result}`);
  return ds.result;
}
