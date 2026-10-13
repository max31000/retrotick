// Headless: Windows XP FreeCell reaches its message loop.
// Usage: BLISS_ASSETS=<dir with freecell.exe, cards.dll> npx tsx tests/test-xp-freecell.mjs
import { resolveAssetsDir, runMessageLoopTest } from './lib/headless-harness.mjs';
const dir = resolveAssetsDir();
const { ok } = await runMessageLoopTest({ dir, exe: 'freecell.exe', companions: ['cards.dll'], lcid: 0x0419 });
process.exit(ok ? 0 : 1);
