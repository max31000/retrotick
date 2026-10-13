/**
 * Persistence backend used by EmulatorView: registry hive, INI profiles and
 * the virtual D:\ file store. The desktop app uses the shared `exeviewer`
 * IndexedDB database; embedders (e.g. the runner) can supply their own.
 */
import { loadRegistry, saveRegistry } from './registry-db';
import { loadProfiles, saveProfiles } from './profile-db';
import { listFileMetadata, getFile, addFile, deleteFile } from './file-store';

export interface EmulatorStorage {
  loadRegistry(): Promise<object | null>;
  saveRegistry(data: object): Promise<void>;
  loadProfiles(): Promise<object | null>;
  saveProfiles(data: object): Promise<void>;
  listFiles(): Promise<{ name: string; size: number }[]>;
  getFile(name: string): Promise<ArrayBuffer | null>;
  addFile(name: string, data: ArrayBuffer): Promise<void>;
  deleteFile(name: string): Promise<void>;
}

export const desktopStorage: EmulatorStorage = {
  loadRegistry,
  saveRegistry,
  loadProfiles,
  saveProfiles,
  listFiles: async () => (await listFileMetadata()).map(m => ({ name: m.name, size: m.size })),
  getFile,
  addFile,
  deleteFile,
};
