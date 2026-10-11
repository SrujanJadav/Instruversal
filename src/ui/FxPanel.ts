import { state, FxConfig } from '../state';
import { FX_PRESETS, getMasterEffectsRack } from '../audio/effects';

export class FxPanel {
  private panel: HTMLElement;
  private backdrop: HTMLElement;
  private isOpen: boolean = false;
  private animTimer: number | null = null;

  constructor(parent: HTMLElement) {
    this.panel = document.createElement('aside');
    this.panel.className = 'fx-panel';
    this.panel.id = 'fx-panel';
    this.panel.setAttribute('aria-label', 'Effects Rack');
    this.panel.setAttribute('aria-hidden', 'true');

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'fx-backdrop';
    this.backdrop.id = 'fx-backdrop';

    parent.appendChild(this.backdrop);
    parent.appendChild(this.panel);

    this.render();
    this.setupEvents();
  }

  private render() {
    const fx = state.fx;

    this.panel.innerHTML = `
      <div class="panel-header">
        <h3 class="panel-title">Effects Rack</h3>
        <button type="button" class="panel-close-btn" id="fx-close-btn" aria-label="Close Effects Rack">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="panel-body">
        <!-- Preset Chips -->
        <div class="fx-section">
          <span class="section-title">Presets</span>
          <div class="fx-presets-row" role="group" aria-label="Effect presets">
            <button type="button" class="fx-preset-chip" data-preset="Clean">Clean</button>
            <button type="button" class="fx-preset-chip" data-preset="Dreamy">Dreamy</button>
            <button type="button" class="fx-preset-chip" data-preset="Space">Space</button>
            <button type="button" class="fx-preset-chip" data-preset="Gritty">Gritty</button>
            <button type="button" class="fx-preset-chip fx-reset-btn" id="fx-reset-btn">Reset</button>
          </div>
        </div>

        <div class="fx-section">
          <span class="section-title">Master Chain (7 Effects)</span>

          <!-- 1. Soft Drive -->
          <div class="fx-row" data-fx="drive">
            <div class="fx-row-header">
              <div class="fx-row-title-wrap">
                <span class="fx-name">Soft Drive</span>
                <span class="fx-desc">2x Oversampled Warm Saturation</span>
              </div>
              <button type="button" class="fx-bypass-btn ${fx.drive.bypassed ? 'bypassed' : 'active'}" data-fx-bypass="drive">
                ${fx.drive.bypassed ? 'Bypassed' : 'Active'}
              </button>
            </div>
            <div class="fx-control-group">
              <div class="fx-slider-row">
                <span class="fx-param-lbl">Amount</span>
                <input type="range" class="fx-slider tactile-slider" data-fx-param="drive-amount" min="0" max="100" value="${fx.drive.amount}" />
                <span class="fx-val-readout" id="val-drive-amount">${fx.drive.amount}%</span>
              </div>
              <div class="fx-slider-row secondary-param">
                <span class="fx-param-lbl">Tone Cutoff</span>
                <input type="range" class="fx-slider" data-fx-param="drive-tone" min="1500" max="8000" step="100" value="${fx.drive.tone}" />
                <span class="fx-val-readout" id="val-drive-tone">${(fx.drive.tone / 1000).toFixed(1)}kHz</span>
              </div>
            </div>
          </div>

          <!-- 2. Auto-Filter -->
          <div class="fx-row" data-fx="autoFilter">
            <div class="fx-row-header">
              <div class="fx-row-title-wrap">
                <span class="fx-name">Auto-Filter</span>
                <span class="fx-desc">Sweeping Lowpass Modulation</span>
              </div>
              <button type="button" class="fx-bypass-btn ${fx.autoFilter.bypassed ? 'bypassed' : 'active'}" data-fx-bypass="autoFilter">
                ${fx.autoFilter.bypassed ? 'Bypassed' : 'Active'}
              </button>
            </div>
            <div class="fx-control-group">
              <div class="fx-slider-row">
                <span class="fx-param-lbl">Amount</span>
                <input type="range" class="fx-slider tactile-slider" data-fx-param="autoFilter-amount" min="0" max="100" value="${fx.autoFilter.amount}" />
                <span class="fx-val-readout" id="val-autoFilter-amount">${fx.autoFilter.amount}%</span>
              </div>
              <div class="fx-pills-row secondary-param">
                <span class="fx-param-lbl">Speed</span>
                <div class="pills-wrap">
                  ${['1m', '2m', '4m'].map((sp) => `
                    <button type="button" class="fx-pill-btn ${fx.autoFilter.speed === sp ? 'active' : ''}" data-fx-pill="autoFilter-speed" data-val="${sp}">
                      ${sp === '1m' ? '1 bar' : sp === '2m' ? '2 bars' : '4 bars'}
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Chorus -->
          <div class="fx-row" data-fx="chorus">
            <div class="fx-row-header">
              <div class="fx-row-title-wrap">
                <span class="fx-name">Chorus</span>
                <span class="fx-desc">Lush Dimension & Shimmer</span>
              </div>
              <button type="button" class="fx-bypass-btn ${fx.chorus.bypassed ? 'bypassed' : 'active'}" data-fx-bypass="chorus">
                ${fx.chorus.bypassed ? 'Bypassed' : 'Active'}
              </button>
            </div>
            <div class="fx-control-group">
              <div class="fx-slider-row">
                <span class="fx-param-lbl">Amount</span>
                <input type="range" class="fx-slider tactile-slider" data-fx-param="chorus-amount" min="0" max="100" value="${fx.chorus.amount}" />
                <span class="fx-val-readout" id="val-chorus-amount">${fx.chorus.amount}%</span>
              </div>
              <div class="fx-slider-row secondary-param">
                <span class="fx-param-lbl">Depth</span>
                <input type="range" class="fx-slider" data-fx-param="chorus-depth" min="20" max="80" value="${Math.round(fx.chorus.depth * 100)}" />
                <span class="fx-val-readout" id="val-chorus-depth">${Math.round(fx.chorus.depth * 100)}%</span>
              </div>
            </div>
          </div>

          <!-- 4. Phaser -->
          <div class="fx-row" data-fx="phaser">
            <div class="fx-row-header">
              <div class="fx-row-title-wrap">
                <span class="fx-name">Phaser</span>
                <span class="fx-desc">Gentle Cosmic Phase Rotation</span>
              </div>
              <button type="button" class="fx-bypass-btn ${fx.phaser.bypassed ? 'bypassed' : 'active'}" data-fx-bypass="phaser">
                ${fx.phaser.bypassed ? 'Bypassed' : 'Active'}
              </button>
            </div>
            <div class="fx-control-group">
              <div class="fx-slider-row">
                <span class="fx-param-lbl">Amount</span>
                <input type="range" class="fx-slider tactile-slider" data-fx-param="phaser-amount" min="0" max="100" value="${fx.phaser.amount}" />
                <span class="fx-val-readout" id="val-phaser-amount">${fx.phaser.amount}%</span>
              </div>
              <div class="fx-slider-row secondary-param">
                <span class="fx-param-lbl">Speed</span>
                <input type="range" class="fx-slider" data-fx-param="phaser-speed" min="1" max="20" value="${Math.round(fx.phaser.speed * 10)}" />
                <span class="fx-val-readout" id="val-phaser-speed">${fx.phaser.speed.toFixed(1)} Hz</span>
              </div>
            </div>
          </div>

          <!-- 5. Tremolo -->
          <div class="fx-row" data-fx="tremolo">
            <div class="fx-row-header">
              <div class="fx-row-title-wrap">
                <span class="fx-name">Tremolo</span>
                <span class="fx-desc">Rhythmic Amplitude Pulse</span>
              </div>
              <button type="button" class="fx-bypass-btn ${fx.tremolo.bypassed ? 'bypassed' : 'active'}" data-fx-bypass="tremolo">
                ${fx.tremolo.bypassed ? 'Bypassed' : 'Active'}
              </button>
            </div>
            <div class="fx-control-group">
              <div class="fx-slider-row">
                <span class="fx-param-lbl">Amount</span>
                <input type="range" class="fx-slider tactile-slider" data-fx-param="tremolo-amount" min="0" max="100" value="${fx.tremolo.amount}" />
                <span class="fx-val-readout" id="val-tremolo-amount">${fx.tremolo.amount}%</span>
              </div>
              <div class="fx-pills-row secondary-param">
                <span class="fx-param-lbl">Rate</span>
                <div class="pills-wrap">
                  ${['4n', '8n', '16n'].map((rt) => `
                    <button type="button" class="fx-pill-btn ${fx.tremolo.rate === rt ? 'active' : ''}" data-fx-pill="tremolo-rate" data-val="${rt}">
                      ${rt === '4n' ? '1/4' : rt === '8n' ? '1/8' : '1/16'}
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 6. PingPongDelay -->
          <div class="fx-row" data-fx="delay">
            <div class="fx-row-header">
              <div class="fx-row-title-wrap">
                <span class="fx-name">Delay</span>
                <span class="fx-desc">BPM-Synced Ping-Pong Echo</span>
              </div>
              <button type="button" class="fx-bypass-btn ${fx.delay.bypassed ? 'bypassed' : 'active'}" data-fx-bypass="delay">
                ${fx.delay.bypassed ? 'Bypassed' : 'Active'}
              </button>
            </div>
            <div class="fx-control-group">
              <div class="fx-slider-row">
                <span class="fx-param-lbl">Amount</span>
                <input type="range" class="fx-slider tactile-slider" data-fx-param="delay-amount" min="0" max="100" value="${fx.delay.amount}" />
                <span class="fx-val-readout" id="val-delay-amount">${fx.delay.amount}%</span>
              </div>
              <div class="fx-pills-row secondary-param">
                <span class="fx-param-lbl">Time</span>
                <div class="pills-wrap">
                  ${['16n', '8n', '8n.', '4n'].map((tm) => `
                    <button type="button" class="fx-pill-btn ${fx.delay.time === tm ? 'active' : ''}" data-fx-pill="delay-time" data-val="${tm}">
                      ${tm === '16n' ? '1/16' : tm === '8n' ? '1/8' : tm === '8n.' ? '1/8 dot' : '1/4'}
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 7. Reverb -->
          <div class="fx-row" data-fx="reverb">
            <div class="fx-row-header">
              <div class="fx-row-title-wrap">
                <span class="fx-name">Reverb</span>
                <span class="fx-desc">Convolution Natural Space</span>
              </div>
              <button type="button" class="fx-bypass-btn ${fx.reverb.bypassed ? 'bypassed' : 'active'}" data-fx-bypass="reverb">
                ${fx.reverb.bypassed ? 'Bypassed' : 'Active'}
              </button>
            </div>
            <div class="fx-control-group">
              <div class="fx-slider-row">
                <span class="fx-param-lbl">Amount</span>
                <input type="range" class="fx-slider tactile-slider" data-fx-param="reverb-amount" min="0" max="100" value="${fx.reverb.amount}" />
                <span class="fx-val-readout" id="val-reverb-amount">${fx.reverb.amount}%</span>
              </div>
              <div class="fx-slider-row secondary-param">
                <span class="fx-param-lbl">Size (Decay)</span>
                <input type="range" class="fx-slider" data-fx-param="reverb-size" min="5" max="80" value="${Math.round(fx.reverb.size * 10)}" />
                <span class="fx-val-readout" id="val-reverb-size">${fx.reverb.size.toFixed(1)}s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindDomEvents();
  }

  private bindDomEvents() {
    // Close button & backdrop
    const closeBtn = this.panel.querySelector<HTMLButtonElement>('#fx-close-btn');
    closeBtn?.addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', () => this.close());

    // Preset buttons
    const presetBtns = this.panel.querySelectorAll<HTMLButtonElement>('.fx-preset-chip');
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetName = btn.dataset.preset;
        if (presetName && FX_PRESETS[presetName]) {
          this.applyPresetAnimated(FX_PRESETS[presetName]);
        }
      });
    });

    // Reset button
    const resetBtn = this.panel.querySelector<HTMLButtonElement>('#fx-reset-btn');
    resetBtn?.addEventListener('click', () => {
      this.applyPresetAnimated({
        reverb: { amount: 0, size: 2.0, bypassed: true },
        delay: { amount: 0, time: '8n', bypassed: true },
        chorus: { amount: 0, depth: 0.5, bypassed: true },
        phaser: { amount: 0, speed: 0.5, bypassed: true },
        tremolo: { amount: 0, rate: '8n', bypassed: true },
        autoFilter: { amount: 0, speed: '2m', bypassed: true },
        drive: { amount: 0, tone: 4000, bypassed: true },
      });
    });

    // Bypass buttons
    const bypassBtns = this.panel.querySelectorAll<HTMLButtonElement>('[data-fx-bypass]');
    bypassBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const fxKey = btn.dataset.fxBypass as keyof FxConfig;
        if (!fxKey || !state.fx[fxKey]) return;

        state.fx[fxKey].bypassed = !state.fx[fxKey].bypassed;
        if (!state.fx[fxKey].bypassed && state.fx[fxKey].amount === 0) {
          state.fx[fxKey].amount = 25; // Sensible default when turning on from 0
        }

        btn.classList.toggle('bypassed', state.fx[fxKey].bypassed);
        btn.classList.toggle('active', !state.fx[fxKey].bypassed);
        btn.textContent = state.fx[fxKey].bypassed ? 'Bypassed' : 'Active';

        getMasterEffectsRack().applyConfig(state.fx);
        this.syncSliderInputs();
      });
    });

    // Sliders
    const sliders = this.panel.querySelectorAll<HTMLInputElement>('.fx-slider');
    sliders.forEach((slider) => {
      slider.addEventListener('input', () => {
        const param = slider.dataset.fxParam;
        if (!param) return;
        const val = parseFloat(slider.value);

        if (param === 'drive-amount') {
          state.fx.drive.amount = val;
          state.fx.drive.bypassed = val === 0;
          this.updateReadout('val-drive-amount', `${Math.round(val)}%`);
        } else if (param === 'drive-tone') {
          state.fx.drive.tone = val;
          this.updateReadout('val-drive-tone', `${(val / 1000).toFixed(1)}kHz`);
        } else if (param === 'autoFilter-amount') {
          state.fx.autoFilter.amount = val;
          state.fx.autoFilter.bypassed = val === 0;
          this.updateReadout('val-autoFilter-amount', `${Math.round(val)}%`);
        } else if (param === 'chorus-amount') {
          state.fx.chorus.amount = val;
          state.fx.chorus.bypassed = val === 0;
          this.updateReadout('val-chorus-amount', `${Math.round(val)}%`);
        } else if (param === 'chorus-depth') {
          state.fx.chorus.depth = val / 100;
          this.updateReadout('val-chorus-depth', `${Math.round(val)}%`);
        } else if (param === 'phaser-amount') {
          state.fx.phaser.amount = val;
          state.fx.phaser.bypassed = val === 0;
          this.updateReadout('val-phaser-amount', `${Math.round(val)}%`);
        } else if (param === 'phaser-speed') {
          state.fx.phaser.speed = val / 10;
          this.updateReadout('val-phaser-speed', `${(val / 10).toFixed(1)} Hz`);
        } else if (param === 'tremolo-amount') {
          state.fx.tremolo.amount = val;
          state.fx.tremolo.bypassed = val === 0;
          this.updateReadout('val-tremolo-amount', `${Math.round(val)}%`);
        } else if (param === 'delay-amount') {
          state.fx.delay.amount = val;
          state.fx.delay.bypassed = val === 0;
          this.updateReadout('val-delay-amount', `${Math.round(val)}%`);
        } else if (param === 'reverb-amount') {
          state.fx.reverb.amount = val;
          state.fx.reverb.bypassed = val === 0;
          this.updateReadout('val-reverb-amount', `${Math.round(val)}%`);
        } else if (param === 'reverb-size') {
          state.fx.reverb.size = val / 10;
          this.updateReadout('val-reverb-size', `${(val / 10).toFixed(1)}s`);
        }

        getMasterEffectsRack().applyConfig(state.fx);
        this.updateBypassBadges();
      });
    });

    // Pills
    const pills = this.panel.querySelectorAll<HTMLButtonElement>('[data-fx-pill]');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const param = pill.dataset.fxPill;
        const val = pill.dataset.val;
        if (!param || !val) return;

        if (param === 'autoFilter-speed') {
          state.fx.autoFilter.speed = val;
        } else if (param === 'tremolo-rate') {
          state.fx.tremolo.rate = val;
        } else if (param === 'delay-time') {
          state.fx.delay.time = val;
        }

        const parentWrap = pill.closest('.pills-wrap');
        parentWrap?.querySelectorAll('.fx-pill-btn').forEach((b) => b.classList.remove('active'));
        pill.classList.add('active');

        getMasterEffectsRack().applyConfig(state.fx);
      });
    });
  }

  private updateReadout(id: string, text: string) {
    const el = this.panel.querySelector<HTMLElement>(`#${id}`);
    if (el) el.textContent = text;
  }

  private updateBypassBadges() {
    const bypassBtns = this.panel.querySelectorAll<HTMLButtonElement>('[data-fx-bypass]');
    bypassBtns.forEach((btn) => {
      const fxKey = btn.dataset.fxBypass as keyof FxConfig;
      if (fxKey && state.fx[fxKey]) {
        btn.classList.toggle('bypassed', state.fx[fxKey].bypassed);
        btn.classList.toggle('active', !state.fx[fxKey].bypassed);
        btn.textContent = state.fx[fxKey].bypassed ? 'Bypassed' : 'Active';
      }
    });
  }

  private syncSliderInputs() {
    const fx = state.fx;
    const setSlider = (selector: string, val: number) => {
      const input = this.panel.querySelector<HTMLInputElement>(selector);
      if (input) input.value = String(val);
    };

    setSlider('[data-fx-param="drive-amount"]', fx.drive.amount);
    setSlider('[data-fx-param="drive-tone"]', fx.drive.tone);
    setSlider('[data-fx-param="autoFilter-amount"]', fx.autoFilter.amount);
    setSlider('[data-fx-param="chorus-amount"]', fx.chorus.amount);
    setSlider('[data-fx-param="chorus-depth"]', Math.round(fx.chorus.depth * 100));
    setSlider('[data-fx-param="phaser-amount"]', fx.phaser.amount);
    setSlider('[data-fx-param="phaser-speed"]', Math.round(fx.phaser.speed * 10));
    setSlider('[data-fx-param="tremolo-amount"]', fx.tremolo.amount);
    setSlider('[data-fx-param="delay-amount"]', fx.delay.amount);
    setSlider('[data-fx-param="reverb-amount"]', fx.reverb.amount);
    setSlider('[data-fx-param="reverb-size"]', Math.round(fx.reverb.size * 10));

    this.updateReadout('val-drive-amount', `${Math.round(fx.drive.amount)}%`);
    this.updateReadout('val-drive-tone', `${(fx.drive.tone / 1000).toFixed(1)}kHz`);
    this.updateReadout('val-autoFilter-amount', `${Math.round(fx.autoFilter.amount)}%`);
    this.updateReadout('val-chorus-amount', `${Math.round(fx.chorus.amount)}%`);
    this.updateReadout('val-chorus-depth', `${Math.round(fx.chorus.depth * 100)}%`);
    this.updateReadout('val-phaser-amount', `${Math.round(fx.phaser.amount)}%`);
    this.updateReadout('val-phaser-speed', `${fx.phaser.speed.toFixed(1)} Hz`);
    this.updateReadout('val-tremolo-amount', `${Math.round(fx.tremolo.amount)}%`);
    this.updateReadout('val-delay-amount', `${Math.round(fx.delay.amount)}%`);
    this.updateReadout('val-reverb-amount', `${Math.round(fx.reverb.amount)}%`);
    this.updateReadout('val-reverb-size', `${fx.reverb.size.toFixed(1)}s`);

    this.updateBypassBadges();
  }

  private applyPresetAnimated(target: FxConfig) {
    const start = JSON.parse(JSON.stringify(state.fx)) as FxConfig;
    const duration = 240; // ms
    const startTime = performance.now();

    if (this.animTimer !== null) {
      cancelAnimationFrame(this.animTimer);
    }

    const animate = () => {
      const now = performance.now();
      const p = Math.min(1, (now - startTime) / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - p, 3);

      const lerp = (a: number, b: number) => a + (b - a) * ease;

      state.fx.drive.amount = Math.round(lerp(start.drive.amount, target.drive.amount));
      state.fx.drive.tone = Math.round(lerp(start.drive.tone, target.drive.tone));
      state.fx.drive.bypassed = target.drive.bypassed;

      state.fx.autoFilter.amount = Math.round(lerp(start.autoFilter.amount, target.autoFilter.amount));
      state.fx.autoFilter.speed = target.autoFilter.speed;
      state.fx.autoFilter.bypassed = target.autoFilter.bypassed;

      state.fx.chorus.amount = Math.round(lerp(start.chorus.amount, target.chorus.amount));
      state.fx.chorus.depth = lerp(start.chorus.depth, target.chorus.depth);
      state.fx.chorus.bypassed = target.chorus.bypassed;

      state.fx.phaser.amount = Math.round(lerp(start.phaser.amount, target.phaser.amount));
      state.fx.phaser.speed = lerp(start.phaser.speed, target.phaser.speed);
      state.fx.phaser.bypassed = target.phaser.bypassed;

      state.fx.tremolo.amount = Math.round(lerp(start.tremolo.amount, target.tremolo.amount));
      state.fx.tremolo.rate = target.tremolo.rate;
      state.fx.tremolo.bypassed = target.tremolo.bypassed;

      state.fx.delay.amount = Math.round(lerp(start.delay.amount, target.delay.amount));
      state.fx.delay.time = target.delay.time;
      state.fx.delay.bypassed = target.delay.bypassed;

      state.fx.reverb.amount = Math.round(lerp(start.reverb.amount, target.reverb.amount));
      state.fx.reverb.size = lerp(start.reverb.size, target.reverb.size);
      state.fx.reverb.bypassed = target.reverb.bypassed;

      this.syncSliderInputs();
      getMasterEffectsRack().applyConfig(state.fx);

      if (p < 1) {
        this.animTimer = requestAnimationFrame(animate);
      } else {
        this.animTimer = null;
        this.render(); // Re-render to update pills and bypass states
      }
    };

    this.animTimer = requestAnimationFrame(animate);
  }

  private setupEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  public open() {
    this.isOpen = true;
    this.panel.classList.add('open');
    this.backdrop.classList.add('open');
    this.panel.setAttribute('aria-hidden', 'false');
    this.render();
  }

  public close() {
    this.isOpen = false;
    this.panel.classList.remove('open');
    this.backdrop.classList.remove('open');
    this.panel.setAttribute('aria-hidden', 'true');
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public destroy() {
    if (this.animTimer !== null) {
      cancelAnimationFrame(this.animTimer);
    }
    this.panel.remove();
    this.backdrop.remove();
  }
}
