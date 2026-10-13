import type { Emulator } from '../../emulator';
import { DMLERR_NO_ERROR, DMLERR_NO_CONV_ESTABLISHED, CP_WINUNICODE } from '../types';

/**
 * Minimal single-process DDEML. Instances, string handles and data handles behave like the real
 * library so DDE servers can initialize and register names; conversations with other processes
 * are never established (DdeConnect fails with DMLERR_NO_CONV_ESTABLISHED).
 */
interface DdeData { bytes: Uint8Array; fmt: number; hszItem: number; mapped: number }

export function registerDde(emu: Emulator): void {
  const user32 = emu.registerDll('USER32.DLL');

  const getData = (h: number): DdeData | null =>
    emu.handles.getType(h) === 'ddedata' ? emu.handles.get<DdeData>(h) : null;

  let nextInst = 1;
  const lastError = new Map<number, number>();
  // String handles are atoms: case-insensitive, reference counted
  const hszByKey = new Map<string, number>();
  const hszStr = new Map<number, { s: string; refs: number }>();
  let nextHsz = 0xC000;

  const createHsz = (s: string): number => {
    const key = s.toUpperCase();
    const existing = hszByKey.get(key);
    if (existing) { hszStr.get(existing)!.refs++; return existing; }
    const h = nextHsz++;
    hszByKey.set(key, h);
    hszStr.set(h, { s, refs: 1 });
    return h;
  };
  const freeHsz = (h: number): number => {
    const e = hszStr.get(h);
    if (!e) return 0;
    if (--e.refs <= 0) { hszStr.delete(h); hszByKey.delete(e.s.toUpperCase()); }
    return 1;
  };

  // DdeInitialize(pidInst, pfnCallback, afCmd, ulRes) → UINT
  const init = () => {
    const pidInst = emu.readArg(0);
    if (!pidInst) return DMLERR_NO_ERROR;
    let inst = emu.memory.readU32(pidInst);
    if (inst === 0) { inst = nextInst++; emu.memory.writeU32(pidInst, inst); }
    lastError.set(inst, DMLERR_NO_ERROR);
    return DMLERR_NO_ERROR;
  };
  user32.register('DdeInitializeA', 4, init);
  user32.register('DdeInitializeW', 4, init);
  user32.register('DdeUninitialize', 1, () => { lastError.delete(emu.readArg(0)); return 1; });
  user32.register('DdeGetLastError', 1, () => {
    const inst = emu.readArg(0);
    const e = lastError.get(inst) ?? DMLERR_NO_ERROR;
    lastError.set(inst, DMLERR_NO_ERROR);
    return e;
  });

  // DdeCreateStringHandle(idInst, psz, iCodePage) → HSZ
  user32.register('DdeCreateStringHandleA', 3, () => {
    const psz = emu.readArg(1);
    return psz ? createHsz(emu.memory.readCString(psz)) : 0;
  });
  user32.register('DdeCreateStringHandleW', 3, () => {
    const psz = emu.readArg(1);
    return psz ? createHsz(emu.memory.readUTF16String(psz)) : 0;
  });
  user32.register('DdeFreeStringHandle', 2, () => freeHsz(emu.readArg(1)));
  user32.register('DdeKeepStringHandle', 2, () => {
    const e = hszStr.get(emu.readArg(1));
    if (!e) return 0;
    e.refs++;
    return 1;
  });
  user32.register('DdeCmpStringHandles', 2, () => {
    const a = hszStr.get(emu.readArg(0))?.s.toUpperCase() ?? '';
    const b = hszStr.get(emu.readArg(1))?.s.toUpperCase() ?? '';
    return a === b ? 0 : (a < b ? -1 : 1);
  });

  // DdeQueryString(idInst, hsz, psz, cchMax, iCodePage) → DWORD length (without terminator)
  const query = (wide: boolean) => () => {
    const hsz = emu.readArg(1);
    const psz = emu.readArg(2);
    const cchMax = emu.readArg(3);
    const codePage = emu.readArg(4);
    const s = hszStr.get(hsz)?.s;
    if (s === undefined) return 0;
    if (!psz || cchMax === 0) return s.length;
    const out = s.substring(0, cchMax - 1);
    if (wide || codePage === CP_WINUNICODE) emu.memory.writeUTF16String(psz, out);
    else emu.memory.writeCString(psz, out);
    return out.length;
  };
  user32.register('DdeQueryStringA', 5, query(false));
  user32.register('DdeQueryStringW', 5, query(true));

  // DdeNameService(idInst, hsz1, hsz2, afCmd) → HDDEDATA (nonzero on success)
  user32.register('DdeNameService', 4, () => 1);
  user32.register('DdeEnableCallback', 3, () => 1);
  user32.register('DdePostAdvise', 3, () => 1);

  // Conversations: no other DDE servers exist in this process space
  const noConv = () => { lastError.set(emu.readArg(0), DMLERR_NO_CONV_ESTABLISHED); return 0; };
  user32.register('DdeConnect', 4, noConv);
  user32.register('DdeConnectList', 5, noConv);
  user32.register('DdeQueryNextServer', 2, () => 0);
  user32.register('DdeDisconnect', 1, () => 1);
  user32.register('DdeDisconnectList', 1, () => 1);
  user32.register('DdeReconnect', 1, () => 0);
  user32.register('DdeClientTransaction', 8, () => 0);
  user32.register('DdeAbandonTransaction', 3, () => 1);
  user32.register('DdeQueryConvInfo', 3, () => 0);
  user32.register('DdeSetUserHandle', 3, () => 0);
  user32.register('DdeImpersonateClient', 1, () => 0);

  // DdeCreateDataHandle(idInst, pSrc, cb, cbOff, hszItem, wFmt, afCmd) → HDDEDATA
  user32.register('DdeCreateDataHandle', 7, () => {
    const pSrc = emu.readArg(1);
    const cb = emu.readArg(2);
    const cbOff = emu.readArg(3);
    const bytes = new Uint8Array(cb);
    if (pSrc) for (let i = 0; i < cb; i++) bytes[i] = emu.memory.readU8(pSrc + cbOff + i);
    const d: DdeData = { bytes, fmt: emu.readArg(5), hszItem: emu.readArg(4), mapped: 0 };
    return emu.handles.alloc('ddedata', d);
  });
  // DdeAddData(hData, pSrc, cb, cbOff) → HDDEDATA
  user32.register('DdeAddData', 4, () => {
    const h = emu.readArg(0);
    const d = getData(h);
    if (!d) return 0;
    const pSrc = emu.readArg(1), cb = emu.readArg(2), cbOff = emu.readArg(3);
    if (cbOff + cb > d.bytes.length) { const n = new Uint8Array(cbOff + cb); n.set(d.bytes); d.bytes = n; }
    for (let i = 0; i < cb; i++) d.bytes[cbOff + i] = emu.memory.readU8(pSrc + i);
    return h;
  });
  // DdeGetData(hData, pDst, cbMax, cbOff) → DWORD bytes copied (or size if pDst NULL)
  user32.register('DdeGetData', 4, () => {
    const d = getData(emu.readArg(0));
    if (!d) return 0;
    const pDst = emu.readArg(1), cbMax = emu.readArg(2), cbOff = emu.readArg(3);
    const avail = Math.max(0, d.bytes.length - cbOff);
    if (!pDst) return avail;
    const n = Math.min(avail, cbMax);
    for (let i = 0; i < n; i++) emu.memory.writeU8(pDst + i, d.bytes[cbOff + i]);
    return n;
  });
  // DdeAccessData(hData, pcbDataSize) → LPBYTE
  user32.register('DdeAccessData', 2, () => {
    const d = getData(emu.readArg(0));
    if (!d) return 0;
    const pcb = emu.readArg(1);
    if (!d.mapped) {
      d.mapped = emu.allocHeap(Math.max(1, d.bytes.length));
      for (let i = 0; i < d.bytes.length; i++) emu.memory.writeU8(d.mapped + i, d.bytes[i]);
    }
    if (pcb) emu.memory.writeU32(pcb, d.bytes.length);
    return d.mapped;
  });
  user32.register('DdeUnaccessData', 1, () => 1);
  user32.register('DdeFreeDataHandle', 1, () => {
    const h = emu.readArg(0);
    if (!getData(h)) return 0;
    emu.handles.free(h);
    return 1;
  });
}
