import * as Tone from 'tone';

export interface InstrumentInstance {
  id: string;
  name: string;
  triggerNote(
    midi: number,
    duration: Tone.Unit.Time | number,
    time?: Tone.Unit.Time | number,
    velocity?: number
  ): void;
  dispose(): void;
  output: Tone.ToneAudioNode;
}

export type InstrumentFactory = () => InstrumentInstance;

export interface InstrumentMeta {
  id: string;
  name: string;
  create: InstrumentFactory;
}

/**
 * 1. Pluck: Triangle wave + fast decay, subtle lowpass filter
 */
export function createPluck(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 2200,
    type: 'lowpass',
    rolloff: -12,
  });

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: {
      attack: 0.005,
      decay: 0.28,
      sustain: 0.04,
      release: 0.25,
    },
  });
  synth.maxPolyphony = 6;

  synth.connect(filter);

  return {
    id: 'pluck',
    name: 'Pluck',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.75) {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      filter.dispose();
    },
  };
}

/**
 * 2. Bell: FM synth with harmonicity ~2.76, short high-pass tail
 */
export function createBell(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 450,
    type: 'highpass',
  });

  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2.76,
    modulationIndex: 4,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.005,
      decay: 0.75,
      sustain: 0.02,
      release: 0.75,
    },
    modulationEnvelope: {
      attack: 0.005,
      decay: 0.35,
      sustain: 0.01,
      release: 0.35,
    },
  });
  synth.maxPolyphony = 6;

  synth.connect(filter);

  return {
    id: 'bell',
    name: 'Bell',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.65) {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      filter.dispose();
    },
  };
}

/**
 * 3. Marimba: Sine + short envelope + subtle woody resonance
 */
export function createMarimba(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 900,
    type: 'bandpass',
    Q: 1.5,
  });

  const gainDirect = new Tone.Gain(0.85);
  const gainResonance = new Tone.Gain(0.4);
  const outGain = new Tone.Gain(0.9);

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.003,
      decay: 0.32,
      sustain: 0.01,
      release: 0.28,
    },
  });
  synth.maxPolyphony = 6;

  synth.connect(gainDirect);
  synth.connect(filter);
  filter.connect(gainResonance);

  gainDirect.connect(outGain);
  gainResonance.connect(outGain);

  return {
    id: 'marimba',
    name: 'Marimba',
    output: outGain,
    triggerNote(midi, duration, time, velocity = 0.8) {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      filter.dispose();
      gainDirect.dispose();
      gainResonance.dispose();
      outGain.dispose();
    },
  };
}

/**
 * 4. Soft Pad: Filtered sawtooth, slow attack, long release
 */
export function createSoftPad(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 1100,
    type: 'lowpass',
    rolloff: -12,
  });

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: {
      attack: 0.22,
      decay: 0.6,
      sustain: 0.45,
      release: 0.75,
    },
  });
  synth.maxPolyphony = 6;

  synth.connect(filter);

  return {
    id: 'soft-pad',
    name: 'Soft Pad',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.6) {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      filter.dispose();
    },
  };
}

/**
 * 5. Warm Keys: FM electric piano style
 */
export function createWarmKeys(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 2400,
    type: 'lowpass',
  });

  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 1.8,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.01,
      decay: 0.5,
      sustain: 0.25,
      release: 0.45,
    },
    modulationEnvelope: {
      attack: 0.01,
      decay: 0.22,
      sustain: 0.1,
      release: 0.25,
    },
  });
  synth.maxPolyphony = 6;

  synth.connect(filter);

  return {
    id: 'warm-keys',
    name: 'Warm Keys',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.7) {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      filter.dispose();
    },
  };
}

/**
 * 6. Kalimba: Plucky triangle/sine blend, bright and short
 */
export function createKalimba(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 2600,
    type: 'peaking',
    Q: 2,
    gain: 4,
  });

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: {
      attack: 0.003,
      decay: 0.26,
      sustain: 0.02,
      release: 0.22,
    },
  });
  synth.maxPolyphony = 6;

  synth.connect(filter);

  return {
    id: 'kalimba',
    name: 'Kalimba',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.75) {
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      filter.dispose();
    },
  };
}

/**
 * 7. Sub Bass: Sine + low saw, mono, short punch
 */
export function createSubBass(): InstrumentInstance {
  const synth = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    filter: {
      frequency: 220,
      type: 'lowpass',
      rolloff: -12,
    },
    envelope: {
      attack: 0.01,
      decay: 0.38,
      sustain: 0.15,
      release: 0.28,
    },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.25,
      sustain: 0.1,
      release: 0.2,
      baseFrequency: 70,
      octaves: 1.8,
    },
  });

  return {
    id: 'sub-bass',
    name: 'Sub Bass',
    output: synth,
    triggerNote(midi, duration, time, velocity = 0.8) {
      // Keep sub bass within deep octave range (e.g. C2–C3)
      const bassMidi = Math.max(36, Math.min(60, midi - 12));
      const freq = Tone.Frequency(bassMidi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
    },
  };
}

export const INSTRUMENT_METAS: InstrumentMeta[] = [
  { id: 'pluck', name: 'Pluck', create: createPluck },
  { id: 'bell', name: 'Bell', create: createBell },
  { id: 'marimba', name: 'Marimba', create: createMarimba },
  { id: 'soft-pad', name: 'Soft Pad', create: createSoftPad },
  { id: 'warm-keys', name: 'Warm Keys', create: createWarmKeys },
  { id: 'kalimba', name: 'Kalimba', create: createKalimba },
  { id: 'sub-bass', name: 'Sub Bass', create: createSubBass },
];

export const INSTRUMENTS_MAP: Record<string, InstrumentMeta> = Object.fromEntries(
  INSTRUMENT_METAS.map((meta) => [meta.id, meta])
);
