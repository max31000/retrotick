import type { Emulator } from '../emulator';
import { SECURITY_DESCRIPTOR_MIN_LENGTH, SECURITY_DESCRIPTOR_REVISION, SE_SELF_RELATIVE } from './types';

// Security descriptor helpers. The emulator keeps descriptors as bare headers without
// owner/group/ACLs, so a self-relative copy is just the header with SE_SELF_RELATIVE set.
export function registerAdvapi32Security(emu: Emulator): void {
  const advapi32 = emu.registerDll('ADVAPI32.DLL');

  advapi32.register('GetSecurityDescriptorLength', 1, () => SECURITY_DESCRIPTOR_MIN_LENGTH);

  // GetSecurityDescriptorControl(pSD, pControl, lpdwRevision) → BOOL
  advapi32.register('GetSecurityDescriptorControl', 3, () => {
    const pSD = emu.readArg(0), pControl = emu.readArg(1), pRev = emu.readArg(2);
    if (!pSD) return 0;
    if (pControl) emu.memory.writeU16(pControl, emu.memory.readU16(pSD + 2));
    if (pRev) emu.memory.writeU32(pRev, emu.memory.readU8(pSD) || SECURITY_DESCRIPTOR_REVISION);
    return 1;
  });

  // MakeSelfRelativeSD(pAbsoluteSD, pSelfRelativeSD, lpdwBufferLength) → BOOL
  advapi32.register('MakeSelfRelativeSD', 3, () => {
    const pAbs = emu.readArg(0), pRel = emu.readArg(1), pLen = emu.readArg(2);
    if (!pAbs || !pLen) return 0;
    const have = emu.memory.readU32(pLen);
    emu.memory.writeU32(pLen, SECURITY_DESCRIPTOR_MIN_LENGTH);
    if (!pRel || have < SECURITY_DESCRIPTOR_MIN_LENGTH) return 0;
    emu.memory.writeU8(pRel, emu.memory.readU8(pAbs) || SECURITY_DESCRIPTOR_REVISION);
    emu.memory.writeU8(pRel + 1, 0);
    emu.memory.writeU16(pRel + 2, emu.memory.readU16(pAbs + 2) | SE_SELF_RELATIVE);
    for (let i = 4; i < SECURITY_DESCRIPTOR_MIN_LENGTH; i += 4) emu.memory.writeU32(pRel + i, 0);
    return 1;
  });
}
