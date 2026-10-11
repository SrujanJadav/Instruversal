import { Creation, CreationMeta, CreationStore, SyncStatus } from './types';
import { LocalStore } from './store';
import { generatePreview, PreviewData } from './preview';
import { validateCreation } from './validator';
import { getSupabase, getCurrentUser, onAuthStateChange } from '../auth/auth';

const LAST_SYNCED_KEY = 'instruversal:last_synced_at';
const PENDING_SYNC_KEY = 'instruversal:pending_sync_ids';

export class CloudStore implements CreationStore {
  public isInMemory: boolean = false;
  private localStore: LocalStore;
  private pendingSyncIds: Set<string> = new Set();
  private pushDebounceTimer: any = null;
  private lastSyncedMap: Record<string, number> = {};
  private syncErrorIds: Set<string> = new Set();

  constructor(localStore?: LocalStore) {
    this.localStore = localStore || new LocalStore();
    this.loadPersistedSyncState();
    this.setupLifecycleListeners();

    // Listen to auth changes: when signing in, attempt to push any pending syncs
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

    // Flush pending sync on page unload / tab switch
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

  async list(): Promise<CreationMeta[]> {
    const localMetas = await this.localStore.list();
    const user = getCurrentUser();
    const supabase = getSupabase();

    // If guest or no supabase client, return local items with 'local' sync status
    if (!user || !supabase) {
      return localMetas.map((m) => ({
        ...m,
        syncStatus: 'local',
      }));
    }

    try {
      const { data, error } = await supabase
        .from('creations')
        .select('id, title, created_at, updated_at, preview, bpm, key_label, is_public, public_slug')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error || !data) {
        // Return local list with appropriate status flags on network error
        return localMetas.map((m) => ({
          ...m,
          syncStatus: this.getSyncStatusFor(m.id),
        }));
      }

      const mergedMap = new Map<string, CreationMeta>();

      // Index local items
      const localMap = new Map<string, CreationMeta>();
      for (const m of localMetas) {
        localMap.set(m.id, m);
      }

      // Process remote rows
      for (const row of data) {
        const remoteUpdated = new Date(row.updated_at).getTime();
        const remoteCreated = new Date(row.created_at).getTime();
        const lastSync = this.lastSyncedMap[row.id] || 0;
        const local = localMap.get(row.id);

        let finalMeta: CreationMeta;

        if (local) {
          // Conflict detection:
          // If remote was updated after lastSync, AND local was also modified after lastSync
          const remoteChangedSinceSync = remoteUpdated > lastSync + 1000;
          const localChangedSinceSync = local.updatedAt > lastSync + 1000;

          if (remoteChangedSinceSync && localChangedSinceSync && Math.abs(local.updatedAt - remoteUpdated) > 2000) {
            // Keep both: save copy of remote with new title
            const copyTitle = `${row.title} (from another device)`;
            finalMeta = {
              ...local,
              syncStatus: this.getSyncStatusFor(local.id),
            };

            // Synthesize remote meta as separate item
            const remoteMeta: CreationMeta = {
              id: `${row.id}-remote-copy`,
              title: copyTitle,
              createdAt: remoteCreated,
              updatedAt: remoteUpdated,
              bpm: row.bpm || 90,
              rootNote: 0,
              scaleName: 'major pentatonic',
              keyLabel: row.key_label || 'C Major Pentatonic',
              trackColors: row.preview?.trackColors || [],
              strokeCount: row.preview?.strokes?.length || 0,
              simplifiedStrokes: row.preview?.strokes || [],
              syncStatus: 'synced',
              isPublic: Boolean(row.is_public),
              publicSlug: row.public_slug || null,
            };
            mergedMap.set(remoteMeta.id, remoteMeta);
          } else if (remoteUpdated > local.updatedAt) {
            // Remote is newer
            finalMeta = {
              id: row.id,
              title: row.title,
              createdAt: remoteCreated,
              updatedAt: remoteUpdated,
              bpm: row.bpm || 90,
              rootNote: 0,
              scaleName: 'major pentatonic',
              keyLabel: row.key_label || 'C Major Pentatonic',
              trackColors: row.preview?.trackColors || [],
              strokeCount: row.preview?.strokes?.length || 0,
              simplifiedStrokes: row.preview?.strokes || [],
              syncStatus: 'synced',
              isPublic: Boolean(row.is_public),
              publicSlug: row.public_slug || null,
            };
            this.lastSyncedMap[row.id] = remoteUpdated;
          } else {
            // Local is newer or equal
            finalMeta = {
              ...local,
              syncStatus: this.getSyncStatusFor(local.id),
              isPublic: Boolean(row.is_public),
              publicSlug: row.public_slug || null,
            };
          }
        } else {
          // Cloud-only item (created on another device)
          finalMeta = {
            id: row.id,
            title: row.title,
            createdAt: remoteCreated,
            updatedAt: remoteUpdated,
            bpm: row.bpm || 90,
            rootNote: 0,
            scaleName: 'major pentatonic',
            keyLabel: row.key_label || 'C Major Pentatonic',
            trackColors: row.preview?.trackColors || [],
            strokeCount: row.preview?.strokes?.length || 0,
            simplifiedStrokes: row.preview?.strokes || [],
            syncStatus: 'synced',
            isPublic: Boolean(row.is_public),
            publicSlug: row.public_slug || null,
          };
          this.lastSyncedMap[row.id] = remoteUpdated;
        }

        mergedMap.set(finalMeta.id, finalMeta);
      }

      // Add any local items that are not in cloud (e.g., created offline or not yet pushed)
      for (const m of localMetas) {
        if (!mergedMap.has(m.id)) {
          mergedMap.set(m.id, {
            ...m,
            syncStatus: this.getSyncStatusFor(m.id),
          });
        }
      }

      this.persistSyncState();
      const list = Array.from(mergedMap.values());
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (err) {
      console.warn('Failed to fetch cloud creations list:', err);
      return localMetas.map((m) => ({
        ...m,
        syncStatus: this.getSyncStatusFor(m.id),
      }));
    }
  }

  async get(id: string): Promise<Creation | null> {
    const local = await this.localStore.get(id);
    const supabase = getSupabase();

    if (!supabase) {
      return local;
    }

    try {
      // If we don't have it locally or want to fetch latest remote
      const { data, error } = await supabase
        .from('creations')
        .select('id, title, created_at, updated_at, project, is_public, public_slug')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        const remoteUpdated = new Date(data.updated_at).getTime();
        const remoteCreated = new Date(data.created_at).getTime();

        if (!local || remoteUpdated > local.updatedAt) {
          const val = validateCreation({
            id: data.id,
            title: data.title,
            createdAt: remoteCreated,
            updatedAt: remoteUpdated,
            schemaVersion: 1,
            project: data.project,
          });

          if (val.isValid && val.data) {
            const creation: Creation = {
              ...val.data,
              isPublic: Boolean(data.is_public),
              publicSlug: data.public_slug || null,
              syncStatus: 'synced',
            };
            await this.localStore.save(creation);
            this.lastSyncedMap[id] = remoteUpdated;
            this.persistSyncState();
            return creation;
          }
        }
      }
    } catch (err) {
      console.warn('Cloud fetch failed, using local cache:', err);
    }

    return local;
  }

