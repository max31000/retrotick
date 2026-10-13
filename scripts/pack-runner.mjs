// Packs runner-pkg (after `npm run build:runner`) into retrotick-runner-<version>.tgz.
// Usage: node scripts/pack-runner.mjs [destDir]   (default: repository root)
import { execSync } from 'node:child_process';
import { renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(repo, 'runner-pkg');
const dest = resolve(process.argv[2] ?? repo);
if (!existsSync(join(pkgDir, 'dist', 'retrotick-runner.js'))) {
  console.error('runner-pkg/dist missing: run `npm run build:runner` first');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
const out = execSync(`npm pack --json --pack-destination "${dest}"`, { cwd: pkgDir, encoding: 'utf8' });
const [info] = JSON.parse(out);
const target = join(dest, `retrotick-runner-${info.version}.tgz`);
renameSync(join(dest, info.filename), target);
console.log(target);
