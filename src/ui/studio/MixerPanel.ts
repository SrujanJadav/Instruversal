import { Song, SongLane, SongMasterSettings, MasteringPreset } from '../../song/types';
import { MASTERING_PRESETS, detectPresetMatch } from '../../song/presets';
import { SongPlaybackEngine } from '../../song/playbackEngine';

export interface MixerPanelCallbacks {
  onUpdateLane: (lane: SongLane) => void;
  onUpdateMaster: (master: SongMasterSettings) => void;
  onAutoBalance: () => void;
  onOpenEffects: () => void;
  onClose: () => void;
}

export class MixerPanel {
  public element: HTMLElement;
  private song: Song;
  private playbackEngine: SongPlaybackEngine;
  private callbacks: MixerPanelCallbacks;
  private isOpen: boolean = false;
  private rafId: number | null = null;
  private lastMeterDrawTime: number = 0;
  private clipWarningTimer: number | null = null;
  private isClipping: boolean = false;

  // Cached DOM elements for fast 30fps meter updates
  private laneMeterFills: Map<string, HTMLElement> = new Map();
  private laneMeterPeaks: Map<string, HTMLElement> = new Map();
  private masterMeterFill: HTMLElement | null = null;
  private masterMeterPeak: HTMLElement | null = null;
  private clipLedEl: HTMLElement | null = null;
  private clipNoticeEl: HTMLElement | null = null;
  private loudnessValueEl: HTMLElement | null = null;

  constructor(
    song: Song,
    playbackEngine: SongPlaybackEngine,
    callbacks: MixerPanelCallbacks
  ) {
    this.song = song;
    this.playbackEngine = playbackEngine;
    this.callbacks = callbacks;

    this.element = document.createElement('div');
    this.element.className = 'studio-mixer-panel';
    this.element.id = 'studio-mixer-panel';
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Song Mixer');
    this.element.style.display = 'none';

    this.render();
  }

  public setSong(song: Song) {
    this.song = song;
    if (this.isOpen) {
      this.render();
    }
  }

  public open() {
    this.isOpen = true;
    this.element.style.display = 'flex';
    this.render();
    this.startMeterLoop();
  }

