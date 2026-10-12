import {
  state,
  events,
  saveDeviceKeyDefaults,
  recordKeyStateHistory,
  recordBarsHistory,
  KeyStateSnapshot,
  savePolyphony,
  PolyphonyCap,
  POLYPHONY_VOICE_COUNTS,
} from '../state';
import { getTrackManager, auditionInstrument, auditionKit, Track } from '../audio/tracks';
import { INSTRUMENT_METAS } from '../audio/instruments';
import { DRUM_KITS, DrumKitId } from '../audio/drums';
import {
  SCALES,
  ScaleName,
  MusicalKey,
  effectiveKey,
  formatShortKeyLabel,
} from '../audio/scales';
import { getTotalAudioLatencySeconds } from '../audio/context';
import { getTransport } from '../audio/transport';
import { getPreviewEngine, getAuditionEnabled, setAuditionEnabled } from '../audio/preview';
import { triggerHaptic } from './haptics';
import { getLightMode, setLightMode } from '../audio/lifecycle';
import { getTrackThemeColor } from './theme';

const ROOT_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function captureCurrentKeyState(): KeyStateSnapshot {
  const tm = getTrackManager();
  const trackKeys: Record<string, MusicalKey | undefined> = {};
  for (const track of tm.getAllTracks()) {
    trackKeys[track.id] = track.key ? { root: track.key.root, scale: track.key.scale } : undefined;
  }
  return {
    keyMode: state.keyMode,
    baseRoot: state.rootNote,
    baseScale: state.scaleName,
    trackKeys,
  };
}

