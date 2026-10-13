import * as Tone from 'tone';
import { FxConfig, DEFAULT_FX_CONFIG, state } from '../state';

const STORAGE_KEY = 'instruversal:fx-settings';

export interface FxPreset {
  name: string;
  config: FxConfig;
}

export const FX_PRESETS: Record<string, FxConfig> = {
  Clean: {
    reverb: { amount: 18, size: 2.0, bypassed: false },
    delay: { amount: 0, time: '8n', bypassed: true },
    chorus: { amount: 0, depth: 0.5, bypassed: true },
    phaser: { amount: 0, speed: 0.5, bypassed: true },
    tremolo: { amount: 0, rate: '8n', bypassed: true },
    autoFilter: { amount: 0, speed: '2m', bypassed: true },
    drive: { amount: 0, tone: 4000, bypassed: true },
  },
  Dreamy: {
    reverb: { amount: 48, size: 3.5, bypassed: false },
    delay: { amount: 36, time: '8n.', bypassed: false },
    chorus: { amount: 52, depth: 0.65, bypassed: false },
    phaser: { amount: 0, speed: 0.5, bypassed: true },
    tremolo: { amount: 0, rate: '8n', bypassed: true },
    autoFilter: { amount: 0, speed: '2m', bypassed: true },
    drive: { amount: 0, tone: 4000, bypassed: true },
  },
  Space: {
    reverb: { amount: 72, size: 5.5, bypassed: false },
    delay: { amount: 48, time: '8n', bypassed: false },
    chorus: { amount: 0, depth: 0.5, bypassed: true },
    phaser: { amount: 55, speed: 0.35, bypassed: false },
    tremolo: { amount: 0, rate: '8n', bypassed: true },
    autoFilter: { amount: 0, speed: '2m', bypassed: true },
    drive: { amount: 0, tone: 4000, bypassed: true },
  },
  Gritty: {
    reverb: { amount: 12, size: 1.5, bypassed: false },
    delay: { amount: 0, time: '8n', bypassed: true },
    chorus: { amount: 0, depth: 0.5, bypassed: true },
    phaser: { amount: 0, speed: 0.5, bypassed: true },
    tremolo: { amount: 45, rate: '8n', bypassed: false },
    autoFilter: { amount: 55, speed: '2m', bypassed: false },
    drive: { amount: 65, tone: 3200, bypassed: false },
  },
};

/**
 * Individual bypassable effect stage.
 * When amount is 0 or bypassed, effect processor is disconnected from the audio graph to save CPU on phones.
 */
class BypassStage {
  public input: Tone.Gain;
  public output: Tone.Gain;
  public dryGain: Tone.Gain;
  public wetGain: Tone.Gain;
  public processor: Tone.ToneAudioNode;
  public isConnected: boolean = false;

  constructor(processor: Tone.ToneAudioNode) {
    this.processor = processor;
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1);
    this.wetGain = new Tone.Gain(0);

    // Default bypass path: input -> dryGain -> output
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
  }

  public setRouting(wetAmount: number, bypassed: boolean) {
    const isEffectActive = !bypassed && wetAmount > 0.001;
    const now = Tone.now();

    if (isEffectActive) {
      if (!this.isConnected) {
        // Connect processor to audio graph
        this.input.connect(this.processor);
        this.processor.connect(this.wetGain);
        this.wetGain.connect(this.output);
        this.isConnected = true;
      }
      this.dryGain.gain.rampTo(Math.max(0.2, 1 - wetAmount * 0.5), 0.05, now);
      this.wetGain.gain.rampTo(wetAmount, 0.05, now);
    } else {
      // Disconnect processor to conserve CPU
      this.dryGain.gain.rampTo(1.0, 0.05, now);
      this.wetGain.gain.rampTo(0.0, 0.05, now);
      if (this.isConnected) {
        window.setTimeout(() => {
          if (!this.isConnected) return;
          try {
            this.input.disconnect(this.processor);
            this.processor.disconnect(this.wetGain);
            this.wetGain.disconnect(this.output);
          } catch {}
          this.isConnected = false;
        }, 60);
      }
    }
  }

  public dispose() {
    try {
      this.input.dispose();
      this.output.dispose();
      this.dryGain.dispose();
      this.wetGain.dispose();
      this.processor.dispose();
    } catch {}
  }
}

export class MasterEffectsRack {
  public masterGain: Tone.Gain;
  public limiter: Tone.Limiter;
  public effectsOutput: Tone.Gain;

  // The 7 effects
  private driveDistortion: Tone.Distortion;
  private driveFilter: Tone.Filter;
  private driveChainGain: Tone.Gain;
  private stageDrive: BypassStage;

  private autoFilter: Tone.AutoFilter;
  private stageAutoFilter: BypassStage;

  private chorus: Tone.Chorus;
  private stageChorus: BypassStage;

