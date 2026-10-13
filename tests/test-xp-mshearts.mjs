// Headless: Windows XP Hearts reaches its message loop (MFC42U runs as a real DLL).
// Usage: BLISS_ASSETS=<dir with mshearts.exe, mfc42u.dll, cards.dll, nddeapi.dll> npx tsx tests/test-xp-mshearts.mjs
import { resolveAssetsDir, runMessageLoopTest } from './lib/headless-harness.mjs';
const dir = resolveAssetsDir();
const { ok } = await runMessageLoopTest({ dir, exe: 'mshearts.exe', companions: ['mfc42u.dll', 'cards.dll', 'nddeapi.dll'], lcid: 0x0419, maxTicks: 20000 });
process.exit(ok ? 0 : 1);
