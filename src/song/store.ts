import { Song, SongPreview, SONG_LIMITS } from './types';
import { SyncStatus } from '../library/types';
import { validateSong } from './validator';
import { buildSongPreview } from './preview';

export interface SongMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  totalBars: number;
  lanesCount: number;
  placementsCount: number;
  preview?: SongPreview;
  syncStatus?: SyncStatus;
  isPublic?: boolean;
  publicSlug?: string | null;
}

export interface SongStore {
  isInMemory?: boolean;
  list(): Promise<SongMeta[]>;
  get(id: string): Promise<Song | null>;
  save(song: Song): Promise<void>;
  remove(id: string): Promise<void>;
  getAllFull?(): Promise<Song[]>;
  setPublic?(id: string, isPublic: boolean): Promise<string | null>;
  getPublicSong?(slug: string): Promise<Song | null>;
}

export function extractSongMeta(song: Song): SongMeta {
  return {
    id: song.id,
    title: song.title,
    createdAt: song.createdAt,
    updatedAt: song.updatedAt,
    bpm: song.bpm,
    totalBars: song.totalBars,
    lanesCount: song.lanes.length,
    placementsCount: song.placements.length,
    preview: buildSongPreview(song),
    syncStatus: song.syncStatus || 'local',
    isPublic: song.isPublic,
    publicSlug: song.publicSlug,
  };
}

export const DB_NAME = 'instruversal';
export const SONGS_STORE = 'songs';
export const CREATIONS_STORE = 'creations';
export const DB_VERSION = 2;

export class MemorySongStore implements SongStore {
  public isInMemory: boolean = true;
  private items: Map<string, { song: Song; meta: SongMeta }> = new Map();

  async list(): Promise<SongMeta[]> {
    const metas = Array.from(this.items.values()).map((v) => v.meta);
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Song | null> {
    const item = this.items.get(id);
    return item ? JSON.parse(JSON.stringify(item.song)) : null;
  }

  async save(song: Song): Promise<void> {
    const val = validateSong(song);
    const validSong = val.isValid && val.data ? val.data : song;
    const meta = extractSongMeta(validSong);

    // Evict oldest if reaching capacity
    if (!this.items.has(validSong.id) && this.items.size >= SONG_LIMITS.MAX_LOCAL_SONGS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, entry] of this.items.entries()) {
        if (entry.song.updatedAt < oldestTime) {
          oldestTime = entry.song.updatedAt;
          oldestId = id;
        }
      }
      if (oldestId) {
        this.items.delete(oldestId);
      }
    }

    this.items.set(validSong.id, {
      song: JSON.parse(JSON.stringify(validSong)),
      meta,
    });
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }

  async getAllFull(): Promise<Song[]> {
    return Array.from(this.items.values())
      .map((v) => JSON.parse(JSON.stringify(v.song)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export class LocalSongStore implements SongStore {
  public isInMemory: boolean = false;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallback: MemorySongStore | null = null;
  private hasRequestedPersistence: boolean = false;
  private debounceTimers: Map<string, any> = new Map();

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
          if (!db.objectStoreNames.contains(CREATIONS_STORE)) {
            const store = db.createObjectStore(CREATIONS_STORE, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
          if (!db.objectStoreNames.contains(SONGS_STORE)) {
            const store = db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
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
      console.warn('Falling back to in-memory song store due to IndexedDB issue:', err);
      this.isInMemory = true;
      this.memoryFallback = new MemorySongStore();
      throw err;
    });

    return this.dbPromise;
  }

  async list(): Promise<SongMeta[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SONGS_STORE, 'readonly');
        const store = tx.objectStore(SONGS_STORE);
        const req = store.getAll();

        req.onsuccess = () => {
          const songs: Song[] = req.result || [];
          const metas = songs.map((s) => extractSongMeta(s));
          metas.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(metas);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryFallback ? this.memoryFallback.list() : [];
    }
  }

  async get(id: string): Promise<Song | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SONGS_STORE, 'readonly');
        const store = tx.objectStore(SONGS_STORE);
        const req = store.get(id);

        req.onsuccess = () => {
          if (!req.result) return resolve(null);
          const val = validateSong(req.result);
          resolve(val.isValid && val.data ? val.data : req.result);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryFallback ? this.memoryFallback.get(id) : null;
    }
  }

  async save(song: Song): Promise<void> {
    const val = validateSong(song);
    const validSong = val.isValid && val.data ? val.data : song;

    try {
      const db = await this.getDB();
      await this.enforceCapacity(db, validSong.id);

      return new Promise((resolve, reject) => {
        const tx = db.transaction(SONGS_STORE, 'readwrite');
        const store = tx.objectStore(SONGS_STORE);
        const req = store.put(validSong);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      if (this.memoryFallback) {
        return this.memoryFallback.save(validSong);
      }
    }
  }

  /**
   * Autosave helper with debounce to prevent blocking user interactions.
   */
  public saveDebounced(song: Song, delayMs = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.debounceTimers.has(song.id)) {
        clearTimeout(this.debounceTimers.get(song.id));
      }
      const timer = setTimeout(async () => {
        this.debounceTimers.delete(song.id);
        try {
          await this.save(song);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, delayMs);
      this.debounceTimers.set(song.id, timer);
    });
  }

  async remove(id: string): Promise<void> {
    if (this.debounceTimers.has(id)) {
      clearTimeout(this.debounceTimers.get(id));
      this.debounceTimers.delete(id);
    }

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SONGS_STORE, 'readwrite');
        const store = tx.objectStore(SONGS_STORE);
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

  async getAllFull(): Promise<Song[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SONGS_STORE, 'readonly');
        const store = tx.objectStore(SONGS_STORE);
        const req = store.getAll();

        req.onsuccess = () => {
          const songs: Song[] = req.result || [];
          songs.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(songs);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryFallback ? this.memoryFallback.getAllFull() : [];
    }
  }

  private async enforceCapacity(db: IDBDatabase, incomingId: string): Promise<void> {
    return new Promise((resolve) => {
      const tx = db.transaction(SONGS_STORE, 'readwrite');
      const store = tx.objectStore(SONGS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const all: Song[] = req.result || [];
        const isExisting = all.some((s) => s.id === incomingId);

        if (!isExisting && all.length >= SONG_LIMITS.MAX_LOCAL_SONGS) {
          all.sort((a, b) => a.updatedAt - b.updatedAt);
          const oldest = all[0];
          if (oldest) {
            store.delete(oldest.id);
          }
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  }
}

let defaultSongStore: SongStore | null = null;

export function getSongStore(): SongStore {
  if (!defaultSongStore) {
    defaultSongStore = new LocalSongStore();
  }
  return defaultSongStore;
}
