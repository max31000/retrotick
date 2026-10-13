/**
 * Namespaced IndexedDB persistence for the runner: one database per
 * namespace (`retrotick-runner:<ns>`) holding the registry hive, INI
 * profiles and guest-written files. Every operation is best-effort: when
 * IndexedDB is unavailable (private mode, blocked storage) loads return
 * empty and saves are dropped with a console warning, so the game still runs.
 */
import type { EmulatorStorage } from '../lib/emulator-storage';

const DB_PREFIX = 'retrotick-runner:';
const DB_VERSION = 1;
const KV_STORE = 'kv';
const FILES_STORE = 'files';

interface FileRecord { name: string; data: ArrayBuffer }

/** Closes still flushing per namespace: a remount waits for them before reading. */
const closing = new Map<string, Promise<void>>();

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
      if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE, { keyPath: 'name' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createRunnerStorage(namespace: string): EmulatorStorage & { close(): Promise<void> } {
  let closed = false;
  const inFlight = new Set<Promise<unknown>>();
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const db = (): Promise<IDBDatabase | null> => {
    if (!dbPromise) {
      dbPromise = (async () => {
        try {
          if (typeof indexedDB === 'undefined') return null;
          await closing.get(namespace);
          return await openDb(DB_PREFIX + namespace);
        } catch (e) {
          console.warn('[runner] IndexedDB unavailable, settings will not persist:', e);
          return null;
        }
      })();
    }
    return dbPromise;
  };

  /** Every operation is tracked so close() can wait for in-flight writes. */
  function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>, fallback: T): Promise<T> {
    if (closed) {
      console.warn(`[runner] storage closed, ${mode} on ${store} ignored`);
      return Promise.resolve(fallback);
    }
    const p = runNow(store, mode, op, fallback);
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));
    return p;
  }

  async function runNow<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>, fallback: T): Promise<T> {
    try {
      const d = await db();
      if (!d) return fallback;
      const tx = d.transaction(store, mode);
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      const result = await reqToPromise(op(tx.objectStore(store)));
      if (mode === 'readwrite') await done;
      else done.catch(() => { /* read-only: completion not awaited */ });
      return result;
    } catch (e) {
      console.warn(`[runner] IndexedDB ${mode} on ${store} failed:`, e);
      return fallback;
    }
  }

  const kvGet = (key: string) => run<object | null>(KV_STORE, 'readonly', s => s.get(key) as IDBRequest<object | null>, null).then(v => v ?? null);
  const kvPut = async (key: string, value: object) => { await run(KV_STORE, 'readwrite', s => s.put(value, key), undefined as unknown as IDBValidKey); };

  return {
    loadRegistry: () => kvGet('registry'),
    saveRegistry: (data) => kvPut('registry', data),
    loadProfiles: () => kvGet('profiles'),
    saveProfiles: (data) => kvPut('profiles', data),
    listFiles: async () => {
      const all = await run<FileRecord[]>(FILES_STORE, 'readonly', s => s.getAll() as IDBRequest<FileRecord[]>, []);
      return all.map(f => ({ name: f.name, size: f.data?.byteLength ?? 0 }));
    },
    getFile: async (name) => {
      const rec = await run<FileRecord | undefined>(FILES_STORE, 'readonly', s => s.get(name) as IDBRequest<FileRecord | undefined>, undefined);
      return rec?.data ?? null;
    },
    addFile: async (name, data) => { await run(FILES_STORE, 'readwrite', s => s.put({ name, data }), undefined as unknown as IDBValidKey); },
    deleteFile: async (name) => { await run(FILES_STORE, 'readwrite', s => s.delete(name), undefined); },
    /** Waits for pending reads/writes (e.g. settings flushed at exit), then closes the database. */
    close: () => {
      if (closed) return closing.get(namespace) ?? Promise.resolve();
      closed = true;
      const done = (async () => {
        while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
        const d = await dbPromise?.catch(() => null);
        d?.close();
        dbPromise = null;
      })();
      const tracked = done.finally(() => { if (closing.get(namespace) === tracked) closing.delete(namespace); });
      closing.set(namespace, tracked);
      return tracked;
    },
  };
}
