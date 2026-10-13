import { Song, SongPlacement, SongLane, SongMasterSettings, SONG_LIMITS } from '../../song/types';
import { autoBalanceSong } from '../../song/presets';
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
import { MixerPanel } from './MixerPanel';
import { FxPanel } from '../FxPanel';
import { SongExportModal } from './SongExportModal';
import { getShareModal } from '../ShareModal';
import { Creation } from '../../library/types';
import { getCreationStore } from '../../library/store';
import { SongPlaybackEngine } from '../../song/playbackEngine';
import { getPracticeEngine } from '../../audio/practice';
import { fadeMasterOut } from '../../audio/lifecycle';

export class StudioView {
  public element: HTMLElement;
  private song: Song;
  private history: StudioHistory;
  private header: StudioHeader;
  private timeline: Timeline;
  private inspector: ClipInspector;
  private listView: ListView;
  private picker: DrawingPicker;
  private mixerPanel: MixerPanel;
  private fxPanel: FxPanel;
  private exportModal: SongExportModal;
  private playbackEngine: SongPlaybackEngine;
  private currentPlayheadBar: number = 0;
  private isPlaying: boolean = false;
  private followPlayhead: boolean = true;
  private selectedLaneId: string | null = null;

  constructor(song: Song) {
    this.song = song;
    this.history = new StudioHistory(song);

    this.playbackEngine = new SongPlaybackEngine(this.song, {
      onPlayheadTick: (wholeBar, beat, totalSec, currentBarFloat) => {
        const barPos = currentBarFloat !== undefined ? currentBarFloat : wholeBar - 1;
        this.currentPlayheadBar = barPos;
        this.timeline.updatePlayhead(barPos);
        this.header.updateTime(wholeBar, beat, totalSec);

        if (this.followPlayhead) {
          this.timeline.scrollToBar(barPos);
        }
      },
      onClipSounding: (placementId) => {
        this.timeline.pulseClip(placementId);
      },
      onPlaybackStateChange: (isPlaying) => {
        this.isPlaying = isPlaying;
        this.header.updatePlayState(isPlaying);
        this.mixerPanel?.onPlaybackChange(isPlaying);
      },
    });

    this.element = document.createElement('div');
    this.element.className = 'studio-view';

    // Header
    this.header = new StudioHeader(this.song, {
      onHome: async () => {
        await this.flushAndExitTo('#/');
      },
      onTitleChange: (newTitle) => this.updateSong({ ...this.song, title: newTitle }),
      onBpmChange: (newBpm) => this.updateSong({ ...this.song, bpm: newBpm }),
      onPlayToggle: () => this.togglePlayback(),
      onStop: () => this.stopPlayback(),
      onZoomIn: () => this.timeline.setZoom(this.timeline.getZoom() + 30),
      onZoomOut: () => this.timeline.setZoom(this.timeline.getZoom() - 30),
      onAddDrawing: () => this.picker.open(),
      onViewToggle: (view) => this.switchView(view),
      onBack: async () => {
        await this.flushAndExitTo('#/library');
      },
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onMixToggle: () => this.toggleMixer(),
      onExport: () => this.exportModal.open(),
      onShare: () => {
        getShareModal().open(
          this.song.id,
          this.song.title,
          this.song.isPublic,
          this.song.publicSlug,
          'song'
        );
      },
      onFollowToggle: (enabled) => {
        this.followPlayhead = enabled;
      },
      onMetronomeToggle: () => {
        try {
          const practice = getPracticeEngine();
          const cur = practice.getSettings();
          practice.updateSettings({ metronomeEnabled: !cur.metronomeEnabled });
          this.header.setMetronomeState(!cur.metronomeEnabled);
        } catch {}
      },
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
      onSelectLane: (laneId) => {
        this.selectedLaneId = laneId;
      },
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

    // Mixer Panel
    this.mixerPanel = new MixerPanel(this.song, this.playbackEngine, {
      onUpdateLane: (l) => this.handleUpdateLane(l),
      onUpdateMaster: (m) => this.handleUpdateMaster(m),
      onAutoBalance: () => this.handleAutoBalance(),
      onOpenEffects: () => this.fxPanel.open(),
      onClose: () => this.header.setMixActive(false),
    });

    // Fx Panel (Effects Rack)
    this.fxPanel = new FxPanel(this.element);

    // Export Modal
    this.exportModal = new SongExportModal(this.song, this.playbackEngine, (updated) => {
      this.updateSong(updated);
    });

    bodyEl.appendChild(this.timeline.element);
    bodyEl.appendChild(this.listView.element);
    bodyEl.appendChild(this.inspector.element);
    bodyEl.appendChild(this.mixerPanel.element);

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
    this.mixerPanel.setSong(this.song);
    this.exportModal.setSong(this.song);
    this.playbackEngine.updateSong(this.song);

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
      this.playbackEngine.updateSong(this.song);
      this.saveSong();
    }
  }

  private redo() {
    const next = this.history.redo();
    if (next) {
      this.song = next;
      this.timeline.setSong(this.song);
      this.listView.render(this.song);
      this.playbackEngine.updateSong(this.song);
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
    this.playbackEngine.seek(bar);
    this.timeline.updatePlayhead(bar);
  }

  private async togglePlayback() {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      await this.startPlayback();
    }
  }

  private async startPlayback() {
    await this.playbackEngine.play();
  }

  private stopPlayback() {
    this.playbackEngine.stop();
  }

  private handleImportDrawing(creation: Creation) {
    const isFirstClip = this.song.placements.length === 0;
    const { song: withAsset, assetId } = addAsset(this.song, creation);

    const sketchBars = creation.project?.bars ?? 2;
    const preferredStart = Math.floor(this.currentPlayheadBar);

    // Prefer selected lane, fallback to first lane
    const targetLaneId = this.selectedLaneId && withAsset.lanes.some((l) => l.id === this.selectedLaneId)
      ? this.selectedLaneId
      : withAsset.lanes[0].id;

    let chosenLaneId = targetLaneId;
    let startBar = preferredStart;

    // Check if slot at playhead overlaps on target lane
    if (hasPlacementOverlap(withAsset.placements, { id: 'temp', laneId: chosenLaneId, startBar, lengthBars: sketchBars })) {
      // Find next free slot on this lane
      const nextFree = findFreeSlot(withAsset.placements, chosenLaneId, preferredStart, sketchBars);
      if (nextFree + sketchBars <= SONG_LIMITS.MAX_TOTAL_BARS && !hasPlacementOverlap(withAsset.placements, { id: 'temp', laneId: chosenLaneId, startBar: nextFree, lengthBars: sketchBars })) {
        startBar = nextFree;
      } else {
        // Try other existing lanes at preferredStart, then free slot
        let placed = false;
        for (const lane of withAsset.lanes) {
          if (lane.id === chosenLaneId) continue;
          if (!hasPlacementOverlap(withAsset.placements, { id: 'temp', laneId: lane.id, startBar: preferredStart, lengthBars: sketchBars })) {
            chosenLaneId = lane.id;
            startBar = preferredStart;
            placed = true;
            break;
          }
          const laneSlot = findFreeSlot(withAsset.placements, lane.id, preferredStart, sketchBars);
          if (laneSlot + sketchBars <= SONG_LIMITS.MAX_TOTAL_BARS && !hasPlacementOverlap(withAsset.placements, { id: 'temp', laneId: lane.id, startBar: laneSlot, lengthBars: sketchBars })) {
            chosenLaneId = lane.id;
            startBar = laneSlot;
            placed = true;
            break;
          }
        }

        // If no existing lane fits without overlap, add a new lane if within limit
        if (!placed && withAsset.lanes.length < SONG_LIMITS.MAX_LANES) {
          const newLaneIdx = withAsset.lanes.length + 1;
          const newLane: SongLane = {
            id: `lane-${Date.now()}`,
            name: `Lane ${newLaneIdx}`,
            volumeDb: 0,
            pan: 0,
            mute: false,
            solo: false,
            sendReverb: 0,
            sendDelay: 0,
          };
          withAsset.lanes.push(newLane);
          chosenLaneId = newLane.id;
          startBar = preferredStart;
          placed = true;
        } else if (!placed) {
          // Absolute fallback: search from bar 0 on target lane
          startBar = findFreeSlot(withAsset.placements, chosenLaneId, 0, sketchBars);
        }
      }
    }

    this.selectedLaneId = chosenLaneId;
    this.timeline.setSelectedLane(chosenLaneId);

    const newPlacement: SongPlacement = {
      id: `placement-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      assetId,
      laneId: chosenLaneId,
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

  private toggleMixer() {
    this.mixerPanel.toggle();
    this.header.setMixActive(this.mixerPanel['isOpen']);
  }

  private handleUpdateMaster(master: SongMasterSettings) {
    this.updateSong({ ...this.song, master });
  }

  private handleAutoBalance() {
    const { song: balanced, explanation } = autoBalanceSong(this.song);
    this.updateSong(balanced);
    this.header.setSaveStatus(explanation.slice(0, 28) + '…');
    window.setTimeout(() => this.header.setSaveStatus('Saved'), 3000);
  }

  public async flushSave(): Promise<void> {
    await this.saveSong();
  }

  public async flushAndExitTo(targetHash: string): Promise<void> {
    try {
      this.playbackEngine.stop();
    } catch {}
    try {
      await this.saveSong();
    } catch {}
    try {
      await fadeMasterOut(0.15);
    } catch {}

    try {
      this.dispose();
    } catch {}
    try {
      this.element.remove();
    } catch {}

    if (window.location.hash === targetHash) {
      window.dispatchEvent(new Event('hashchange'));
    } else {
      window.location.hash = targetHash;
    }
  }

  public dispose() {
    try {
      this.playbackEngine.stop();
    } catch {}
    try {
      this.mixerPanel.dispose();
    } catch {}
    try {
      this.exportModal.dispose();
    } catch {}
    try {
      this.fxPanel.destroy();
    } catch {}
    try {
      this.playbackEngine.dispose();
    } catch {}
  }
}
