// Library build of the embeddable runner (`npm run build:runner`).
// Output (runner-pkg/dist): retrotick-runner.js (ES module, Preact bundled),
// luna.js (Luna stylesheet only, no emulator) and luna.css (the same stylesheet as a file).
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { LUNA_CSS } from './src/components/win2k/luna/luna-css';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

function lunaCssFile(): Plugin {
	return {
		name: 'bliss-luna-css-file',
		generateBundle() {
			this.emitFile({ type: 'asset', fileName: 'luna.css', source: LUNA_CSS.trim() + '\n' });
		},
	};
}

export default defineConfig({
	plugins: [preact(), lunaCssFile()],
	publicDir: false,
	define: {
		// The runner is always a production build: no dev-only test hooks.
		'import.meta.env.DEV': 'false',
	},
	build: {
		outDir: src('./runner-pkg/dist'),
		emptyOutDir: true,
		target: 'es2020',
		sourcemap: true,
		lib: {
			entry: {
				'retrotick-runner': src('./src/runner/index.ts'),
				luna: src('./src/runner/luna-entry.ts'),
			},
			formats: ['es'],
			fileName: (_format, name) => `${name}.js`,
		},
	},
});
