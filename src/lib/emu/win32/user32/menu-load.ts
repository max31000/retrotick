// LoadMenu / LoadMenuIndirect: build a real menu handle tree from the RT_MENU template,
// so GetSubMenu/GetMenuItemCount/WM_INITMENUPOPUP see the actual items.
import type { Emulator } from '../../emulator';
import { parseMenuTemplate } from '../../../pe/extract-menu';
import { findResourceForModule } from '../kernel32/resource';
import { buildMenuHandleTree } from './menu';

const RT_MENU = 4;
const MAX_INDIRECT_TEMPLATE = 0x10000;

function menuFromMemory(emu: Emulator, addr: number, size: number): number {
  const bytes = emu.memory.slice(addr, size);
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  try {
    return buildMenuHandleTree(emu, parseMenuTemplate(buf, 0, bytes.length).items);
  } catch {
    return 0;
  }
}

export function registerMenuLoad(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');
  const load = (wide: boolean) => () => {
    const hInstance = emu.readArg(0);
    const namePtr = emu.readArg(1);
    const name: number | string = namePtr < 0x10000 ? namePtr
      : wide ? emu.memory.readUTF16String(namePtr) : emu.memory.readCString(namePtr);
    const res = findResourceForModule(emu, hInstance, RT_MENU, name);
    if (!res) return 0;
    const h = menuFromMemory(emu, res.imageBase + res.dataRva, res.dataSize);
    const data = emu.handles.get<{ menuId?: number | string }>(h);
    if (data) data.menuId = name;
    return h;
  };
  user32.register('LoadMenuA', 2, load(false));
  user32.register('LoadMenuW', 2, load(true));
  // LoadMenuIndirect(lpMenuTemplate): the template is always Unicode in Win32
  const indirect = () => menuFromMemory(emu, emu.readArg(0), MAX_INDIRECT_TEMPLATE);
  user32.register('LoadMenuIndirectA', 1, indirect);
  user32.register('LoadMenuIndirectW', 1, indirect);
}
