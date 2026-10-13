import { Song, SongPreview } from './types';
import { SongMeta, SongStore, LocalSongStore } from './store';
import { SyncStatus } from '../library/types';
import { validateSong } from './validator';
import { buildSongPreview } from './preview';
import { getSupabase, getCurrentUser, onAuthStateChange } from '../auth/auth';

const LAST_SYNCED_KEY = 'instruversal:last_song_synced_at';
const PENDING_SYNC_KEY = 'instruversal:pending_song_sync_ids';

export class CloudSongStore implements SongStore {
  public isInMemory: boolean = false;
  private localStore: LocalSongStore;
  private pendingSyncIds: Set<string> = new Set();
  private pushDebounceTimer: any = null;
  private lastSyncedMap: Record<string, number> = {};
  private syncErrorIds: Set<string> = new Set();

  constructor(localStore?: LocalSongStore) {
    this.localStore = localStore || new LocalSongStore();
    this.loadPersistedSyncState();
    this.setupLifecycleListeners();

    onAuthStateChange((user) => {
      if (user && this.pendingSyncIds.size > 0) {
        this.schedulePush();
      }
    });
  }

  private loadPersistedSyncState() {
    if (typeof localStorage === 'undefined') return;
    try {
      const savedSynced = localStorage.getItem(LAST_SYNCED_KEY);
      if (savedSynced) {
        this.lastSyncedMap = JSON.parse(savedSynced);
      }
      const savedPending = localStorage.getItem(PENDING_SYNC_KEY);
      if (savedPending) {
        const arr = JSON.parse(savedPending);
        if (Array.isArray(arr)) {
          this.pendingSyncIds = new Set(arr);
        }
      }
    } catch {}
  }

