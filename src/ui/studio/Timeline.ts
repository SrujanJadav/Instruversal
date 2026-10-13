import {
  Song,
  SongPlacement,
  SongLane,
} from '../../song/types';
import {
  hasPlacementOverlap,
  findFreeSlot,
  trimPlacementLeft,
  trimPlacementRight,
} from '../../song/helpers';
import { renderThumbnailCanvas } from '../../gallery/thumbnail';

export interface TimelineCallbacks {
  onSelectPlacement: (placement: SongPlacement | null) => void;
  onUpdatePlacement: (placement: SongPlacement) => void;
  onDeletePlacement: (placementId: string) => void;
  onDuplicatePlacement: (placement: SongPlacement) => void;
  onSplitPlacement: (placementId: string, atBar: number) => void;
  onAddLane: () => void;
  onRemoveLane: (laneId: string) => void;
  onUpdateLane: (lane: SongLane) => void;
  onAddMarker: (bar: number, label: string) => void;
  onSetLoopRegion: (region: { startBar: number; endBar: number } | null) => void;
  onSeek: (bar: number) => void;
  onAddDrawingClick: () => void;
}

export class Timeline {
  public element: HTMLElement;
  private song: Song;
  private callbacks: TimelineCallbacks;
  private pixelsPerBar: number = 120;
  private selectedPlacementIds: Set<string> = new Set();
  private currentPlayheadBar: number = 0;

  private rulerTicksEl: HTMLElement;
  private lanesContainerEl: HTMLElement;
  private playheadLineEl: HTMLElement;
  private scrollWrapperEl: HTMLElement;
  private loopRegionEl: HTMLElement;

  constructor(song: Song, callbacks: TimelineCallbacks) {
    this.song = song;
    this.callbacks = callbacks;

    this.element = document.createElement('div');
    this.element.className = 'studio-timeline-container';

    this.element.innerHTML = `
      <div class="studio-ruler-track-wrapper" id="studio-scroll-wrapper">
        <div class="studio-ruler" id="studio-ruler">
          <div class="studio-ruler-corner">
            <span>LANES</span>
            <button type="button" class="studio-mini-btn" id="studio-add-lane-btn" title="Add lane" style="margin-left: auto;">+</button>
          </div>
          <div class="studio-ruler-ticks" id="studio-ruler-ticks">
            <div class="studio-loop-region-highlight" id="studio-loop-region" style="display: none;"></div>
          </div>
        </div>
        <div class="studio-lanes" id="studio-lanes"></div>
        <div class="studio-playhead-line" id="studio-playhead" style="left: 140px;">
          <div class="studio-playhead-head"></div>
        </div>
      </div>
    `;

    this.scrollWrapperEl = this.element.querySelector('#studio-scroll-wrapper')!;
    this.rulerTicksEl = this.element.querySelector('#studio-ruler-ticks')!;
    this.lanesContainerEl = this.element.querySelector('#studio-lanes')!;
    this.playheadLineEl = this.element.querySelector('#studio-playhead')!;
    this.loopRegionEl = this.element.querySelector('#studio-loop-region')!;

    this.setupListeners();
    this.render();
  }

  public setSong(song: Song) {
    this.song = song;
    this.render();
  }

  public setZoom(pixelsPerBar: number) {
    this.pixelsPerBar = Math.max(60, Math.min(360, pixelsPerBar));
    this.render();
    this.updatePlayhead(this.currentPlayheadBar);
  }

  public getZoom(): number {
    return this.pixelsPerBar;
  }

  public updatePlayhead(bar: number) {
    this.currentPlayheadBar = bar;
    const headerWidth = 140;
    const left = headerWidth + bar * this.pixelsPerBar;
    this.playheadLineEl.style.left = `${left}px`;
  }

  public getSelectedPlacement(): SongPlacement | null {
    if (this.selectedPlacementIds.size === 0) return null;
    const id = Array.from(this.selectedPlacementIds)[0];
    return this.song.placements.find((p) => p.id === id) || null;
  }

  public clearSelection() {
    this.selectedPlacementIds.clear();
    this.renderClips();
    this.callbacks.onSelectPlacement(null);
  }

  private setupListeners() {
    // Add lane
    this.element.querySelector('#studio-add-lane-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onAddLane();
    });