  public close() {
    this.isOpen = false;
    this.element.style.display = 'none';
    this.stopMeterLoop();
    this.callbacks.onClose();
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public getIsClipping(): boolean {
    return this.isClipping;
  }

  public onPlaybackChange(isPlaying: boolean) {
    if (this.isOpen && isPlaying) {
      this.startMeterLoop();
    } else {
      this.stopMeterLoop();
      this.clearMeters();
    }
  }

  private startMeterLoop() {
    this.stopMeterLoop();
    const tick = (now: number) => {
      if (!this.isOpen) return;

      // Throttle to <= 30fps (~33ms)
      if (now - this.lastMeterDrawTime >= 33) {
        this.lastMeterDrawTime = now;
        this.updateMeterDrawings();
      }

      if (typeof requestAnimationFrame !== 'undefined') {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(tick);
    }
  }

  private stopMeterLoop() {
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  private clearMeters() {
    for (const fill of this.laneMeterFills.values()) {
      fill.style.height = '0%';
    }
    for (const peak of this.laneMeterPeaks.values()) {
      peak.style.bottom = '0%';
    }
    if (this.masterMeterFill) this.masterMeterFill.style.height = '0%';
    if (this.masterMeterPeak) this.masterMeterPeak.style.bottom = '0%';
  }

  private dbToPercent(db: number): number {
    if (db <= -60) return 0;
    if (db >= 0) return 100;
    // Map -60 dB to 0 dB logarithmically/visually
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  }

  private updateMeterDrawings() {
    // 1. Update lanes
    for (const lane of this.song.lanes) {
      const db = this.playbackEngine.getLaneMeterLevel(lane.id);
      const pct = this.dbToPercent(db);

      const fill = this.laneMeterFills.get(lane.id);
      if (fill) {
        fill.style.height = `${pct}%`;
      }

      const peak = this.laneMeterPeaks.get(lane.id);
      if (peak) {
        peak.style.bottom = `${Math.min(98, pct)}%`;
      }
    }

    // 2. Update master meter
    const masterLevel = this.playbackEngine.getMasterMeterLevel();
    const masterPct = this.dbToPercent(masterLevel.rmsDb);
    const peakPct = this.dbToPercent(masterLevel.peakDb);

    if (this.masterMeterFill) {
      this.masterMeterFill.style.height = `${masterPct}%`;
    }
    if (this.masterMeterPeak) {
      this.masterMeterPeak.style.bottom = `${Math.min(98, peakPct)}%`;
    }

    // Clip Warning: if peak > -1.0 dB
    if (masterLevel.peakDb > -1.0) {
      this.triggerClipWarning();
    }

    // Loudness readout (RMS)
    if (this.loudnessValueEl) {
      this.loudnessValueEl.textContent =
        masterLevel.rmsDb <= -60 ? '-∞ dB' : `${masterLevel.rmsDb.toFixed(1)} dB`;
    }
  }

  private triggerClipWarning() {
    this.isClipping = true;
    if (this.clipLedEl) {
      this.clipLedEl.classList.add('clipping');
    }
    if (this.clipNoticeEl) {
      this.clipNoticeEl.style.opacity = '1';
    }

    if (this.clipWarningTimer !== null) {
      window.clearTimeout(this.clipWarningTimer);
    }

    // Stays lit for 2 seconds
    this.clipWarningTimer = window.setTimeout(() => {
      this.isClipping = false;
      if (this.clipLedEl) {
        this.clipLedEl.classList.remove('clipping');
      }
      if (this.clipNoticeEl) {
        this.clipNoticeEl.style.opacity = '0';
      }
      this.clipWarningTimer = null;
    }, 2000);
  }

  public render() {
    this.laneMeterFills.clear();
    this.laneMeterPeaks.clear();

    const master = this.song.master;
    const currentPreset = detectPresetMatch(master);

    this.element.innerHTML = `
      <div class="studio-mixer-header">
        <div class="studio-mixer-title">
          <span>Mixer & Master</span>
          <span class="studio-mixer-count">${this.song.lanes.length} lanes</span>
        </div>
        <div class="studio-mixer-header-actions">
          <button type="button" class="studio-btn studio-btn-sm" id="mixer-balance-btn" title="Auto-balance starting levels">
            Balance lanes
          </button>
          <button type="button" class="studio-mini-btn" id="mixer-close-btn" title="Close mixer" aria-label="Close mixer">
            ✕
          </button>
        </div>
      </div>

      <div class="studio-mixer-body">
        <!-- Lane Channel Strips -->
        <div class="studio-mixer-lanes" id="mixer-lanes-container">
          ${this.song.lanes
            .map((lane) => {
              const panDisplay =
                lane.pan === 0
                  ? 'C'
                  : lane.pan < 0
                  ? `${Math.round(Math.abs(lane.pan) * 100)}L`
                  : `${Math.round(lane.pan * 100)}R`;

              const revPct = Math.round((lane.sendReverb || 0) * 100);
              const delPct = Math.round((lane.sendDelay || 0) * 100);

              return `
                <div class="studio-channel-strip" data-lane-id="${lane.id}">
                  <div class="studio-strip-header">
                    <span class="studio-strip-name" title="${lane.name}">${lane.name}</span>
                    <div class="studio-strip-ms">
                      <button type="button" class="studio-mini-btn ${lane.mute ? 'active' : ''}" data-action="mute" aria-pressed="${lane.mute}" title="Mute">M</button>
                      <button type="button" class="studio-mini-btn ${lane.solo ? 'active-solo' : ''}" data-action="solo" aria-pressed="${lane.solo}" title="Solo">S</button>
                    </div>
                  </div>

                  <!-- Pan & Sends -->
                  <div class="studio-strip-controls">
                    <div class="studio-knob-row">
                      <label class="studio-knob-label">Pan</label>
                      <input type="range" class="studio-slider-mini" data-control="pan" min="-1" max="1" step="0.05" value="${lane.pan}" aria-label="${lane.name} Pan" aria-valuetext="${panDisplay}" />
                      <span class="studio-knob-readout" data-readout="pan">${panDisplay}</span>
                    </div>

                    <div class="studio-knob-row">
                      <label class="studio-knob-label">Rev</label>
                      <input type="range" class="studio-slider-mini" data-control="sendReverb" min="0" max="1" step="0.05" value="${lane.sendReverb || 0}" aria-label="${lane.name} Reverb send" aria-valuetext="${revPct}%" />
                      <span class="studio-knob-readout" data-readout="rev">${revPct}%</span>
                    </div>

                    <div class="studio-knob-row">
                      <label class="studio-knob-label">Dly</label>
                      <input type="range" class="studio-slider-mini" data-control="sendDelay" min="0" max="1" step="0.05" value="${lane.sendDelay || 0}" aria-label="${lane.name} Delay send" aria-valuetext="${delPct}%" />
                      <span class="studio-knob-readout" data-readout="del">${delPct}%</span>
                    </div>
                  </div>

                  <!-- Fader & Meter Section -->
                  <div class="studio-fader-section">
                    <div class="studio-meter-slot">
                      <div class="studio-meter-track">
                        <div class="studio-meter-fill" data-meter-fill="${lane.id}"></div>
                        <div class="studio-meter-peak" data-meter-peak="${lane.id}"></div>
                      </div>
                    </div>

                    <div class="studio-fader-track-container">
                      <input type="range" class="studio-fader-vertical" data-control="volume" min="-60" max="6" step="0.5" value="${lane.volumeDb}" aria-label="${lane.name} Volume" aria-valuetext="${lane.volumeDb.toFixed(1)} dB" />
                    </div>
                  </div>

                  <div class="studio-fader-readout" data-readout="vol" title="Double click to reset to 0 dB">
                    ${lane.volumeDb <= -60 ? '-∞ dB' : `${lane.volumeDb.toFixed(1)} dB`}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- Master Section -->
        <div class="studio-master-strip">
          <div class="studio-strip-header">
            <span class="studio-strip-name" style="font-weight: 700;">MASTER</span>
            <div class="studio-clip-led" id="master-clip-led" title="Clip warning" aria-hidden="true"></div>
          </div>

          <div class="studio-master-loudness-row">
            <span style="font-size: 0.65rem; color: var(--ink-soft);">approx. loudness:</span>
            <span class="studio-readout-mono" id="master-loudness-readout">-∞ dB</span>
          </div>

          <div class="studio-clip-warning-text" id="master-clip-warning">
            Quiet it down a little
          </div>

          <!-- Master Fader & Meter -->
          <div class="studio-fader-section" style="margin-top: 8px;">
            <div class="studio-meter-slot">
              <div class="studio-meter-track">
                <div class="studio-meter-fill master-fill" id="master-meter-fill"></div>
                <div class="studio-meter-peak master-peak" id="master-meter-peak"></div>
              </div>
            </div>

            <div class="studio-fader-track-container">
              <input type="range" class="studio-fader-vertical" id="master-gain-slider" min="-60" max="6" step="0.5" value="${master.gainDb}" aria-label="Master Gain" aria-valuetext="${master.gainDb.toFixed(1)} dB" />
            </div>
          </div>

          <div class="studio-fader-readout" id="master-gain-readout" title="Double click to reset to 0 dB">
            ${master.gainDb <= -60 ? '-∞ dB' : `${master.gainDb.toFixed(1)} dB`}
          </div>

          <!-- Mastering Presets Chips -->
          <div class="studio-master-presets-row">
            <div class="studio-field-label" style="font-size: 0.68rem; margin-bottom: 2px;">Mastering Presets:</div>
            <div class="studio-presets-chips">
              ${(['clean', 'warm', 'bright', 'loud', 'lo-fi'] as MasteringPreset[])
                .map(
                  (pk) => `
                    <button type="button" class="studio-preset-chip ${currentPreset === pk ? 'active' : ''}" data-preset="${pk}">
                      ${pk === 'lo-fi' ? 'Lo-fi' : pk.charAt(0).toUpperCase() + pk.slice(1)}
                    </button>
                  `
                )
                .join('')}
              <span class="studio-preset-chip custom ${currentPreset === 'custom' ? 'active' : ''}">Custom</span>
            </div>
          </div>

          <!-- 3-Band EQ Controls -->
          <div class="studio-eq-section">
            <div class="studio-eq-header">
              <span class="studio-field-label">3-Band EQ</span>
              <button type="button" class="studio-mini-btn" id="eq-reset-btn" title="Reset EQ">Reset</button>
            </div>
            <div class="studio-eq-sliders">
              <div class="studio-eq-row">
                <label>Low</label>
                <input type="range" class="studio-slider-mini" id="eq-low" min="-12" max="12" step="0.5" value="${master.eq.lowDb}" aria-label="EQ Low" />
                <span class="studio-eq-val" id="eq-low-val">${master.eq.lowDb.toFixed(1)}</span>
              </div>
              <div class="studio-eq-row">
                <label>Mid</label>
                <input type="range" class="studio-slider-mini" id="eq-mid" min="-12" max="12" step="0.5" value="${master.eq.midDb}" aria-label="EQ Mid" />
                <span class="studio-eq-val" id="eq-mid-val">${master.eq.midDb.toFixed(1)}</span>
              </div>
              <div class="studio-eq-row">
                <label>High</label>
                <input type="range" class="studio-slider-mini" id="eq-high" min="-12" max="12" step="0.5" value="${master.eq.highDb}" aria-label="EQ High" />
                <span class="studio-eq-val" id="eq-high-val">${master.eq.highDb.toFixed(1)}</span>
              </div>
            </div>
          </div>

          <!-- Glue Compressor Accordion -->
          <details class="studio-glue-accordion">
            <summary class="studio-glue-summary">
              <span>Glue Compressor</span>
              <span class="studio-glue-state">${master.compressor.on ? 'ON' : 'OFF'}</span>
            </summary>
            <div class="studio-glue-content">
              <div class="studio-glue-toggle-row">
                <label>Enable</label>
                <input type="checkbox" id="comp-on-check" ${master.compressor.on ? 'checked' : ''} />
              </div>
              <div class="studio-glue-row">
                <label>Thresh</label>
                <input type="range" class="studio-slider-mini" id="comp-thresh" min="-40" max="0" step="1" value="${master.compressor.thresholdDb}" />
                <span class="studio-glue-val" id="comp-thresh-val">${master.compressor.thresholdDb}dB</span>
              </div>
              <div class="studio-glue-row">
                <label>Ratio</label>
                <input type="range" class="studio-slider-mini" id="comp-ratio" min="1" max="20" step="0.5" value="${master.compressor.ratio}" />
                <span class="studio-glue-val" id="comp-ratio-val">${master.compressor.ratio}:1</span>
              </div>
              <div class="studio-glue-row">
                <label>Attack</label>
                <input type="range" class="studio-slider-mini" id="comp-attack" min="1" max="100" step="1" value="${master.compressor.attackMs}" />
                <span class="studio-glue-val" id="comp-attack-val">${master.compressor.attackMs}ms</span>
              </div>
              <div class="studio-glue-row">
                <label>Release</label>
                <input type="range" class="studio-slider-mini" id="comp-release" min="20" max="1000" step="10" value="${master.compressor.releaseMs}" />
                <span class="studio-glue-val" id="comp-release-val">${master.compressor.releaseMs}ms</span>
              </div>
              <div class="studio-glue-row">
                <label>Makeup</label>
                <input type="range" class="studio-slider-mini" id="comp-makeup" min="0" max="20" step="0.5" value="${master.compressor.makeupDb}" />
                <span class="studio-glue-val" id="comp-makeup-val">${master.compressor.makeupDb}dB</span>
              </div>
            </div>
          </details>

          <!-- Effects Rack Button -->
          <button type="button" class="studio-btn studio-btn-sm" id="master-fx-btn" style="margin-top: 10px;">
            Effects Rack
          </button>
        </div>
      </div>
    `;

    this.cacheMeterElements();
    this.bindEvents();
  }

  private cacheMeterElements() {
    this.song.lanes.forEach((lane) => {
      const fill = this.element.querySelector<HTMLElement>(`[data-meter-fill="${lane.id}"]`);
      if (fill) this.laneMeterFills.set(lane.id, fill);

      const peak = this.element.querySelector<HTMLElement>(`[data-meter-peak="${lane.id}"]`);
      if (peak) this.laneMeterPeaks.set(lane.id, peak);
    });

    this.masterMeterFill = this.element.querySelector<HTMLElement>('#master-meter-fill');
    this.masterMeterPeak = this.element.querySelector<HTMLElement>('#master-meter-peak');
    this.clipLedEl = this.element.querySelector<HTMLElement>('#master-clip-led');
    this.clipNoticeEl = this.element.querySelector<HTMLElement>('#master-clip-warning');
    this.loudnessValueEl = this.element.querySelector<HTMLElement>('#master-loudness-readout');
  }

  private bindEvents() {
    // Close & Balance buttons
    this.element.querySelector('#mixer-close-btn')?.addEventListener('click', () => this.close());
    this.element.querySelector('#mixer-balance-btn')?.addEventListener('click', () => this.callbacks.onAutoBalance());

    // Lane Strips Events
    this.element.querySelectorAll<HTMLElement>('.studio-channel-strip').forEach((strip) => {
      const laneId = strip.dataset.laneId;
      if (!laneId) return;

      const lane = this.song.lanes.find((l) => l.id === laneId);
      if (!lane) return;

      // Mute / Solo
      strip.querySelector('[data-action="mute"]')?.addEventListener('click', () => {
        this.callbacks.onUpdateLane({ ...lane, mute: !lane.mute });
      });

      strip.querySelector('[data-action="solo"]')?.addEventListener('click', () => {
        this.callbacks.onUpdateLane({ ...lane, solo: !lane.solo });
      });

      // Volume fader
      const volSlider = strip.querySelector<HTMLInputElement>('[data-control="volume"]');
      const volReadout = strip.querySelector<HTMLElement>('[data-readout="vol"]');

      volSlider?.addEventListener('input', () => {
        const val = parseFloat(volSlider.value);
        if (volReadout) volReadout.textContent = val <= -60 ? '-∞ dB' : `${val.toFixed(1)} dB`;
        volSlider.setAttribute('aria-valuetext', `${val.toFixed(1)} dB`);
        this.callbacks.onUpdateLane({ ...lane, volumeDb: val });
      });

      volReadout?.addEventListener('dblclick', () => {
        if (volSlider) {
          volSlider.value = '0';
          if (volReadout) volReadout.textContent = '0.0 dB';
          this.callbacks.onUpdateLane({ ...lane, volumeDb: 0 });
        }
      });

      // Pan slider
      const panSlider = strip.querySelector<HTMLInputElement>('[data-control="pan"]');
      const panReadout = strip.querySelector<HTMLElement>('[data-readout="pan"]');

      panSlider?.addEventListener('input', () => {
        const val = parseFloat(panSlider.value);
        const text =
          val === 0
            ? 'C'
            : val < 0
            ? `${Math.round(Math.abs(val) * 100)}L`
            : `${Math.round(val * 100)}R`;
        if (panReadout) panReadout.textContent = text;
        panSlider.setAttribute('aria-valuetext', text);
        this.callbacks.onUpdateLane({ ...lane, pan: val });
      });

      panReadout?.addEventListener('dblclick', () => {
        if (panSlider) {
          panSlider.value = '0';
          if (panReadout) panReadout.textContent = 'C';
          this.callbacks.onUpdateLane({ ...lane, pan: 0 });
        }
      });

      // Reverb send
      const revSlider = strip.querySelector<HTMLInputElement>('[data-control="sendReverb"]');
      const revReadout = strip.querySelector<HTMLElement>('[data-readout="rev"]');

      revSlider?.addEventListener('input', () => {
        const val = parseFloat(revSlider.value);
        const pct = `${Math.round(val * 100)}%`;
        if (revReadout) revReadout.textContent = pct;
        revSlider.setAttribute('aria-valuetext', pct);
        this.callbacks.onUpdateLane({ ...lane, sendReverb: val });
      });

      revReadout?.addEventListener('dblclick', () => {
        if (revSlider) {
          revSlider.value = '0';
          if (revReadout) revReadout.textContent = '0%';
          this.callbacks.onUpdateLane({ ...lane, sendReverb: 0 });
        }
      });

      // Delay send
      const delSlider = strip.querySelector<HTMLInputElement>('[data-control="sendDelay"]');
      const delReadout = strip.querySelector<HTMLElement>('[data-readout="del"]');

      delSlider?.addEventListener('input', () => {
        const val = parseFloat(delSlider.value);
        const pct = `${Math.round(val * 100)}%`;
        if (delReadout) delReadout.textContent = pct;
        delSlider.setAttribute('aria-valuetext', pct);
        this.callbacks.onUpdateLane({ ...lane, sendDelay: val });
      });

      delReadout?.addEventListener('dblclick', () => {
        if (delSlider) {
          delSlider.value = '0';
          if (delReadout) delReadout.textContent = '0%';
          this.callbacks.onUpdateLane({ ...lane, sendDelay: 0 });
        }
      });
    });

    // Master Fader
    const masterSlider = this.element.querySelector<HTMLInputElement>('#master-gain-slider');
    const masterReadout = this.element.querySelector<HTMLElement>('#master-gain-readout');

    masterSlider?.addEventListener('input', () => {
      const val = parseFloat(masterSlider.value);
      if (masterReadout) masterReadout.textContent = val <= -60 ? '-∞ dB' : `${val.toFixed(1)} dB`;
      this.callbacks.onUpdateMaster({ ...this.song.master, gainDb: val });
    });

    masterReadout?.addEventListener('dblclick', () => {
      if (masterSlider) {
        masterSlider.value = '0';
        if (masterReadout) masterReadout.textContent = '0.0 dB';
        this.callbacks.onUpdateMaster({ ...this.song.master, gainDb: 0 });
      }
    });

    // Mastering Presets Chips
    this.element.querySelectorAll<HTMLButtonElement>('.studio-preset-chip[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pk = btn.dataset.preset as Exclude<MasteringPreset, 'custom'>;
        const preset = MASTERING_PRESETS[pk];
        if (preset) {
          const updatedMaster: SongMasterSettings = {
            ...this.song.master,
            preset: pk,
            eq: { ...preset.eq },
            compressor: { ...preset.compressor },
          };
          this.callbacks.onUpdateMaster(updatedMaster);
          this.render();
        }
      });
    });

    // EQ Sliders & Reset
    const eqLow = this.element.querySelector<HTMLInputElement>('#eq-low');
    const eqMid = this.element.querySelector<HTMLInputElement>('#eq-mid');
    const eqHigh = this.element.querySelector<HTMLInputElement>('#eq-high');

    const onEqChange = () => {
      const lowVal = parseFloat(eqLow?.value || '0');
      const midVal = parseFloat(eqMid?.value || '0');
      const highVal = parseFloat(eqHigh?.value || '0');

      const lowTxt = this.element.querySelector('#eq-low-val');
      const midTxt = this.element.querySelector('#eq-mid-val');
      const highTxt = this.element.querySelector('#eq-high-val');
      if (lowTxt) lowTxt.textContent = lowVal.toFixed(1);
      if (midTxt) midTxt.textContent = midVal.toFixed(1);
      if (highTxt) highTxt.textContent = highVal.toFixed(1);

      this.callbacks.onUpdateMaster({
        ...this.song.master,
        preset: 'custom',
        eq: { lowDb: lowVal, midDb: midVal, highDb: highVal },
      });
    };

    eqLow?.addEventListener('input', onEqChange);
    eqMid?.addEventListener('input', onEqChange);
    eqHigh?.addEventListener('input', onEqChange);

    this.element.querySelector('#eq-reset-btn')?.addEventListener('click', () => {
      if (eqLow) eqLow.value = '0';
      if (eqMid) eqMid.value = '0';
      if (eqHigh) eqHigh.value = '0';
      onEqChange();
    });

    // Glue Compressor Controls
    const compOnCheck = this.element.querySelector<HTMLInputElement>('#comp-on-check');
    const compThresh = this.element.querySelector<HTMLInputElement>('#comp-thresh');
    const compRatio = this.element.querySelector<HTMLInputElement>('#comp-ratio');
    const compAttack = this.element.querySelector<HTMLInputElement>('#comp-attack');
    const compRelease = this.element.querySelector<HTMLInputElement>('#comp-release');
    const compMakeup = this.element.querySelector<HTMLInputElement>('#comp-makeup');

    const onCompChange = () => {
      const updatedComp = {
        on: Boolean(compOnCheck?.checked),
        thresholdDb: parseFloat(compThresh?.value || '-18'),
        ratio: parseFloat(compRatio?.value || '2.5'),
        attackMs: parseFloat(compAttack?.value || '30'),
        releaseMs: parseFloat(compRelease?.value || '100'),
        makeupDb: parseFloat(compMakeup?.value || '0'),
      };

      this.callbacks.onUpdateMaster({
        ...this.song.master,
        preset: 'custom',
        compressor: updatedComp,
      });

      const st = this.element.querySelector('.studio-glue-state');
      if (st) st.textContent = updatedComp.on ? 'ON' : 'OFF';

      const tv = this.element.querySelector('#comp-thresh-val');
      if (tv) tv.textContent = `${updatedComp.thresholdDb}dB`;
      const rv = this.element.querySelector('#comp-ratio-val');
      if (rv) rv.textContent = `${updatedComp.ratio}:1`;
      const av = this.element.querySelector('#comp-attack-val');
      if (av) av.textContent = `${updatedComp.attackMs}ms`;
      const relv = this.element.querySelector('#comp-release-val');
      if (relv) relv.textContent = `${updatedComp.releaseMs}ms`;
      const mv = this.element.querySelector('#comp-makeup-val');
      if (mv) mv.textContent = `${updatedComp.makeupDb}dB`;
    };

    compOnCheck?.addEventListener('change', onCompChange);
    compThresh?.addEventListener('input', onCompChange);
    compRatio?.addEventListener('input', onCompChange);
    compAttack?.addEventListener('input', onCompChange);
    compRelease?.addEventListener('input', onCompChange);
    compMakeup?.addEventListener('input', onCompChange);

    // Effects Rack Button
    this.element.querySelector('#master-fx-btn')?.addEventListener('click', () => {
      this.callbacks.onOpenEffects();
    });
  }

  public dispose() {
    this.stopMeterLoop();
    if (this.clipWarningTimer !== null) {
      window.clearTimeout(this.clipWarningTimer);
    }
  }
}