  private persistSyncState() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LAST_SYNCED_KEY, JSON.stringify(this.lastSyncedMap));
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(Array.from(this.pendingSyncIds)));
    } catch {}
  }

  private setupLifecycleListeners() {
    if (typeof window === 'undefined') return;

    const flush = () => {
      if (this.pendingSyncIds.size > 0) {
        this.flushPendingSync();
      }
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    });

    window.addEventListener('online', () => {
      if (this.pendingSyncIds.size > 0 || this.syncErrorIds.size > 0) {
        this.syncErrorIds.forEach((id) => this.pendingSyncIds.add(id));
        this.schedulePush();
      }
    });
  }

  public getSyncStatusFor(id: string): SyncStatus {
    const user = getCurrentUser();
    if (!user) return 'local';
    if (this.syncErrorIds.has(id)) return 'error';
    if (this.pendingSyncIds.has(id)) return 'syncing';
    return 'synced';
  }

  async list(): Promise<SongMeta[]> {
    const localMetas = await this.localStore.list();
    const user = getCurrentUser();
    const supabase = getSupabase();

    if (!user || !supabase) {
      return localMetas.map((m) => ({
        ...m,
        syncStatus: 'local',
      }));
    }

    try {
      const { data, error } = await supabase
        .from('songs')
        .select('id, title, created_at, updated_at, preview, bpm, total_bars, is_public, public_slug')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error || !data) {
        return localMetas.map((m) => ({
          ...m,
          syncStatus: this.getSyncStatusFor(m.id),
        }));
      }

      const mergedMap = new Map<string, SongMeta>();
      const localMap = new Map<string, SongMeta>();
      localMetas.forEach((m) => localMap.set(m.id, m));

      for (const row of data) {
        const rowUpdatedAt = new Date(row.updated_at).getTime();
        const local = localMap.get(row.id);

        let preview: SongPreview | undefined = undefined;
        if (row.preview && typeof row.preview === 'object') {
          preview = row.preview as SongPreview;
        }

        if (!local || rowUpdatedAt > local.updatedAt) {
          mergedMap.set(row.id, {
            id: row.id,
            title: row.title,
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: rowUpdatedAt,
            bpm: row.bpm || 90,
            totalBars: row.total_bars || 4,
            lanesCount: preview?.lanesCount || 1,
            placementsCount: preview?.blocks?.length || 0,
            preview,
            syncStatus: 'synced',
            isPublic: row.is_public,
            publicSlug: row.public_slug,
          });
        } else {
          mergedMap.set(local.id, {
            ...local,
            syncStatus: this.getSyncStatusFor(local.id),
          });
        }
      }

      for (const [id, local] of localMap.entries()) {
        if (!mergedMap.has(id)) {
          mergedMap.set(id, {
            ...local,
            syncStatus: this.getSyncStatusFor(id),
          });
        }
      }

      const result = Array.from(mergedMap.values());
      result.sort((a, b) => b.updatedAt - a.updatedAt);
      return result;
    } catch {
      return localMetas.map((m) => ({
        ...m,
        syncStatus: this.getSyncStatusFor(m.id),
      }));
    }
  }

  async get(id: string): Promise<Song | null> {
    const local = await this.localStore.get(id);
    const user = getCurrentUser();
    const supabase = getSupabase();

    if (!user || !supabase) {
      return local;
    }

    try {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !data) {
        return local;
      }

      const remoteUpdatedAt = new Date(data.updated_at).getTime();

      if (local && local.updatedAt >= remoteUpdatedAt) {
        return local;
      }

      const rawSong = data.song || {};
      const songPayload: Song = {
        ...rawSong,
        id: data.id,
        title: data.title,
        bpm: data.bpm,
        totalBars: data.total_bars,
        createdAt: new Date(data.created_at).getTime(),
        updatedAt: remoteUpdatedAt,
        isPublic: data.is_public,
        publicSlug: data.public_slug,
        syncStatus: 'synced',
      };

      const val = validateSong(songPayload);
      if (val.isValid && val.data) {
        await this.localStore.save(val.data);
        this.lastSyncedMap[val.data.id] = val.data.updatedAt;
        this.persistSyncState();
        return val.data;
      }
    } catch {
      // Fallback to local
    }

    return local;
  }

  async save(song: Song): Promise<void> {
    const user = getCurrentUser();
    song.updatedAt = Date.now();
    song.syncStatus = user ? 'syncing' : 'local';

    await this.localStore.save(song);

    if (user) {
      this.pendingSyncIds.add(song.id);
      this.syncErrorIds.delete(song.id);
      this.persistSyncState();
      this.schedulePush();
    }
  }

  async remove(id: string): Promise<void> {
    this.pendingSyncIds.delete(id);
    this.syncErrorIds.delete(id);
    delete this.lastSyncedMap[id];
    this.persistSyncState();

    await this.localStore.remove(id);

    const user = getCurrentUser();
    const supabase = getSupabase();
    if (user && supabase) {
      try {
        await supabase.from('songs').delete().eq('id', id).eq('user_id', user.id);
      } catch {
        // Silently fail network error on delete
      }
    }
  }

  async getAllFull(): Promise<Song[]> {
    return this.localStore.getAllFull();
  }

  private schedulePush() {
    if (this.pushDebounceTimer) {
      clearTimeout(this.pushDebounceTimer);
    }
    this.pushDebounceTimer = setTimeout(() => {
      this.flushPendingSync();
    }, 2000);
  }

  public async flushPendingSync(): Promise<void> {
    const user = getCurrentUser();
    const supabase = getSupabase();
    if (!user || !supabase || this.pendingSyncIds.size === 0) return;

    const idsToPush = Array.from(this.pendingSyncIds);

    for (const id of idsToPush) {
      try {
        const localSong = await this.localStore.get(id);
        if (!localSong) {
          this.pendingSyncIds.delete(id);
          continue;
        }

        // Check for conflict: fetch remote row updated_at
        const { data: remoteRow } = await supabase
          .from('songs')
          .select('updated_at, title')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (remoteRow) {
          const remoteTime = new Date(remoteRow.updated_at).getTime();
          const lastSyncedTime = this.lastSyncedMap[id] || 0;

          // Conflict detected: remote is newer than when we last synced, and local was edited
          if (remoteTime > lastSyncedTime && localSong.updatedAt > lastSyncedTime && remoteTime !== localSong.updatedAt) {
            // Save conflict copy locally
            const conflictSong: Song = {
              ...localSong,
              id: `song-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              title: `${localSong.title} (from another device)`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await this.localStore.save(conflictSong);
            this.pendingSyncIds.add(conflictSong.id);
          }
        }

        const preview = buildSongPreview(localSong);

        const payload = {
          id: localSong.id,
          user_id: user.id,
          title: localSong.title,
          song: localSong,
          preview,
          bpm: localSong.bpm,
          total_bars: localSong.totalBars,
          is_public: localSong.isPublic || false,
          public_slug: localSong.publicSlug || null,
          schema_version: localSong.schemaVersion || 1,
          updated_at: new Date(localSong.updatedAt).toISOString(),
        };

        const { error } = await supabase.from('songs').upsert(payload, { onConflict: 'id' });

        if (error) {
          this.syncErrorIds.add(id);
        } else {
          this.pendingSyncIds.delete(id);
          this.syncErrorIds.delete(id);
          this.lastSyncedMap[id] = localSong.updatedAt;
          localSong.syncStatus = 'synced';
          await this.localStore.save(localSong);
        }
      } catch {
        this.syncErrorIds.add(id);
      }
    }

    this.persistSyncState();
  }

  async setPublic(id: string, isPublic: boolean): Promise<string | null> {
    const local = await this.localStore.get(id);
    if (!local) return null;

    let publicSlug = local.publicSlug;
    if (isPublic && !publicSlug) {
      publicSlug = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
    }

    local.isPublic = isPublic;
    local.publicSlug = isPublic ? publicSlug : null;
    await this.save(local);
    await this.flushPendingSync();

    return isPublic ? publicSlug || null : null;
  }

  async getPublicSong(slug: string): Promise<Song | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('public_slug', slug)
        .eq('is_public', true)
        .maybeSingle();

      if (error || !data) return null;

      const raw = data.song || {};
      const songPayload: Song = {
        ...raw,
        id: data.id,
        title: data.title,
        bpm: data.bpm,
        totalBars: data.total_bars,
        createdAt: new Date(data.created_at).getTime(),
        updatedAt: new Date(data.updated_at).getTime(),
        isPublic: true,
        publicSlug: slug,
      };

      const val = validateSong(songPayload);
      return val.isValid && val.data ? val.data : null;
    } catch {
      return null;
    }
  }
}
