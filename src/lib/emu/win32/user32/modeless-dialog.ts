import type { Emulator, ControlOverlay, DialogControlInfo } from '../../emulator';
import type { WindowInfo } from './types';
import { IDCANCEL } from '../types';
import { getClientSize } from './_helpers';

const WS_CHILD = 0x40000000;

/** Control overlays for the UI, built from a dialog's live child windows. */
export function buildDialogOverlays(emu: Emulator, wnd: WindowInfo): ControlOverlay[] {
  const overlays: ControlOverlay[] = [];
  for (const childHwnd of wnd.childList ?? []) {
    const child = emu.handles.get<WindowInfo>(childHwnd);
    if (!child || !child.visible) continue;
    const overlay: ControlOverlay = {
      controlId: child.controlId ?? 0,
      childHwnd,
      className: child.classInfo.className.toUpperCase(),
      baseClassName: child.classInfo.baseClassName,
      x: child.x, y: child.y, width: child.width, height: child.height,
      style: child.style, exStyle: child.exStyle, title: child.title,
      checked: child.checked ?? 0,
      fontHeight: child.hFont ? (emu.handles.get<{ height: number }>(child.hFont)?.height ?? 0) : 0,
      trackPos: child.trackPos ?? 0,
      trackMin: child.trackMin ?? 0,
      trackMax: child.trackMax ?? 100,
    };
    if (child.tabItems) overlay.tabItems = child.tabItems;
    if (child.tabSelectedIndex !== undefined) overlay.tabSelectedIndex = child.tabSelectedIndex;
    if (child.cbItems) overlay.cbItems = child.cbItems;
    if (child.cbSelectedIndex !== undefined) overlay.cbSelectedIndex = child.cbSelectedIndex;
    if (child.lbItems) overlay.lbItems = child.lbItems;
    if (child.lbSelectedIndex !== undefined) overlay.lbSelectedIndex = child.lbSelectedIndex;
    if (child.lbSelectedIndices) overlay.lbSelectedIndices = Array.from(child.lbSelectedIndices);
    overlays.push(overlay);
  }
  return overlays;
}

/** True for a top-level dialog window that is not the emulator's main (canvas) window. */
export function isSecondaryTopLevelDialog(emu: Emulator, hwnd: number, wnd: WindowInfo): boolean {
  return emu.mainWindow !== 0 && hwnd !== emu.mainWindow && !!wnd.dlgProc && !(wnd.style & WS_CHILD);
}

/**
 * Show a modeless (CreateDialog*) top-level dialog in the dialog overlay. The application keeps
 * running its own message loop (e.g. MFC's CDialog::DoModal → RunModalLoop); button clicks in
 * the overlay are delivered as WM_COMMAND and the overlay closes when the dialog is hidden,
 * ended or destroyed.
 */
export function showModelessDialog(emu: Emulator, hwnd: number): void {
  const wnd = emu.handles.get<WindowInfo>(hwnd);
  if (!wnd) return;
  if (emu.dialogState?.hwnd === hwnd) return;
  const { cw, ch } = getClientSize(wnd.style, false, wnd.width, wnd.height, !!emu.isNE);
  const overlays = buildDialogOverlays(emu, wnd);
  const controls: DialogControlInfo[] = overlays.map(o => ({
    id: o.controlId, className: o.className, text: o.title, style: o.style,
    x: o.x, y: o.y, width: o.width, height: o.height,
  }));
  if (emu.dialogState) {
    emu._dialogStack.push({ dialogState: emu.dialogState, resolve: emu._dialogResolve, pumpTimer: emu._dialogPumpTimer });
    emu._dialogResolve = null;
    emu._dialogPumpTimer = null;
  }
  emu.dialogState = {
    hwnd,
    dlgProc: wnd.dlgProc ?? 0,
    info: { title: wnd.title, style: wnd.style, width: cw, height: ch, hwnd, controls, overlays, controlValues: new Map() },
    result: IDCANCEL,
    ended: false,
    modeless: true,
  };
  console.log(`[DLG] Showing modeless dialog 0x${hwnd.toString(16)} "${wnd.title}" in overlay`);
  emu.onShowDialog?.(emu.dialogState.info);
}

/** Remove a modeless dialog from the overlay (window stays alive unless the caller frees it). */
export function hideModelessDialog(emu: Emulator, hwnd: number): void {
  if (!emu.dialogState?.modeless || emu.dialogState.hwnd !== hwnd) return;
  const outer = emu._dialogStack.pop();
  if (outer) {
    emu.dialogState = outer.dialogState;
    emu._dialogResolve = outer.resolve;
    emu._dialogPumpTimer = outer.pumpTimer;
    emu.onShowDialog?.(outer.dialogState.info);
  } else {
    emu.dialogState = null;
    emu.onCloseDialog?.();
  }
}

/** WC_DIALOG class atom (MAKEINTATOM(0x8002)) */
const WC_DIALOG_ATOM = 0x8002;
const CREATESTRUCT_SIZE = 48;
const HCBT_CREATEWND = 3;

/**
 * Fire WH_CBT HCBT_CREATEWND for a dialog window, as CreateWindowEx does inside CreateDialog*.
 * Frameworks such as MFC attach their window objects and subclass the window here.
 */
export function fireDialogCbtCreate(emu: Emulator, hwnd: number, wnd: WindowInfo, hInstance: number): void {
  if (emu.cbtHooks.length === 0) return;
  const cs = emu.allocHeap(CREATESTRUCT_SIZE);
  emu.memory.writeU32(cs, 0); // lpCreateParams
  emu.memory.writeU32(cs + 4, hInstance);
  emu.memory.writeU32(cs + 8, 0); // hMenu
  emu.memory.writeU32(cs + 12, wnd.parent);
  emu.memory.writeU32(cs + 16, wnd.height);
  emu.memory.writeU32(cs + 20, wnd.width);
  emu.memory.writeU32(cs + 24, wnd.y);
  emu.memory.writeU32(cs + 28, wnd.x);
  emu.memory.writeU32(cs + 32, wnd.style);
  emu.memory.writeU32(cs + 36, 0); // lpszName
  emu.memory.writeU32(cs + 40, WC_DIALOG_ATOM);
  emu.memory.writeU32(cs + 44, wnd.exStyle);
  const cbt = emu.allocHeap(8);
  emu.memory.writeU32(cbt, cs);
  emu.memory.writeU32(cbt + 4, 0); // hwndInsertAfter
  for (const hook of emu.cbtHooks) emu.callCallback(hook.lpfn, [HCBT_CREATEWND, hwnd, cbt]);
}
