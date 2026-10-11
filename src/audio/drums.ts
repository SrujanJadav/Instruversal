import * as Tone from 'tone';

export type DrumSoundId =
  | 'open-hat'
  | 'closed-hat'
  | 'shaker'
  | 'cowbell'
  | 'clap'
  | 'snare'
  | 'tom'
  | 'kick';

export interface DrumLaneMeta {
  id: DrumSoundId;
  laneIndex: number; // 0 (top) to 7 (bottom)
  name: string;
  shortLabel: string;
}

export const DRUM_LANES: DrumLaneMeta[] = [
  { id: 'open-hat', laneIndex: 0, name: 'Open Hat', shortLabel: 'OH' },
  { id: 'closed-hat', laneIndex: 1, name: 'Closed Hat', shortLabel: 'CH' },
  { id: 'shaker', laneIndex: 2, name: 'Shaker', shortLabel: 'SH' },
  { id: 'cowbell', laneIndex: 3, name: 'Cowbell', shortLabel: 'CB' },
  { id: 'clap', laneIndex: 4, name: 'Clap', shortLabel: 'CP' },
  { id: 'snare', laneIndex: 5, name: 'Snare', shortLabel: 'SN' },
  { id: 'tom', laneIndex: 6, name: 'Tom', shortLabel: 'TM' },
  { id: 'kick', laneIndex: 7, name: 'Kick', shortLabel: 'BD' },
];

export function yToDrumSound(y: number): DrumSoundId {
  const laneIndex = Math.max(0, Math.min(7, Math.floor(y * 8)));
  return DRUM_LANES[laneIndex].id;
}

export type DrumKitId = '808' | 'lofi' | 'acoustic' | 'electro';

export interface DrumKitPreset {
  id: DrumKitId;
  name: string;
  description: string;
  kickPitch: string;
  kickDecay: number;
  snarePitch: string;
  snareDecay: number;
  hatDecay: number;
  openHatDecay: number;
  tomPitch: string;
  filterFreq: number;
}

export const DRUM_KITS: Record<DrumKitId, DrumKitPreset> = {
  '808': {
    id: '808',
    name: '808 Kit',
    description: 'Deep sub kick, crisp snappy snare, metallic hats',
    kickPitch: 'C1',
    kickDecay: 0.55,
    snarePitch: 'D2',
    snareDecay: 0.22,
    hatDecay: 0.05,
    openHatDecay: 0.35,
    tomPitch: 'G1',
    filterFreq: 8000,
  },
  'lofi': {
    id: 'lofi',
    name: 'Lo-fi Kit',
    description: 'Warm, soft, tape-filtered drum tones',
    kickPitch: 'B0',
    kickDecay: 0.35,
    snarePitch: 'C2',
    snareDecay: 0.18,
    hatDecay: 0.035,
    openHatDecay: 0.22,
    tomPitch: 'F1',
    filterFreq: 3200,
  },
  'acoustic': {
    id: 'acoustic',
    name: 'Acoustic Kit',
    description: 'Tight natural wooden attack, punchy shell tone',
    kickPitch: 'D1',
    kickDecay: 0.28,
    snarePitch: 'E2',
    snareDecay: 0.16,
    hatDecay: 0.045,
    openHatDecay: 0.28,
    tomPitch: 'A1',
    filterFreq: 6500,
  },
  'electro': {
    id: 'electro',
    name: 'Electro Kit',
    description: 'Punchy synthetic attack, bright snappy percussion',
    kickPitch: 'C#1',
    kickDecay: 0.42,
    snarePitch: 'D#2',
    snareDecay: 0.24,
    hatDecay: 0.06,
    openHatDecay: 0.4,
    tomPitch: 'G#1',
    filterFreq: 11000,
  },
};

export class DrumKitInstance {
  public readonly output: Tone.Gain;
  private kitId: DrumKitId = '808';

  // Drum synths
  private kickSynth: Tone.MembraneSynth;
  private tomSynth: Tone.MembraneSynth;
  private snareNoise: Tone.NoiseSynth;
  private snareBody: Tone.Synth;
  private clapNoise: Tone.NoiseSynth;
  private closedHat: Tone.MetalSynth;
  private openHat: Tone.MetalSynth;
  private shakerNoise: Tone.NoiseSynth;
  private cowbellOsc1: Tone.Oscillator;
  private cowbellOsc2: Tone.Oscillator;
  private cowbellFilter: Tone.Filter;
  private cowbellGain: Tone.Gain;
  private kitFilter: Tone.Filter;

  // Track if open hat is currently sounding for choke
  private openHatGain: Tone.Gain;

