import { SaveData } from '../types';

const DB_NAME = 'operation_wildlands_db';
const STORE_NAME = 'saves';
const SAVE_KEY = 'primary_operator';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
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

export class SaveSystem {
  public async save(data: SaveData): Promise<void> {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data, SAVE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Fallback to localStorage if IndexedDB is restricted
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      } catch {
        // Ignore storage quota issues
      }
    }
  }

  public async load(): Promise<SaveData | null> {
    try {
      const db = await openDB();
      const result = await new Promise<SaveData | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(SAVE_KEY);
        req.onsuccess = () => resolve((req.result as SaveData) ?? null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (result) return result;
    } catch {
      // Fallback below
    }
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  }

  public async hasSave(): Promise<boolean> {
    const data = await this.load();
    return Boolean(data && data.version === 1);
  }

  public async clear(): Promise<void> {
    try {
      const db = await openDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(SAVE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    } catch {
      // Ignore
    }
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Ignore
    }
  }
}
