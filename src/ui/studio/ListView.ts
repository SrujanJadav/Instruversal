import { Song, SongPlacement } from '../../song/types';

export interface ListViewCallbacks {
  onUpdatePlacement: (placement: SongPlacement) => void;
  onDeletePlacement: (placementId: string) => void;
  onMovePlacementLane: (placementId: string, direction: 'up' | 'down') => void;
}

export class ListView {
  public element: HTMLElement;
  private callbacks: ListViewCallbacks;

  constructor(callbacks: ListViewCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'studio-list-view';
    this.element.style.display = 'none';
  }

  public render(song: Song) {
    this.element.innerHTML = '';

    if (song.placements.length === 0) {
      this.element.innerHTML = `
        <div class="studio-empty-state">
          <p class="studio-empty-msg">Nothing here yet. Add a drawing.</p>
        </div>
      `;
      return;
    }

    song.lanes.forEach((lane, laneIdx) => {
      const laneContainer = document.createElement('section');
      laneContainer.className = 'studio-list-lane';
      laneContainer.setAttribute('aria-label', `${lane.name} clips`);

      const laneHeader = document.createElement('div');
      laneHeader.style.cssText = 'font-weight: 600; font-size: 0.85rem; border-bottom: 1px solid var(--line); padding-bottom: 4px;';
      laneHeader.textContent = lane.name;
      laneContainer.appendChild(laneHeader);

      const lanePlacements = song.placements
        .filter((p) => p.laneId === lane.id)
        .sort((a, b) => a.startBar - b.startBar);

      if (lanePlacements.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'font-size: 0.78rem; color: var(--ink-soft); font-style: italic;';
        emptyMsg.textContent = 'No clips on this lane';
        laneContainer.appendChild(emptyMsg);
      } else {
        lanePlacements.forEach((p) => {
          const asset = song.assets[p.assetId];
          const row = document.createElement('div');
          row.className = 'studio-list-item';

          row.innerHTML = `
            <div style="flex: 1; min-width: 120px;">
              <div style="font-weight: 600; font-size: 0.8rem;">${asset?.name || 'Sketch'}</div>
              <div style="font-size: 0.72rem; color: var(--ink-soft); font-family: var(--font-mono, monospace);">Bar ${p.startBar + 1} (${p.lengthBars} bars)</div>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;">
              <label style="font-size: 0.75rem; color: var(--ink-soft);">
                Start
                <input type="number" class="studio-field-input" data-field="start" min="0" max="127" value="${p.startBar}" style="width: 50px;" />
              </label>
              <label style="font-size: 0.75rem; color: var(--ink-soft);">
                Len
                <input type="number" class="studio-field-input" data-field="len" min="1" max="128" value="${p.lengthBars}" style="width: 50px;" />
              </label>
              <button type="button" class="studio-mini-btn" data-action="up" title="Move to upper lane" ${laneIdx === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="studio-mini-btn" data-action="down" title="Move to lower lane" ${laneIdx === song.lanes.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="studio-mini-btn" data-action="delete" title="Delete clip" style="color: var(--vermilion, #D2432A);">✕</button>
            </div>
          `;

          const startInput = row.querySelector<HTMLInputElement>('[data-field="start"]');
          startInput?.addEventListener('change', () => {
            const val = Math.max(0, parseInt(startInput.value) || 0);
            this.callbacks.onUpdatePlacement({ ...p, startBar: val });
          });

          const lenInput = row.querySelector<HTMLInputElement>('[data-field="len"]');
          lenInput?.addEventListener('change', () => {
            const val = Math.max(1, parseInt(lenInput.value) || 1);
            this.callbacks.onUpdatePlacement({ ...p, lengthBars: val });
          });

          row.querySelector('[data-action="up"]')?.addEventListener('click', () => {
            this.callbacks.onMovePlacementLane(p.id, 'up');
          });

          row.querySelector('[data-action="down"]')?.addEventListener('click', () => {
            this.callbacks.onMovePlacementLane(p.id, 'down');
          });

          row.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
            this.callbacks.onDeletePlacement(p.id);
          });

          laneContainer.appendChild(row);
        });
      }

      this.element.appendChild(laneContainer);
    });
  }

  public show() {
    this.element.style.display = 'flex';
  }

  public hide() {
    this.element.style.display = 'none';
  }
}
