// Headless: Windows XP Minesweeper reaches its message loop.
// Usage: BLISS_ASSETS=<dir with winmine.exe> npx tsx tests/test-xp-winmine.mjs
import { resolveAssetsDir, runMessageLoopTest } from './lib/headless-harness.mjs';
const dir = resolveAssetsDir();
const { ok } = await runMessageLoopTest({ dir, exe: 'winmine.exe', companions: [], lcid: 0x0419 });
process.exit(ok ? 0 : 1);
