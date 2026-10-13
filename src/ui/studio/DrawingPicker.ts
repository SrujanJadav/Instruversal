import { CreationMeta, Creation } from '../../library/types';
import { getCreationStore } from '../../library/store';
import { renderThumbnailCanvas } from '../../gallery/thumbnail';
import { getPreviewEngine } from '../../audio/preview';

export interface DrawingPickerCallbacks {
  onSelectCreation: (creation: Creation) => void;
  onClose: () => void;
}

export class DrawingPicker {
  private overlay: HTMLElement;
  private cardsContainer: HTMLElement;
  private searchInput: HTMLInputElement;
  private creations: CreationMeta[] = [];
  private callbacks: DrawingPickerCallbacks;
  private openerElement: HTMLElement | null = null;

  constructor(callbacks: DrawingPickerCallbacks) {
    this.callbacks = callbacks;
    this.overlay = document.createElement('div');
    this.overlay.className = 'studio-sheet-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Add drawing to song');

    this.overlay.innerHTML = `
      <div class="studio-sheet">
        <header class="studio-sheet-header">
          <h2 style="font-size: 0.95rem; font-weight: 600;">Add drawing to timeline</h2>
          <button type="button" class="studio-btn studio-btn-icon" id="picker-close-btn" aria-label="Close picker">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3l10 10M13 3L3 13"/></svg>
          </button>
        </header>
        <div style="padding: 10px 16px; border-bottom: 1px solid var(--line);">
          <input type="search" class="library-search-input" id="picker-search-input" placeholder="Search drawings…" aria-label="Search drawings" />
        </div>
        <div class="picker-cards-scroll" style="flex: 1; overflow-y: auto; padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;" id="picker-cards-grid">
          <div style="color: var(--ink-soft); font-size: 0.85rem; padding: 16px;">Loading drawings…</div>
        </div>
      </div>
    `;

    this.cardsContainer = this.overlay.querySelector('#picker-cards-grid')!;
    this.searchInput = this.overlay.querySelector('#picker-search-input')!;

    this.bindEvents();
  }

  private bindEvents() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    this.overlay.querySelector('#picker-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    this.searchInput.addEventListener('input', () => {
      this.renderCards(this.searchInput.value.toLowerCase().trim());
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.contains(this.overlay)) {
        this.close();
      }
    });
  }

  public async open() {
    this.openerElement = document.activeElement as HTMLElement | null;
    document.body.appendChild(this.overlay);

    const store = getCreationStore();
    this.creations = await store.list();
    this.renderCards('');
    this.searchInput.focus();
  }

  public close() {
    getPreviewEngine().cancelPreview();
    if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.callbacks.onClose();
    this.openerElement?.focus();
  }

  private renderCards(query: string) {
    this.cardsContainer.innerHTML = '';

    const filtered = this.creations.filter((c) =>
      query ? c.title.toLowerCase().includes(query) : true
    );

    if (filtered.length === 0) {
      this.cardsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; color: var(--ink-soft); font-size: 0.85rem; text-align: center; padding: 32px 0;">
          ${query ? 'No drawings match your search.' : 'No saved drawings yet. Draw a sketch first!'}
        </div>
      `;
      return;
    }

    const store = getCreationStore();

    filtered.forEach((meta) => {
      const card = document.createElement('div');
      card.className = 'picker-card';
      card.style.cssText = `
        background-color: var(--paper-deep);
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;

      const thumbCanvas = renderThumbnailCanvas(meta, 180, 120);
      thumbCanvas.style.cssText = 'width: 100%; height: 90px; border-radius: 4px; pointer-events: none;';

      const infoRow = document.createElement('div');
      infoRow.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-weight: 600; font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      titleEl.textContent = meta.title;

      const subEl = document.createElement('div');
      subEl.style.cssText = 'font-size: 0.72rem; color: var(--ink-soft); font-family: var(--font-mono, monospace);';
      subEl.textContent = `${meta.bars} bars · ${meta.bpm} BPM`;

      infoRow.appendChild(titleEl);
      infoRow.appendChild(subEl);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display: flex; gap: 6px; margin-top: auto;';

      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'studio-btn';
      previewBtn.style.cssText = 'flex: 1; padding: 0 4px; height: 28px; font-size: 0.75rem;';
      previewBtn.textContent = 'Audition';

      previewBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fullCreation = await store.get(meta.id);
        const engine = getPreviewEngine();
        const root = fullCreation?.project?.rootNote ?? meta.rootNote ?? 0;
        const scale = fullCreation?.project?.scaleName ?? meta.scaleName ?? 'major pentatonic';
        engine.previewScale(root, scale as any);
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'studio-btn studio-btn-primary';
      addBtn.style.cssText = 'flex: 1; padding: 0 4px; height: 28px; font-size: 0.75rem;';
      addBtn.textContent = 'Add';

      addBtn.addEventListener('click', async () => {
        const fullCreation = await store.get(meta.id);
        if (fullCreation) {
          this.callbacks.onSelectCreation(fullCreation);
          this.close();
        }
      });

      btnRow.appendChild(previewBtn);
      btnRow.appendChild(addBtn);

      card.appendChild(thumbCanvas);
      card.appendChild(infoRow);
      card.appendChild(btnRow);

      this.cardsContainer.appendChild(card);
    });
  }
}
