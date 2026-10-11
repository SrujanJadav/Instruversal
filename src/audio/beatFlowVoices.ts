import * as Tone from 'tone';
import { BeatFlowStyle, BeatRollVoice, BeatSweepCharacter } from '../state';

export interface BeatFlowVoice {
  id: string;
  trackId: string;
  strokeId: string;
  style: BeatFlowStyle;
  output: Tone.ToneAudioNode;
  triggerAttack(freqOrY: number, time: number, velocity?: number, width?: number): void;
  updateParam(freqOrY: number, time: number, slideSec: number, width?: number): void;
  triggerRelease(time: number): void;
  fadeAndRelease(fadeSec?: number): void;
  dispose(): void;
}

/**
 * 1. Glide Voice: Dedicated mono sub/bass voice (sine + warm low saw)
 * with a pitch-drop transient at the start and phone-friendly soft saturation.
 */
export function createGlideVoice(destination: Tone.ToneAudioNode): BeatFlowVoice {
  const id = `glide-${Math.random().toString(36).slice(2, 9)}`;
  const voiceGain = new Tone.Gain(0);
  voiceGain.connect(destination);

  const filter = new Tone.Filter({
    frequency: 900,
    type: 'lowpass',
    rolloff: -12,
  });

  // Soft saturation curve for phone speaker audibility
  const distortion = new Tone.Chebyshev({
    order: 2,
    wet: 0.35,
  });

  const sineOsc = new Tone.Oscillator(55, 'sine');
  const sawOsc = new Tone.Oscillator(55, 'sawtooth');
  const sawGain = new Tone.Gain(0.22); // subtle saw presence

  sawOsc.connect(sawGain);
  sawGain.connect(filter);
  sineOsc.connect(filter);

  filter.connect(distortion);
  distortion.connect(voiceGain);

  sineOsc.start();
  sawOsc.start();

  return {
    id,
    trackId: '',
    strokeId: '',
    style: 'glide',
    output: voiceGain,

    triggerAttack(freq: number, time: number, velocity: number = 0.8) {
      const at = time;
      // Start slightly higher for 18ms transient drop (classic 808 transient punch)
      const transientPitch = Math.min(440, freq * 1.35);
      sineOsc.frequency.cancelScheduledValues(at);
      sawOsc.frequency.cancelScheduledValues(at);

      sineOsc.frequency.setValueAtTime(transientPitch, at);
      sawOsc.frequency.setValueAtTime(transientPitch, at);

      sineOsc.frequency.exponentialRampToValueAtTime(freq, at + 0.02);
      sawOsc.frequency.exponentialRampToValueAtTime(freq, at + 0.02);

      voiceGain.gain.cancelScheduledValues(at);
      voiceGain.gain.setValueAtTime(0.001, at);
      voiceGain.gain.linearRampToValueAtTime(Math.min(1.0, velocity * 0.95), at + 0.015);
    },

    updateParam(freq: number, time: number, slideSec: number) {
      const at = time;
      const rampTime = Math.max(0.02, slideSec);
      sineOsc.frequency.rampTo(freq, rampTime, at);
      sawOsc.frequency.rampTo(freq, rampTime, at);
    },

    triggerRelease(time: number) {
      voiceGain.gain.cancelScheduledValues(time);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, time);
      voiceGain.gain.linearRampToValueAtTime(0.001, time + 0.08);
    },

    fadeAndRelease(fadeSec: number = 0.02) {
      const now = Tone.now();
      voiceGain.gain.cancelScheduledValues(now);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
      voiceGain.gain.linearRampToValueAtTime(0.001, now + fadeSec);
    },

    dispose() {
      sineOsc.stop().dispose();
      sawOsc.stop().dispose();
      sawGain.dispose();
      filter.dispose();
      distortion.dispose();
      voiceGain.dispose();
    },
  };
}

/**
 * 2. Sweep Voice: Continuous filtered noise through a bandpass filter.
 * Height controls cutoff frequency (400Hz to 10kHz), thickness controls volume.
 */
export function createSweepVoice(
  character: BeatSweepCharacter = 'shaker',
  destination: Tone.ToneAudioNode
): BeatFlowVoice {
  const id = `sweep-${Math.random().toString(36).slice(2, 9)}`;
  const voiceGain = new Tone.Gain(0);
  voiceGain.connect(destination);

  const filter = new Tone.Filter({
    frequency: 2400,
    type: 'bandpass',
    Q: character === 'shaker' ? 2.5 : 3.8,
  });

  const noise = new Tone.Noise(character === 'shaker' ? 'white' : 'pink');
  noise.connect(filter);
  filter.connect(voiceGain);
  noise.start();

  return {
    id,
    trackId: '',
    strokeId: '',
    style: 'sweep',
    output: voiceGain,

    triggerAttack(normY: number, time: number, velocity: number = 0.8, width: number = 3.5) {
      const at = time;
      const cutoff = 400 * Math.pow(10000 / 400, Math.max(0, Math.min(1, 1 - normY)));
      const targetGain = Math.min(1.0, Math.max(0.3, (velocity * 0.7) + (width / 5) * 0.25));

      filter.frequency.cancelScheduledValues(at);
      filter.frequency.setValueAtTime(cutoff, at);

      voiceGain.gain.cancelScheduledValues(at);
      voiceGain.gain.setValueAtTime(0.001, at);
      voiceGain.gain.linearRampToValueAtTime(targetGain, at + 0.02);
    },

    updateParam(normY: number, time: number, slideSec: number, width: number = 3.5) {
      const at = time;
      const cutoff = 400 * Math.pow(10000 / 400, Math.max(0, Math.min(1, 1 - normY)));
      const targetGain = Math.min(1.0, Math.max(0.3, 0.55 + (width / 5) * 0.35));

      filter.frequency.rampTo(cutoff, Math.max(0.03, slideSec), at);
      voiceGain.gain.rampTo(targetGain, Math.max(0.03, slideSec), at);
    },

    triggerRelease(time: number) {
      voiceGain.gain.cancelScheduledValues(time);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, time);
      voiceGain.gain.linearRampToValueAtTime(0.001, time + 0.06);
    },

    fadeAndRelease(fadeSec: number = 0.02) {
      const now = Tone.now();
      voiceGain.gain.cancelScheduledValues(now);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
      voiceGain.gain.linearRampToValueAtTime(0.001, now + fadeSec);
    },

    dispose() {
      noise.stop().dispose();
      filter.dispose();
      voiceGain.dispose();
    },
  };
}

