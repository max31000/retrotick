import type { Emulator } from '../emulator';
import type { Win32Dll } from '../emulator';
import {
  CSIDL_DESKTOP, CSIDL_PROGRAMS, CSIDL_PERSONAL, CSIDL_FAVORITES, CSIDL_STARTUP, CSIDL_RECENT,
  CSIDL_SENDTO, CSIDL_STARTMENU, CSIDL_MYMUSIC, CSIDL_DESKTOPDIRECTORY, CSIDL_FONTS, CSIDL_TEMPLATES,
  CSIDL_COMMON_STARTMENU, CSIDL_COMMON_PROGRAMS, CSIDL_COMMON_DESKTOPDIRECTORY, CSIDL_APPDATA,
  CSIDL_LOCAL_APPDATA, CSIDL_COMMON_FAVORITES, CSIDL_INTERNET_CACHE, CSIDL_COOKIES, CSIDL_HISTORY,
  CSIDL_COMMON_APPDATA, CSIDL_WINDOWS, CSIDL_SYSTEM, CSIDL_PROGRAM_FILES, CSIDL_MYPICTURES,
  CSIDL_PROFILE, CSIDL_PROGRAM_FILES_COMMON, CSIDL_COMMON_DOCUMENTS, CSIDL_FLAG_CREATE, CSIDL_FLAG_MASK,
  S_OK, S_FALSE, E_INVALIDARG,
} from './types';

/** Desktop is the emulator's persistent D:\ root; the rest of the profile lives below it. */
const DESKTOP_DIR = 'D:\\';
const PROFILE_DIR = 'D:\\Documents and Settings\\User';
const ALL_USERS_DIR = 'D:\\Documents and Settings\\All Users';

const FOLDER_PATHS = new Map<number, string>([
  [CSIDL_DESKTOP, DESKTOP_DIR],
  [CSIDL_DESKTOPDIRECTORY, DESKTOP_DIR],
  [CSIDL_COMMON_DESKTOPDIRECTORY, DESKTOP_DIR],
  [CSIDL_PROFILE, PROFILE_DIR],
  [CSIDL_PERSONAL, PROFILE_DIR + '\\My Documents'],
  [CSIDL_MYMUSIC, PROFILE_DIR + '\\My Documents\\My Music'],
  [CSIDL_MYPICTURES, PROFILE_DIR + '\\My Documents\\My Pictures'],
  [CSIDL_FAVORITES, PROFILE_DIR + '\\Favorites'],
  [CSIDL_RECENT, PROFILE_DIR + '\\Recent'],
  [CSIDL_SENDTO, PROFILE_DIR + '\\SendTo'],
  [CSIDL_TEMPLATES, PROFILE_DIR + '\\Templates'],
  [CSIDL_STARTMENU, PROFILE_DIR + '\\Start Menu'],
  [CSIDL_PROGRAMS, PROFILE_DIR + '\\Start Menu\\Programs'],
  [CSIDL_STARTUP, PROFILE_DIR + '\\Start Menu\\Programs\\Startup'],
  [CSIDL_APPDATA, PROFILE_DIR + '\\Application Data'],
  [CSIDL_LOCAL_APPDATA, PROFILE_DIR + '\\Local Settings\\Application Data'],
  [CSIDL_INTERNET_CACHE, PROFILE_DIR + '\\Local Settings\\Temporary Internet Files'],
  [CSIDL_HISTORY, PROFILE_DIR + '\\Local Settings\\History'],
  [CSIDL_COOKIES, PROFILE_DIR + '\\Cookies'],
  [CSIDL_COMMON_APPDATA, ALL_USERS_DIR + '\\Application Data'],
  [CSIDL_COMMON_DOCUMENTS, ALL_USERS_DIR + '\\Documents'],
  [CSIDL_COMMON_FAVORITES, ALL_USERS_DIR + '\\Favorites'],
  [CSIDL_COMMON_STARTMENU, ALL_USERS_DIR + '\\Start Menu'],
  [CSIDL_COMMON_PROGRAMS, ALL_USERS_DIR + '\\Start Menu\\Programs'],
  [CSIDL_WINDOWS, 'C:\\WINDOWS'],
  [CSIDL_SYSTEM, 'C:\\WINDOWS\\SYSTEM32'],
  [CSIDL_FONTS, 'C:\\WINDOWS\\Fonts'],
  [CSIDL_PROGRAM_FILES, 'C:\\Program Files'],
  [CSIDL_PROGRAM_FILES_COMMON, 'C:\\Program Files\\Common Files'],
]);

/** Create every missing component of a directory path in the virtual FS. */
function ensureDirectory(emu: Emulator, path: string): void {
  const parts = path.split('\\').filter(Boolean);
  let cur = parts.shift()!; // drive "X:"
  for (const p of parts) {
    cur += '\\' + p;
    emu.fs.createDirectory(cur.toUpperCase());
  }
}

/** Resolve a CSIDL to a path. Returns null for unknown folders. */
export function getSpecialFolderPath(emu: Emulator, csidl: number, create: boolean): string | null {
  const path = FOLDER_PATHS.get(csidl & ~CSIDL_FLAG_MASK);
  if (!path) return null;
  if (create || (csidl & CSIDL_FLAG_CREATE)) ensureDirectory(emu, path);
  return path;
}

function writeStr(emu: Emulator, ptr: number, s: string, wide: boolean): void {
  if (wide) emu.memory.writeUTF16String(ptr, s);
  else emu.memory.writeCString(ptr, s);
}

export function registerShellFolders(emu: Emulator, shell32: Win32Dll): void {
  // BOOL SHGetSpecialFolderPath(HWND hwnd, LPTSTR pszPath, int csidl, BOOL fCreate)
  const special = (wide: boolean) => () => {
    const pszPath = emu.readArg(1);
    const csidl = emu.readArg(2);
    const fCreate = emu.readArg(3);
    const path = getSpecialFolderPath(emu, csidl, fCreate !== 0);
    if (!path || !pszPath) return 0;
    writeStr(emu, pszPath, path, wide);
    return 1;
  };
  shell32.register('SHGetSpecialFolderPathA', 4, special(false));
  shell32.register('SHGetSpecialFolderPathW', 4, special(true));

  // HRESULT SHGetFolderPath(HWND hwnd, int csidl, HANDLE hToken, DWORD dwFlags, LPTSTR pszPath)
  const folder = (wide: boolean) => () => {
    const csidl = emu.readArg(1);
    const pszPath = emu.readArg(4);
    const path = getSpecialFolderPath(emu, csidl, false);
    if (!pszPath) return E_INVALIDARG;
    if (!path) { writeStr(emu, pszPath, '', wide); return E_INVALIDARG; }
    writeStr(emu, pszPath, path, wide);
    return (csidl & CSIDL_FLAG_CREATE) || emu.fs.getFileAttributes(path.toUpperCase(), emu.additionalFiles) !== 0xFFFFFFFF ? S_OK : S_FALSE;
  };
  shell32.register('SHGetFolderPathA', 5, folder(false));
  shell32.register('SHGetFolderPathW', 5, folder(true));
}
