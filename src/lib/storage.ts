import type { StorageValue, PersistStorage } from "zustand/middleware";

const DB_NAME = "starfield";
const DB_VERSION = 1;
const STORE_NAME = "orbit";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(name: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(name);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    }).catch(() => resolve(null));
  });
}

function idbSet(name: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }).catch(reject);
  });
}

function idbRemove(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }).catch(reject);
  });
}

export function createIDBStorage<T>(): PersistStorage<T, unknown> {
  return {
    getItem: async (name: string): Promise<StorageValue<T> | null> => {
      const raw = await idbGet(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<T>;
      } catch {
        return null;
      }
    },
    setItem: async (name: string, value: StorageValue<T>): Promise<void> => {
      await idbSet(name, JSON.stringify(value));
    },
    removeItem: async (name: string): Promise<void> => {
      await idbRemove(name);
    },
  };
}

export const idbStorage = createIDBStorage<unknown>();

export async function migrateLocalStorageToIDB(): Promise<boolean> {
  const LEGACY_KEY = "starfield-orbit-state";
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    await idbSet(LEGACY_KEY, raw);
    localStorage.removeItem(LEGACY_KEY);
    void parsed;
    return true;
  } catch {
    return false;
  }
}