/**
 * 3. Roll Voice: Retriggering drum voice (Snare, Hat, or Tom).
 * Rate ramps from 1/8 to 1/64 note with slope/height. Velocity follows thickness.
 */
export function createRollVoice(
  voiceType: BeatRollVoice = 'snare',
  destination: Tone.ToneAudioNode
): BeatFlowVoice {
  const id = `roll-${Math.random().toString(36).slice(2, 9)}`;
  const voiceGain = new Tone.Gain(0.9);
  voiceGain.connect(destination);

  let synth: Tone.NoiseSynth | Tone.MetalSynth | Tone.MembraneSynth;

  if (voiceType === 'hat') {
    synth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.04, release: 0.04 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
    });
  } else if (voiceType === 'tom') {
    synth = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 4,
      envelope: { attack: 0.002, decay: 0.22, release: 0.2 },
    });
  } else {
    // Snare (white noise burst)
    synth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.12, release: 0.1 },
    });
  }
  synth.connect(voiceGain);

  return {
    id,
    trackId: '',
    strokeId: '',
    style: 'roll',
    output: voiceGain,

    triggerAttack(_normY: number, time: number, velocity: number = 0.75) {
      if (voiceType === 'hat') {
        (synth as Tone.MetalSynth).triggerAttackRelease(200, '32n', time, velocity);
      } else if (voiceType === 'tom') {
        (synth as Tone.MembraneSynth).triggerAttackRelease('A1', '16n', time, velocity);
      } else {
        (synth as Tone.NoiseSynth).triggerAttackRelease('32n', time, velocity);
      }
    },

    updateParam(_normY: number, time: number, _slideSec: number, width: number = 3.5) {
      const vel = Math.min(1.0, Math.max(0.4, 0.45 + (width / 5) * 0.45));
      if (voiceType === 'hat') {
        (synth as Tone.MetalSynth).triggerAttackRelease(200, '32n', time, vel);
      } else if (voiceType === 'tom') {
        (synth as Tone.MembraneSynth).triggerAttackRelease('A1', '16n', time, vel);
      } else {
        (synth as Tone.NoiseSynth).triggerAttackRelease('32n', time, vel);
      }
    },

    triggerRelease(time: number) {
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, time);
    },

    fadeAndRelease(fadeSec: number = 0.02) {
      const now = Tone.now();
      voiceGain.gain.cancelScheduledValues(now);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
      voiceGain.gain.linearRampToValueAtTime(0.001, now + fadeSec);
    },

    dispose() {
      synth.dispose();
      voiceGain.dispose();
    },
  };
}

/**
 * Voice Pool managing active beat flow voices.
 * Capped at 4 simultaneous voices with clean voice stealing and zero stuck notes.
 */
export class BeatFlowVoicePool {
  private activeVoices: Map<string, BeatFlowVoice> = new Map();
  private maxVoices = 4;

  public acquireVoice(
    strokeId: string,
    trackId: string,
    style: BeatFlowStyle,
    rollVoice: BeatRollVoice,
    sweepChar: BeatSweepCharacter,
    destination: Tone.ToneAudioNode
  ): BeatFlowVoice {
    let voice = this.activeVoices.get(strokeId);
    if (voice && voice.style === style) {
      return voice;
    }

    if (voice) {
      voice.fadeAndRelease(0.015);
      this.activeVoices.delete(strokeId);
    }

    // Steal oldest voice if capacity reached
    if (this.activeVoices.size >= this.maxVoices) {
      const oldestKey = this.activeVoices.keys().next().value;
      if (oldestKey) {
        const oldest = this.activeVoices.get(oldestKey);
        oldest?.fadeAndRelease(0.015);
        this.activeVoices.delete(oldestKey);
      }
    }

    if (style === 'glide') {
      voice = createGlideVoice(destination);
    } else if (style === 'sweep') {
      voice = createSweepVoice(sweepChar, destination);
    } else {
      voice = createRollVoice(rollVoice, destination);
    }

    voice.trackId = trackId;
    voice.strokeId = strokeId;
    this.activeVoices.set(strokeId, voice);
    return voice;
  }

  public markStrokeEnded(strokeId: string) {
    const voice = this.activeVoices.get(strokeId);
    if (voice) {
      voice.triggerRelease(Tone.now());
      window.setTimeout(() => {
        voice.dispose();
        this.activeVoices.delete(strokeId);
      }, 150);
    }
  }

  public releaseAll(fadeSec: number = 0.02) {
    for (const voice of this.activeVoices.values()) {
      voice.fadeAndRelease(fadeSec);
      voice.dispose();
    }
    this.activeVoices.clear();
  }
}

let sharedBeatFlowPool: BeatFlowVoicePool | null = null;
export function getBeatFlowVoicePool(): BeatFlowVoicePool {
  if (!sharedBeatFlowPool) {
    sharedBeatFlowPool = new BeatFlowVoicePool();
  }
  return sharedBeatFlowPool;
}
