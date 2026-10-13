import { state, events } from '../state';
import { getTransport } from '../audio/transport';
import { getTotalAudioLatencySeconds } from '../audio/context';

export class HeaderMoreSheet {
  private overlay: HTMLElement;
  private dialog: HTMLElement;
  private isOpen: boolean = false;
  private openerEl: HTMLElement | null = null;
  private onExportCallback: (() => void) | null = null;

  constructor(onExport: () => void) {
    this.onExportCallback = onExport;

    this.overlay = document.createElement('div');
    this.overlay.className = 'header-more-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');

    this.dialog = document.createElement('div');
    this.dialog.className = 'header-more-sheet';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-label', 'More actions');

    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);

    this.setupEvents();
  }

  private setupEvents() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.close();
      }
    });

    events.on('ui:close-all-sheets', () => {
      if (this.isOpen) this.close();
    });
  }

  public open(opener?: HTMLElement) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.openerEl = opener || null;

    events.emit('ui:close-all-sheets', undefined);
    this.render();

    this.overlay.classList.add('visible');
    this.overlay.setAttribute('aria-hidden', 'false');

    // Focus the first action button or close button
    const firstFocusable = this.dialog.querySelector<HTMLElement>('button');
    firstFocusable?.focus();
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('visible');
    this.overlay.setAttribute('aria-hidden', 'true');

    if (this.openerEl && typeof this.openerEl.focus === 'function') {
      this.openerEl.focus();
    }
  }

  private render() {
    const hardwareMs = Math.round(getTotalAudioLatencySeconds() * 1000);
    const offsetMs = state.syncOffsetMs;

    this.dialog.innerHTML = `
      <div class="more-sheet-header">
        <h2 class="more-sheet-title">More Actions</h2>
        <button type="button" class="more-sheet-close" id="more-sheet-close-btn" aria-label="Close more options">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="more-sheet-body">
        <!-- Audio Export Action -->
        <div class="more-sheet-section">
          <div class="more-sheet-section-title">Audio Export</div>
          <p class="more-sheet-desc">Download your creation as lossless WAV, compressed WebM audio, or MIDI sequence.</p>
          <button type="button" class="more-action-btn primary" id="more-export-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export Audio & MIDI</span>
          </button>
        </div>

        <!-- Sync Calibration Action -->
        <div class="more-sheet-section">
          <div class="more-sheet-section-header">
            <span class="more-sheet-section-title">Audio & Visual Sync</span>
            <span class="more-hw-info">Hardware latency ≈ ${hardwareMs}ms</span>
          </div>
          <p class="more-sheet-desc">Compensate for Bluetooth audio latency so lines hit strokes on beat.</p>

          <div class="sync-slider-row">
            <span class="sync-range-lbl">-200ms</span>
            <input type="range" id="more-sync-slider" class="sync-slider"
              min="-200" max="400" step="5" value="${offsetMs}"
              aria-label="Sync offset in milliseconds" />
            <span class="sync-range-lbl">+400ms</span>
          </div>

          <div class="sync-val-row">
            <span class="sync-val-display" id="more-sync-display">${offsetMs >= 0 ? '+' : ''}${offsetMs}ms</span>
            <button type="button" class="sync-reset-btn" id="more-sync-reset">Reset to 0</button>
          </div>
        </div>
      </div>
    `;

    // Bind Close
    this.dialog.querySelector('#more-sheet-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Bind Export
    this.dialog.querySelector('#more-export-btn')?.addEventListener('click', () => {
      this.close();
      if (this.onExportCallback) {
        this.onExportCallback();
      }
    });

    // Bind Sync Slider
    const slider = this.dialog.querySelector<HTMLInputElement>('#more-sync-slider');
    const display = this.dialog.querySelector<HTMLElement>('#more-sync-display');
    const resetBtn = this.dialog.querySelector<HTMLButtonElement>('#more-sync-reset');

    slider?.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      if (display) display.textContent = `${val >= 0 ? '+' : ''}${val}ms`;
      getTransport().setSyncOffset(val);
    });

    resetBtn?.addEventListener('click', () => {
      getTransport().setSyncOffset(0);
      if (slider) slider.value = '0';
      if (display) display.textContent = '+0ms';
    });
  }
}

let moreSheetInstance: HeaderMoreSheet | null = null;

export function getHeaderMoreSheet(onExport: () => void): HeaderMoreSheet {
  if (!moreSheetInstance) {
    moreSheetInstance = new HeaderMoreSheet(onExport);
  }
  return moreSheetInstance;
}
