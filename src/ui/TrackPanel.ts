import { state, events } from '../state';
import { getTrackManager, auditionInstrument, auditionKit, Track } from '../audio/tracks';
import { INSTRUMENT_METAS } from '../audio/instruments';
import { DRUM_KITS, DrumKitId } from '../audio/drums';
import { SCALES, ScaleName } from '../audio/scales';
import { getTotalAudioLatencySeconds } from '../audio/context';
import { getTransport } from '../audio/transport';
import { getPreviewEngine, getAuditionEnabled, setAuditionEnabled } from '../audio/preview';

const ROOT_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class TrackPanel {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private currentTab: 'tracks' | 'key' = 'tracks';
  private activeInstrumentPickerTrackId: string | null = null;
  private pickerTab: 'melodic' | 'beats' = 'melodic';
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
    getPreviewEngine().cancelPreview();
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

  public openInstrumentPicker(trackId?: string) {
    this.currentTab = 'tracks';
    const targetId = trackId || state.selectedTrackId;
    this.activeInstrumentPickerTrackId = targetId;
    const tr = getTrackManager().getTrack(targetId);
    this.pickerTab = tr?.trackType === 'beat' ? 'beats' : 'melodic';
    this.render();
    this.overlay.classList.remove('hidden');
    this.overlay.removeAttribute('aria-hidden');
    this.panel.classList.remove('hidden');
    this.panel.classList.add('visible');
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
      }),
      events.on('ui:open-mixer', (tab) => {
        this.open(tab || 'tracks');
      }),
      events.on('ui:open-instruments', (trackId) => {
        this.openInstrumentPicker(trackId);
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

          <div class="picker-category-toggle" role="group" aria-label="Instrument Category">
            <button type="button" class="mode-pill-btn ${this.pickerTab === 'melodic' ? 'active' : ''}" id="picker-tab-melodic">
              Melodic (${INSTRUMENT_METAS.length})
            </button>
            <button type="button" class="mode-pill-btn ${this.pickerTab === 'beats' ? 'active' : ''}" id="picker-tab-beats">
              Beats (${Object.keys(DRUM_KITS).length})
            </button>
          </div>

          ${this.pickerTab === 'melodic' ? `
            <ul class="instrument-list">
              ${INSTRUMENT_METAS.map((meta) => {
                const isSelected = track.trackType === 'melodic' && track.instrumentId === meta.id;
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
          ` : `
            <ul class="instrument-list">
              ${Object.values(DRUM_KITS).map((kit) => {
                const isSelected = track.trackType === 'beat' && track.kitId === kit.id;
                return `
                  <li class="instrument-item ${isSelected ? 'selected' : ''}">
                    <button type="button" class="kit-select-btn" data-kit-id="${kit.id}">
                      <div class="kit-info-col">
                        <span class="inst-name">${kit.name}</span>
                        <span class="kit-desc-lbl">${kit.description}</span>
                      </div>
                      ${isSelected ? '<span class="inst-badge">Active</span>' : ''}
                    </button>
                    <button type="button" class="kit-audition-btn" data-audition-kit="${kit.id}" aria-label="Audition ${kit.name}">
                      ▶ Test
                    </button>
                  </li>
                `;
              }).join('')}
            </ul>
          `}
        </div>
      `;
    }

    const hwMs = Math.round(getTotalAudioLatencySeconds() * 1000);
    return `
      <ul class="track-list">
        ${tracks.map((t) => this.renderTrackRow(t)).join('')}
      </ul>

      <!-- Sidechain Ducking -->
      <div class="mixer-sync-section">
        <div class="mixer-sync-header">
          <span class="section-title">Kick Sidechain Ducking</span>
          <span class="sync-val-display" id="mixer-duck-val">${state.kickDucking}%</span>
        </div>
        <p class="sync-hint">Gently ducks pads and strings when a kick hits (amount 0 to 40%).</p>
        <div class="sync-slider-row">
          <span class="sync-range-lbl">0%</span>
          <input type="range" class="sync-slider" id="mixer-duck-slider"
            min="0" max="40" step="5" value="${state.kickDucking}"
            aria-label="Kick sidechain ducking" />
          <span class="sync-range-lbl">40%</span>
        </div>
      </div>

      <!-- Sync Calibration -->
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
    let instName = '';
    if (track.trackType === 'beat') {
      instName = DRUM_KITS[track.kitId]?.name || '808 Kit';
    } else {
      const instMeta = INSTRUMENT_METAS.find((m) => m.id === track.instrumentId);
      instName = instMeta ? instMeta.name : track.instrumentId;
    }

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

    const tm = getTrackManager();
    const selTrack = tm.getTrack(state.selectedTrackId);
    const isBeat = selTrack?.trackType === 'beat';

    const intervals = SCALES[currentScale] || SCALES['major pentatonic'];
    const stripNotes = intervals.map((semi) => ROOT_NOTE_NAMES[(currentRoot + semi) % 12]);
    stripNotes.push(ROOT_NOTE_NAMES[currentRoot % 12]); // Octave

    return `
      <div class="key-picker-container">
        <div class="key-section">
          <span class="section-title">Root Key</span>
          <div class="root-note-grid">
            ${ROOT_NOTE_NAMES.map((name, idx) => `
              <button type="button" class="root-note-btn ${currentRoot === idx ? 'active' : ''}" data-root-idx="${idx}" tabindex="0">
                ${name}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="key-section">
          <span class="section-title">Musical Scale</span>
          <div class="scale-list-grid">
            ${scaleKeys.map((scaleName) => `
              <button type="button" class="scale-pill-btn ${currentScale === scaleName ? 'active' : ''}" data-scale-name="${scaleName}" tabindex="0">
                ${scaleName.replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            `).join('')}
          </div>

          ${
            isBeat
              ? `<p class="scale-beat-note" id="scale-beat-note">Beat track selected, previewing with Keys.</p>`
              : ''
          }

          <!-- Scale Strip with note names and Replay button -->
          <div class="scale-strip-row" aria-label="Scale note sequence">
            <div class="scale-strip" id="scale-strip">
              ${stripNotes.map((name, idx) => `
                <span class="scale-strip-note" data-strip-idx="${idx}">${name}</span>
              `).join('')}
            </div>
            <button type="button" class="scale-replay-btn" id="scale-replay-btn" aria-label="Replay scale audition" tabindex="0">
              Play
            </button>
          </div>
        </div>

        <div class="key-section">
          <span class="section-title">Display Options</span>
          <label class="panel-checkbox-row">
            <input type="checkbox" class="panel-checkbox" id="toggle-audition" ${getAuditionEnabled() ? 'checked' : ''} tabindex="0" />
            <span class="checkbox-label">Hear it when I choose</span>
          </label>
          <label class="panel-checkbox-row">
            <input type="checkbox" class="panel-checkbox" id="toggle-hit-notes" ${state.showHitNotes ? 'checked' : ''} tabindex="0" />
            <span class="checkbox-label">Show note names on playhead hit</span>
          </label>
        </div>
      </div>
    `;
  }

  private handleHighlight(step: number | 'chord' | null, intervals: readonly number[]) {
    const noteEls = this.panel.querySelectorAll<HTMLElement>('.scale-strip-note');
    if (noteEls.length === 0) return;

    const tm = getTrackManager();
    const selTrack = tm.getTrack(state.selectedTrackId);
    const trackColor = selTrack?.colorHex || '#1C1A16';

    noteEls.forEach((el) => {
      el.classList.remove('active', 'chord-active');
      el.style.backgroundColor = '';
      el.style.borderColor = '';
      el.style.color = '';
    });

    if (step === null) return;

    if (step === 'chord') {
      const thirdIdx = 2;
      const fifthIdx = intervals.length === 5 ? 3 : 4;
      const octaveIdx = noteEls.length - 1;
      [0, thirdIdx, fifthIdx, octaveIdx].forEach((idx) => {
        const el = noteEls[idx];
        if (el) {
          el.classList.add('chord-active');
          el.style.backgroundColor = trackColor;
          el.style.borderColor = trackColor;
          el.style.color = '#F3ECDD';
        }
      });
    } else if (typeof step === 'number') {
      const el = noteEls[step];
      if (el) {
        el.classList.add('active');
        el.style.backgroundColor = trackColor;
        el.style.borderColor = trackColor;
        el.style.color = '#F3ECDD';
      }
    }
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

    // Instrument picker tab switches (Melodic vs Beats)
    const pickerTabMelodic = this.panel.querySelector<HTMLButtonElement>('#picker-tab-melodic');
    const pickerTabBeats = this.panel.querySelector<HTMLButtonElement>('#picker-tab-beats');

    pickerTabMelodic?.addEventListener('click', () => {
      this.pickerTab = 'melodic';
      this.render();
    });

    pickerTabBeats?.addEventListener('click', () => {
      this.pickerTab = 'beats';
      this.render();
    });

    // Melodic audition buttons
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

    // Beat Kit audition buttons
    const kitAuditionBtns = this.panel.querySelectorAll<HTMLButtonElement>('.kit-audition-btn');
    kitAuditionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const kitId = btn.dataset.auditionKit as DrumKitId;
        if (kitId) {
          auditionKit(kitId);
        }
      });
    });

    // Melodic instrument select buttons
    const instSelectBtns = this.panel.querySelectorAll<HTMLButtonElement>('.inst-select-btn');
    instSelectBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const instId = btn.dataset.instId;
        if (instId && this.activeInstrumentPickerTrackId) {
          const track = tm.getTrack(this.activeInstrumentPickerTrackId);
          if (track) {
            track.setTrackType('melodic');
            track.setInstrument(instId);
            track.audition();
            events.emit('track:type-change', { trackId: track.id, type: 'melodic' });
            events.emit('track:update', track.id);
          }
          this.activeInstrumentPickerTrackId = null;
          this.render();
        }
      });
    });

    // Beat kit select buttons
    const kitSelectBtns = this.panel.querySelectorAll<HTMLButtonElement>('.kit-select-btn');
    kitSelectBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const kitId = btn.dataset.kitId as DrumKitId;
        if (kitId && this.activeInstrumentPickerTrackId) {
          const track = tm.getTrack(this.activeInstrumentPickerTrackId);
          if (track) {
            track.setTrackType('beat');
            track.setKit(kitId);
            track.audition();
            events.emit('track:type-change', { trackId: track.id, type: 'beat' });
            events.emit('track:update', track.id);
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

    // Key & Root Note selection with audition
    const rootBtns = this.panel.querySelectorAll<HTMLButtonElement>('.root-note-btn');
    rootBtns.forEach((btn) => {
      const handleRootClick = () => {
        const idx = parseInt(btn.dataset.rootIdx || '0', 10);
        state.rootNote = idx;
        events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
        this.render();

        if (getAuditionEnabled()) {
          const previewEngine = getPreviewEngine();
          const activeBtn = this.panel.querySelector<HTMLButtonElement>(`[data-root-idx="${idx}"]`);
          activeBtn?.classList.add('audition-pressed');
          window.setTimeout(() => activeBtn?.classList.remove('audition-pressed'), 350);

          const curIntervals = SCALES[state.scaleName] || SCALES['major pentatonic'];
          previewEngine.previewRoot(idx, undefined, (step) => this.handleHighlight(step, curIntervals));
        }
      };

      btn.addEventListener('click', handleRootClick);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRootClick();
        }
      });
    });

    // Scale selection with audition
    const scaleBtns = this.panel.querySelectorAll<HTMLButtonElement>('.scale-pill-btn');
    scaleBtns.forEach((btn) => {
      const handleScaleClick = () => {
        const scaleName = btn.dataset.scaleName as ScaleName;
        if (scaleName) {
          state.scaleName = scaleName;
          events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
          this.render();

          if (getAuditionEnabled()) {
            const previewEngine = getPreviewEngine();
            const activeBtn = this.panel.querySelector<HTMLButtonElement>(`[data-scale-name="${scaleName}"]`);
            activeBtn?.classList.add('audition-pressed');
            window.setTimeout(() => activeBtn?.classList.remove('audition-pressed'), 450);

            const curIntervals = SCALES[state.scaleName] || SCALES['major pentatonic'];
            previewEngine.previewScale(state.rootNote, state.scaleName, undefined, (step) =>
              this.handleHighlight(step, curIntervals)
            );
          }
        }
      };

      btn.addEventListener('click', handleScaleClick);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleScaleClick();
        }
      });
    });

    // Replay scale preview button
    const replayBtn = this.panel.querySelector<HTMLButtonElement>('#scale-replay-btn');
    replayBtn?.addEventListener('click', () => {
      const previewEngine = getPreviewEngine();
      const curIntervals = SCALES[state.scaleName] || SCALES['major pentatonic'];
      previewEngine.previewScale(state.rootNote, state.scaleName, undefined, (step) =>
        this.handleHighlight(step, curIntervals)
      );
    });

    // Audition toggle checkbox
    const auditionToggle = this.panel.querySelector<HTMLInputElement>('#toggle-audition');
    auditionToggle?.addEventListener('change', () => {
      setAuditionEnabled(auditionToggle.checked);
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

    // Kick ducking slider in Mixer
    const duckSlider = this.panel.querySelector<HTMLInputElement>('#mixer-duck-slider');
    const duckValDisplay = this.panel.querySelector<HTMLElement>('#mixer-duck-val');
    duckSlider?.addEventListener('input', () => {
      const val = parseInt(duckSlider.value, 10);
      state.kickDucking = val;
      if (duckValDisplay) duckValDisplay.textContent = `${val}%`;
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