  async save(c: Creation): Promise<void> {
    // 1. Immediate local write
    await this.localStore.save(c);

    // 2. Queue for cloud sync if user is signed in
    const user = getCurrentUser();
    if (user && getSupabase()) {
      this.pendingSyncIds.add(c.id);
      this.persistSyncState();
      this.schedulePush();
    }
  }

  async remove(id: string): Promise<void> {
    await this.localStore.remove(id);
    this.pendingSyncIds.delete(id);
    this.syncErrorIds.delete(id);
    delete this.lastSyncedMap[id];
    this.persistSyncState();

    const user = getCurrentUser();
    const supabase = getSupabase();
    if (user && supabase) {
      try {
        await supabase.from('creations').delete().eq('id', id).eq('user_id', user.id);
      } catch (err) {
        console.warn('Failed to delete creation from cloud:', err);
      }
    }
  }

  async getAllFull(): Promise<Creation[]> {
    return this.localStore.getAllFull();
  }

  private schedulePush() {
    if (this.pushDebounceTimer) {
      clearTimeout(this.pushDebounceTimer);
    }
    // 2-second debounce for cloud push
    this.pushDebounceTimer = setTimeout(() => {
      this.pushDebounceTimer = null;
      this.flushPendingSync();
    }, 2000);
  }

  public async flushPendingSync(): Promise<void> {
    if (this.pushDebounceTimer) {
      clearTimeout(this.pushDebounceTimer);
      this.pushDebounceTimer = null;
    }

    const user = getCurrentUser();
    const supabase = getSupabase();
    if (!user || !supabase || this.pendingSyncIds.size === 0) return;

    const idsToSync = Array.from(this.pendingSyncIds);

    for (const id of idsToSync) {
      try {
        const creation = await this.localStore.get(id);
        if (!creation) {
          this.pendingSyncIds.delete(id);
          continue;
        }

        const preview: PreviewData = generatePreview(creation.project);

        const { data, error } = await supabase.from('creations').upsert({
          id: creation.id,
          user_id: user.id,
          title: creation.title,
          project: creation.project,
          preview,
          bpm: creation.project.bpm || 90,
          key_label: preview.keyLabel || 'C Major Pentatonic',
          schema_version: creation.schemaVersion || 1,
        }).select('updated_at').single();

        if (error) {
          console.warn(`Sync error for ${id}:`, error.message);
          this.syncErrorIds.add(id);
        } else {
          this.pendingSyncIds.delete(id);
          this.syncErrorIds.delete(id);
          const serverUpdated = data?.updated_at ? new Date(data.updated_at).getTime() : creation.updatedAt;
          this.lastSyncedMap[id] = serverUpdated;
        }
      } catch (err) {
        console.warn(`Sync exception for ${id}:`, err);
        this.syncErrorIds.add(id);
      }
    }

    this.persistSyncState();
  }

  async setPublic(id: string, isPublic: boolean): Promise<string | null> {
    const user = getCurrentUser();
    const supabase = getSupabase();
    if (!user || !supabase) {
      throw new Error('Must be signed in to share creations.');
    }

    let publicSlug: string | null = null;
    if (isPublic) {
      // Generate compact 8-character URL-friendly slug
      publicSlug = Math.random().toString(36).substring(2, 10);
    }

    const { error } = await supabase
      .from('creations')
      .update({
        is_public: isPublic,
        public_slug: publicSlug,
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    // Update local cache
    const local = await this.localStore.get(id);
    if (local) {
      local.isPublic = isPublic;
      local.publicSlug = publicSlug;
      await this.localStore.save(local);
    }

    return publicSlug;
  }

  async getPublicCreation(slug: string): Promise<Creation | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('creations')
      .select('id, title, created_at, updated_at, project, is_public, public_slug')
      .eq('public_slug', slug)
      .eq('is_public', true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const val = validateCreation({
      id: data.id,
      title: data.title,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      schemaVersion: 1,
      project: data.project,
    });

    if (!val.isValid || !val.data) return null;

    return {
      ...val.data,
      isPublic: true,
      publicSlug: data.public_slug,
    };
  }
}
