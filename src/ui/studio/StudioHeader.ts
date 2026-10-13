import { Song, SONG_LIMITS } from '../../song/types';

export interface StudioHeaderCallbacks {
  onTitleChange: (newTitle: string) => void;
  onBpmChange: (newBpm: number) => void;
  onPlayToggle: () => void;
  onStop: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddDrawing: () => void;
  onViewToggle: (view: 'timeline' | 'list') => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export class StudioHeader {
  public element: HTMLElement;
  private titleInput: HTMLInputElement;
  private bpmValueEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  private timeReadoutEl: HTMLElement;
  private viewToggleBtn: HTMLButtonElement;
  private saveStatusEl: HTMLElement;
  private callbacks: StudioHeaderCallbacks;
  private currentView: 'timeline' | 'list' = 'timeline';

  constructor(song: Song, callbacks: StudioHeaderCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('header');
    this.element.className = 'studio-header';

    this.element.innerHTML = `
      <div class="studio-header-left">
        <button type="button" class="studio-btn" id="studio-back-btn" aria-label="Back to library">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          <span>Library</span>
        </button>
        <span class="header-divider-dot">·</span>
        <input type="text" class="studio-title-input" id="studio-title-input" maxlength="80" aria-label="Song title" />
        <span class="studio-save-status" id="studio-save-status">Saved</span>
      </div>

      <div class="studio-header-center">
        <div class="studio-transport-group">
          <button type="button" class="studio-btn studio-btn-icon" id="studio-stop-btn" aria-label="Stop and return to start">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
          <button type="button" class="studio-btn studio-btn-primary studio-btn-icon" id="studio-play-btn" aria-label="Play song">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" id="studio-play-icon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <span class="studio-readout" id="studio-time-readout">1.1 · 00:00</span>
        </div>
      </div>

      <div class="studio-header-right">
        <div class="studio-bpm-stepper">
          <button type="button" class="studio-bpm-btn" id="studio-bpm-dec" aria-label="Decrease BPM">−</button>
          <span class="studio-bpm-value" id="studio-bpm-val">${song.bpm} BPM</span>
          <button type="button" class="studio-bpm-btn" id="studio-bpm-inc" aria-label="Increase BPM">+</button>
        </div>

        <button type="button" class="studio-btn studio-btn-icon" id="studio-zoom-out" aria-label="Zoom out timeline">−</button>
        <button type="button" class="studio-btn studio-btn-icon" id="studio-zoom-in" aria-label="Zoom in timeline">+</button>

        <button type="button" class="studio-btn" id="studio-add-drawing-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Add drawing</span>
        </button>

        <button type="button" class="studio-btn" id="studio-view-toggle-btn" aria-label="Toggle between timeline and list view">
          <span>List</span>
        </button>
      </div>
    `;

    this.titleInput = this.element.querySelector('#studio-title-input')!;
    this.titleInput.value = song.title;

    this.bpmValueEl = this.element.querySelector('#studio-bpm-val')!;
    this.playBtn = this.element.querySelector('#studio-play-btn')!;
    this.timeReadoutEl = this.element.querySelector('#studio-time-readout')!;
    this.viewToggleBtn = this.element.querySelector('#studio-view-toggle-btn')!;
    this.saveStatusEl = this.element.querySelector('#studio-save-status')!;

    this.bindEvents(song);
  }

  private bindEvents(song: Song) {
    this.titleInput.addEventListener('change', () => {
      const val = this.titleInput.value.trim().slice(0, 80) || 'Untitled song';
      this.titleInput.value = val;
      this.callbacks.onTitleChange(val);
    });

    this.element.querySelector('#studio-back-btn')?.addEventListener('click', () => {
      this.callbacks.onBack();
    });

    this.playBtn.addEventListener('click', () => {
      this.callbacks.onPlayToggle();
    });

    this.element.querySelector('#studio-stop-btn')?.addEventListener('click', () => {
      this.callbacks.onStop();
    });

    let currentBpm = song.bpm;
    this.element.querySelector('#studio-bpm-dec')?.addEventListener('click', () => {
      if (currentBpm > SONG_LIMITS.MIN_BPM) {
        currentBpm--;
        this.updateBpm(currentBpm);
        this.callbacks.onBpmChange(currentBpm);
      }
    });

    this.element.querySelector('#studio-bpm-inc')?.addEventListener('click', () => {
      if (currentBpm < SONG_LIMITS.MAX_BPM) {
        currentBpm++;
        this.updateBpm(currentBpm);
        this.callbacks.onBpmChange(currentBpm);
      }
    });

    this.element.querySelector('#studio-zoom-out')?.addEventListener('click', () => {
      this.callbacks.onZoomOut();
    });

    this.element.querySelector('#studio-zoom-in')?.addEventListener('click', () => {
      this.callbacks.onZoomIn();
    });

    this.element.querySelector('#studio-add-drawing-btn')?.addEventListener('click', () => {
      this.callbacks.onAddDrawing();
    });

    this.viewToggleBtn.addEventListener('click', () => {
      this.currentView = this.currentView === 'timeline' ? 'list' : 'timeline';
      this.viewToggleBtn.querySelector('span')!.textContent =
        this.currentView === 'timeline' ? 'List' : 'Timeline';
      this.callbacks.onViewToggle(this.currentView);
    });
  }

  public updateBpm(bpm: number) {
    this.bpmValueEl.textContent = `${bpm} BPM`;
  }

  public updateTime(bar: number, beat: number, seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    this.timeReadoutEl.textContent = `${bar}.${beat} · ${timeStr}`;
  }

  public updatePlayState(isPlaying: boolean) {
    const icon = this.element.querySelector('#studio-play-icon');
    if (icon) {
      if (isPlaying) {
        icon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
        this.playBtn.setAttribute('aria-label', 'Pause song');
      } else {
        icon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
        this.playBtn.setAttribute('aria-label', 'Play song');
      }
    }
  }

  public setSaveStatus(status: string) {
    this.saveStatusEl.textContent = status;
  }
}
