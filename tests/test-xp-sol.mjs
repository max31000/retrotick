// Headless: Windows XP Solitaire reaches its message loop.
// Usage: BLISS_ASSETS=<dir with sol.exe, cards.dll> npx tsx tests/test-xp-sol.mjs
import { resolveAssetsDir, runMessageLoopTest } from './lib/headless-harness.mjs';
const dir = resolveAssetsDir();
const { ok } = await runMessageLoopTest({ dir, exe: 'sol.exe', companions: ['cards.dll'], lcid: 0x0419 });
process.exit(ok ? 0 : 1);
