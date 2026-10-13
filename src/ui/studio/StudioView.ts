import { Song, SongPlacement, SongLane, SONG_LIMITS } from '../../song/types';
import {
  hasPlacementOverlap,
  findFreeSlot,
  splitPlacement,
  addAsset,
  removeUnusedAssets,
} from '../../song/helpers';
import { getSongStore } from '../../song/store';
import { StudioHeader } from './StudioHeader';
import { Timeline } from './Timeline';
import { ClipInspector } from './ClipInspector';
import { DrawingPicker } from './DrawingPicker';
import { ListView } from './ListView';
import { StudioHistory } from './StudioHistory';
import { Creation } from '../../library/types';
import { getCreationStore } from '../../library/store';

export class StudioView {
  public element: HTMLElement;
  private song: Song;
  private history: StudioHistory;
  private header: StudioHeader;
  private timeline: Timeline;
  private inspector: ClipInspector;
  private listView: ListView;
  private picker: DrawingPicker;
  private currentPlayheadBar: number = 0;
  private isPlaying: boolean = false;
  private playAnimationId: number | null = null;
  private playStartTime: number = 0;
  private playStartBar: number = 0;

  constructor(song: Song) {
    this.song = song;
    this.history = new StudioHistory(song);

    this.element = document.createElement('div');
    this.element.className = 'studio-view';

    // Header
    this.header = new StudioHeader(this.song, {
      onTitleChange: (newTitle) => this.updateSong({ ...this.song, title: newTitle }),
      onBpmChange: (newBpm) => this.updateSong({ ...this.song, bpm: newBpm }),
      onPlayToggle: () => this.togglePlayback(),
      onStop: () => this.stopPlayback(),
      onZoomIn: () => this.timeline.setZoom(this.timeline.getZoom() + 30),
      onZoomOut: () => this.timeline.setZoom(this.timeline.getZoom() - 30),
      onAddDrawing: () => this.picker.open(),
      onViewToggle: (view) => this.switchView(view),
      onBack: () => {
        window.location.hash = '#/library';
      },
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
    });

    // Mobile landscape banner hint
    const hintBanner = document.createElement('div');
    hintBanner.className = 'studio-landscape-hint';
    hintBanner.innerHTML = `
      <span>Landscape gives you more room for arranging.</span>
      <button type="button" class="studio-mini-btn" style="border: none; background: transparent;">✕</button>
    `;
    hintBanner.querySelector('button')?.addEventListener('click', () => hintBanner.remove());

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'studio-body';

    // Timeline
    this.timeline = new Timeline(this.song, {
      onSelectPlacement: (p) => {
        const asset = p ? this.song.assets[p.assetId] || null : null;
        this.inspector.inspect(p, asset);
      },
      onUpdatePlacement: (p) => this.handleUpdatePlacement(p),
      onDeletePlacement: (id) => this.handleDeletePlacement(id),
      onDuplicatePlacement: (p) => this.handleDuplicatePlacement(p),
      onSplitPlacement: (id, atBar) => this.handleSplitPlacement(id, atBar),
      onAddLane: () => this.handleAddLane(),
      onRemoveLane: (id) => this.handleRemoveLane(id),
      onUpdateLane: (l) => this.handleUpdateLane(l),
      onAddMarker: (bar, label) => this.handleAddMarker(bar, label),
      onSetLoopRegion: (region) => this.updateSong({ ...this.song, loopRegion: region }),
      onSeek: (bar) => this.handleSeek(bar),
      onAddDrawingClick: () => this.picker.open(),
    });

    // Inspector
    this.inspector = new ClipInspector({
      onUpdatePlacement: (p) => this.handleUpdatePlacement(p),
      onDeletePlacement: (id) => this.handleDeletePlacement(id),
      onReplaceDrawing: () => {
        this.picker.open();
      },
      onUpdateFromOriginal: async (assetId) => {
        await this.handleUpdateAssetFromOriginal(assetId);
      },
      onEditDrawing: (assetId) => {
        this.handleEditDrawing(assetId);
      },
    });

    // List view
    this.listView = new ListView({
      onUpdatePlacement: (p) => this.handleUpdatePlacement(p),
      onDeletePlacement: (id) => this.handleDeletePlacement(id),
      onMovePlacementLane: (id, dir) => this.handleMovePlacementLane(id, dir),
    });

    // Picker
    this.picker = new DrawingPicker({
      onSelectCreation: (creation) => this.handleImportDrawing(creation),
      onClose: () => {},
    });

    bodyEl.appendChild(this.timeline.element);
    bodyEl.appendChild(this.listView.element);
    bodyEl.appendChild(this.inspector.element);

    this.element.appendChild(this.header.element);
    this.element.appendChild(hintBanner);
    this.element.appendChild(bodyEl);

    this.setupKeyboardShortcuts();
  }

