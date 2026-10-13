import * as Tone from 'tone';
import { SongMasterSettings } from './types';
import { getMasterEffectsRack, MasterEffectsRack } from '../audio/effects';
import { state } from '../state';

export interface MasterMeterLevel {
  peakDb: number;
  rmsDb: number;
}

export class SongMasterChain {
  public songBus!: Tone.Gain;

  // Shared send buses
  public reverbSend!: Tone.Freeverb;
  public reverbReturn!: Tone.Gain;
  public delaySend!: Tone.FeedbackDelay;
  public delayReturn!: Tone.Gain;

  // Master chain nodes inserted between effects and limiter
  public eq!: Tone.EQ3;
  public compressor!: Tone.Compressor;
  public compBypassGain!: Tone.Gain;
  public compActiveGain!: Tone.Gain;
  public makeupGain!: Tone.Gain;
  public compSum!: Tone.Gain;
  public masterGain!: Tone.Gain;

  // Level monitoring
  public masterMeter!: Tone.Meter;

  private effectsRack: MasterEffectsRack | null = null;
  private isDisposed: boolean = false;
  private isMock: boolean = false;
  private peakHoldDb: number = -Infinity;
  private peakHoldTime: number = 0;

  constructor(settings: SongMasterSettings) {
    try {
      this.effectsRack = getMasterEffectsRack();

      // 1. Song Summing Bus
      this.songBus = new Tone.Gain(1);

      // 2. Shared Sends
      const isLightMode =
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'light';

      // Reverb send: lightweight Freeverb to save CPU on phones
      this.reverbSend = new Tone.Freeverb({
        roomSize: 0.75,
        dampening: 3000,
        wet: 1.0,
      });
      this.reverbReturn = new Tone.Gain(isLightMode ? 0 : 1);
      this.reverbSend.connect(this.reverbReturn);
      this.reverbReturn.connect(this.songBus);

      // Delay send: FeedbackDelay (8n with 35% feedback)
      this.delaySend = new Tone.FeedbackDelay({
        delayTime: '8n',
        feedback: 0.35,
        wet: 1.0,
        maxDelay: 2,
      });
      this.delayReturn = new Tone.Gain(1);
      this.delaySend.connect(this.delayReturn);
      this.delayReturn.connect(this.songBus);

      // 3. Connect Song Bus into Master Effects Rack
      if (this.effectsRack && this.effectsRack.input) {
        this.songBus.connect(this.effectsRack.input);
      }

      // 4. Insert Chain Nodes: EQ3 -> Compressor + Makeup / Bypass -> MasterGain
      this.eq = new Tone.EQ3({
        low: settings.eq?.lowDb ?? 0,
        mid: settings.eq?.midDb ?? 0,
        high: settings.eq?.highDb ?? 0,
      });

      const compOn = settings.compressor?.on ?? true;
      this.compressor = new Tone.Compressor({
        threshold: settings.compressor?.thresholdDb ?? -18,
        ratio: settings.compressor?.ratio ?? 2.5,
        attack: (settings.compressor?.attackMs ?? 30) / 1000,
        release: (settings.compressor?.releaseMs ?? 100) / 1000,
      });

      this.makeupGain = new Tone.Gain(Math.pow(10, (settings.compressor?.makeupDb ?? 0) / 20));
      this.compActiveGain = new Tone.Gain(compOn ? 1 : 0);
      this.compBypassGain = new Tone.Gain(compOn ? 0 : 1);
      this.compSum = new Tone.Gain(1);

      this.masterGain = new Tone.Gain(Math.pow(10, (settings.gainDb ?? 0) / 20));

      // Internal routing:
      // eq -> compressor -> makeupGain -> compActiveGain -> compSum
      // eq -> compBypassGain -> compSum
      // compSum -> masterGain
      this.eq.connect(this.compressor);
      this.compressor.connect(this.makeupGain);
      this.makeupGain.connect(this.compActiveGain);
      this.compActiveGain.connect(this.compSum);

      this.eq.connect(this.compBypassGain);
      this.compBypassGain.connect(this.compSum);

      this.compSum.connect(this.masterGain);

      // Insert chain into effects rack between effects output and brickwall limiter
      if (this.effectsRack) {
        this.effectsRack.insertProcessing(this.eq, this.masterGain);
      }

      // 5. Connect meter after brickwall limiter
      this.masterMeter = new Tone.Meter({ smoothing: 0.8 });
      if (this.effectsRack && this.effectsRack.limiter) {
        this.effectsRack.limiter.connect(this.masterMeter);
      }

      // Apply song-level effects config if present
      if (settings.effects && this.effectsRack) {
        this.effectsRack.applyConfig(settings.effects);
      }
    } catch {
      // Non-audio / Vitest test environment fallback
      this.isMock = true;
      this.songBus = {} as any;
      this.reverbSend = {} as any;
      this.reverbReturn = {} as any;
      this.delaySend = {} as any;
      this.delayReturn = {} as any;
      this.eq = {} as any;
      this.compressor = {} as any;
      this.compActiveGain = {} as any;
      this.compBypassGain = {} as any;
      this.makeupGain = {} as any;
      this.compSum = {} as any;
      this.masterGain = {} as any;
      this.masterMeter = {} as any;
    }
  }

