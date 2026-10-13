import { Song } from '../../song/types';
import { SongPlaybackEngine } from '../../song/playbackEngine';
import {
  recordSongAudio,
  getSupportedExportFormats,
  ExportFormatOption,
  ExportResult,
} from '../../song/audioExport';
import { downloadSongMidiFile } from '../../song/midiExport';

export class SongExportModal {
  private overlay: HTMLElement;
  private isOpen: boolean = false;
  private song: Song;
  private playbackEngine: SongPlaybackEngine;
  private onMasterUpdate?: (song: Song) => void;

  private selectedTab: 'audio' | 'midi' = 'audio';
  private selectedRange: 'whole' | 'loop' = 'whole';
  private selectedFormat: 'wav' | 'compressed' = 'wav';

  private isRecording: boolean = false;
  private cancelRecordingFn: (() => void) | null = null;
  private lastResult: ExportResult | null = null;
  private visibilityWarning: boolean = false;

  constructor(
    song: Song,
    playbackEngine: SongPlaybackEngine,
    onMasterUpdate?: (song: Song) => void
  ) {
    this.song = song;
    this.playbackEngine = playbackEngine;
    this.onMasterUpdate = onMasterUpdate;

    this.overlay = document.createElement('div');
    this.overlay.className = 'studio-export-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Export song');
    this.overlay.style.display = 'none';

    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && !this.isRecording) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape' && !this.isRecording) {
        this.close();
      }
    });
  }

  public setSong(song: Song) {
    this.song = song;
    if (this.isOpen && !this.isRecording) {
      this.render();
    }
  }

  public open() {
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.isRecording = false;
    this.lastResult = null;
    this.visibilityWarning = false;
    this.render();
  }

  public close() {
    if (this.isRecording && this.cancelRecordingFn) {
      this.cancelRecordingFn();
      this.isRecording = false;
    }
    this.isOpen = false;
    this.overlay.style.display = 'none';
  }

  private render() {
    const formats: ExportFormatOption[] = getSupportedExportFormats();
    const hasLoop = this.song.loopRegion !== null;
    const loopLabel = hasLoop
      ? `Loop region (Bars ${this.song.loopRegion!.startBar + 1}–${this.song.loopRegion!.endBar})`
      : 'Loop region (none set)';

    this.overlay.innerHTML = `
      <div class="studio-export-dialog">
        <div class="studio-export-header">
          <h2 class="studio-export-title">Export Song</h2>
          <button type="button" class="studio-mini-btn" id="export-close-btn" ${this.isRecording ? 'disabled' : ''} aria-label="Close export dialog">✕</button>
        </div>

        <div class="studio-export-tabs" role="tablist">
          <button type="button" class="studio-tab-btn ${this.selectedTab === 'audio' ? 'active' : ''}" id="tab-audio-btn" role="tab" ${this.isRecording ? 'disabled' : ''}>Audio</button>
          <button type="button" class="studio-tab-btn ${this.selectedTab === 'midi' ? 'active' : ''}" id="tab-midi-btn" role="tab" ${this.isRecording ? 'disabled' : ''}>MIDI (.mid)</button>
        </div>

        <div class="studio-export-body" id="export-body-content">
          ${this.selectedTab === 'audio' ? this.renderAudioTab(formats, hasLoop, loopLabel) : this.renderMidiTab()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderAudioTab(formats: ExportFormatOption[], hasLoop: boolean, loopLabel: string): string {
    if (this.isRecording) {
      return `
        <div class="studio-recording-status">
          <div class="studio-rec-indicator">
            <span class="studio-rec-dot"></span>
            <span>Recording master output in real time…</span>
          </div>

          <div class="studio-progress-bar-wrap">
            <div class="studio-progress-bar-fill" id="export-progress-fill" style="width: 0%;"></div>
          </div>
          <div class="studio-countdown-text" id="export-countdown-text">Preparing audio…</div>

          ${
            this.visibilityWarning
              ? `<div class="studio-warning-box">Warning: Tab hidden or screen locked. Real-time audio rendering may stutter. Keep tab visible for best results.</div>`
              : ''
          }

          <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
            <button type="button" class="studio-btn" id="export-cancel-btn">Cancel</button>
          </div>
        </div>
      `;
    }

    if (this.lastResult) {
      const peakDb = this.lastResult.peak > 0 ? (20 * Math.log10(this.lastResult.peak)).toFixed(1) : '-∞';
      const isClipping = this.lastResult.isClipping || this.lastResult.peak >= 0.999;

      return `
        <div class="studio-export-success">
          <div class="studio-success-meta">
            <span class="studio-success-title">${this.lastResult.filename}</span>
            <span class="studio-success-sub">Peak level: ${peakDb} dB ${isClipping ? '· High peak detected' : '· Clean output'}</span>
          </div>

          ${
            isClipping
              ? `
                <div class="studio-clip-warning-box">
                  <strong>Quiet it down a little:</strong> Output peaked near the 0 dB ceiling.
                  <button type="button" class="studio-btn studio-btn-sm" id="export-lower-reexport-btn" style="margin-top: 6px;">
                    Lower master by 3 dB & re-export
                  </button>
                </div>
              `
              : ''
          }

          <div class="studio-download-actions" style="margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;">
            <a id="export-download-link" class="studio-btn studio-btn-primary" download="${this.lastResult.filename}">Download again</a>
            <button type="button" class="studio-btn" id="export-done-btn">Done</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="studio-export-options">
        <div class="studio-export-group">
          <label class="studio-field-label">Export Range</label>
          <div class="studio-chooser-group">
            <label class="studio-radio-label">
              <input type="radio" name="export-range" value="whole" ${this.selectedRange === 'whole' ? 'checked' : ''} />
              <span>Whole song (${this.song.totalBars} bars)</span>
            </label>
            <label class="studio-radio-label ${!hasLoop ? 'disabled' : ''}">
              <input type="radio" name="export-range" value="loop" ${this.selectedRange === 'loop' ? 'checked' : ''} ${!hasLoop ? 'disabled' : ''} />
              <span>${loopLabel}</span>
            </label>
          </div>
        </div>

        <div class="studio-export-group" style="margin-top: 14px;">
          <label class="studio-field-label">Format</label>
          <div class="studio-chooser-group">
            ${formats
              .map(
                (f) => `
              <label class="studio-radio-label">
                <input type="radio" name="export-format" value="${f.id}" ${this.selectedFormat === f.id ? 'checked' : ''} />
                <span>${f.label}</span>
              </label>
            `
              )
              .join('')}
          </div>
          <span class="studio-field-hint" style="margin-top: 4px; display: block; font-size: 0.76rem; color: var(--ink-soft);">
            Includes all active lane processing, master EQ, compressor, and 2-second reverb/delay tail.
          </span>
        </div>

        <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="studio-btn" id="export-cancel-init-btn">Cancel</button>
          <button type="button" class="studio-btn studio-btn-primary" id="export-start-btn">Export Audio</button>
        </div>
      </div>
    `;
  }

  private renderMidiTab(): string {
    return `
      <div class="studio-export-options">
        <p class="studio-desc" style="font-size: 0.86rem; color: var(--ink-soft); line-height: 1.45; margin: 0 0 16px 0;">
          Exports a Standard MIDI File (Format 1) containing one MIDI track per lane and instrument/color.
          General MIDI drums are placed on Channel 10. Tempo, clip transposition, and markers are included.
        </p>

        <div style="background: var(--paper-deep); padding: 10px 14px; border-radius: 6px; border: 1px solid var(--line); font-size: 0.8rem; font-family: var(--font-mono, monospace);">
          <div>BPM: ${this.song.bpm}</div>
          <div>Lanes: ${this.song.lanes.length}</div>
          <div>Placements: ${this.song.placements.length}</div>
          <div>Markers: ${this.song.markers.length}</div>
        </div>

        <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="studio-btn" id="export-midi-cancel-btn">Close</button>
          <button type="button" class="studio-btn studio-btn-primary" id="export-midi-download-btn">
            Download MIDI (.mid)
          </button>
        </div>
      </div>
    `;
  }

  private bindEvents() {
    this.overlay.querySelector('#export-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#export-cancel-init-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#export-midi-cancel-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#export-done-btn')?.addEventListener('click', () => this.close());

    // Tab buttons
    this.overlay.querySelector('#tab-audio-btn')?.addEventListener('click', () => {
      this.selectedTab = 'audio';
      this.render();
    });
    this.overlay.querySelector('#tab-midi-btn')?.addEventListener('click', () => {
      this.selectedTab = 'midi';
      this.render();
    });

    // Range radio changes
    this.overlay.querySelectorAll<HTMLInputElement>('input[name="export-range"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        this.selectedRange = radio.value as 'whole' | 'loop';
      });
    });

    // Format radio changes
    this.overlay.querySelectorAll<HTMLInputElement>('input[name="export-format"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        this.selectedFormat = radio.value as 'wav' | 'compressed';
      });
    });

    // MIDI download
    this.overlay.querySelector('#export-midi-download-btn')?.addEventListener('click', () => {
      downloadSongMidiFile(this.song);
      this.close();
    });

    // Start Audio recording
    this.overlay.querySelector('#export-start-btn')?.addEventListener('click', () => {
      this.startAudioRecording();
    });

    // Cancel while recording
    this.overlay.querySelector('#export-cancel-btn')?.addEventListener('click', () => {
      if (this.cancelRecordingFn) {
        this.cancelRecordingFn();
      }
      this.isRecording = false;
      this.render();
    });

    // Success download again link
    const dlLink = this.overlay.querySelector<HTMLAnchorElement>('#export-download-link');
    if (dlLink && this.lastResult) {
      const url = URL.createObjectURL(this.lastResult.blob);
      dlLink.href = url;
    }

    // Lower master by 3 dB and re-export
    this.overlay.querySelector('#export-lower-reexport-btn')?.addEventListener('click', () => {
      const currentGain = this.song.master?.gainDb ?? 0;
      const updatedMaster = {
        ...this.song.master,
        gainDb: Math.max(-60, currentGain - 3),
      };
      const updatedSong: Song = {
        ...this.song,
        master: updatedMaster,
      };
      this.song = updatedSong;
      this.onMasterUpdate?.(updatedSong);
      this.lastResult = null;
      this.startAudioRecording();
    });
  }

  private startAudioRecording() {
    this.isRecording = true;
    this.visibilityWarning = false;
    this.render();

    const progressFill = this.overlay.querySelector<HTMLElement>('#export-progress-fill');
    const countdownText = this.overlay.querySelector<HTMLElement>('#export-countdown-text');

    const { promise, cancel } = recordSongAudio(this.song, this.playbackEngine, {
      range: this.selectedRange,
      format: this.selectedFormat,
      onProgress: (progress, remaining) => {
        if (progressFill) progressFill.style.width = `${Math.round(progress * 100)}%`;
        if (countdownText) countdownText.textContent = `Rendering audio: ${remaining}s remaining…`;
      },
      onVisibilityWarning: () => {
        this.visibilityWarning = true;
        this.render();
      },
    });

    this.cancelRecordingFn = cancel;

    promise
      .then((res) => {
        this.isRecording = false;
        this.cancelRecordingFn = null;
        if (!res) {
          this.render();
          return;
        }

        this.lastResult = res;
        this.render();

        // Trigger immediate browser download
        try {
          const url = URL.createObjectURL(res.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch {}
      })
      .catch((err) => {
        console.error('Song audio export failed:', err);
        this.isRecording = false;
        this.cancelRecordingFn = null;
        this.render();
      });
  }

  public dispose() {
    if (this.cancelRecordingFn) {
      this.cancelRecordingFn();
    }
    this.overlay.remove();
  }
}
