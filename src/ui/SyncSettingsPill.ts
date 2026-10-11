import * as Tone from 'tone';
import { state } from '../state';
import { getTransport } from '../audio/transport';
import { getTotalAudioLatencySeconds } from '../audio/context';

export class SyncSettingsPill {
  private wrapper: HTMLElement;
  private popup: HTMLElement | null = null;
  private isOpen: boolean = false;
  private beatClickSynth: Tone.Synth | null = null;
  private clickLoop: Tone.Loop | null = null;
  private isTestPlaying: boolean = false;

  constructor(parent: HTMLElement) {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'sync-pill-wrapper';
    this.wrapper.style.position = 'relative';
    this.wrapper.style.display = 'inline-flex';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'header-btn sync-settings-btn';
    btn.id = 'header-sync-btn';
    btn.setAttribute('aria-label', 'Audio sync settings');
    btn.textContent = 'Sync';

    this.wrapper.appendChild(btn);
    parent.insertBefore(this.wrapper, parent.firstChild);

    btn.addEventListener('click', () => this.toggle());

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.wrapper.contains(e.target as Node)) {
        this.close();
      }
    });
  }

  private toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open() {
    this.isOpen = true;
    this.popup = this.buildPopup();
    this.wrapper.appendChild(this.popup);
    requestAnimationFrame(() => {
      this.popup?.classList.add('visible');
    });
  }

  private close() {
    if (this.isTestPlaying) {
      this.stopTestClick();
    }
    if (this.popup) {
      this.popup.classList.remove('visible');
      window.setTimeout(() => {
        this.popup?.remove();
        this.popup = null;
      }, 180);
    }
    this.isOpen = false;
  }

  private buildPopup(): HTMLElement {
    const hardwareMs = Math.round(getTotalAudioLatencySeconds() * 1000);
    const popup = document.createElement('div');
    popup.className = 'sync-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Audio sync settings');

    const offsetMs = state.syncOffsetMs;

    popup.innerHTML = `
      <div class="sync-popup-header">
        <span class="sync-popup-title">Audio Sync</span>
        <span class="sync-hw-info">Hardware latency ≈ ${hardwareMs}ms</span>
      </div>

      <div class="sync-section">
        <label class="sync-label" for="sync-slider">
          Nudge offset
          <span class="sync-hint">Bluetooth? Raise until line hits stroke on beat.</span>
        </label>
        <div class="sync-slider-row">
          <span class="sync-range-lbl">-200ms</span>
          <input type="range" id="sync-slider" class="sync-slider"
            min="-200" max="400" step="5" value="${offsetMs}"
            aria-label="Sync nudge offset in milliseconds" />
          <span class="sync-range-lbl">+400ms</span>
        </div>
        <div class="sync-val-row">
          <span class="sync-val-display" id="sync-val-display">${offsetMs >= 0 ? '+' : ''}${offsetMs}ms</span>
          <button type="button" class="sync-reset-btn" id="sync-reset-btn">Reset to 0</button>
        </div>
      </div>

      <div class="sync-section">
        <button type="button" class="sync-test-btn" id="sync-test-btn">
          Tap to calibrate — plays a click on every beat
        </button>
        <p class="sync-test-hint">Watch the playhead. Nudge the offset until the ink line hits each stroke exactly when you hear the click.</p>
      </div>
    `;

    // Bind slider
    const slider = popup.querySelector<HTMLInputElement>('#sync-slider')!;
    const display = popup.querySelector<HTMLElement>('#sync-val-display')!;

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      display.textContent = `${val >= 0 ? '+' : ''}${val}ms`;
      getTransport().setSyncOffset(val);
    });

    // Reset button
    const resetBtn = popup.querySelector<HTMLButtonElement>('#sync-reset-btn')!;
    resetBtn.addEventListener('click', () => {
      getTransport().setSyncOffset(0);
      slider.value = '0';
      display.textContent = '+0ms';
    });

    // Test click button
    const testBtn = popup.querySelector<HTMLButtonElement>('#sync-test-btn')!;
    testBtn.addEventListener('click', () => {
      if (this.isTestPlaying) {
        this.stopTestClick();
        testBtn.textContent = 'Tap to calibrate — plays a click on every beat';
      } else {
        this.startTestClick();
        testBtn.textContent = 'Stop calibration click';
      }
    });

    return popup;
  }

  private startTestClick() {
    this.isTestPlaying = true;

    try {
      this.beatClickSynth = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: {
          attack: 0.001,
          decay: 0.04,
          sustain: 0,
          release: 0.04,
        },
        volume: -8,
      }).toDestination();

      this.clickLoop = new Tone.Loop((time) => {
        if (this.beatClickSynth) {
          this.beatClickSynth.triggerAttackRelease('C5', '32n', time);
        }
      }, '4n');

      this.clickLoop.start(0);

      // Start transport if not playing
      if (!getTransport().isPlaying()) {
        getTransport().play();
      }
    } catch (e) {
      console.warn('Sync test click failed:', e);
    }
  }

  private stopTestClick() {
    this.isTestPlaying = false;
    if (this.clickLoop) {
      this.clickLoop.stop();
      this.clickLoop.dispose();
      this.clickLoop = null;
    }
    if (this.beatClickSynth) {
      this.beatClickSynth.dispose();
      this.beatClickSynth = null;
    }
  }

  public destroy() {
    this.stopTestClick();
    this.wrapper.remove();
  }
}