  private phaser: Tone.Phaser;
  private stagePhaser: BypassStage;

  private tremolo: Tone.Tremolo;
  private stageTremolo: BypassStage;

  private delay: Tone.PingPongDelay;
  private stageDelay: BypassStage;

  private reverb: Tone.Reverb;
  private stageReverb: BypassStage;

  private reverbDebounceTimer: number | null = null;

  constructor() {
    this.masterGain = new Tone.Gain(0.75); // Calibrated to prevent clipping across all combined effects
    this.limiter = new Tone.Limiter(-0.5);

    // 1. Soft Drive (Distortion with 2x oversample + tone lowpass filter)
    this.driveDistortion = new Tone.Distortion({
      distortion: 0.1,
      oversample: '2x',
      wet: 1.0,
    });
    this.driveFilter = new Tone.Filter({
      frequency: 4000,
      type: 'lowpass',
      rolloff: -12,
    });
    this.driveChainGain = new Tone.Gain(1);
    this.driveDistortion.connect(this.driveFilter);
    this.driveFilter.connect(this.driveChainGain);
    this.stageDrive = new BypassStage(this.driveDistortion);

    // 2. Auto-Filter
    this.autoFilter = new Tone.AutoFilter({
      frequency: '2m',
      baseFrequency: 200,
      octaves: 3,
      type: 'sine',
      filter: { type: 'lowpass', rolloff: -12, Q: 1 },
      wet: 1.0,
    });
    try {
      this.autoFilter.start();
    } catch {}
    this.stageAutoFilter = new BypassStage(this.autoFilter);

    // 3. Chorus
    this.chorus = new Tone.Chorus({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.5,
      wet: 1.0,
    });
    try {
      this.chorus.start();
    } catch {}
    this.stageChorus = new BypassStage(this.chorus);

    // 4. Phaser
    this.phaser = new Tone.Phaser({
      frequency: 0.5,
      octaves: 3,
      baseFrequency: 350,
      wet: 1.0,
    });
    this.stagePhaser = new BypassStage(this.phaser);

    // 5. Tremolo
    this.tremolo = new Tone.Tremolo({
      frequency: '8n',
      depth: 0.5,
      type: 'sine',
      wet: 1.0,
    });
    try {
      this.tremolo.start();
    } catch {}
    this.stageTremolo = new BypassStage(this.tremolo);

    // 6. PingPongDelay
    this.delay = new Tone.PingPongDelay({
      delayTime: '8n',
      feedback: 0.35,
      wet: 1.0,
      maxDelay: 2,
    });
    this.stageDelay = new BypassStage(this.delay);

    // 7. Reverb
    this.reverb = new Tone.Reverb({
      decay: 2.2,
      preDelay: 0.01,
      wet: 1.0,
    });
    // Pre-generate impulse response on init
    this.reverb.generate().catch(() => {});
    this.stageReverb = new BypassStage(this.reverb);

    // Wire master effects chain:
    // masterGain -> Drive -> AutoFilter -> Chorus -> Phaser -> Tremolo -> Delay -> Reverb -> Limiter -> destination
    this.masterGain.connect(this.stageDrive.input);
    this.stageDrive.output.connect(this.stageAutoFilter.input);
    this.stageAutoFilter.output.connect(this.stageChorus.input);
    this.stageChorus.output.connect(this.stagePhaser.input);
    this.stagePhaser.output.connect(this.stageTremolo.input);
    this.stageTremolo.output.connect(this.stageDelay.input);
    this.stageDelay.output.connect(this.stageReverb.input);
    this.effectsOutput = new Tone.Gain(1);
    this.stageReverb.output.connect(this.effectsOutput);
    this.effectsOutput.connect(this.limiter);
    this.limiter.toDestination();

    // Load saved settings if present
    this.loadPersistedConfig();
    this.applyConfig(state.fx);
  }

  public insertProcessing(nodeIn: Tone.ToneAudioNode, nodeOut: Tone.ToneAudioNode) {
    try {
      this.effectsOutput.disconnect(this.limiter);
      this.effectsOutput.connect(nodeIn);
      nodeOut.connect(this.limiter);
    } catch {}
  }

  public removeProcessing(nodeIn: Tone.ToneAudioNode, nodeOut: Tone.ToneAudioNode) {
    try {
      this.effectsOutput.disconnect(nodeIn);
      nodeOut.disconnect(this.limiter);
      this.effectsOutput.connect(this.limiter);
    } catch {}
  }

  public get input(): Tone.ToneAudioNode {
    return this.masterGain;
  }

  public get outputNode(): Tone.ToneAudioNode {
    return this.limiter;
  }

  public lowerGain3dB() {
    const current = this.masterGain.gain.value;
    this.masterGain.gain.rampTo(current * 0.7079, 0.05);
  }