  constructor(initialKit: DrumKitId = '808') {
    this.output = new Tone.Gain(1.0);
    this.kitFilter = new Tone.Filter(8000, 'lowpass');
    this.kitFilter.connect(this.output);

    // 1. Kick
    this.kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.45,
        sustain: 0.01,
        release: 0.4,
      },
    });
    this.kickSynth.connect(this.kitFilter);

    // 2. Tom
    this.tomSynth = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.002,
        decay: 0.35,
        sustain: 0.02,
        release: 0.3,
      },
    });
    this.tomSynth.connect(this.kitFilter);

    // 3. Snare (Noise + Short Tonal Body)
    this.snareNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: {
        attack: 0.001,
        decay: 0.2,
        sustain: 0,
        release: 0.2,
      },
    });
    this.snareBody = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.002,
        decay: 0.12,
        sustain: 0,
        release: 0.12,
      },
    });
    this.snareNoise.connect(this.kitFilter);
    this.snareBody.connect(this.kitFilter);

    // 4. Clap (Layered noise)
    this.clapNoise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: {
        attack: 0.002,
        decay: 0.22,
        sustain: 0,
        release: 0.22,
      },
    });
    this.clapNoise.connect(this.kitFilter);

    // 5 & 6. Closed Hat & Open Hat (Choke group)
    this.closedHat = new Tone.MetalSynth({
      envelope: {
        attack: 0.001,
        decay: 0.05,
        release: 0.05,
      },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    });
    this.closedHat.connect(this.kitFilter);

    this.openHatGain = new Tone.Gain(1.0);
    this.openHat = new Tone.MetalSynth({
      envelope: {
        attack: 0.001,
        decay: 0.35,
        release: 0.35,
      },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    });
    this.openHat.connect(this.openHatGain);
    this.openHatGain.connect(this.kitFilter);

    // 7. Shaker (Soft bandpassed noise)
    const shakerFilter = new Tone.Filter(4800, 'bandpass', -12);
    this.shakerNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: {
        attack: 0.008,
        decay: 0.09,
        sustain: 0,
        release: 0.09,
      },
    });
    this.shakerNoise.connect(shakerFilter);
    shakerFilter.connect(this.kitFilter);

    // 8. Cowbell (Two detuned square waves through 800Hz bandpass)
    this.cowbellFilter = new Tone.Filter(820, 'bandpass', -24);
    this.cowbellGain = new Tone.Gain(0);
    this.cowbellOsc1 = new Tone.Oscillator(587, 'square').start();
    this.cowbellOsc2 = new Tone.Oscillator(845, 'square').start();
    this.cowbellOsc1.connect(this.cowbellGain);
    this.cowbellOsc2.connect(this.cowbellGain);
    this.cowbellGain.connect(this.cowbellFilter);
    this.cowbellFilter.connect(this.kitFilter);

    this.applyKitPreset(initialKit);
  }

  public setKit(kitId: DrumKitId): void {
    this.kitId = kitId;
    this.applyKitPreset(kitId);
  }

  public getKitId(): DrumKitId {
    return this.kitId;
  }

  private applyKitPreset(kitId: DrumKitId): void {
    const preset = DRUM_KITS[kitId] || DRUM_KITS['808'];
    this.kitFilter.frequency.rampTo(preset.filterFreq, 0.05);
    this.kickSynth.envelope.decay = preset.kickDecay;
    this.snareNoise.envelope.decay = preset.snareDecay;
    this.closedHat.envelope.decay = preset.hatDecay;
    this.openHat.envelope.decay = preset.openHatDecay;
  }

  /**
   * Trigger an individual drum voice by id
   */
  public trigger(soundId: DrumSoundId, time?: number, velocity: number = 0.8): void {
    const at = time !== undefined ? time : Tone.now();
    const preset = DRUM_KITS[this.kitId];

    switch (soundId) {
      case 'kick': {
        this.kickSynth.triggerAttackRelease(preset.kickPitch, '8n', at, velocity);
        break;
      }

      case 'tom': {
        this.tomSynth.triggerAttackRelease(preset.tomPitch, '8n', at, velocity);
        break;
      }

      case 'snare': {
        this.snareNoise.triggerAttackRelease('16n', at, velocity * 0.9);
        this.snareBody.triggerAttackRelease(preset.snarePitch, '16n', at, velocity * 0.7);
        break;
      }

      case 'clap': {
        // Quick 3-pulse flammed burst
        this.clapNoise.triggerAttackRelease('32n', at, velocity * 0.5);
        this.clapNoise.triggerAttackRelease('32n', at + 0.012, velocity * 0.7);
        this.clapNoise.triggerAttackRelease('16n', at + 0.024, velocity);
        break;
      }

      case 'closed-hat': {
        // Choke open hat if ringing
        this.openHatGain.gain.cancelScheduledValues(at);
        this.openHatGain.gain.setValueAtTime(0, at);
        this.openHatGain.gain.setValueAtTime(1.0, at + 0.05);

        this.closedHat.triggerAttackRelease(200, '32n', at, velocity * 0.75);
        break;
      }

      case 'open-hat': {
        this.openHatGain.gain.setValueAtTime(1.0, at);
        this.openHat.triggerAttackRelease(200, '8n', at, velocity * 0.75);
        break;
      }

      case 'shaker': {
        this.shakerNoise.triggerAttackRelease('16n', at, velocity * 0.7);
        break;
      }

      case 'cowbell': {
        this.cowbellGain.gain.cancelScheduledValues(at);
        this.cowbellGain.gain.setValueAtTime(velocity * 0.45, at);
        this.cowbellGain.gain.linearRampToValueAtTime(0, at + 0.25);
        break;
      }
    }
  }

  public dispose(): void {
    this.kickSynth.dispose();
    this.tomSynth.dispose();
    this.snareNoise.dispose();
    this.snareBody.dispose();
    this.clapNoise.dispose();
    this.closedHat.dispose();
    this.openHat.dispose();
    this.openHatGain.dispose();
    this.shakerNoise.dispose();
    this.cowbellOsc1.stop().dispose();
    this.cowbellOsc2.stop().dispose();
    this.cowbellFilter.dispose();
    this.cowbellGain.dispose();
    this.kitFilter.dispose();
    this.output.dispose();
  }
}
