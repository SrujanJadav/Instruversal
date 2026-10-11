import { state, events } from '../state';
import { getTrackManager, auditionInstrument, Track } from '../audio/tracks';
import { INSTRUMENT_METAS } from '../audio/instruments';
import { SCALES, ScaleName } from '../audio/scales';
import { getTotalAudioLatencySeconds } from '../audio/context';
import { getTransport } from '../audio/transport';

const ROOT_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class TrackPanel {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private currentTab: 'tracks' | 'key' = 'tracks';
  private activeInstrumentPickerTrackId: string | null = null;
  private unsubs: (() => void)[] = [];

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'panel-backdrop hidden';
    this.overlay.setAttribute('aria-hidden', 'true');

    this.panel = document.createElement('section');
    this.panel.className = 'track-panel hidden';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', 'Track mixer and musical key');

    container.appendChild(this.overlay);
    container.appendChild(this.panel);

    this.render();
    this.setupListeners();
  }

  public open(tab: 'tracks' | 'key' = 'tracks') {
    this.currentTab = tab;
    this.activeInstrumentPickerTrackId = null;
    this.render();
    this.overlay.classList.remove('hidden');
    this.overlay.removeAttribute('aria-hidden');
    this.panel.classList.remove('hidden');
    this.panel.classList.add('visible');
  }

  public close() {
    this.activeInstrumentPickerTrackId = null;
    this.panel.classList.remove('visible');
    this.overlay.classList.add('hidden');
    this.overlay.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      this.panel.classList.add('hidden');
    }, 180);
  }

  public toggle(tab: 'tracks' | 'key' = 'tracks') {
    if (this.isOpen()) {
      if (this.currentTab === tab && this.activeInstrumentPickerTrackId === null) {
        this.close();
      } else {
        this.currentTab = tab;
        this.activeInstrumentPickerTrackId = null;
        this.render();
      }
    } else {
      this.open(tab);
    }
  }

  public isOpen(): boolean {
    return this.panel.classList.contains('visible');
  }

  private setupListeners() {
    this.overlay.addEventListener('click', () => this.close());

    this.unsubs.push(
      events.on('track:select', () => {
        if (this.isOpen() && this.currentTab === 'tracks') {
          this.render();
        }
      }),
      events.on('scale:change', () => {
        if (this.isOpen() && this.currentTab === 'key') {
          this.render();
        }
      }),
      events.on('sync:change', (offsetMs) => {
        const slider = this.panel.querySelector<HTMLInputElement>('#panel-sync-slider');
        const display = this.panel.querySelector<HTMLElement>('#panel-sync-val');
        if (slider) slider.value = String(offsetMs);
        if (display) display.textContent = `${offsetMs >= 0 ? '+' : ''}${offsetMs}ms`;
      })
    );
  }

  private render() {
    this.panel.innerHTML = `
      <div class="panel-header">
        <div class="panel-drag-handle" aria-hidden="true"></div>
        <div class="panel-tabs">
          <button type="button" class="panel-tab-btn ${this.currentTab === 'tracks' ? 'active' : ''}" id="tab-tracks-btn">
            Mixer
          </button>
          <button type="button" class="panel-tab-btn ${this.currentTab === 'key' ? 'active' : ''}" id="tab-key-btn">
            Key & Scale
          </button>
        </div>
        <button type="button" class="panel-close-btn" id="panel-close-btn" aria-label="Close mixer panel">
          ✕
        </button>
      </div>

      <div class="panel-content">
        ${this.currentTab === 'tracks' ? this.renderTracksTab() : this.renderKeyTab()}
      </div>
    `;

    this.bindEvents();
  }

  private renderTracksTab(): string {
    const tm = getTrackManager();
    const tracks = tm.getAllTracks();

    // If instrument picker is open for a track
    if (this.activeInstrumentPickerTrackId) {
      const track = tm.getTrack(this.activeInstrumentPickerTrackId);
      if (!track) return '';

      return `
        <div class="instrument-picker-view">
          <div class="picker-header">
            <button type="button" class="picker-back-btn" id="picker-back-btn">
              ← Back to tracks
            </button>
            <span class="picker-title">
              <span class="palette-dot-small" style="background-color: ${track.colorHex}"></span>
              ${track.name} Voice
            </span>
          </div>
          <ul class="instrument-list">
            ${INSTRUMENT_METAS.map((meta) => {
              const isSelected = track.instrumentId === meta.id;
              return `
                <li class="instrument-item ${isSelected ? 'selected' : ''}">
                  <button type="button" class="inst-select-btn" data-inst-id="${meta.id}">
                    <span class="inst-name">${meta.name}</span>
                    ${isSelected ? '<span class="inst-badge">Active</span>' : ''}
                  </button>
                  <button type="button" class="inst-audition-btn" data-audition-id="${meta.id}" aria-label="Audition ${meta.name}">
                    ▶ Test
                  </button>
                </li>
              `;
            }).join('')}
          </ul>
        </div>
      `;
    }

    const hwMs = Math.round(getTotalAudioLatencySeconds() * 1000);
    return `
      <ul class="track-list">
        ${tracks.map((t) => this.renderTrackRow(t)).join('')}
      </ul>
      <div class="mixer-sync-section">
        <div class="mixer-sync-header">
          <span class="section-title">Audio & Playhead Sync</span>
          <span class="sync-hw-info">Hardware latency ≈ ${hwMs}ms</span>
        </div>
        <p class="sync-hint">Using Bluetooth headphones? Raise this until the line hits the stroke exactly when you hear the note.</p>
        <div class="sync-slider-row">
          <span class="sync-range-lbl">-200ms</span>
          <input type="range" class="sync-slider" id="panel-sync-slider"
            min="-200" max="400" step="5" value="${state.syncOffsetMs}"
            aria-label="Sync nudge offset in milliseconds" />
          <span class="sync-range-lbl">+400ms</span>
          <span class="sync-val-display" id="panel-sync-val">${state.syncOffsetMs >= 0 ? '+' : ''}${state.syncOffsetMs}ms</span>
        </div>
      </div>
    `;
  }

  private renderTrackRow(track: Track): string {
    const isSelected = track.id === state.selectedTrackId;
    const instMeta = INSTRUMENT_METAS.find((m) => m.id === track.instrumentId);
    const instName = instMeta ? instMeta.name : track.instrumentId;

    return `
      <li class="track-row ${isSelected ? 'selected' : ''}" data-track-id="${track.id}">
        <button type="button" class="track-select-lead" data-select-id="${track.id}" aria-label="Select ${track.name} track for drawing">
          <span class="track-dot-indicator" style="background-color: ${track.colorHex}"></span>
          <span class="track-name-lbl">${track.name}</span>
        </button>

        <button type="button" class="track-inst-btn" data-picker-track="${track.id}" aria-label="Change instrument for ${track.name}">
          <span class="inst-label">${instName}</span>
          <span class="chevron-icon">▾</span>
        </button>

        <div class="track-controls">
          <button type="button" class="track-toggle-btn mute-btn ${track.muted ? 'active' : ''}" data-mute-id="${track.id}" aria-label="Mute ${track.name}">
            M
          </button>
          <button type="button" class="track-toggle-btn solo-btn ${track.solo ? 'active' : ''}" data-solo-id="${track.id}" aria-label="Solo ${track.name}">
            S
          </button>
          <label class="track-vol-label" aria-label="${track.name} Volume">
            <input type="range" class="track-vol-slider" min="0" max="1" step="0.05" value="${track.volume}" data-vol-id="${track.id}" />
          </label>
        </div>
      </li>
    `;
  }

  private renderKeyTab(): string {
    const currentRoot = state.rootNote;
    const currentScale = state.scaleName;
    const scaleKeys = Object.keys(SCALES) as ScaleName[];

    return `
      <div class="key-picker-container">
        <div class="key-section">
          <span class="section-title">Root Key</span>
          <div class="root-note-grid">
            ${ROOT_NOTE_NAMES.map((name, idx) => `
              <button type="button" class="root-note-btn ${currentRoot === idx ? 'active' : ''}" data-root-idx="${idx}">
                ${name}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="key-section">
          <span class="section-title">Musical Scale</span>
          <div class="scale-list-grid">
            ${scaleKeys.map((scaleName) => `
              <button type="button" class="scale-pill-btn ${currentScale === scaleName ? 'active' : ''}" data-scale-name="${scaleName}">
                ${scaleName.replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="key-section">
          <span class="section-title">Display Options</span>
          <label class="panel-checkbox-row">
            <input type="checkbox" class="panel-checkbox" id="toggle-hit-notes" ${state.showHitNotes ? 'checked' : ''} />
            <span class="checkbox-label">Show note names on playhead hit</span>
          </label>
        </div>
      </div>
    `;
  }

  private bindEvents() {
    // Close button
    const closeBtn = this.panel.querySelector('#panel-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Tabs
    const tracksTabBtn = this.panel.querySelector('#tab-tracks-btn');
    const keyTabBtn = this.panel.querySelector('#tab-key-btn');

    tracksTabBtn?.addEventListener('click', () => {
      this.currentTab = 'tracks';
      this.activeInstrumentPickerTrackId = null;
      this.render();
    });

    keyTabBtn?.addEventListener('click', () => {
      this.currentTab = 'key';
      this.activeInstrumentPickerTrackId = null;
      this.render();
    });

    const tm = getTrackManager();

    // Instrument picker back button
    const backBtn = this.panel.querySelector('#picker-back-btn');
    backBtn?.addEventListener('click', () => {
      this.activeInstrumentPickerTrackId = null;
      this.render();
    });

    // Instrument audition buttons
    const auditionBtns = this.panel.querySelectorAll<HTMLButtonElement>('.inst-audition-btn');
    auditionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const instId = btn.dataset.auditionId;
        if (instId) {
          auditionInstrument(instId);
        }
      });
    });

    // Instrument select buttons
    const instSelectBtns = this.panel.querySelectorAll<HTMLButtonElement>('.inst-select-btn');
    instSelectBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const instId = btn.dataset.instId;
        if (instId && this.activeInstrumentPickerTrackId) {
          const track = tm.getTrack(this.activeInstrumentPickerTrackId);
          if (track) {
            track.setInstrument(instId);
            track.audition();
          }
          this.activeInstrumentPickerTrackId = null;
          this.render();
        }
      });
    });

    // Track selector triggers
    const selectLeads = this.panel.querySelectorAll<HTMLButtonElement>('.track-select-lead');
    selectLeads.forEach((btn) => {
      btn.addEventListener('click', () => {
        const trackId = btn.dataset.selectId;
        if (trackId) {
          state.selectedTrackId = trackId;
          const track = tm.getTrack(trackId);
          track?.audition();
          events.emit('track:select', trackId);
          this.render();
        }
      });
    });

    // Open instrument picker
    const instBtns = this.panel.querySelectorAll<HTMLButtonElement>('.track-inst-btn');
    instBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeInstrumentPickerTrackId = btn.dataset.pickerTrack || null;
        this.render();
      });
    });

    // Mute buttons
    const muteBtns = this.panel.querySelectorAll<HTMLButtonElement>('.mute-btn');
    muteBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const trackId = btn.dataset.muteId;
        if (!trackId) return;
        const track = tm.getTrack(trackId);
        if (track) {
          track.setMute(!track.muted);
          this.render();
        }
      });
    });

    // Solo buttons
    const soloBtns = this.panel.querySelectorAll<HTMLButtonElement>('.solo-btn');
    soloBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const trackId = btn.dataset.soloId;
        if (!trackId) return;
        const track = tm.getTrack(trackId);
        if (track) {
          track.setSolo(!track.solo);
          this.render();
        }
      });
    });

    // Volume sliders
    const volSliders = this.panel.querySelectorAll<HTMLInputElement>('.track-vol-slider');
    volSliders.forEach((slider) => {
      slider.addEventListener('input', () => {
        const trackId = slider.dataset.volId;
        if (!trackId) return;
        const track = tm.getTrack(trackId);
        if (track) {
          track.setVolume(parseFloat(slider.value));
        }
      });
    });

    // Key & Root Note selection
    const rootBtns = this.panel.querySelectorAll<HTMLButtonElement>('.root-note-btn');
    rootBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.rootIdx || '0', 10);
        state.rootNote = idx;
        events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
        this.render();
      });
    });

    // Scale selection
    const scaleBtns = this.panel.querySelectorAll<HTMLButtonElement>('.scale-pill-btn');
    scaleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const scaleName = btn.dataset.scaleName as ScaleName;
        if (scaleName) {
          state.scaleName = scaleName;
          events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
          this.render();
        }
      });
    });

    // Display options
    const hitNotesToggle = this.panel.querySelector<HTMLInputElement>('#toggle-hit-notes');
    hitNotesToggle?.addEventListener('change', () => {
      state.showHitNotes = hitNotesToggle.checked;
    });

    // Sync calibration slider in Mixer
    const syncSlider = this.panel.querySelector<HTMLInputElement>('#panel-sync-slider');
    const syncValDisplay = this.panel.querySelector<HTMLElement>('#panel-sync-val');
    syncSlider?.addEventListener('input', () => {
      const val = parseInt(syncSlider.value, 10);
      if (syncValDisplay) syncValDisplay.textContent = `${val >= 0 ? '+' : ''}${val}ms`;
      getTransport().setSyncOffset(val);
    });
  }

  public destroy() {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    this.panel.remove();
    this.overlay.remove();
  }
}