  private setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayback();
      } else if (e.key === 'Escape') {
        this.timeline.clearSelection();
        this.inspector.inspect(null, null);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const sel = this.timeline.getSelectedPlacement();
        if (sel) this.handleDuplicatePlacement(sel);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        const sel = this.timeline.getSelectedPlacement();
        if (sel) this.handleSplitPlacement(sel.id, this.currentPlayheadBar);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const sel = this.timeline.getSelectedPlacement();
        if (sel) this.handleDeletePlacement(sel.id);
      } else if (e.key === '+' || e.key === '=') {
        this.timeline.setZoom(this.timeline.getZoom() + 30);
      } else if (e.key === '-' || e.key === '_') {
        this.timeline.setZoom(this.timeline.getZoom() - 30);
      }
    });
  }

  private updateSong(updated: Song, pushHistory: boolean = true) {
    this.song = updated;
    this.timeline.setSong(this.song);
    this.listView.render(this.song);

    if (pushHistory) {
      this.history.pushState(this.song);
    }

    this.saveSong();
  }

  private async saveSong() {
    this.header.setSaveStatus('Saving…');
    try {
      const store = getSongStore();
      await store.save(this.song);
      this.header.setSaveStatus('Saved');
    } catch {
      this.header.setSaveStatus('Local');
    }
  }

  private undo() {
    const prev = this.history.undo();
    if (prev) {
      this.song = prev;
      this.timeline.setSong(this.song);
      this.listView.render(this.song);
      this.saveSong();
    }
  }

  private redo() {
    const next = this.history.redo();
    if (next) {
      this.song = next;
      this.timeline.setSong(this.song);
      this.listView.render(this.song);
      this.saveSong();
    }
  }

  private switchView(view: 'timeline' | 'list') {
    if (view === 'timeline') {
      this.timeline.element.style.display = 'flex';
      this.listView.hide();
    } else {
      this.timeline.element.style.display = 'none';
      this.listView.render(this.song);
      this.listView.show();
    }
  }

  private handleSeek(bar: number) {
    this.currentPlayheadBar = bar;
    const beatsPerSec = this.song.bpm / 60;
    const secs = (bar * 4) / beatsPerSec;
    this.header.updateTime(bar + 1, 1, secs);
  }

  private togglePlayback() {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback() {
    this.isPlaying = true;
    this.header.updatePlayState(true);
    this.playStartTime = performance.now();
    this.playStartBar = this.currentPlayheadBar;

    const tick = () => {
      if (!this.isPlaying) return;
      const elapsedSec = (performance.now() - this.playStartTime) / 1000;
      const beatsElapsed = elapsedSec * (this.song.bpm / 60);
      const barsElapsed = beatsElapsed / 4;
      let currentBar = this.playStartBar + barsElapsed;

      // Handle loop region if set
      if (this.song.loopRegion) {
        const { startBar, endBar } = this.song.loopRegion;
        if (currentBar >= endBar) {
          this.playStartTime = performance.now();
          this.playStartBar = startBar;
          currentBar = startBar;
        }
      } else if (currentBar >= this.song.totalBars) {
        // Return to start
        this.playStartTime = performance.now();
        this.playStartBar = 0;
        currentBar = 0;
      }

      this.currentPlayheadBar = currentBar;
      this.timeline.updatePlayhead(currentBar);

      const wholeBar = Math.floor(currentBar);
      const beat = Math.floor((currentBar - wholeBar) * 4) + 1;
      const totalSec = (currentBar * 4) / (this.song.bpm / 60);
      this.header.updateTime(wholeBar + 1, beat, totalSec);

      this.playAnimationId = requestAnimationFrame(tick);
    };

    this.playAnimationId = requestAnimationFrame(tick);
  }

  private stopPlayback() {
    this.isPlaying = false;
    this.header.updatePlayState(false);
    if (this.playAnimationId) {
      cancelAnimationFrame(this.playAnimationId);
      this.playAnimationId = null;
    }
    const resetBar = this.song.loopRegion ? this.song.loopRegion.startBar : 0;
    this.handleSeek(resetBar);
    this.timeline.updatePlayhead(resetBar);
  }

  private handleImportDrawing(creation: Creation) {
    const isFirstClip = this.song.placements.length === 0;
    const { song: withAsset, assetId } = addAsset(this.song, creation);

    const sketchBars = creation.project?.bars ?? 2;
    const preferredStart = Math.floor(this.currentPlayheadBar);
    const laneId = withAsset.lanes[0].id;
    const startBar = findFreeSlot(withAsset.placements, laneId, preferredStart, sketchBars);

    const newPlacement: SongPlacement = {
      id: `placement-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      assetId,
      laneId,
      startBar,
      lengthBars: sketchBars,
      offsetBars: 0,
      gainDb: 0,
      transpose: 0,
      fadeInBars: 0,
      fadeOutBars: 0,
      mute: false,
    };

    const newBpm = isFirstClip && creation.project?.bpm ? creation.project.bpm : withAsset.bpm;

    const updatedSong: Song = {
      ...withAsset,
      bpm: newBpm,
      placements: [...withAsset.placements, newPlacement],
      updatedAt: Date.now(),
    };

    if (isFirstClip) {
      this.header.updateBpm(newBpm);
    }

    this.updateSong(updatedSong);
  }

  private handleUpdatePlacement(p: SongPlacement) {
    const updatedPlacements = this.song.placements.map((existing) =>
      existing.id === p.id ? p : existing
    );
    this.updateSong({ ...this.song, placements: updatedPlacements });
    this.inspector.inspect(p, this.song.assets[p.assetId] || null);
  }

  private handleDeletePlacement(placementId: string) {
    const remaining = this.song.placements.filter((p) => p.id !== placementId);
    const cleaned = removeUnusedAssets({ ...this.song, placements: remaining });
    this.updateSong(cleaned);
    this.timeline.clearSelection();
    this.inspector.inspect(null, null);
  }

  private handleDuplicatePlacement(p: SongPlacement) {
    const freeSlot = findFreeSlot(
      this.song.placements,
      p.laneId,
      p.startBar + p.lengthBars,
      p.lengthBars
    );
    const duplicated: SongPlacement = {
      ...p,
      id: `placement-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      startBar: freeSlot,
    };
    this.updateSong({ ...this.song, placements: [...this.song.placements, duplicated] });
  }

  private handleSplitPlacement(placementId: string, atBarFloat: number) {
    const atBar = Math.round(atBarFloat);
    const target = this.song.placements.find((p) => p.id === placementId);
    if (!target) return;
    if (atBar <= target.startBar || atBar >= target.startBar + target.lengthBars) return;

    try {
      const loopLen = this.song.assets[target.assetId]?.project?.bars ?? 4;
      const [left, right] = splitPlacement(target, atBar, loopLen);
      const filtered = this.song.placements.filter((p) => p.id !== placementId);
      this.updateSong({ ...this.song, placements: [...filtered, left, right] });
    } catch {}
  }

  private handleAddLane() {
    if (this.song.lanes.length >= SONG_LIMITS.MAX_LANES) return;
    const newIdx = this.song.lanes.length + 1;
    const newLane: SongLane = {
      id: `lane-${Date.now()}`,
      name: `Lane ${newIdx}`,
      volumeDb: 0,
      pan: 0,
      mute: false,
      solo: false,
      sendReverb: 0,
      sendDelay: 0,
    };
    this.updateSong({ ...this.song, lanes: [...this.song.lanes, newLane] });
  }

  private handleRemoveLane(laneId: string) {
    if (this.song.lanes.length <= 1) return;
    const remainingLanes = this.song.lanes.filter((l) => l.id !== laneId);
    // Remove placements on this lane
    const remainingPlacements = this.song.placements.filter((p) => p.laneId !== laneId);
    const cleaned = removeUnusedAssets({
      ...this.song,
      lanes: remainingLanes,
      placements: remainingPlacements,
    });
    this.updateSong(cleaned);
  }

  private handleUpdateLane(lane: SongLane) {
    const updatedLanes = this.song.lanes.map((l) => (l.id === lane.id ? lane : l));
    this.updateSong({ ...this.song, lanes: updatedLanes });
  }

  private handleAddMarker(bar: number, label: string) {
    const newMarker = { id: `marker-${Date.now()}`, bar, label };
    this.updateSong({ ...this.song, markers: [...this.song.markers, newMarker] });
  }

  private handleMovePlacementLane(placementId: string, direction: 'up' | 'down') {
    const p = this.song.placements.find((x) => x.id === placementId);
    if (!p) return;
    const currentIdx = this.song.lanes.findIndex((l) => l.id === p.laneId);
    const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= this.song.lanes.length) return;

    const targetLane = this.song.lanes[targetIdx];
    const candidate = { ...p, laneId: targetLane.id };
    if (!hasPlacementOverlap(this.song.placements, candidate)) {
      this.handleUpdatePlacement(candidate);
    }
  }

  private async handleUpdateAssetFromOriginal(assetId: string) {
    const asset = this.song.assets[assetId];
    if (!asset || !asset.sourceCreationId) return;
    const store = getCreationStore();
    const orig = await store.get(asset.sourceCreationId);
    if (!orig) return;

    const updatedAssets = {
      ...this.song.assets,
      [assetId]: {
        ...asset,
        project: JSON.parse(JSON.stringify(orig.project)),
        sourceUpdatedAt: orig.updatedAt,
      },
    };
    this.updateSong({ ...this.song, assets: updatedAssets });
  }

  private handleEditDrawing(assetId: string) {
    // Open sketch in editor with return token
    sessionStorage.setItem('instruversal:studio_return_song_id', this.song.id);
    sessionStorage.setItem('instruversal:studio_return_asset_id', assetId);
    window.location.hash = '#/';
  }

  public dispose() {
    this.stopPlayback();
  }
}
