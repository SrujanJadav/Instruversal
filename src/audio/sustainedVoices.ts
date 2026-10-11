import * as Tone from 'tone';

export interface SustainedVoice {
  id: string;
  instrumentId: string;
  output: Tone.ToneAudioNode;
  triggerAttack(freq: number, time?: number, velocity?: number): void;
  triggerRelease(time?: number): void;
  setNote(freq: number, time?: number, slideSeconds?: number): void;
  fadeAndRelease(fadeSeconds?: number): void;
  dispose(): void;
}

export function createSustainedVoice(
  instrumentId: string,
  destination: Tone.ToneAudioNode
): SustainedVoice {
  const voiceId = `voice-${Math.random().toString(36).slice(2, 9)}`;
  const voiceGain = new Tone.Gain(1.0);
  voiceGain.connect(destination);

  let synthNode: Tone.Synth | Tone.FMSynth | Tone.MonoSynth;
  let filterNode: Tone.Filter | null = null;

  switch (instrumentId) {
    case 'pluck': {
      filterNode = new Tone.Filter({
        frequency: 2400,
        type: 'lowpass',
        rolloff: -12,
      });
      synthNode = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.015,
          decay: 0.1,
          sustain: 1.0,
          release: 0.25,
        },
      });
      synthNode.connect(filterNode);
      filterNode.connect(voiceGain);
      break;
    }

    case 'bell': {
      filterNode = new Tone.Filter({
        frequency: 380,
        type: 'highpass',
      });
      synthNode = new Tone.FMSynth({
        harmonicity: 2.76,
        modulationIndex: 2.2,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: {
          attack: 0.02,
          decay: 0.12,
          sustain: 1.0,
          release: 0.35,
        },
        modulationEnvelope: {
          attack: 0.02,
          decay: 0.18,
          sustain: 0.65,
          release: 0.35,
        },
      });
      synthNode.connect(filterNode);
      filterNode.connect(voiceGain);
      break;
    }

    case 'marimba': {
      filterNode = new Tone.Filter({
        frequency: 900,
        type: 'bandpass',
        Q: 1.4,
      });
      synthNode = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.015,
          decay: 0.1,
          sustain: 1.0,
          release: 0.22,
        },
      });
      synthNode.connect(filterNode);
      filterNode.connect(voiceGain);
      break;
    }

    case 'soft-pad': {
      filterNode = new Tone.Filter({
        frequency: 1200,
        type: 'lowpass',
        rolloff: -12,
      });
      synthNode = new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: {
          attack: 0.02,
          decay: 0.15,
          sustain: 1.0,
          release: 0.35,
        },
      });
      synthNode.connect(filterNode);
      filterNode.connect(voiceGain);
      break;
    }

    case 'warm-keys': {
      filterNode = new Tone.Filter({
        frequency: 2200,
        type: 'lowpass',
      });
      synthNode = new Tone.FMSynth({
        harmonicity: 2.0,
        modulationIndex: 1.5,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: {
          attack: 0.015,
          decay: 0.1,
          sustain: 1.0,
          release: 0.28,
        },
        modulationEnvelope: {
          attack: 0.015,
          decay: 0.15,
          sustain: 0.7,
          release: 0.28,
        },
      });
      synthNode.connect(filterNode);
      filterNode.connect(voiceGain);
      break;
    }

    case 'kalimba': {
      filterNode = new Tone.Filter({
        frequency: 2600,
        type: 'peaking',
        Q: 2.2,
        gain: 3.5,
      });
      synthNode = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.015,
          decay: 0.1,
          sustain: 1.0,
          release: 0.25,
        },
      });
      synthNode.connect(filterNode);
      filterNode.connect(voiceGain);
      break;
    }

    case 'sub-bass':
    default: {
      const subSynth = new Tone.MonoSynth({
        oscillator: { type: 'sine' },
        filter: {
          frequency: 220,
          type: 'lowpass',
          rolloff: -12,
        },
        envelope: {
          attack: 0.015,
          decay: 0.1,
          sustain: 1.0,
          release: 0.25,
        },
        filterEnvelope: {
          attack: 0.015,
          decay: 0.1,
          sustain: 0.85,
          release: 0.25,
          baseFrequency: 70,
          octaves: 1.6,
        },
      });
      subSynth.connect(voiceGain);
      synthNode = subSynth;
      break;
    }
  }

  return {
    id: voiceId,
    instrumentId,
    output: voiceGain,

    triggerAttack(freq: number, time?: number, velocity: number = 0.8) {
      voiceGain.gain.cancelScheduledValues(time ?? Tone.now());
      voiceGain.gain.setValueAtTime(1.0, time ?? Tone.now());
      synthNode.triggerAttack(freq, time, velocity);
    },

    triggerRelease(time?: number) {
      synthNode.triggerRelease(time);
    },

    setNote(freq: number, time?: number, slideSeconds?: number) {
      const atTime = time !== undefined ? time : Tone.now();
      const slide = slideSeconds !== undefined ? slideSeconds : 0.008;

      if (slide > 0.008) {
        synthNode.frequency.rampTo(freq, slide, atTime);
      } else {
        synthNode.frequency.setValueAtTime(freq, atTime);
      }
    },

    fadeAndRelease(fadeSeconds: number = 0.025) {
      const now = Tone.now();
      voiceGain.gain.cancelScheduledValues(now);
      voiceGain.gain.rampTo(0, fadeSeconds, now);
      window.setTimeout(() => {
        try {
          synthNode.triggerRelease();
        } catch {
          // ignore if already disposed or released
        }
      }, Math.round(fadeSeconds * 1000) + 10);
    },

    dispose() {
      try {
        synthNode.dispose();
      } catch {}
      if (filterNode) {
        try {
          filterNode.dispose();
        } catch {}
      }
      try {
        voiceGain.dispose();
      } catch {}
    },
  };
}