  public applyConfig(cfg: FxConfig) {
    const now = Tone.now();

    // 1. Soft Drive: amount 0..100 -> distortion 0..0.5, wet 0..0.6
    const driveAmount = cfg.drive.bypassed ? 0 : cfg.drive.amount;
    const driveDist = (driveAmount / 100) * 0.5;
    const driveWet = (driveAmount / 100) * 0.6;
    this.driveDistortion.distortion = driveDist;
    this.driveFilter.frequency.rampTo(cfg.drive.tone, 0.05, now);
    this.stageDrive.setRouting(driveWet, cfg.drive.bypassed);

    // 2. Auto-Filter: amount 0..100 -> wet 0..1.0
    const filterAmount = cfg.autoFilter.bypassed ? 0 : cfg.autoFilter.amount;
    const filterWet = filterAmount / 100;
    try {
      this.autoFilter.frequency.setValueAtTime(cfg.autoFilter.speed, now);
    } catch {}
    this.stageAutoFilter.setRouting(filterWet, cfg.autoFilter.bypassed);

    // 3. Chorus: amount 0..100 -> wet 0..0.8
    const chorusAmount = cfg.chorus.bypassed ? 0 : cfg.chorus.amount;
    const chorusWet = (chorusAmount / 100) * 0.8;
    this.chorus.depth = cfg.chorus.depth;
    this.chorus.frequency.rampTo(0.5 + cfg.chorus.depth * 3.5, 0.05, now);
    this.stageChorus.setRouting(chorusWet, cfg.chorus.bypassed);

    // 4. Phaser: amount 0..100 -> wet 0..0.8
    const phaserAmount = cfg.phaser.bypassed ? 0 : cfg.phaser.amount;
    const phaserWet = (phaserAmount / 100) * 0.8;
    this.phaser.frequency.rampTo(cfg.phaser.speed, 0.05, now);
    this.stagePhaser.setRouting(phaserWet, cfg.phaser.bypassed);

    // 5. Tremolo: amount 0..100 -> depth 0..1, wet 0..1
    const tremAmount = cfg.tremolo.bypassed ? 0 : cfg.tremolo.amount;
    const tremWet = tremAmount / 100;
    this.tremolo.depth.rampTo(tremWet, 0.05, now);
    try {
      this.tremolo.frequency.setValueAtTime(cfg.tremolo.rate, now);
    } catch {}
    this.stageTremolo.setRouting(tremWet, cfg.tremolo.bypassed);

    // 6. Delay: amount 0..100 -> wet 0..0.6
    const delayAmount = cfg.delay.bypassed ? 0 : cfg.delay.amount;
    const delayWet = (delayAmount / 100) * 0.6;
    try {
      this.delay.delayTime.setValueAtTime(cfg.delay.time, now);
    } catch {}
    this.stageDelay.setRouting(delayWet, cfg.delay.bypassed);

    // 7. Reverb: amount 0..100 -> wet 0..0.7
    const reverbAmount = cfg.reverb.bypassed ? 0 : cfg.reverb.amount;
    const reverbWet = (reverbAmount / 100) * 0.7;
    this.stageReverb.setRouting(reverbWet, cfg.reverb.bypassed);

    // Debounced regeneration on size change
    const currentDecay = typeof this.reverb.decay === 'number' ? this.reverb.decay : parseFloat(String(this.reverb.decay));
    if (Math.abs(currentDecay - cfg.reverb.size) > 0.1) {
      if (this.reverbDebounceTimer !== null) {
        window.clearTimeout(this.reverbDebounceTimer);
      }
      this.reverbDebounceTimer = window.setTimeout(async () => {
        this.reverbDebounceTimer = null;
        this.reverb.decay = cfg.reverb.size;
        try {
          await this.reverb.generate();
        } catch {}
      }, 250);
    }

    this.persistConfig(cfg);
  }

  private persistConfig(cfg: FxConfig) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {}
  }

  private loadPersistedConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.fx = { ...DEFAULT_FX_CONFIG, ...parsed };
        }
      }
    } catch {}
  }

  public dispose() {
    if (this.reverbDebounceTimer !== null) {
      window.clearTimeout(this.reverbDebounceTimer);
    }
    this.masterGain.dispose();
    this.effectsOutput.dispose();
    this.limiter.dispose();
    this.stageDrive.dispose();
    this.driveFilter.dispose();
    this.driveChainGain.dispose();
    this.stageAutoFilter.dispose();
    this.stageChorus.dispose();
    this.stagePhaser.dispose();
    this.stageTremolo.dispose();
    this.stageDelay.dispose();
    this.stageReverb.dispose();
  }
}

let sharedEffectsRack: MasterEffectsRack | null = null;

export function getMasterEffectsRack(): MasterEffectsRack {
  if (!sharedEffectsRack) {
    sharedEffectsRack = new MasterEffectsRack();
  }
  return sharedEffectsRack;
}
