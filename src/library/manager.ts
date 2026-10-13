import { state, events, clearHistory, loadDeviceKeyDefaults } from '../state';
import { Creation, ProjectData, CreationStore } from './types';
import { getCreationStore } from './store';
import { serializeProject, deserializeProject, PROJECT_STORAGE_KEY } from '../audio/projectState';
import { getTrackManager } from '../audio/tracks';
import { getTransport } from '../audio/transport';
import { getLoopScheduler } from '../audio/schedule';
import { getFlowVoicePool } from '../audio/voicePool';
import { getBeatFlowVoicePool } from '../audio/beatFlowVoices';
import { validateProject, sanitizeTitle } from './validator';

const MIGRATION_KEY = 'instruversal:library-migrated';
const CURRENT_ID_KEY = 'instruversal:current-creation-id';
const CURRENT_TITLE_KEY = 'instruversal:current-creation-title';

export type SaveStatus = 'idle' | 'saving' | 'saved';

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class CreationManager {
  private store: CreationStore;
  private currentId: string = generateUuid();
  private currentTitle: string = 'Untitled sketch';
  private createdAt: number = Date.now();
  private saveStatus: SaveStatus = 'idle';
  private autosaveTimer: number | null = null;
  private statusFadeTimer: number | null = null;
  private statusListeners: Set<(status: SaveStatus) => void> = new Set();
  private titleListeners: Set<(title: string) => void> = new Set();
  private unsubs: (() => void)[] = [];

  constructor(store?: CreationStore) {
    this.store = store || getCreationStore();
  }

  public getCurrentId(): string {
    return this.currentId;
  }

  public getCurrentTitle(): string {
    return this.currentTitle;
  }

  public getSaveStatus(): SaveStatus {
    return this.saveStatus;
  }

  public getCurrentCreation(): Creation {
    return {
      id: this.currentId,
      title: this.currentTitle,
      createdAt: this.createdAt,
      updatedAt: Date.now(),
      schemaVersion: 2,
      project: serializeProject(),
    };
  }

  public onStatusChange(fn: (status: SaveStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.saveStatus);
    return () => this.statusListeners.delete(fn);
  }

  public onTitleChange(fn: (title: string) => void): () => void {
    this.titleListeners.add(fn);
    fn(this.currentTitle);
    return () => this.titleListeners.delete(fn);
  }

  private setStatus(status: SaveStatus) {
    this.saveStatus = status;
    this.statusListeners.forEach((fn) => fn(status));

    if (this.statusFadeTimer !== null) {
      clearTimeout(this.statusFadeTimer);
      this.statusFadeTimer = null;
    }

    if (status === 'saved') {
      this.statusFadeTimer = setTimeout(() => {
        this.statusFadeTimer = null;
        this.saveStatus = 'idle';
        this.statusListeners.forEach((fn) => fn('idle'));
      }, 2000) as unknown as number;
    }
  }

  public setTitle(newTitle: string) {
    const sanitized = sanitizeTitle(newTitle, 'Untitled sketch');
    if (sanitized === this.currentTitle) return;
    this.currentTitle = sanitized;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CURRENT_TITLE_KEY, sanitized);
      }
    } catch {}
    this.titleListeners.forEach((fn) => fn(sanitized));
    this.scheduleDebouncedSave();
  }

  public async init(): Promise<void> {
    // 1. Check if we need to migrate existing legacy project from single-project localStorage
    await this.migrateLegacyProjectIfNeeded();

    // 2. Restore current active ID / title from session if present
    try {
      if (typeof localStorage !== 'undefined') {
        const savedId = localStorage.getItem(CURRENT_ID_KEY);
        const savedTitle = localStorage.getItem(CURRENT_TITLE_KEY);
        if (savedId) {
          this.currentId = savedId;
        }
        if (savedTitle) {
          this.currentTitle = sanitizeTitle(savedTitle);
        }
      }
    } catch {}

    this.titleListeners.forEach((fn) => fn(this.currentTitle));

    // 3. Setup event listeners for autosave
    this.setupAutosaveListeners();
  }

  private async migrateLegacyProjectIfNeeded(): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') return;
      const migrated = localStorage.getItem(MIGRATION_KEY);
      if (migrated) return;

      const legacyJson = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (legacyJson) {
        const parsed = JSON.parse(legacyJson);
        const val = validateProject(parsed);
        if (val.isValid && val.data) {
          const creationId = generateUuid();
          const creation: Creation = {
            id: creationId,
            title: 'First sketch',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            schemaVersion: 1,
            project: val.data,
          };
          await this.store.save(creation);
          this.currentId = creationId;
          this.currentTitle = 'First sketch';
          this.createdAt = creation.createdAt;
          localStorage.setItem(CURRENT_ID_KEY, creationId);
          localStorage.setItem(CURRENT_TITLE_KEY, 'First sketch');
        }
      }
      localStorage.setItem(MIGRATION_KEY, 'true');
    } catch (err) {
      console.warn('Migration of legacy project failed:', err);
    }
  }

  private setupAutosaveListeners() {
    const trigger = () => this.scheduleDebouncedSave();

    this.unsubs = [
      events.on('stroke:added', trigger),
      events.on('strokes:updated', trigger),
      events.on('bpm:change', trigger),
      events.on('scale:change', trigger),
      events.on('playback-mode:change', trigger),
      events.on('glide:change', trigger),
      events.on('track:beat-param-change', trigger),
      events.on('track:type-change', trigger),
      events.on('track:update', trigger),
      events.on('fx:change', trigger),
    ];
  }

  public scheduleDebouncedSave() {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
    }

    // 800ms debounce requirement
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.performAutosave();
    }, 800) as unknown as number;
  }

  private performAutosave() {
    this.setStatus('saving');

    const executeSave = async () => {
      try {
        const projectData: ProjectData = serializeProject();
        const now = Date.now();

        const creation: Creation = {
          id: this.currentId,
          title: this.currentTitle,
          createdAt: this.createdAt,
          updatedAt: now,
          schemaVersion: 2,
          project: projectData,
        };

        await this.store.save(creation);

        // Save active id & title in localStorage
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(CURRENT_ID_KEY, this.currentId);
            localStorage.setItem(CURRENT_TITLE_KEY, this.currentTitle);
            // Keep single-project backup in localStorage for recovery fallback
            localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projectData));
          } catch {}
        }

        this.setStatus('saved');
      } catch (err) {
        console.error('Autosave failed:', err);
        this.setStatus('idle');
      }
    };

    // Offload off the hot path using requestIdleCallback if available
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        executeSave();
      }, { timeout: 1000 });
    } else {
      setTimeout(executeSave, 0);
    }
  }

  /**
   * Immediately flushes any pending save without waiting for the 800ms debounce.
   * Returns true on successful save, false on failure.
   */
  public async flushSave(): Promise<boolean> {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.setStatus('saving');

    try {
      const projectData: ProjectData = serializeProject();
      const now = Date.now();

      const creation: Creation = {
        id: this.currentId,
        title: this.currentTitle,
        createdAt: this.createdAt,
        updatedAt: now,
        schemaVersion: 2,
        project: projectData,
      };

      await this.store.save(creation);

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(CURRENT_ID_KEY, this.currentId);
          localStorage.setItem(CURRENT_TITLE_KEY, this.currentTitle);
          localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projectData));
        } catch {}
      }

      this.setStatus('saved');
      return true;
    } catch (err) {
      console.error('Autosave flush failed:', err);
      this.setStatus('idle');
      return false;
    }
  }

  public async openCreation(
    idOrCreation: string | Creation,
    startPlaying: boolean = false
  ): Promise<{ success: boolean; warnings?: string[] }> {
    try {
      const creation = typeof idOrCreation === 'string'
        ? await this.store.get(idOrCreation)
        : idOrCreation;
      if (!creation) {
        return { success: false, warnings: ['Creation not found.'] };
      }

      const val = validateProject(creation.project);
      if (!val.isValid || !val.data) {
        return { success: false, warnings: [val.error || 'Invalid project data.'] };
      }

      // 1. Stop transport
      const transport = getTransport();
      transport.pause();

      // 2. Cleanly release voices
      getFlowVoicePool().releaseAll(0.02);
      getBeatFlowVoicePool().releaseAll(0.02);

      // 3. Clear undo/redo history for the new creation
      clearHistory();

      // 4. Load project into tracks, state, canvas
      const allTracks = getTrackManager().getAllTracks();
      deserializeProject(val.data, allTracks);

      // 5. Rebuild loop schedule once
      getLoopScheduler().rebuild();

      // 6. Notify canvas and UI
      events.emit('strokes:updated', state.strokes);
      events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
      events.emit('bpm:change', state.bpm);
      events.emit('playback-mode:change', state.playbackMode);
      events.emit('glide:change', state.glide);
      events.emit('track:select', state.selectedTrackId);

      // 7. Update current creation identity
      this.currentId = creation.id;
      this.currentTitle = sanitizeTitle(creation.title);
      this.createdAt = creation.createdAt;

      try {
        localStorage.setItem(CURRENT_ID_KEY, this.currentId);
        localStorage.setItem(CURRENT_TITLE_KEY, this.currentTitle);
      } catch {}

      this.titleListeners.forEach((fn) => fn(this.currentTitle));
      this.setStatus('saved');

      // 8. Start audio playback if requested (e.g. from Play card button)
      if (startPlaying) {
        await transport.play();
      }

      return { success: true, warnings: val.warnings };
    } catch (err) {
      console.error('Failed to open creation:', err);
      return { success: false, warnings: [String(err)] };
    }
  }

  public async createNewCreation(): Promise<void> {
    const transport = getTransport();
    transport.pause();
    getFlowVoicePool().releaseAll(0.02);
    getBeatFlowVoicePool().releaseAll(0.02);
    clearHistory();

    const defaults = loadDeviceKeyDefaults();
    state.keyMode = defaults.keyMode;
    state.rootNote = defaults.rootNote;
    state.scaleName = defaults.scaleName;
    const tm = getTrackManager();
    for (const track of tm.getAllTracks()) {
      if (track.trackType !== 'beat') {
        track.setKey(defaults.keyMode === 'perColour' ? { root: defaults.rootNote, scale: defaults.scaleName } : undefined);
      }
    }
    events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
    events.emit('key-mode:change', state.keyMode);

    state.strokes = [];
    events.emit('strokes:updated', []);
    getLoopScheduler().rebuild();

    this.currentId = generateUuid();
    this.currentTitle = 'Untitled sketch';
    this.createdAt = Date.now();

    try {
      localStorage.setItem(CURRENT_ID_KEY, this.currentId);
      localStorage.setItem(CURRENT_TITLE_KEY, this.currentTitle);
    } catch {}

    this.titleListeners.forEach((fn) => fn(this.currentTitle));
    this.scheduleDebouncedSave();
  }

  public destroy() {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
    }
    if (this.statusFadeTimer !== null) {
      clearTimeout(this.statusFadeTimer);
    }
  }
}

let sharedManager: CreationManager | null = null;

export function getCreationManager(store?: CreationStore): CreationManager {
  if (store) {
    return new CreationManager(store);
  }
  if (!sharedManager) {
    sharedManager = new CreationManager();
  }
  return sharedManager;
}