export class TrackPanel {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private currentTab: 'tracks' | 'key' = 'tracks';
  private activeInstrumentPickerTrackId: string | null = null;
  private pickerTab: 'melodic' | 'beats' = 'melodic';
  private openerElement: HTMLElement | null = null;
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
    this.setupSwipeToDismiss();
  }

  private setupSwipeToDismiss() {
    let startY = 0;
    let isTracking = false;

    this.panel.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.panel-header') || target.closest('.panel-drag-handle')) {
          startY = e.touches[0].clientY;
          isTracking = true;
        }
      },
      { passive: true }
    );

    this.panel.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (!isTracking) return;
        const currentY = e.touches[0].clientY;
        const dy = currentY - startY;
        if (dy > 65) {
          isTracking = false;
          this.close();
        }
      },
      { passive: true }
    );

    this.panel.addEventListener(
      'touchend',
      () => {
        isTracking = false;
      },
      { passive: true }
    );
  }

  public open(tab: 'tracks' | 'key' = 'tracks') {
    this.openerElement = (document.activeElement as HTMLElement) || null;
    this.currentTab = tab;
    this.activeInstrumentPickerTrackId = null;
    this.render();
    document.body.style.overflow = 'hidden';
    this.overlay.classList.remove('hidden');
    this.overlay.removeAttribute('aria-hidden');
    this.panel.classList.remove('hidden');
    this.panel.classList.add('visible');
  }

  public close() {
    getPreviewEngine().cancelPreview();
    this.activeInstrumentPickerTrackId = null;
    document.body.style.overflow = '';
    this.panel.classList.remove('visible');
    this.overlay.classList.add('hidden');
    this.overlay.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      this.panel.classList.add('hidden');
      if (
        this.openerElement &&
        typeof this.openerElement.focus === 'function' &&
        document.body.contains(this.openerElement)
      ) {
        this.openerElement.focus();
      }
      this.openerElement = null;
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
    if (!this.isOpen()) {
      this.openerElement = (document.activeElement as HTMLElement) || null;
    }
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
        if (this.isOpen()) {
          this.render();
        }
      }),
      events.on('scale:change', () => {
        if (this.isOpen() && this.currentTab === 'key') {
          this.render();
        }
      }),
      events.on('key-mode:change', () => {
        if (this.isOpen()) {
          this.render();
        }
      }),
      events.on('track:key-change', () => {
        if (this.isOpen()) {
          this.render();
        }
      }),
      events.on('bars:change', () => {
        if (this.isOpen()) {
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
      }),
      events.on('polyphony:thinned', (isThinned) => {
        const hintEl = this.panel.querySelector<HTMLElement>('#mixer-thinned-hint');
        if (hintEl) {
          hintEl.style.display = isThinned ? 'block' : 'none';
        }
      })
    );

    const onThemeChange = () => {
      if (this.isOpen()) {
        this.render();
      }
    };
    window.addEventListener('themechange', onThemeChange);
    this.unsubs.push(() => window.removeEventListener('themechange', onThemeChange));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.stopPropagation();
        this.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.unsubs.push(() => window.removeEventListener('keydown', onKeyDown));
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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              <span>Back to tracks</span>
            </button>
            <span class="picker-title">
              <span class="palette-dot-small" style="background-color: var(${track.colorVar})"></span>
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
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                      <span>Test</span>
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
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                      <span>Test</span>
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
    const currentBars = getTransport().getBars();
    return `
      <!-- Loop Length Control -->
      <div class="mixer-loop-section">
        <div class="mixer-loop-header">
          <span class="section-title">Loop Length</span>
          <span class="loop-bars-display" id="mixer-loop-val">${currentBars} bar${currentBars === 1 ? '' : 's'} (4/4)</span>
        </div>
        <p class="loop-hint">Stretches the drawing in time. Beat grid and tempo stretch with it.</p>
        <div class="loop-mode-toggle" role="radiogroup" aria-label="Loop length in bars">
          ${([1, 2, 4, 8] as const).map((b) => {
            const isSel = currentBars === b;
            return `
              <button type="button"
                class="mode-pill-btn ${isSel ? 'active' : ''}"
                data-loop-bars="${b}"
                role="radio"
                aria-checked="${isSel}"
                tabindex="${isSel ? '0' : '-1'}">
                ${b} bar${b === 1 ? '' : 's'}
              </button>
            `;
          }).join('')}
        </div>
      </div>

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

      <!-- Voice Polyphony Cap -->
      <div class="mixer-sync-section">
        <div class="mixer-sync-header">
          <span class="section-title">Voice Polyphony Cap</span>
          <span class="sync-val-display" id="mixer-polyphony-val">${state.polyphony.charAt(0).toUpperCase() + state.polyphony.slice(1)} (${POLYPHONY_VOICE_COUNTS[state.polyphony]} voices)</span>
        </div>
        <p class="sync-hint">Maximum simultaneous voices. Lower values protect battery and older phones.</p>
        <div class="loop-mode-toggle" role="radiogroup" aria-label="Simultaneous polyphony cap">
          <button type="button"
            class="mode-pill-btn ${state.polyphony === 'low' ? 'active' : ''}"
            data-polyphony="low"
            role="radio"
            aria-checked="${state.polyphony === 'low'}">
            Low (4)
          </button>
          <button type="button"
            class="mode-pill-btn ${state.polyphony === 'medium' ? 'active' : ''}"
            data-polyphony="medium"
            role="radio"
            aria-checked="${state.polyphony === 'medium'}">
            Medium (8)
          </button>
          <button type="button"
            class="mode-pill-btn ${state.polyphony === 'high' ? 'active' : ''}"
            data-polyphony="high"
            role="radio"
            aria-checked="${state.polyphony === 'high'}">
            High (12)
          </button>
        </div>
        <p class="thinned-hint" id="mixer-thinned-hint" style="color: var(--vermilion); font-size: 0.8rem; margin-top: 6px; ${state.isThinned ? '' : 'display: none;'}">Some lines were thinned to keep the sound smooth.</p>
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

    const keyDesc = track.trackType === 'beat' ? 'Drums' : formatShortKeyLabel(effectiveKey(track, state));
    const keyTag =
      state.keyMode === 'perColour' && track.trackType === 'melodic'
        ? `<button type="button" class="track-key-tag" data-key-track="${track.id}" aria-label="Key for ${track.name}: ${formatShortKeyLabel(effectiveKey(track, state))}">${formatShortKeyLabel(effectiveKey(track, state))}</button>`
        : '';

    return `
      <li class="track-row ${isSelected ? 'selected' : ''}" data-track-id="${track.id}">
        <button type="button" class="track-select-lead" data-select-id="${track.id}" aria-label="Select ${track.name} track (${keyDesc}) for drawing">
          <span class="track-dot-indicator" style="background-color: var(${track.colorVar})"></span>
          <span class="track-name-lbl">${track.name}</span>
        </button>

        <button type="button" class="track-inst-btn" data-picker-track="${track.id}" aria-label="Change instrument for ${track.name} (currently ${instName})">
          <span class="inst-label">${instName}</span>
          <svg class="chevron-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>

        ${keyTag}

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
    const tm = getTrackManager();
    const tracks = tm.getAllTracks();
    const selTrack = tm.getTrack(state.selectedTrackId);
    const isBeat = selTrack?.trackType === 'beat';

    const activeKey = isBeat
      ? { root: state.rootNote, scale: state.scaleName }
      : effectiveKey(selTrack, state);
    const currentRoot = activeKey.root;
    const currentScale = activeKey.scale;
    const scaleKeys = Object.keys(SCALES) as ScaleName[];

    const intervals = SCALES[currentScale] || SCALES['major pentatonic'];
    const stripNotes = intervals.map((semi) => ROOT_NOTE_NAMES[(currentRoot + semi) % 12]);
    stripNotes.push(ROOT_NOTE_NAMES[currentRoot % 12]); // Octave

    return `
      <div class="key-picker-container">
        <!-- Segmented Mode Toggle -->
        <div class="key-mode-section">
          <div class="key-mode-toggle" role="radiogroup" aria-label="Key link mode">
            <button type="button" class="mode-pill-btn ${state.keyMode === 'linked' ? 'active' : ''}" id="key-mode-linked" role="radio" aria-checked="${state.keyMode === 'linked'}" tabindex="${state.keyMode === 'linked' ? '0' : '-1'}">
              One key for all
            </button>
            <button type="button" class="mode-pill-btn ${state.keyMode === 'perColour' ? 'active' : ''}" id="key-mode-per-colour" role="radio" aria-checked="${state.keyMode === 'perColour'}" tabindex="${state.keyMode === 'perColour' ? '0' : '-1'}">
              Key per colour
            </button>
          </div>
          <p class="key-mode-hint" id="key-mode-hint">
            ${state.keyMode === 'linked' ? 'Changes apply to the whole drawing' : 'Each color has its own root and scale'}
          </p>
        </div>

        ${state.keyMode === 'perColour' ? `
          <!-- Row of 6 color dots -->
          <div class="key-section">
            <span class="section-title">Color Key Settings</span>
            <div class="key-colour-picker-row" role="radiogroup" aria-label="Select color to edit key">
              ${tracks.map((tr) => {
                const isSel = tr.id === state.selectedTrackId;
                const trIsBeat = tr.trackType === 'beat';
                const trKey = effectiveKey(tr, state);
                const shortLabel = trIsBeat ? 'Drums' : formatShortKeyLabel(trKey);
                const trInstName = trIsBeat
                  ? (DRUM_KITS[tr.kitId as DrumKitId]?.name || 'Drums')
                  : (INSTRUMENT_METAS.find((m) => m.id === tr.instrumentId)?.name || 'Synth');
                const trKeyDesc = trIsBeat ? 'Drums (no key)' : `${ROOT_NOTE_NAMES[trKey.root]} ${trKey.scale}`;
                return `
                  <button type="button"
                    class="key-colour-dot-btn ${isSel ? 'active' : ''} ${trIsBeat ? 'is-beat' : ''}"
                    data-track-dot-id="${tr.id}"
                    role="radio"
                    aria-checked="${isSel}"
                    tabindex="${isSel ? '0' : '-1'}"
                    aria-label="${tr.name}, ${trInstName}, ${trKeyDesc}">
                    <span class="palette-dot-large" style="background-color: var(${tr.colorVar})"></span>
                    <span class="colour-dot-label">${shortLabel}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${isBeat && state.keyMode === 'perColour' ? `
          <div class="beat-key-disabled-banner">
            <p>Drums have no key. Select a melody color above to set its key.</p>
          </div>
        ` : ''}

        <div class="key-section">
          <span class="section-title">Root Key</span>
          <div class="root-note-grid ${isBeat && state.keyMode === 'perColour' ? 'disabled-grid' : ''}" ${isBeat && state.keyMode === 'perColour' ? 'aria-disabled="true"' : ''}>
            ${ROOT_NOTE_NAMES.map((name, idx) => `
              <button type="button" class="root-note-btn ${currentRoot === idx ? 'active' : ''}" data-root-idx="${idx}" tabindex="0" ${isBeat && state.keyMode === 'perColour' ? 'disabled' : ''}>
                ${name}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="key-section">
          <span class="section-title">Musical Scale</span>
          <div class="scale-list-grid ${isBeat && state.keyMode === 'perColour' ? 'disabled-grid' : ''}" ${isBeat && state.keyMode === 'perColour' ? 'aria-disabled="true"' : ''}>
            ${scaleKeys.map((scaleName) => `
              <button type="button" class="scale-pill-btn ${currentScale === scaleName ? 'active' : ''}" data-scale-name="${scaleName}" tabindex="0" ${isBeat && state.keyMode === 'perColour' ? 'disabled' : ''}>
                ${scaleName.replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            `).join('')}
          </div>

          ${isBeat && state.keyMode === 'linked' ? `
            <p class="scale-beat-note" id="scale-beat-note">Beat track selected, previewing with Keys.</p>
          ` : ''}

          <!-- Scale Strip with note names and Replay button -->
          <div class="scale-strip-row ${isBeat && state.keyMode === 'perColour' ? 'disabled-grid' : ''}" aria-label="Scale note sequence">
            <div class="scale-strip" id="scale-strip">
              ${stripNotes.map((name, idx) => `
                <span class="scale-strip-note" data-strip-idx="${idx}">${name}</span>
              `).join('')}
            </div>
            <button type="button" class="scale-replay-btn" id="scale-replay-btn" aria-label="Replay scale audition" tabindex="0" ${isBeat && state.keyMode === 'perColour' ? 'disabled' : ''}>
              Play
            </button>
          </div>

          ${state.keyMode === 'perColour' && !isBeat ? `
            <div class="per-colour-actions-row">
              <button type="button" class="panel-secondary-btn" id="btn-copy-key-all" aria-label="Copy this key to all colours">
                Copy this key to all colours
              </button>
              <button type="button" class="panel-secondary-btn" id="btn-match-project-key" aria-label="Match project key">
                Match project key
              </button>
            </div>
          ` : ''}
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
          <label class="panel-checkbox-row">
            <input type="checkbox" class="panel-checkbox" id="toggle-light-mode" ${getLightMode() ? 'checked' : ''} tabindex="0" />
            <span class="checkbox-label">Light mode (saves battery & CPU)</span>
          </label>
        </div>
      </div>
    `;
  }

  private handleHighlight(step: number | 'chord' | null, intervals: readonly number[]) {
    const noteEls = this.panel.querySelectorAll<HTMLElement>('.scale-strip-note');
    if (noteEls.length === 0) return;

    const trackColor = getTrackThemeColor(state.selectedTrackId);

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
          el.style.color = 'var(--paper)';
        }
      });
    } else if (typeof step === 'number') {
      const el = noteEls[step];
      if (el) {
        el.classList.add('active');
        el.style.backgroundColor = trackColor;
        el.style.borderColor = trackColor;
        el.style.color = 'var(--paper)';
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
          triggerHaptic(8);
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

    // Loop Length buttons
    const loopBtns = this.panel.querySelectorAll<HTMLButtonElement>('[data-loop-bars]');
    const loopBtnList = Array.from(loopBtns);
    loopBtnList.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const barsVal = parseInt(btn.dataset.loopBars || '2', 10);
        const transport = getTransport();
        const before = transport.getBars();
        if (before !== barsVal) {
          triggerHaptic(8);
          recordBarsHistory(before, barsVal);
          transport.setBars(barsVal);
          this.render();
        }
      });

      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = loopBtnList[(idx + 1) % loopBtnList.length];
          next.focus();
          next.click();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = loopBtnList[(idx - 1 + loopBtnList.length) % loopBtnList.length];
          prev.focus();
          prev.click();
        }
      });
    });

    // Key tag click triggers in Mixer rows
    const keyTags = this.panel.querySelectorAll<HTMLButtonElement>('.track-key-tag');
    keyTags.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.keyTrack;
        if (trackId) {
          triggerHaptic(8);
          state.selectedTrackId = trackId;
          events.emit('track:select', trackId);
          this.currentTab = 'key';
          this.render();
        }
      });
    });

    // Key link mode switches
    const btnLinked = this.panel.querySelector<HTMLButtonElement>('#key-mode-linked');
    const btnPerColour = this.panel.querySelector<HTMLButtonElement>('#key-mode-per-colour');

    btnLinked?.addEventListener('click', () => {
      if (state.keyMode !== 'linked') {
        triggerHaptic(8);
        const before = captureCurrentKeyState();
        state.keyMode = 'linked';
        saveDeviceKeyDefaults({ keyMode: 'linked' });
        events.emit('key-mode:change', 'linked');
        const after = captureCurrentKeyState();
        recordKeyStateHistory(before, after);
        this.render();
      }
    });

    btnPerColour?.addEventListener('click', () => {
      if (state.keyMode !== 'perColour') {
        triggerHaptic(8);
        const before = captureCurrentKeyState();
        state.keyMode = 'perColour';
        saveDeviceKeyDefaults({ keyMode: 'perColour' });
        events.emit('key-mode:change', 'perColour');
        const after = captureCurrentKeyState();
        recordKeyStateHistory(before, after);
        this.render();
      }
    });

    const modeBtns = [btnLinked, btnPerColour].filter(Boolean) as HTMLButtonElement[];
    modeBtns.forEach((btn, idx) => {
      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = modeBtns[(idx + 1) % modeBtns.length];
          next.focus();
          next.click();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = modeBtns[(idx - 1 + modeBtns.length) % modeBtns.length];
          prev.focus();
          prev.click();
        }
      });
    });

    // Color dot buttons in perColour mode
    const dotBtns = this.panel.querySelectorAll<HTMLButtonElement>('[data-track-dot-id]');
    const dotBtnList = Array.from(dotBtns);
    dotBtnList.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const trId = btn.dataset.trackDotId;
        if (trId) {
          triggerHaptic(8);
          state.selectedTrackId = trId;
          events.emit('track:select', trId);
          const tr = tm.getTrack(trId);
          tr?.audition();
          this.render();
        }
      });

      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = dotBtnList[(idx + 1) % dotBtnList.length];
          next.focus();
          next.click();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = dotBtnList[(idx - 1 + dotBtnList.length) % dotBtnList.length];
          prev.focus();
          prev.click();
        }
      });
    });

    const selTrack = tm.getTrack(state.selectedTrackId);

    // Copy this key to all colours
    const copyBtn = this.panel.querySelector<HTMLButtonElement>('#btn-copy-key-all');
    copyBtn?.addEventListener('click', () => {
      if (selTrack && selTrack.trackType === 'melodic') {
        triggerHaptic(8);
        const before = captureCurrentKeyState();
        const srcKey = effectiveKey(selTrack, state);
        state.rootNote = srcKey.root;
        state.scaleName = srcKey.scale;
        saveDeviceKeyDefaults({ rootNote: srcKey.root, scaleName: srcKey.scale });
        for (const tr of tm.getAllTracks()) {
          if (tr.trackType === 'melodic') {
            tr.setKey({ root: srcKey.root, scale: srcKey.scale });
            events.emit('track:key-change', { trackId: tr.id, key: { root: srcKey.root, scale: srcKey.scale } });
          }
        }
        events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
        const after = captureCurrentKeyState();
        recordKeyStateHistory(before, after);
        this.render();
      }
    });

    // Match project key
    const matchBtn = this.panel.querySelector<HTMLButtonElement>('#btn-match-project-key');
    matchBtn?.addEventListener('click', () => {
      if (selTrack && selTrack.trackType === 'melodic') {
        triggerHaptic(8);
        const before = captureCurrentKeyState();
        const matchKey: MusicalKey = { root: state.rootNote, scale: state.scaleName };
        selTrack.setKey(matchKey);
        events.emit('track:key-change', { trackId: selTrack.id, key: matchKey });
        const after = captureCurrentKeyState();
        recordKeyStateHistory(before, after, selTrack.id);
        this.render();
      }
    });

    // Key & Root Note selection with audition
    const rootBtns = this.panel.querySelectorAll<HTMLButtonElement>('.root-note-btn');
    rootBtns.forEach((btn) => {
      const handleRootClick = () => {
        if (state.keyMode === 'perColour' && selTrack?.trackType === 'beat') return;
        triggerHaptic(8);
        const idx = parseInt(btn.dataset.rootIdx || '0', 10);
        const before = captureCurrentKeyState();

        if (state.keyMode === 'linked') {
          state.rootNote = idx;
          saveDeviceKeyDefaults({ rootNote: idx });
          events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
          const after = captureCurrentKeyState();
          recordKeyStateHistory(before, after);
        } else {
          if (selTrack && selTrack.trackType === 'melodic') {
            const curK = effectiveKey(selTrack, state);
            const newKey: MusicalKey = { root: idx, scale: curK.scale };
            selTrack.setKey(newKey);
            events.emit('track:key-change', { trackId: selTrack.id, key: newKey });
            const after = captureCurrentKeyState();
            recordKeyStateHistory(before, after, selTrack.id);
          }
        }
        this.render();

        if (getAuditionEnabled()) {
          const previewEngine = getPreviewEngine();
          const activeBtn = this.panel.querySelector<HTMLButtonElement>(`[data-root-idx="${idx}"]`);
          activeBtn?.classList.add('audition-pressed');
          window.setTimeout(() => activeBtn?.classList.remove('audition-pressed'), 350);

          const curScaleName = state.keyMode === 'linked' ? state.scaleName : (effectiveKey(selTrack, state).scale);
          const curIntervals = SCALES[curScaleName] || SCALES['major pentatonic'];
          previewEngine.previewRoot(idx, selTrack, (step) => this.handleHighlight(step, curIntervals));
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
        if (state.keyMode === 'perColour' && selTrack?.trackType === 'beat') return;
        triggerHaptic(8);
        const scaleName = btn.dataset.scaleName as ScaleName;
        if (!scaleName) return;

        const before = captureCurrentKeyState();
        if (state.keyMode === 'linked') {
          state.scaleName = scaleName;
          saveDeviceKeyDefaults({ scaleName });
          events.emit('scale:change', { rootNote: state.rootNote, scaleName: state.scaleName });
          const after = captureCurrentKeyState();
          recordKeyStateHistory(before, after);
        } else {
          if (selTrack && selTrack.trackType === 'melodic') {
            const curK = effectiveKey(selTrack, state);
            const newKey: MusicalKey = { root: curK.root, scale: scaleName };
            selTrack.setKey(newKey);
            events.emit('track:key-change', { trackId: selTrack.id, key: newKey });
            const after = captureCurrentKeyState();
            recordKeyStateHistory(before, after, selTrack.id);
          }
        }
        this.render();

        if (getAuditionEnabled()) {
          const previewEngine = getPreviewEngine();
          const activeBtn = this.panel.querySelector<HTMLButtonElement>(`[data-scale-name="${scaleName}"]`);
          activeBtn?.classList.add('audition-pressed');
          window.setTimeout(() => activeBtn?.classList.remove('audition-pressed'), 450);

          const curRoot = state.keyMode === 'linked' ? state.rootNote : (effectiveKey(selTrack, state).root);
          const curIntervals = SCALES[scaleName] || SCALES['major pentatonic'];
          previewEngine.previewScale(curRoot, scaleName, selTrack, (step) =>
            this.handleHighlight(step, curIntervals)
          );
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
      const curRoot = state.keyMode === 'linked' ? state.rootNote : (effectiveKey(selTrack, state).root);
      const curScaleName = state.keyMode === 'linked' ? state.scaleName : (effectiveKey(selTrack, state).scale);
      const curIntervals = SCALES[curScaleName] || SCALES['major pentatonic'];
      previewEngine.previewScale(curRoot, curScaleName, selTrack, (step) =>
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

    const lightModeToggle = this.panel.querySelector<HTMLInputElement>('#toggle-light-mode');
    lightModeToggle?.addEventListener('change', () => {
      setLightMode(lightModeToggle.checked);
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

    // Polyphony cap toggle buttons in Mixer
    const polyBtns = this.panel.querySelectorAll<HTMLButtonElement>('[data-polyphony]');
    polyBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const capVal = btn.dataset.polyphony as PolyphonyCap;
        if (capVal && capVal !== state.polyphony) {
          triggerHaptic(8);
          state.polyphony = capVal;
          savePolyphony(capVal);
          events.emit('polyphony:change', capVal);
          this.render();
        }
      });
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
