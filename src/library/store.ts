import { Creation, CreationMeta, CreationStore } from './types';
import { extractCreationMeta } from './simplify';
import { validateCreation } from './validator';

const DB_NAME = 'instruversal';
const STORE_NAME = 'creations';
const DB_VERSION = 1;
const MAX_LOCAL_CREATIONS = 100;

export class MemoryCreationStore implements CreationStore {
  public isInMemory: boolean = true;
  private items: Map<string, { creation: Creation; meta: CreationMeta }> = new Map();

  async list(): Promise<CreationMeta[]> {
    const metas = Array.from(this.items.values()).map((v) => v.meta);
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Creation | null> {
    const item = this.items.get(id);
    return item ? JSON.parse(JSON.stringify(item.creation)) : null;
  }

  async save(c: Creation): Promise<void> {
    const val = validateCreation(c);
    const validCreation = val.isValid && val.data ? val.data : c;
    const meta = extractCreationMeta(validCreation);

    // If new item and at cap, remove oldest
    if (!this.items.has(validCreation.id) && this.items.size >= MAX_LOCAL_CREATIONS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, entry] of this.items.entries()) {
        if (entry.creation.updatedAt < oldestTime) {
          oldestTime = entry.creation.updatedAt;
          oldestId = id;
        }
      }
      if (oldestId) {
        this.items.delete(oldestId);
      }
    }

    this.items.set(validCreation.id, {
      creation: JSON.parse(JSON.stringify(validCreation)),
      meta,
    });
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }

  async getAllFull(): Promise<Creation[]> {
    return Array.from(this.items.values())
      .map((v) => JSON.parse(JSON.stringify(v.creation)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export class LocalStore implements CreationStore {
  public isInMemory: boolean = false;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallback: MemoryCreationStore | null = null;
  private hasRequestedPersistence: boolean = false;

  constructor() {
    this.requestPersistenceOnce();
  }

  private requestPersistenceOnce() {
    if (this.hasRequestedPersistence) return;
    this.hasRequestedPersistence = true;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.storage &&
        typeof navigator.storage.persist === 'function'
      ) {
        navigator.storage.persist().catch(() => {});
      }
    } catch {}
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.memoryFallback) {
      throw new Error('IndexedDB unavailable, using memory fallback');
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        if (typeof window === 'undefined' || !window.indexedDB) {
          return reject(new Error('IndexedDB not supported'));
        }

        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        };

        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };

        req.onerror = () => {
          reject(req.error || new Error('Failed to open IndexedDB'));
        };

        req.onblocked = () => {
          console.warn('Instruversal IndexedDB blocked by other tab.');
        };
      } catch (err) {
        reject(err);
      }
    }).catch((err) => {
      console.warn('Falling back to in-memory store due to IndexedDB issue:', err);
      this.isInMemory = true;
      this.memoryFallback = new MemoryCreationStore();
      throw err;
    });

    return this.dbPromise;
  }

  async list(): Promise<CreationMeta[]> {
    try {
      const db = await this.getDB();
      return new Promise<CreationMeta[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('updatedAt');
        const results: CreationMeta[] = [];

        // Open cursor descending (newest first)
        const req = index.openCursor(null, 'prev');

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const val = cursor.value;
            if (val.meta) {
              results.push(val.meta);
            } else {
              // Backward compatibility
              results.push(extractCreationMeta(val));
            }
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        req.onerror = () => reject(req.error);
      });
    } catch {
      if (this.memoryFallback) {
        return this.memoryFallback.list();
      }
      return [];
    }
  }

  async get(id: string): Promise<Creation | null> {
    try {
      const db = await this.getDB();
      return new Promise<Creation | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);

        req.onsuccess = () => {
          if (!req.result) {
            resolve(null);
            return;
          }
          const { id, title, createdAt, updatedAt, schemaVersion, project } = req.result;
          resolve({
            id,
            title,
            createdAt,
            updatedAt,
            schemaVersion: schemaVersion || 1,
            project,
          });
        };

        req.onerror = () => reject(req.error);
      });
    } catch {
      if (this.memoryFallback) {
        return this.memoryFallback.get(id);
      }
      return null;
    }
  }

  private async enforceCap(db: IDBDatabase, newId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();

      countReq.onsuccess = () => {
        const count = countReq.result;
        if (count < MAX_LOCAL_CREATIONS) {
          resolve();
          return;
        }

        // Check if existing item
        const checkReq = store.get(newId);
        checkReq.onsuccess = () => {
          if (checkReq.result) {
            // Updating existing, no need to delete
            resolve();
            return;
          }

          // Delete oldest item (cursor ascending)
          const index = store.index('updatedAt');
          const cursorReq = index.openCursor(null, 'next');
          cursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              cursor.delete();
            }
            resolve();
          };
          cursorReq.onerror = () => resolve();
        };
        checkReq.onerror = () => resolve();
      };
      countReq.onerror = () => resolve();
    });
  }

  async save(c: Creation): Promise<void> {
    const val = validateCreation(c);
    const validCreation = val.isValid && val.data ? val.data : c;
    const meta = extractCreationMeta(validCreation);

    try {
      const db = await this.getDB();
      await this.enforceCap(db, validCreation.id);

      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const record = {
          id: validCreation.id,
          title: validCreation.title,
          createdAt: validCreation.createdAt,
          updatedAt: validCreation.updatedAt,
          schemaVersion: validCreation.schemaVersion,
          project: validCreation.project,
          meta,
        };

        const req = store.put(record);

        req.onsuccess = () => resolve();
        req.onerror = () => {
          const err = req.error;
          if (err && err.name === 'QuotaExceededError') {
            console.warn('Storage quota exceeded when saving creation.');
            // Never crash or lose current work: resolve quietly
            resolve();
          } else {
            reject(err);
          }
        };
      });
    } catch (err) {
      if (this.memoryFallback) {
        return this.memoryFallback.save(c);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      if (this.memoryFallback) {
        return this.memoryFallback.remove(id);
      }
    }
  }

  async getAllFull(): Promise<Creation[]> {
    try {
      const db = await this.getDB();
      return new Promise<Creation[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('updatedAt');
        const results: Creation[] = [];
        const req = index.openCursor(null, 'prev');

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const val = cursor.value;
            results.push({
              id: val.id,
              title: val.title,
              createdAt: val.createdAt,
              updatedAt: val.updatedAt,
              schemaVersion: val.schemaVersion || 1,
              project: val.project,
            });
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        req.onerror = () => reject(req.error);
      });
    } catch {
      if (this.memoryFallback) {
        return this.memoryFallback.getAllFull();
      }
      return [];
    }
  }
}

import { CloudStore } from './cloudStore';

// Global default singleton store
let sharedStore: CreationStore | null = null;

export function getCreationStore(): CreationStore {
  if (!sharedStore) {
    try {
      sharedStore = new CloudStore();
    } catch {
      sharedStore = new LocalStore();
    }
  }
  return sharedStore;
}
