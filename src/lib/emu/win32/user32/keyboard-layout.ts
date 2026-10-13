// Keyboard layout dependent translation: VkKeyScan(Ex)A/W, ToAscii/ToUnicode(Ex),
// MapVirtualKey(Ex)W VK→char, GetKeyboardLayoutNameA. Characters come from the active
// layout (e.g. ЙЦУКЕН for ru-RU, HKL 0x04190419).
import type { Emulator } from '../../emulator';
import { layoutForLcid } from '../../../regional-settings';
import { encodeMBCS, decodeMBCS } from '../../memory';

const MAPVK_VK_TO_VSC = 0;
const MAPVK_VSC_TO_VK = 1;
const MAPVK_VK_TO_CHAR = 2;
const VK_SHIFT = 0x10;
const VK_CAPITAL = 0x14;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12;
const KEY_DOWN = 0x80;
const KEY_TOGGLED = 0x01;
const SHIFT_STATE = 0x0100;

export function registerKeyboardLayout(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');
  const layout = () => layoutForLcid(emu.configuredLcid);

  const vkScan = (ch: string): number => {
    const info = layout().charToVK.get(ch);
    if (!info) {
      // Control characters map to their own VK codes (Enter, Esc, Tab, Backspace)
      const c = ch.charCodeAt(0);
      if (c === 0x0D || c === 0x1B || c === 0x09 || c === 0x08 || c === 0x20) return c;
      return 0xFFFF; // -1 (both bytes)
    }
    return info.vk | (info.shift ? SHIFT_STATE : 0);
  };
  const toWideChar = (c: number, wide: boolean) => (wide || c < 0x80 ? String.fromCharCode(c) : decodeMBCS(new Uint8Array([c & 0xFF])));

  user32.register('VkKeyScanA', 1, () => vkScan(toWideChar(emu.readArg(0) & 0xFF, false)));
  user32.register('VkKeyScanW', 1, () => vkScan(String.fromCharCode(emu.readArg(0) & 0xFFFF)));
  user32.register('VkKeyScanExA', 2, () => vkScan(toWideChar(emu.readArg(0) & 0xFF, false)));
  user32.register('VkKeyScanExW', 2, () => vkScan(String.fromCharCode(emu.readArg(0) & 0xFFFF)));

  /** Character produced by vk with the given key state array (256 bytes), or '' */
  const charFor = (vk: number, keyState: number, unshifted = false): string => {
    const ks = emu.msgKeyState ?? emu.keyStates;
    const shift = unshifted ? false : keyState ? !!(emu.memory.readU8(keyState + VK_SHIFT) & KEY_DOWN) : ks.has(VK_SHIFT);
    const caps = !unshifted && keyState ? !!(emu.memory.readU8(keyState + VK_CAPITAL) & KEY_TOGGLED) : false;
    const ctrl = !unshifted && keyState ? !!(emu.memory.readU8(keyState + VK_CONTROL) & KEY_DOWN) : false;
    const alt = !unshifted && keyState ? !!(emu.memory.readU8(keyState + VK_MENU) & KEY_DOWN) : false;
    // Ctrl+letter produces the control character (Ctrl+A = 0x01), Ctrl+Alt (AltGr) aside
    if (ctrl && !alt && vk >= 0x41 && vk <= 0x5A) return String.fromCharCode(vk - 0x40);
    let best = '';
    for (const [ch, info] of layout().charToVK) {
      if (info.vk !== vk) continue;
      if (info.shift === shift) { best = ch; break; }
      if (!best) best = ch;
    }
    if (best && caps && best.toLowerCase() !== best.toUpperCase()) {
      best = shift ? best.toLowerCase() : best.toUpperCase();
    }
    if (!best && (vk === 0x0D || vk === 0x1B || vk === 0x08 || vk === 0x09 || vk === 0x20)) best = String.fromCharCode(vk);
    return best;
  };

  // ToUnicode(wVirtKey, wScanCode, lpKeyState, pwszBuff, cchBuff, wFlags)
  const toUnicode = () => {
    const ch = charFor(emu.readArg(0) & 0xFF, emu.readArg(2));
    const buf = emu.readArg(3), cch = emu.readArg(4);
    if (!ch || !buf || cch < 1) return 0;
    emu.memory.writeU16(buf, ch.charCodeAt(0));
    if (cch > 1) emu.memory.writeU16(buf + 2, 0);
    return 1;
  };
  user32.register('ToUnicode', 6, toUnicode);
  user32.register('ToUnicodeEx', 7, toUnicode);
  // ToAscii(uVirtKey, uScanCode, lpKeyState, lpChar, uFlags) — lpChar is a WORD buffer
  const toAscii = () => {
    const ch = charFor(emu.readArg(0) & 0xFF, emu.readArg(2));
    const buf = emu.readArg(3);
    if (!ch || !buf) return 0;
    const b = encodeMBCS(ch);
    emu.memory.writeU16(buf, b[0] ?? 0x3F);
    return 1;
  };
  user32.register('ToAscii', 5, toAscii);
  user32.register('ToAsciiEx', 6, toAscii);

  const mapVk = (wide: boolean) => () => {
    const code = emu.readArg(0), type = emu.readArg(1);
    if (type === MAPVK_VK_TO_CHAR) {
      const ch = charFor(code, 0, true);
      if (!ch) return 0;
      const up = ch.toUpperCase();
      return wide ? up.charCodeAt(0) : (encodeMBCS(up)[0] ?? 0);
    }
    if (type === MAPVK_VK_TO_VSC) {
      if (code >= 0x41 && code <= 0x5A) return code - 0x41 + 0x1E;
      if (code >= 0x30 && code <= 0x39) return code - 0x30 + 0x02;
      return 0;
    }
    if (type === MAPVK_VSC_TO_VK) {
      if (code >= 0x1E && code <= 0x37) return code - 0x1E + 0x41;
      if (code >= 0x02 && code <= 0x0B) return code - 0x02 + 0x30;
    }
    return 0;
  };
  user32.register('MapVirtualKeyA', 2, mapVk(false));
  user32.register('MapVirtualKeyW', 2, mapVk(true));
  user32.register('MapVirtualKeyExA', 3, mapVk(false));
  user32.register('MapVirtualKeyExW', 3, mapVk(true));

  user32.register('GetKeyboardLayoutNameA', 1, () => {
    const p = emu.readArg(0);
    if (p) emu.memory.writeCString(p, (layout().hkl & 0xFFFF).toString(16).toUpperCase().padStart(8, '0'));
    return 1;
  });
  user32.register('GetKeyboardLayoutNameW', 1, () => {
    const p = emu.readArg(0);
    if (p) emu.memory.writeUTF16String(p, (layout().hkl & 0xFFFF).toString(16).toUpperCase().padStart(8, '0'));
    return 1;
  });
}
