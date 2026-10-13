// Unit test: Russian keyboard layout and ANSI/UTF-16 character message conversion (no binaries needed).
// Usage: npx tsx tests/test-keyboard-ru.mjs
import { installDomMocks } from './lib/headless-harness.mjs';
installDomMocks();
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { layoutForLcid, getLocalePreset } = await import('../src/lib/regional-settings.ts');
const { setAnsiCodePageFromCP } = await import('../src/lib/emu/memory.ts');
const { convertCharParam } = await import('../src/lib/emu/win32/user32/_helpers.ts');

let fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ' (want ' + JSON.stringify(want) + ')'}`);
};

eq('ru preset keyboard', getLocalePreset(0x0419).defaultKeyboard, 'jcuken-ru');
const ru = layoutForLcid(0x0419);
eq('HKL', ru.hkl, 0x04190419);
eq('й → VK_Q', ru.charToVK.get('й')?.vk, 0x51);
eq('Ж → VK_OEM_1 + shift', JSON.stringify(ru.charToVK.get('Ж')), JSON.stringify({ vk: 0xBA, shift: true }));
eq('KeyQ → VK_Q', ru.codeToVK.KeyQ, 0x51);
setAnsiCodePageFromCP(1251);
eq('WM_CHAR UTF-16 → cp1251 (М)', convertCharParam(0x041C, true, false), 0xCC);
eq('WM_CHAR cp1251 → UTF-16 (я)', convertCharParam(0xFF, false, true), 0x044F);
eq('WM_CHAR ASCII unchanged', convertCharParam(0x41, true, false), 0x41);
eq('WM_CHAR same charset unchanged', convertCharParam(0x041C, true, true), 0x041C);
console.log(fail ? `[TEST] FAIL (${fail})` : '[TEST] SUCCESS');
process.exit(fail ? 1 : 0);
