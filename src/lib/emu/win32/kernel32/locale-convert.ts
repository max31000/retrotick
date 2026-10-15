// ConvertDefaultLocale: map special LCIDs to concrete ones (Wine dlls/kernelbase/locale.c).
import type { Emulator } from '../../emulator';
import {
  LOCALE_NEUTRAL, LOCALE_INVARIANT, LOCALE_SYSTEM_DEFAULT, LOCALE_USER_DEFAULT, SUBLANG_NEUTRAL, SUBLANG_DEFAULT,
} from '../constants-gdi';

export function convertDefaultLocale(emu: Emulator, lcid: number): number {
  if (lcid === LOCALE_INVARIANT) return lcid;
  if (lcid === LOCALE_SYSTEM_DEFAULT || lcid === LOCALE_USER_DEFAULT || lcid === LOCALE_NEUTRAL) return emu.configuredLcid;
  const langid = lcid & 0xFFFF;
  if ((langid >>> 10) !== SUBLANG_NEUTRAL) return lcid;
  // MAKELANGID(PRIMARYLANGID(langid), SUBLANG_DEFAULT), keeping the sort id
  return ((lcid & 0xFFFF0000) | (SUBLANG_DEFAULT << 10) | (langid & 0x3FF)) >>> 0;
}

export function registerLocaleConvert(emu: Emulator): void {
  const kernel32 = emu.registerDll('KERNEL32.DLL');
  kernel32.register('ConvertDefaultLocale', 1, () => convertDefaultLocale(emu, emu.readArg(0)));
}