  /**
   * Smoothly updates master chain parameters using 50ms ramps to prevent audio clicks.
   */
  public updateSettings(settings: SongMasterSettings) {
    if (this.isDisposed || this.isMock) return;
    const now = Tone.now();

    try {
      // 1. EQ ramps
      if (settings.eq) {
        this.eq.low.rampTo(settings.eq.lowDb, 0.05, now);
        this.eq.mid.rampTo(settings.eq.midDb, 0.05, now);
        this.eq.high.rampTo(settings.eq.highDb, 0.05, now);
      }

      // 2. Compressor parameters
      if (settings.compressor) {
        const comp = settings.compressor;
        this.compressor.threshold.rampTo(comp.thresholdDb, 0.05, now);
        this.compressor.ratio.rampTo(comp.ratio, 0.05, now);
        this.compressor.attack.rampTo(Math.max(0.001, comp.attackMs / 1000), 0.05, now);
        this.compressor.release.rampTo(Math.max(0.01, comp.releaseMs / 1000), 0.05, now);

        const targetMakeup = Math.pow(10, (comp.makeupDb || 0) / 20);
        this.makeupGain.gain.rampTo(targetMakeup, 0.05, now);

        if (comp.on) {
          this.compActiveGain.gain.rampTo(1.0, 0.05, now);
          this.compBypassGain.gain.rampTo(0.0, 0.05, now);
        } else {
          this.compActiveGain.gain.rampTo(0.0, 0.05, now);
          this.compBypassGain.gain.rampTo(1.0, 0.05, now);
        }
      }

      // 3. Master Gain
      if (settings.gainDb !== undefined) {
        const targetGain = Math.pow(10, settings.gainDb / 20);
        this.masterGain.gain.rampTo(targetGain, 0.05, now);
      }

      // 4. Effects rack update
      if (settings.effects && this.effectsRack) {
        this.effectsRack.applyConfig(settings.effects);
      }
    } catch {}
  }

  /**
   * Computes peak level and approx loudness (RMS dB) with peak-hold decay.
   */
  public getMeterLevel(): MasterMeterLevel {
    if (this.isDisposed || this.isMock) return { peakDb: -90, rmsDb: -90 };

    let rawVal: number | Float32Array = -Infinity;
    try {
      rawVal = this.masterMeter.getValue() as number;
    } catch {
      return { peakDb: -90, rmsDb: -90 };
    }

    let currentDb = -Infinity;
    if (Array.isArray(rawVal)) {
      currentDb = Math.max(...rawVal);
    } else if (typeof rawVal === 'number') {
      currentDb = rawVal;
    }

    // Clamp lower bound
    if (isNaN(currentDb) || currentDb < -90) {
      currentDb = -90;
    }

    const now = performance.now();
    if (currentDb >= this.peakHoldDb || now - this.peakHoldTime > 1500) {
      this.peakHoldDb = currentDb;
      this.peakHoldTime = now;
    } else {
      // Gentle decay of peak hold
      this.peakHoldDb -= 0.5;
    }

    return {
      peakDb: this.peakHoldDb,
      rmsDb: currentDb,
    };
  }

  /**
   * Cleanly restores effects rack and disposes all allocated nodes.
   */
  public dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.isMock) return;

    // Disconnect inserted chain from effects rack
    if (this.effectsRack) {
      this.effectsRack.removeProcessing(this.eq, this.masterGain);
      try {
        this.effectsRack.limiter.disconnect(this.masterMeter);
      } catch {}
      this.effectsRack.applyConfig(state.fx);
    }

    // Dispose nodes
    try {
      this.songBus.disconnect();
      this.songBus.dispose();

      this.reverbSend.dispose();
      this.reverbReturn.dispose();
      this.delaySend.dispose();
      this.delayReturn.dispose();

      this.eq.dispose();
      this.compressor.dispose();
      this.makeupGain.dispose();
      this.compActiveGain.dispose();
      this.compBypassGain.dispose();
      this.compSum.dispose();
      this.masterGain.dispose();
      this.masterMeter.dispose();
    } catch {}
  }
}
