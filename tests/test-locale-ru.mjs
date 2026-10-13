// Unit test: ru-RU locale preset and GetLocaleInfo table (no binaries needed).
// Usage: npx tsx tests/test-locale-ru.mjs
import { getLocalePreset } from '../src/lib/regional-settings.ts';
import { buildLocaleInfo, localeInfoNumber } from '../src/lib/emu/win32/kernel32/locale-info.ts';
import { setAnsiCodePageFromCP, encodeMBCS } from '../src/lib/emu/memory.ts';

let fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ' (want ' + JSON.stringify(want) + ')'}`);
};

const p = getLocalePreset(0x0419);
eq('preset lcid', p.localeId, 0x0419);
eq('ACP', p.ansiCodePage, 1251);
eq('OEMCP', p.oemCodePage, 866);
eq('decimal', p.decimalSep, ',');
const info = buildLocaleInfo(p);
eq('LOCALE_ILANGUAGE', info[0x0001], '0419');
eq('LOCALE_ILANGUAGE number', localeInfoNumber(0x0001, info[0x0001]), 0x0419);
eq('LOCALE_SSHORTDATE', info[0x001F], 'dd.MM.yyyy');
eq('LOCALE_IDATE', info[0x0021], '1');
eq('LOCALE_SMONTHNAME10', info[0x0038 + 9], 'Октябрь');
eq('LOCALE_SDAYNAME1', info[0x002A], 'понедельник');
eq('LOCALE_SISO639LANGNAME', info[0x0059], 'ru');
eq('LOCALE_IDEFAULTANSICODEPAGE', info[0x1004], '1251');
setAnsiCodePageFromCP(1251);
eq('cp1251 encode "Сапер"', Array.from(encodeMBCS('Сапер')).map(b => b.toString(16)).join(' '), 'd1 e0 ef e5 f0');
console.log(fail ? `[TEST] FAIL (${fail})` : '[TEST] SUCCESS');
process.exit(fail ? 1 : 0);
