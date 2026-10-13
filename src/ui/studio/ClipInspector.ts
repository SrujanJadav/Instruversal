import { SongPlacement, SongAsset } from '../../song/types';
import { getCreationStore } from '../../library/store';

export interface ClipInspectorCallbacks {
  onUpdatePlacement: (placement: SongPlacement) => void;
  onDeletePlacement: (placementId: string) => void;
  onReplaceDrawing: (placement: SongPlacement) => void;
  onUpdateFromOriginal: (assetId: string) => void;
  onEditDrawing: (assetId: string) => void;
}

export class ClipInspector {
  public element: HTMLElement;
  private currentPlacement: SongPlacement | null = null;
  private currentAsset: SongAsset | null = null;
  private callbacks: ClipInspectorCallbacks;

  constructor(callbacks: ClipInspectorCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('aside');
    this.element.className = 'studio-inspector';
    this.element.style.display = 'none';
  }

  public async inspect(placement: SongPlacement | null, asset: SongAsset | null) {
    this.currentPlacement = placement;
    this.currentAsset = asset;

    if (!placement || !asset) {
      this.element.style.display = 'none';
      return;
    }

    this.element.style.display = 'flex';
    this.render();
  }

  private async render() {
    if (!this.currentPlacement || !this.currentAsset) return;
    const p = this.currentPlacement;
    const a = this.currentAsset;

    let hasSourceUpdate = false;
    if (a.sourceCreationId) {
      try {
        const store = getCreationStore();
        const sourceCreation = await store.get(a.sourceCreationId);
        if (sourceCreation && a.sourceUpdatedAt && sourceCreation.updatedAt > Number(a.sourceUpdatedAt)) {
          hasSourceUpdate = true;
        }
      } catch {}
    }

    this.element.innerHTML = `
      <div class="studio-inspector-title">Clip Inspector</div>

      <div class="studio-field-row">
        <span class="studio-field-label">Drawing</span>
        <span style="font-weight: 600; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis;">${a.name}</span>
      </div>

      <div class="studio-field-row">
        <span class="studio-field-label">Start bar</span>
        <input type="number" class="studio-field-input" id="insp-start" min="0" max="127" value="${p.startBar}" />
      </div>

      <div class="studio-field-row">
        <span class="studio-field-label">Length (bars)</span>
        <input type="number" class="studio-field-input" id="insp-len" min="1" max="128" value="${p.lengthBars}" />
      </div>

      <div class="studio-field-row">
        <span class="studio-field-label">Gain (dB)</span>
        <input type="number" class="studio-field-input" id="insp-gain" min="-36" max="6" value="${p.gainDb}" />
      </div>

      <div class="studio-field-row">
        <span class="studio-field-label">Transpose (st)</span>
        <input type="number" class="studio-field-input" id="insp-transpose" min="-24" max="24" value="${p.transpose}" />
      </div>

      <div class="studio-field-row">
        <span class="studio-field-label">Fade in (bars)</span>
        <input type="number" class="studio-field-input" id="insp-fadein" min="0" max="4" value="${p.fadeInBars}" />
      </div>

      <div class="studio-field-row">
        <span class="studio-field-label">Fade out (bars)</span>
        <input type="number" class="studio-field-input" id="insp-fadeout" min="0" max="4" value="${p.fadeOutBars}" />
      </div>

      <div class="studio-field-row">
        <span class="studio-field-label">Mute clip</span>
        <input type="checkbox" id="insp-mute" ${p.mute ? 'checked' : ''} />
      </div>

      <div style="display: flex; gap: 4px; margin-top: 6px;">
        <span style="font-size: 0.75rem; color: var(--ink-soft); align-self: center;">Repeat:</span>
        <button type="button" class="studio-mini-btn" id="insp-rep-1">1×</button>
        <button type="button" class="studio-mini-btn" id="insp-rep-2">2×</button>
        <button type="button" class="studio-mini-btn" id="insp-rep-4">4×</button>
      </div>

      ${
        hasSourceUpdate
          ? `<button type="button" class="studio-btn" id="insp-update-orig-btn" style="color: var(--vermilion, #D2432A);">Update from original</button>`
          : ''
      }

      <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
        <button type="button" class="studio-btn" id="insp-replace-btn">Replace drawing</button>
        <button type="button" class="studio-btn" id="insp-edit-drawing-btn">Edit drawing</button>
        <button type="button" class="studio-btn" id="insp-delete-btn" style="color: var(--vermilion, #D2432A);">Delete clip</button>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents() {
    if (!this.currentPlacement) return;
    const p = this.currentPlacement;

    const startInput = this.element.querySelector<HTMLInputElement>('#insp-start');
    startInput?.addEventListener('change', () => {
      const val = Math.max(0, parseInt(startInput.value) || 0);
      startInput.value = String(val);
      this.callbacks.onUpdatePlacement({ ...p, startBar: val });
    });

    const lenInput = this.element.querySelector<HTMLInputElement>('#insp-len');
    lenInput?.addEventListener('change', () => {
      const val = Math.max(1, parseInt(lenInput.value) || 1);
      lenInput.value = String(val);
      this.callbacks.onUpdatePlacement({ ...p, lengthBars: val });
    });

    const gainInput = this.element.querySelector<HTMLInputElement>('#insp-gain');
    gainInput?.addEventListener('change', () => {
      const val = Math.max(-36, Math.min(6, parseFloat(gainInput.value) || 0));
      gainInput.value = String(val);
      this.callbacks.onUpdatePlacement({ ...p, gainDb: val });
    });

    const transInput = this.element.querySelector<HTMLInputElement>('#insp-transpose');
    transInput?.addEventListener('change', () => {
      const val = Math.max(-24, Math.min(24, parseInt(transInput.value) || 0));
      transInput.value = String(val);
      this.callbacks.onUpdatePlacement({ ...p, transpose: val });
    });

    const fadeInInput = this.element.querySelector<HTMLInputElement>('#insp-fadein');
    fadeInInput?.addEventListener('change', () => {
      const val = Math.max(0, Math.min(4, parseInt(fadeInInput.value) || 0));
      fadeInInput.value = String(val);
      this.callbacks.onUpdatePlacement({ ...p, fadeInBars: val });
    });

    const fadeOutInput = this.element.querySelector<HTMLInputElement>('#insp-fadeout');
    fadeOutInput?.addEventListener('change', () => {
      const val = Math.max(0, Math.min(4, parseInt(fadeOutInput.value) || 0));
      fadeOutInput.value = String(val);
      this.callbacks.onUpdatePlacement({ ...p, fadeOutBars: val });
    });

    const muteInput = this.element.querySelector<HTMLInputElement>('#insp-mute');
    muteInput?.addEventListener('change', () => {
      this.callbacks.onUpdatePlacement({ ...p, mute: Boolean(muteInput.checked) });
    });

    // Repeat shortcuts
    const loopBars = this.currentAsset?.project?.bars ?? 2;
    this.element.querySelector('#insp-rep-1')?.addEventListener('click', () => {
      this.callbacks.onUpdatePlacement({ ...p, lengthBars: loopBars });
    });
    this.element.querySelector('#insp-rep-2')?.addEventListener('click', () => {
      this.callbacks.onUpdatePlacement({ ...p, lengthBars: loopBars * 2 });
    });
    this.element.querySelector('#insp-rep-4')?.addEventListener('click', () => {
      this.callbacks.onUpdatePlacement({ ...p, lengthBars: loopBars * 4 });
    });

    this.element.querySelector('#insp-update-orig-btn')?.addEventListener('click', () => {
      this.callbacks.onUpdateFromOriginal(p.assetId);
    });

    this.element.querySelector('#insp-replace-btn')?.addEventListener('click', () => {
      this.callbacks.onReplaceDrawing(p);
    });

    this.element.querySelector('#insp-edit-drawing-btn')?.addEventListener('click', () => {
      this.callbacks.onEditDrawing(p.assetId);
    });

    this.element.querySelector('#insp-delete-btn')?.addEventListener('click', () => {
      this.callbacks.onDeletePlacement(p.id);
    });
  }
}
