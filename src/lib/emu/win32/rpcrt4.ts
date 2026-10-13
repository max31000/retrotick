import type { Emulator } from '../emulator';
import { RPC_S_OK, RPC_S_SERVER_UNAVAILABLE, EXCEPTION_EXECUTE_HANDLER } from './types';

// RPCRT4.DLL — no RPC servers are reachable inside the emulator. String bindings are composed
// for real, but binding to them fails with RPC_S_SERVER_UNAVAILABLE so callers take their
// "service not running" paths.
export function registerRpcrt4(emu: Emulator): void {
  const rpc = emu.registerDll('RPCRT4.DLL');

  // RpcStringBindingComposeW(ObjUuid, ProtSeq, NetworkAddr, Endpoint, Options, StringBinding)
  rpc.register('RpcStringBindingComposeW', 6, () => {
    const rd = (i: number) => { const p = emu.readArg(i); return p ? emu.memory.readUTF16String(p) : ''; };
    const uuid = rd(0), prot = rd(1), addr = rd(2), ep = rd(3), opts = rd(4);
    const out = emu.readArg(5);
    let s = (uuid ? uuid + '@' : '') + prot + ':' + addr;
    if (ep || opts) s += '[' + ep + (opts ? ',' + opts : '') + ']';
    if (out) {
      const p = emu.allocHeap((s.length + 1) * 2);
      emu.memory.writeUTF16String(p, s);
      emu.memory.writeU32(out, p);
    }
    return RPC_S_OK;
  });
  rpc.register('RpcStringFreeW', 1, () => {
    const pp = emu.readArg(0);
    if (pp) emu.memory.writeU32(pp, 0);
    return RPC_S_OK;
  });
  // RpcBindingFromStringBindingW(StringBinding, Binding)
  rpc.register('RpcBindingFromStringBindingW', 2, () => {
    const out = emu.readArg(1);
    if (out) emu.memory.writeU32(out, 0);
    return RPC_S_SERVER_UNAVAILABLE;
  });
  rpc.register('RpcBindingFree', 1, () => {
    const pp = emu.readArg(0);
    if (pp) emu.memory.writeU32(pp, 0);
    return RPC_S_OK;
  });
  // I_RpcExceptionFilter(ExceptionCode) → handle every exception in the stub's __except
  rpc.register('I_RpcExceptionFilter', 1, () => EXCEPTION_EXECUTE_HANDLER);
  // NdrClientCall2(pStubDescriptor, pFormat, ...) is cdecl varargs; the call fails
  rpc.register('NdrClientCall2', 0, () => RPC_S_SERVER_UNAVAILABLE);
}
