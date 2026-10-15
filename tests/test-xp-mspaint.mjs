// Headless: Windows XP Paint reaches its message loop (MFC42U runs as a real DLL, GDI+ is delay-loaded).
// Usage: BLISS_ASSETS=<dir with mspaint.exe, mfc42u.dll, mfc42loc.dll, gdiplus.dll> npx tsx tests/test-xp-mspaint.mjs
import { resolveAssetsDir, runMessageLoopTest } from './lib/headless-harness.mjs';
const dir = resolveAssetsDir();
const { ok } = await runMessageLoopTest({ dir, exe: 'mspaint.exe', companions: ['mfc42u.dll', 'mfc42loc.dll', 'gdiplus.dll'], lcid: 0x0419, maxTicks: 40000 });
process.exit(ok ? 0 : 1);