    // Ruler click / drag for seek and markers
    this.rulerTicksEl.addEventListener('click', (e) => {
      const rect = this.rulerTicksEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const bar = Math.max(0, Math.floor(clickX / this.pixelsPerBar));

      if (e.shiftKey) {
        // Add marker
        const label = window.prompt('Marker label (e.g. Verse, Chorus):', 'Section');
        if (label && label.trim()) {
          this.callbacks.onAddMarker(bar, label.trim().slice(0, 24));
        }
      } else {
        // Seek playhead
        this.updatePlayhead(bar);
        this.callbacks.onSeek(bar);
      }
    });

    // Ctrl+wheel zoom on desktop
    this.scrollWrapperEl.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 20 : -20;
        this.setZoom(this.pixelsPerBar + delta);
      }
    }, { passive: false });
  }

  public render() {
    this.renderRuler();
    this.renderLanes();
    this.renderClips();
    this.renderMarkers();
    this.renderLoopRegion();
  }

  private renderRuler() {
    const totalBars = Math.max(16, this.song.totalBars + 8);
    const width = totalBars * this.pixelsPerBar;
    this.rulerTicksEl.style.width = `${width}px`;

    // Clear old bars except loop region
    const oldBars = this.rulerTicksEl.querySelectorAll('.studio-ruler-bar');
    oldBars.forEach((el) => el.remove());

    for (let bar = 0; bar < totalBars; bar++) {
      const barEl = document.createElement('div');
      barEl.className = 'studio-ruler-bar';
      barEl.style.left = `${bar * this.pixelsPerBar}px`;
      barEl.style.width = `${this.pixelsPerBar}px`;
      barEl.textContent = String(bar + 1);
      this.rulerTicksEl.appendChild(barEl);
    }
  }

  private renderMarkers() {
    const oldMarkers = this.rulerTicksEl.querySelectorAll('.studio-marker-flag');
    oldMarkers.forEach((m) => m.remove());

    this.song.markers.forEach((m) => {
      const flag = document.createElement('div');
      flag.className = 'studio-marker-flag';
      flag.style.left = `${m.bar * this.pixelsPerBar}px`;
      flag.textContent = m.label;
      flag.title = `${m.label} (Bar ${m.bar + 1})`;

      flag.addEventListener('click', (e) => {
        e.stopPropagation();
        this.updatePlayhead(m.bar);
        this.callbacks.onSeek(m.bar);
      });

      this.rulerTicksEl.appendChild(flag);
    });
  }

  private renderLoopRegion() {
    if (this.song.loopRegion) {
      const { startBar, endBar } = this.song.loopRegion;
      this.loopRegionEl.style.display = 'block';
      this.loopRegionEl.style.left = `${startBar * this.pixelsPerBar}px`;
      this.loopRegionEl.style.width = `${(endBar - startBar) * this.pixelsPerBar}px`;
    } else {
      this.loopRegionEl.style.display = 'none';
    }
  }

  private renderLanes() {
    this.lanesContainerEl.innerHTML = '';
    const totalBars = Math.max(16, this.song.totalBars + 8);
    const width = totalBars * this.pixelsPerBar;

    this.song.lanes.forEach((lane) => {
      const laneRow = document.createElement('div');
      laneRow.className = 'studio-lane-row';
      laneRow.dataset.laneId = lane.id;

      laneRow.innerHTML = `
        <div class="studio-lane-header">
          <div class="studio-lane-header-top">
            <span class="studio-lane-name" title="${lane.name}">${lane.name}</span>
            <button type="button" class="studio-mini-btn" data-action="remove-lane" title="Remove lane" ${this.song.lanes.length <= 1 ? 'style="display: none;"' : ''}>×</button>
          </div>
          <div class="studio-lane-controls">
            <button type="button" class="studio-mini-btn ${lane.mute ? 'active' : ''}" data-action="mute">M</button>
            <button type="button" class="studio-mini-btn ${lane.solo ? 'active-solo' : ''}" data-action="solo">S</button>
          </div>
        </div>
        <div class="studio-lane-track-area" style="width: ${width}px;"></div>
      `;

      laneRow.querySelector('[data-action="remove-lane"]')?.addEventListener('click', () => {
        this.callbacks.onRemoveLane(lane.id);
      });

      laneRow.querySelector('[data-action="mute"]')?.addEventListener('click', () => {
        this.callbacks.onUpdateLane({ ...lane, mute: !lane.mute });
      });

      laneRow.querySelector('[data-action="solo"]')?.addEventListener('click', () => {
        this.callbacks.onUpdateLane({ ...lane, solo: !lane.solo });
      });

      this.lanesContainerEl.appendChild(laneRow);
    });

    if (this.song.placements.length === 0) {
      const emptyContainer = document.createElement('div');
      emptyContainer.className = 'studio-empty-state';
      emptyContainer.innerHTML = `
        <p class="studio-empty-msg">Nothing here yet. Add a drawing.</p>
        <button type="button" class="studio-btn studio-btn-primary" id="studio-empty-add-btn">Add drawing</button>
      `;
      emptyContainer.querySelector('#studio-empty-add-btn')?.addEventListener('click', () => {
        this.callbacks.onAddDrawingClick();
      });
      this.lanesContainerEl.appendChild(emptyContainer);
    }
  }

  private renderClips() {
    // Remove existing clips from DOM
    const oldClips = this.lanesContainerEl.querySelectorAll('.studio-clip');
    oldClips.forEach((c) => c.remove());

    this.song.placements.forEach((placement) => {
      const laneRow = this.lanesContainerEl.querySelector(`[data-lane-id="${placement.laneId}"]`);
      if (!laneRow) return;
      const trackArea = laneRow.querySelector('.studio-lane-track-area');
      if (!trackArea) return;

      const asset = this.song.assets[placement.assetId];
      const clipEl = document.createElement('div');
      clipEl.className = `studio-clip ${this.selectedPlacementIds.has(placement.id) ? 'selected' : ''}`;
      clipEl.dataset.placementId = placement.id;
      clipEl.setAttribute('role', 'button');
      clipEl.setAttribute(
        'aria-label',
        `${asset?.name || 'Sketch'}, bar ${placement.startBar + 1}, ${placement.lengthBars} bars`
      );
      clipEl.tabIndex = 0;

      const leftPx = placement.startBar * this.pixelsPerBar;
      const widthPx = placement.lengthBars * this.pixelsPerBar;

      clipEl.style.left = `${leftPx}px`;
      clipEl.style.width = `${widthPx}px`;

      clipEl.innerHTML = `
        <div class="studio-clip-handle studio-clip-handle-left" data-handle="left" title="Trim left"></div>
        <div class="studio-clip-header">
          <span class="studio-clip-title">${asset?.name || 'Sketch'}</span>
          <span class="studio-clip-len">${placement.lengthBars}b</span>
        </div>
        <div class="studio-clip-canvas-container"></div>
        <div class="studio-clip-handle studio-clip-handle-right" data-handle="right" title="Extend/trim right"></div>
      `;

      // Render thumbnail inside clip
      const canvasContainer = clipEl.querySelector('.studio-clip-canvas-container')!;
      if (asset) {
        const thumb = renderThumbnailCanvas({ id: placement.assetId, strokes: asset.project.strokes }, 120, 60);
        thumb.className = 'studio-clip-thumb';
        canvasContainer.appendChild(thumb);
      }

      this.attachClipGestures(clipEl, placement);
      trackArea.appendChild(clipEl);
    });
  }

  private updateClipSelectionClasses() {
    this.lanesContainerEl.querySelectorAll<HTMLElement>('.studio-clip').forEach((el) => {
      const pid = el.dataset.placementId;
      if (pid && this.selectedPlacementIds.has(pid)) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  private attachClipGestures(clipEl: HTMLElement, placement: SongPlacement) {
    let startX = 0;
    let initialBar = placement.startBar;
    let initialLen = placement.lengthBars;
    let isDragging = false;
    let activeHandle: 'left' | 'right' | 'move' | null = null;
    let longPressTimer: any = null;

    const onPointerDown = (e: PointerEvent) => {
      // Don't intercept right click
      if (e.button !== 0) return;
      startX = e.clientX;
      initialBar = placement.startBar;
      initialLen = placement.lengthBars;

      const target = e.target as HTMLElement;
      if (target.dataset.handle === 'left') {
        activeHandle = 'left';
      } else if (target.dataset.handle === 'right') {
        activeHandle = 'right';
      } else {
        activeHandle = 'move';
      }

      // Selection handling
      if (!e.shiftKey) {
        this.selectedPlacementIds.clear();
      }
      this.selectedPlacementIds.add(placement.id);
      this.updateClipSelectionClasses();
      this.callbacks.onSelectPlacement(placement);

      // On mobile touch, require 300ms long press to initiate drag to allow normal scroll
      if (e.pointerType === 'touch') {
        longPressTimer = setTimeout(() => {
          isDragging = true;
          clipEl.classList.add('dragging');
          try {
            clipEl.setPointerCapture(e.pointerId);
          } catch {}
        }, 300);
      } else {
        isDragging = true;
        clipEl.classList.add('dragging');
        try {
          clipEl.setPointerCapture(e.pointerId);
        } catch {}
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || !activeHandle) return;
      const deltaX = e.clientX - startX;
      const deltaBars = Math.round(deltaX / this.pixelsPerBar);

      if (activeHandle === 'move') {
        const targetBar = Math.max(0, initialBar + deltaBars);
        clipEl.style.left = `${targetBar * this.pixelsPerBar}px`;
      } else if (activeHandle === 'right') {
        const targetLen = Math.max(1, initialLen + deltaBars);
        clipEl.style.width = `${targetLen * this.pixelsPerBar}px`;
      } else if (activeHandle === 'left') {
        const targetStart = Math.max(0, Math.min(initialBar + initialLen - 1, initialBar + deltaBars));
        const diff = targetStart - initialBar;
        clipEl.style.left = `${targetStart * this.pixelsPerBar}px`;
        clipEl.style.width = `${Math.max(1, initialLen - diff) * this.pixelsPerBar}px`;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!isDragging) {
        activeHandle = null;
        return;
      }

      isDragging = false;
      clipEl.classList.remove('dragging');
      try {
        clipEl.releasePointerCapture(e.pointerId);
      } catch {}

      const deltaX = e.clientX - startX;
      const deltaBars = Math.round(deltaX / this.pixelsPerBar);

      if (activeHandle === 'move') {
        const targetBar = Math.max(0, initialBar + deltaBars);
        const candidate: SongPlacement = { ...placement, startBar: targetBar };

        if (!hasPlacementOverlap(this.song.placements, candidate)) {
          this.callbacks.onUpdatePlacement(candidate);
        } else {
          // Snap to nearest free slot or revert
          const freeSlot = findFreeSlot(this.song.placements, placement.laneId, targetBar, placement.lengthBars);
          this.callbacks.onUpdatePlacement({ ...placement, startBar: freeSlot });
        }
      } else if (activeHandle === 'right') {
        const targetLen = Math.max(1, initialLen + deltaBars);
        const trimmed = trimPlacementRight(placement, targetLen);
        if (!hasPlacementOverlap(this.song.placements, trimmed)) {
          this.callbacks.onUpdatePlacement(trimmed);
        } else {
          this.renderClips();
        }
      } else if (activeHandle === 'left') {
        const targetStart = Math.max(0, Math.min(initialBar + initialLen - 1, initialBar + deltaBars));
        const trimmed = trimPlacementLeft(placement, targetStart);
        if (!hasPlacementOverlap(this.song.placements, trimmed)) {
          this.callbacks.onUpdatePlacement(trimmed);
        } else {
          this.renderClips();
        }
      }

      activeHandle = null;
    };

    clipEl.addEventListener('pointerdown', onPointerDown);
    clipEl.addEventListener('pointermove', onPointerMove);
    clipEl.addEventListener('pointerup', onPointerUp);
    clipEl.addEventListener('pointercancel', onPointerUp);

    // Keyboard controls on focused clip
    clipEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          this.callbacks.onUpdatePlacement({ ...placement, lengthBars: placement.lengthBars + 1 });
        } else {
          const target = placement.startBar + 1;
          if (!hasPlacementOverlap(this.song.placements, { ...placement, startBar: target })) {
            this.callbacks.onUpdatePlacement({ ...placement, startBar: target });
          }
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          if (placement.lengthBars > 1) {
            this.callbacks.onUpdatePlacement({ ...placement, lengthBars: placement.lengthBars - 1 });
          }
        } else {
          const target = Math.max(0, placement.startBar - 1);
          if (!hasPlacementOverlap(this.song.placements, { ...placement, startBar: target })) {
            this.callbacks.onUpdatePlacement({ ...placement, startBar: target });
          }
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.callbacks.onDeletePlacement(placement.id);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.callbacks.onDuplicatePlacement(placement);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.callbacks.onSplitPlacement(placement.id, this.currentPlayheadBar);
      }
    });
  }
}
