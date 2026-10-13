// Headless: Windows XP Spider Solitaire reaches its message loop.
// Usage: BLISS_ASSETS=<dir with spider.exe> npx tsx tests/test-xp-spider.mjs
import { resolveAssetsDir, runMessageLoopTest } from './lib/headless-harness.mjs';
const dir = resolveAssetsDir();
const { ok } = await runMessageLoopTest({ dir, exe: 'spider.exe', companions: ['cards.dll'], lcid: 0x0419 });
process.exit(ok ? 0 : 1);
