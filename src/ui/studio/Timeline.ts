import {
  Song,
  SongPlacement,
  SongLane,
  SONG_LIMITS,
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
  onSelectLane?: (laneId: string) => void;
}

export class Timeline {
  public element: HTMLElement;
  private song: Song;
  private callbacks: TimelineCallbacks;
  private pixelsPerBar: number = 120;
  private selectedPlacementIds: Set<string> = new Set();
  private selectedLaneId: string | null = null;
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

  public pulseClip(placementId: string) {
    const clipEl = this.lanesContainerEl.querySelector<HTMLElement>(`[data-placement-id="${placementId}"]`);
    if (clipEl) {
      clipEl.classList.add('sounding');
      window.setTimeout(() => {
        clipEl.classList.remove('sounding');
      }, 120);
    }
  }

  public scrollToBar(bar: number) {
    const headerWidth = 140;
    const playheadPx = headerWidth + bar * this.pixelsPerBar;
    const scrollLeft = this.scrollWrapperEl.scrollLeft;
    const viewportWidth = this.scrollWrapperEl.clientWidth;

    // Follow playhead if it approaches or exceeds visible bounds
    if (playheadPx > scrollLeft + viewportWidth * 0.75 || playheadPx < scrollLeft + 50) {
      this.scrollWrapperEl.scrollLeft = Math.max(0, playheadPx - viewportWidth * 0.35);
    }
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

  public selectLane(laneId: string) {
    this.selectedLaneId = laneId;
    this.lanesContainerEl.querySelectorAll<HTMLElement>('.studio-lane-row').forEach((row) => {
      if (row.dataset.laneId === laneId) {
        row.classList.add('selected');
      } else {
        row.classList.remove('selected');
      }
    });
    this.callbacks.onSelectLane?.(laneId);
  }

  public getSelectedLaneId(): string | null {
    return this.selectedLaneId || (this.song.lanes[0]?.id ?? null);
  }

  public setSelectedLane(laneId: string | null) {
    this.selectedLaneId = laneId;
    this.lanesContainerEl.querySelectorAll<HTMLElement>('.studio-lane-row').forEach((row) => {
      if (row.dataset.laneId === laneId) {
        row.classList.add('selected');
      } else {
        row.classList.remove('selected');
      }
    });
  }

  private renderLanes() {
    this.lanesContainerEl.innerHTML = '';
    const totalBars = Math.max(16, this.song.totalBars + 8);
    const width = totalBars * this.pixelsPerBar;

    if (!this.selectedLaneId && this.song.lanes.length > 0) {
      this.selectedLaneId = this.song.lanes[0].id;
    }

    this.song.lanes.forEach((lane, index) => {
      const isSelected = this.selectedLaneId === lane.id;
      const laneRow = document.createElement('div');
      laneRow.className = `studio-lane-row ${isSelected ? 'selected' : ''}`;
      laneRow.dataset.laneId = lane.id;
      laneRow.tabIndex = 0;
      laneRow.setAttribute('role', 'region');
      laneRow.setAttribute('aria-label', `${lane.name}`);

      laneRow.innerHTML = `
        <div class="studio-lane-header">
          <div class="studio-lane-header-top">
            <span class="studio-lane-name" title="${lane.name}">${lane.name}</span>
            <button type="button" class="studio-mini-btn" data-action="remove-lane" title="Remove lane" ${this.song.lanes.length <= 1 ? 'style="display: none;"' : ''}>×</button>
          </div>
          <div class="studio-lane-controls">
            <button type="button" class="studio-mini-btn ${lane.mute ? 'active' : ''}" data-action="mute" aria-label="${lane.name} Mute">M</button>
            <button type="button" class="studio-mini-btn ${lane.solo ? 'active-solo' : ''}" data-action="solo" aria-label="${lane.name} Solo">S</button>
          </div>
        </div>
        <div class="studio-lane-track-area" style="width: ${width}px;"></div>
      `;

      laneRow.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button, input, .studio-clip')) return;
        this.selectLane(lane.id);
      });

      laneRow.addEventListener('keydown', (e) => {
        if ((e.target as HTMLElement).closest('button, input, .studio-clip')) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIdx = Math.min(this.song.lanes.length - 1, index + 1);
          const nextLane = this.song.lanes[nextIdx];
          this.selectLane(nextLane.id);
          const nextEl = this.lanesContainerEl.querySelector<HTMLElement>(`[data-lane-id="${nextLane.id}"]`);
          nextEl?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIdx = Math.max(0, index - 1);
          const prevLane = this.song.lanes[prevIdx];
          this.selectLane(prevLane.id);
          const prevEl = this.lanesContainerEl.querySelector<HTMLElement>(`[data-lane-id="${prevLane.id}"]`);
          prevEl?.focus();
        }
      });

      laneRow.querySelector('[data-action="remove-lane"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onRemoveLane(lane.id);
      });

      laneRow.querySelector('[data-action="mute"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onUpdateLane({ ...lane, mute: !lane.mute });
      });

      laneRow.querySelector('[data-action="solo"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
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
    let startY = 0;
    let initialBar = placement.startBar;
    let initialLen = placement.lengthBars;
    let initialLaneIndex = 0;
    let isDragging = false;
    let activeHandle: 'left' | 'right' | 'move' | null = null;
    let longPressTimer: any = null;

    const onPointerDown = (e: PointerEvent) => {
      // Don't intercept right click
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      initialBar = placement.startBar;
      initialLen = placement.lengthBars;
      initialLaneIndex = this.song.lanes.findIndex((l) => l.id === placement.laneId);
      if (initialLaneIndex < 0) initialLaneIndex = 0;

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
        const deltaY = e.clientY - startY;
        const deltaLanes = Math.round(deltaY / 90);
        const targetBar = Math.max(0, initialBar + deltaBars);
        clipEl.style.left = `${targetBar * this.pixelsPerBar}px`;
        clipEl.style.transform = `translateY(${deltaLanes * 90}px)`;
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
      clipEl.style.transform = '';
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
        const deltaY = e.clientY - startY;
        const deltaLanes = Math.round(deltaY / 90);
        const targetLaneIdx = Math.max(0, Math.min(this.song.lanes.length - 1, initialLaneIndex + deltaLanes));
        const targetLane = this.song.lanes[targetLaneIdx];
        const targetBar = Math.max(0, initialBar + deltaBars);
        const candidate: SongPlacement = { ...placement, laneId: targetLane.id, startBar: targetBar };

        if (!hasPlacementOverlap(this.song.placements, candidate)) {
          this.callbacks.onUpdatePlacement(candidate);
        } else {
          // Snap to nearest free slot on target lane or revert
          const freeSlot = findFreeSlot(this.song.placements, targetLane.id, targetBar, placement.lengthBars);
          const freeCandidate: SongPlacement = { ...placement, laneId: targetLane.id, startBar: freeSlot };
          if (freeSlot + placement.lengthBars <= SONG_LIMITS.MAX_TOTAL_BARS && !hasPlacementOverlap(this.song.placements, freeCandidate)) {
            this.callbacks.onUpdatePlacement(freeCandidate);
          } else {
            this.renderClips();
          }
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
