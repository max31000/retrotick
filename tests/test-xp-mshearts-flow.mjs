// Headless: Hearts welcome dialog → enter a name → OK, then report what the app does next.
// Usage: BLISS_ASSETS=<dir> npx tsx tests/test-xp-mshearts-flow.mjs
import { resolveAssetsDir, startExe, tickUntilIdle, pump, summarizeWarnings } from './lib/headless-harness.mjs';
const dir = resolveAssetsDir();
const { emu, warnings, restore } = await startExe({ dir, exe: 'mshearts.exe', companions: ['mfc42u.dll', 'cards.dll', 'nddeapi.dll'], lcid: 0x0419 });
tickUntilIdle(emu, 20000);
await pump(emu, 300);
const out = (s) => process.stdout.write(s + '\n');
const ds = emu.dialogState;
out(`[TEST] dialog after start: ${ds ? JSON.stringify(ds.info.title) + ' modeless=' + !!ds.modeless : 'none'}`);
if (ds) {
  emu.dismissDialog(1, new Map([[201, 'Max']]));
  out(`[TEST] queue after OK: ${JSON.stringify(emu.messageQueue.map(m => [m.hwnd, m.message]))} waiting=${emu.waitingForMessage} cb=${!!emu.currentThread?._onMessageAvailable} depth=${emu.wndProcDepth} framesPending=${emu._wndProcFrames?.length} setupPending=${emu._wndProcSetupPending}`);
  await pump(emu, 1500);
  out(`[TEST] queue after pump: ${JSON.stringify(emu.messageQueue.map(m => [m.hwnd, m.message]))} waiting=${emu.waitingForMessage}`);
}
const ds2 = emu.dialogState;
out(`[TEST] dialog after OK: ${ds2 ? JSON.stringify(ds2.info.title) : 'none'}; message boxes: ${JSON.stringify(emu.messageBoxes.map(m => m.text))}`);
const s = summarizeWarnings(warnings);
out(`[TEST] halted=${emu.halted} reason=${emu.haltReason || '-'} unimpl=${s.unimpl.join(',')} noDef=${s.noDef.join(',')}`);
restore();
process.exit(0);
