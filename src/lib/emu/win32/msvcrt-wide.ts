// Wide-character string functions of MSVCRT (cdecl, so registered with 0 argument bytes).
import type { Emulator } from '../emulator';
import { formatString, vaListArgReader } from '../format';

export function registerMsvcrtWide(emu: Emulator): void {
  const msvcrt = emu.registerDll('MSVCRT.DLL');
  const m = emu.memory;

  // wcspbrk(str, charset) → first char of str found in charset, or NULL
  msvcrt.register('wcspbrk', 0, () => {
    const p = emu.readArg(0);
    const set = new Set(m.readUTF16String(emu.readArg(1)));
    const s = m.readUTF16String(p);
    for (let i = 0; i < s.length; i++) if (set.has(s[i])) return p + i * 2;
    return 0;
  });

  // wcsstr(str, sub) → first occurrence of sub, or NULL (empty sub → str)
  msvcrt.register('wcsstr', 0, () => {
    const p = emu.readArg(0);
    const i = m.readUTF16String(p).indexOf(m.readUTF16String(emu.readArg(1)));
    return i < 0 ? 0 : p + i * 2;
  });

  // _wcslwr(str) → str, lower-cased in place
  msvcrt.register('_wcslwr', 0, () => {
    const p = emu.readArg(0);
    m.writeUTF16String(p, m.readUTF16String(p).toLowerCase());
    return p;
  });

  // vswprintf(buffer, format, va_list) — MSVCRT's non-ISO form without a count
  msvcrt.register('vswprintf', 0, () => {
    const buf = emu.readArg(0), fmtPtr = emu.readArg(1);
    if (!buf || !fmtPtr) return -1;
    const result = formatString(m.readUTF16String(fmtPtr), vaListArgReader(m, emu.readArg(2)), m, true);
    m.writeUTF16String(buf, result);
    return result.length;
  });
}
