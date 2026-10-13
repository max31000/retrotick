import type { PEInfo, MenuResult, MenuTemplate, MenuItem } from './types';
import { rvaToFileOffset, readAnsiStr } from './read';

export function parseMenuTemplate(arrayBuffer: ArrayBuffer, baseOffset: number, dataSize: number, encoding?: string): MenuTemplate {
  const dv = new DataView(arrayBuffer, baseOffset, dataSize);
  let pos = 0;

  function readStr(): string {
    if (encoding) {
      const r = readAnsiStr(dv, pos, dataSize - pos, encoding);
      pos = r.end;
      return r.value;
    } else {
      let s = '';
      while (pos + 2 <= dataSize) {
        const ch = dv.getUint16(pos, true); pos += 2;
        if (ch === 0) break;
        s += String.fromCharCode(ch);
      }
      return s;
    }
  }

  const wVersion = dv.getUint16(pos, true); pos += 2;
  const wOffset = dv.getUint16(pos, true); pos += 2;

  if (wVersion === 1 && !encoding) {
    pos += 4; // skip dwHelpId
    pos = 4 + wOffset;

    function parseExItems(): MenuItem[] {
      const items: MenuItem[] = [];
      while (pos < dataSize) {
        pos = (pos + 3) & ~3;
        if (pos + 14 > dataSize) break;

        const dwType = dv.getUint32(pos, true);
        const dwState = dv.getUint32(pos + 4, true);
        const uId = dv.getUint32(pos + 8, true);
        const wFlags = dv.getUint16(pos + 12, true);
        pos += 14;

        const text = readStr();

        const isSeparator = !!(dwType & 0x0800);
        const isChecked = !!(dwState & 0x0008);
        const isGrayed = !!(dwState & 0x0003);
        const isDefault = !!(dwState & 0x1000);
        const hasSubmenu = !!(wFlags & 0x01);
        const isLast = !!(wFlags & 0x80);

        let children: MenuItem[] | null = null;
        if (hasSubmenu) {
          pos = (pos + 3) & ~3;
          if (pos + 4 <= dataSize) pos += 4;
          children = parseExItems();
        }

        items.push({ id: uId, text, isSeparator, isChecked, isGrayed, isDefault, children });
        if (isLast) break;
      }
      return items;
    }

    return { isExtended: true, items: parseExItems() };
  }

  // Standard menu (wVersion === 0)
  pos = 4 + wOffset;

  function parseItems(): MenuItem[] {
    const items: MenuItem[] = [];
    while (pos < dataSize) {
      if (pos + 2 > dataSize) break;
      const mtOption = dv.getUint16(pos, true); pos += 2;

      const isPopup = !!(mtOption & 0x0010);
      const isEnd = !!(mtOption & 0x0080);
      const isSeparator = !!(mtOption & 0x0800);
      const isChecked = !!(mtOption & 0x0008);
      const isGrayed = !!(mtOption & 0x0001);

      let id = 0;
      if (!isPopup) {
        if (pos + 2 > dataSize) break;
        id = dv.getUint16(pos, true); pos += 2;
      }

      const text = readStr();

      let children: MenuItem[] | null = null;
      if (isPopup) {
        children = parseItems();
      }

      const sep = isSeparator || (!isPopup && id === 0 && text === '');
      items.push({ id, text, isSeparator: sep, isChecked, isGrayed, isDefault: false, children });
      if (isEnd) break;
    }
    return items;
  }

  return { isExtended: false, items: parseItems() };
}

export function extractMenus(peInfo: PEInfo, arrayBuffer: ArrayBuffer): MenuResult[] {
  if (!peInfo.resources) return [];
  const menuType = peInfo.resources.find(r => r.typeId === 4);
  if (!menuType) return [];

  const results: MenuResult[] = [];
  for (const entry of menuType.entries) {
    for (const lang of entry.languages) {
      try {
        const fileOffset = rvaToFileOffset(lang.dataRva, peInfo.sections);
        const menu = parseMenuTemplate(arrayBuffer, fileOffset, lang.dataSize, peInfo.neEncoding);
        results.push({ id: entry.id, name: entry.name, languageId: lang.languageId, menu });
      } catch (e: unknown) {
        console.warn(`Failed to extract menu ${entry.id ?? entry.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return results;
}
