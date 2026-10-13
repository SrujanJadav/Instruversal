import { state } from '../state';
import { getMasterEffectsRack } from '../audio/effects';
import {
  recordLoopAudio,
  triggerFileDownload,
  getSupportedExportFormats,
  ExportResult,
} from '../export/exportAudio';

export class ExportModal {
  private overlay: HTMLElement;
  private isOpen: boolean = false;
  private openerElement: HTMLElement | null = null;
  private activeCancelFn: (() => void) | null = null;
  private isRecording: boolean = false;
  private repeats: 1 | 2 | 4 = 2;
  private formatId: 'wav' | 'compressed' = 'wav';
  private currentResult: ExportResult | null = null;
  private warningMessage: string | null = null;
  private customTitle: string | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'export-modal-overlay hidden';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Export audio');

    document.body.appendChild(this.overlay);
    this.setupListeners();
  }

  private setupListeners() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && !this.isRecording) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        if (this.isRecording && this.activeCancelFn) {
          this.activeCancelFn();
          this.activeCancelFn = null;
          this.isRecording = false;
        }
        this.close();
      }
    });
  }

  public open(customTitle?: string) {
    this.openerElement = (document.activeElement as HTMLElement) || null;
    this.isOpen = true;
    this.isRecording = false;
    this.activeCancelFn = null;
    this.currentResult = null;
    this.warningMessage = null;
    this.customTitle = customTitle || null;

    document.body.style.overflow = 'hidden';
    this.overlay.classList.remove('hidden');
    this.render();
  }

  public close() {
    if (this.isRecording && this.activeCancelFn) {
      this.activeCancelFn();
      this.activeCancelFn = null;
      this.isRecording = false;
    }

    this.isOpen = false;
    document.body.style.overflow = '';
    this.overlay.classList.add('hidden');

    if (this.openerElement && typeof this.openerElement.focus === 'function' && document.body.contains(this.openerElement)) {
      this.openerElement.focus();
    }
    this.openerElement = null;
  }

  private render() {
    const titleInput = document.querySelector<HTMLInputElement>('#creation-title');
    const sketchTitle = this.customTitle || titleInput?.value || 'Untitled sketch';
    const bpm = state.bpm || 90;
    const bars = state.bars || 2;
    const supportedFormats = getSupportedExportFormats();

    this.overlay.innerHTML = `
      <div class="export-modal-dialog">
        <div class="export-modal-header">
          <h2 class="export-modal-title">Export Audio</h2>
          <button type="button" class="export-modal-close" id="export-close-btn" aria-label="Close export dialog" ${this.isRecording ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
          </button>
        </div>

        <div class="export-modal-body" id="export-modal-body">
          ${this.renderBodyContent(bpm, bars, supportedFormats)}
        </div>
      </div>
    `;

    this.bindEvents(sketchTitle);
  }

  private renderBodyContent(bpm: number, bars: number, supportedFormats: any[]): string {
    if (this.isRecording) {
      return `
        <div class="export-recording-view">
          <p class="export-rec-notice">Recording audio in real time with live master effects & reverb...</p>
          <div class="export-progress-container" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" id="export-progress-bar">
            <div class="export-progress-fill" id="export-progress-fill" style="width: 0%;"></div>
          </div>
          <div class="export-rec-status" id="export-rec-status" aria-live="polite">Preparing recording...</div>
          ${this.warningMessage ? `<p class="export-warning-text">${this.warningMessage}</p>` : ''}
          <div class="export-actions">
            <button type="button" class="export-cancel-btn" id="export-cancel-btn">Cancel</button>
          </div>
        </div>
      `;
    }

    if (this.currentResult) {
      const res = this.currentResult;
      return `
        <div class="export-complete-view">
          <div class="export-success-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Recording finished (${res.durationSeconds.toFixed(1)}s)</span>
          </div>

          <p class="export-file-label" id="export-file-label"></p>

          ${
            res.isClipping
              ? `
            <div class="export-clip-banner">
              <strong>Quiet it down a little</strong>
              <p>The output reached peak volume (${res.peak.toFixed(2)}). You can lower the master gain by 3 dB and re-export cleanly.</p>
              <button type="button" class="export-lower-btn" id="export-lower-gain-btn">Lower gain by 3 dB & re-export</button>
            </div>
          `
              : ''
          }

          ${res.wasInterrupted ? `<p class="export-warning-text">Note: The browser was tabbed out or screen locked during recording. If audio has dropouts, tap re-export below.</p>` : ''}

          <div class="export-download-row">
            <button type="button" class="export-download-btn" id="export-manual-download-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download again</span>
            </button>
            <button type="button" class="export-done-btn" id="export-done-btn">Done</button>
          </div>
        </div>
      `;
    }

    // Config setup view
    return `
      <div class="export-config-view">
        <div class="export-info-card">
          <span class="export-sketch-title" id="export-sketch-title-text"></span>
          <span class="export-sketch-meta">${bpm} BPM · ${bars} bar${bars === 1 ? '' : 's'}</span>
        </div>

        <div class="export-field-group">
          <label class="export-field-label">Loop Repeats</label>
          <div class="export-segmented" role="radiogroup" aria-label="Loop repeats chooser">
            <button type="button" class="export-seg-btn ${this.repeats === 1 ? 'active' : ''}" data-repeat="1" role="radio" aria-checked="${this.repeats === 1}">1 loop</button>
            <button type="button" class="export-seg-btn ${this.repeats === 2 ? 'active' : ''}" data-repeat="2" role="radio" aria-checked="${this.repeats === 2}">2 loops</button>
            <button type="button" class="export-seg-btn ${this.repeats === 4 ? 'active' : ''}" data-repeat="4" role="radio" aria-checked="${this.repeats === 4}">4 loops</button>
          </div>
          <span class="export-field-hint">Includes a 1.5s reverb & delay ring-out tail.</span>
        </div>

        <div class="export-field-group">
          <label class="export-field-label">Audio Format</label>
          <div class="export-segmented" role="radiogroup" aria-label="Format chooser">
            ${supportedFormats
              .map(
                (f) => `
              <button type="button" class="export-seg-btn ${this.formatId === f.id ? 'active' : ''}" data-format="${f.id}" role="radio" aria-checked="${this.formatId === f.id}">
                ${f.label}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="export-actions">
          <button type="button" class="export-start-btn" id="export-start-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <span>Start Recording</span>
          </button>
        </div>
      </div>
    `;
  }

  private bindEvents(sketchTitle: string) {
    const closeBtn = this.overlay.querySelector<HTMLButtonElement>('#export-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Safely insert textContent for sketch title
    const sketchTitleEl = this.overlay.querySelector<HTMLElement>('#export-sketch-title-text');
    if (sketchTitleEl) sketchTitleEl.textContent = sketchTitle;

    const fileLabelEl = this.overlay.querySelector<HTMLElement>('#export-file-label');
    if (fileLabelEl && this.currentResult) fileLabelEl.textContent = this.currentResult.filename;

    // Repeats buttons
    const repeatBtns = this.overlay.querySelectorAll<HTMLButtonElement>('[data-repeat]');
    repeatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.repeat || '2', 10) as 1 | 2 | 4;
        this.repeats = val;
        this.render();
      });
    });

    // Format buttons
    const formatBtns = this.overlay.querySelectorAll<HTMLButtonElement>('[data-format]');
    formatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.formatId = (btn.dataset.format as any) || 'wav';
        this.render();
      });
    });

    // Start recording
    const startBtn = this.overlay.querySelector<HTMLButtonElement>('#export-start-btn');
    startBtn?.addEventListener('click', () => {
      this.startExport(sketchTitle);
    });

    // Cancel recording
    const cancelBtn = this.overlay.querySelector<HTMLButtonElement>('#export-cancel-btn');
    cancelBtn?.addEventListener('click', () => {
      if (this.activeCancelFn) {
        this.activeCancelFn();
        this.activeCancelFn = null;
      }
      this.isRecording = false;
      this.render();
    });

    // Manual download button
    const downloadAgainBtn = this.overlay.querySelector<HTMLButtonElement>('#export-manual-download-btn');
    downloadAgainBtn?.addEventListener('click', () => {
      if (this.currentResult) {
        triggerFileDownload(this.currentResult.blob, this.currentResult.filename);
      }
    });

    // Done button
    const doneBtn = this.overlay.querySelector<HTMLButtonElement>('#export-done-btn');
    doneBtn?.addEventListener('click', () => this.close());

    // Lower gain by 3dB & re-export
    const lowerGainBtn = this.overlay.querySelector<HTMLButtonElement>('#export-lower-gain-btn');
    lowerGainBtn?.addEventListener('click', () => {
      getMasterEffectsRack().lowerGain3dB();
      this.currentResult = null;
      this.startExport(sketchTitle);
    });
  }

  private startExport(sketchTitle: string) {
    this.isRecording = true;
    this.currentResult = null;
    this.warningMessage = null;
    this.render();

    const fillEl = this.overlay.querySelector<HTMLElement>('#export-progress-fill');
    const statusEl = this.overlay.querySelector<HTMLElement>('#export-rec-status');
    const progressBar = this.overlay.querySelector<HTMLElement>('#export-progress-bar');

    const { promise, cancel } = recordLoopAudio({
      repeats: this.repeats,
      format: this.formatId,
      title: sketchTitle,
      onProgress: (progress, remaining) => {
        const pct = Math.round(progress * 100);
        if (fillEl) fillEl.style.width = `${pct}%`;
        if (progressBar) progressBar.setAttribute('aria-valuenow', String(pct));
        if (statusEl) statusEl.textContent = `Recording audio... ${remaining.toFixed(1)}s remaining`;
      },
      onVisibilityWarning: () => {
        this.warningMessage = 'The tab was backgrounded during recording. Keep this tab visible to prevent audio gaps.';
        const noticeEl = this.overlay.querySelector<HTMLElement>('.export-warning-text');
        if (noticeEl) noticeEl.textContent = this.warningMessage;
      },
    });

    this.activeCancelFn = cancel;

    promise
      .then((result) => {
        this.isRecording = false;
        this.activeCancelFn = null;
        if (result) {
          this.currentResult = result;
          triggerFileDownload(result.blob, result.filename);
        }
        this.render();
      })
      .catch((err) => {
        console.error('Audio export error:', err);
        this.isRecording = false;
        this.activeCancelFn = null;
        this.warningMessage = 'Recording failed. Please try again.';
        this.render();
      });
  }
}

let sharedExportModal: ExportModal | null = null;
export function getExportModal(): ExportModal {
  if (!sharedExportModal) {
    sharedExportModal = new ExportModal();
  }
  return sharedExportModal;
}
