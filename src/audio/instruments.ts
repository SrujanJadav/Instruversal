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
 * Helper to debounce rapid duplicate triggers of the exact same pitch within < 25ms
 * (prevents voice-stacking click bursts when dragging dense overlapping strokes)
 */
function createPitchThrottler() {
  const lastTimes = new Map<number, number>();
  return (midi: number, time?: Tone.Unit.Time | number): boolean => {
    const at = typeof time === 'number' ? time : Tone.now();
    const prev = lastTimes.get(midi);
    if (prev !== undefined && Math.abs(at - prev) < 0.025) {
      return false;
    }
    lastTimes.set(midi, at);
    if (lastTimes.size > 32) {
      for (const [k, v] of lastTimes) {
        if (at - v > 2) lastTimes.delete(k);
      }
    }
    return true;
  };
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
  const throttle = createPitchThrottler();

  return {
    id: 'pluck',
    name: 'Pluck',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.75) {
      if (!throttle(midi, time)) return;
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
  const throttle = createPitchThrottler();

  return {
    id: 'bell',
    name: 'Bell',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.65) {
      if (!throttle(midi, time)) return;
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
 * 3. Marimba: Sine + short envelope + subtle woody resonance (anti-click attack >= 5ms)
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
      attack: 0.006, // Anti-click floor (was 0.003)
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
  const throttle = createPitchThrottler();

  return {
    id: 'marimba',
    name: 'Marimba',
    output: outGain,
    triggerNote(midi, duration, time, velocity = 0.8) {
      if (!throttle(midi, time)) return;
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
      attack: 0.045,
      decay: 0.6,
      sustain: 0.45,
      release: 0.75,
    },
  });
  synth.maxPolyphony = 6;
  synth.connect(filter);
  const throttle = createPitchThrottler();

  return {
    id: 'soft-pad',
    name: 'Soft Pad',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.6) {
      if (!throttle(midi, time)) return;
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
  const throttle = createPitchThrottler();

  return {
    id: 'warm-keys',
    name: 'Warm Keys',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.7) {
      if (!throttle(midi, time)) return;
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
 * 6. Kalimba: Plucky triangle/sine blend, bright and short (anti-click attack >= 5ms)
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
      attack: 0.006, // Anti-click floor (was 0.003)
      decay: 0.26,
      sustain: 0.02,
      release: 0.22,
    },
  });
  synth.maxPolyphony = 6;
  synth.connect(filter);
  const throttle = createPitchThrottler();

  return {
    id: 'kalimba',
    name: 'Kalimba',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.75) {
      if (!throttle(midi, time)) return;
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
 * 7. Sub Bass: Warm triangle oscillator with 280Hz lowpass filter for clear upper harmonics
 * (audible on laptop/phone speakers without overdriving small cones)
 */
export function createSubBass(): InstrumentInstance {
  const synth = new Tone.MonoSynth({
    oscillator: { type: 'triangle' }, // Warm triangle provides overtone presence around 120-250Hz
    filter: {
      frequency: 280,
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
      baseFrequency: 80,
      octaves: 1.8,
    },
  });

  const throttle = createPitchThrottler();

  return {
    id: 'sub-bass',
    name: 'Sub Bass',
    output: synth,
    triggerNote(midi, duration, time, velocity = 0.8) {
      if (!throttle(midi, time)) return;
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

/**
 * 8. Music Box: Bright bell-like FM chime with anti-click envelope floor
 */
export function createMusicBox(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 600,
    type: 'highpass',
  });

  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.5,
    modulationIndex: 2.2,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.006, // Anti-click floor (was 0.003)
      decay: 0.45,
      sustain: 0.02,
      release: 0.35,
    },
    modulationEnvelope: {
      attack: 0.006, // Anti-click floor (was 0.003)
      decay: 0.22,
      sustain: 0.01,
      release: 0.2,
    },
  });
  synth.maxPolyphony = 6;
  synth.connect(filter);
  const throttle = createPitchThrottler();

  return {
    id: 'music-box',
    name: 'Music Box',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.7) {
      if (!throttle(midi, time)) return;
      const freq = Tone.Frequency(midi + 12, 'midi').toFrequency(); // one octave up for sparkle
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      filter.dispose();
    },
  };
}

/**
 * 9. Steel Pan: FM with clear metallic attack and warm body
 */
export function createSteelPan(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 1400,
    type: 'bandpass',
    Q: 2.0,
  });

  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1.5,
    modulationIndex: 3.2,
    oscillator: { type: 'triangle' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.006, // Anti-click floor (was 0.004)
      decay: 0.45,
      sustain: 0.03,
      release: 0.3,
    },
    modulationEnvelope: {
      attack: 0.006, // Anti-click floor (was 0.004)
      decay: 0.18,
      sustain: 0.01,
      release: 0.18,
    },
  });
  synth.maxPolyphony = 6;
  synth.connect(filter);
  const throttle = createPitchThrottler();

  return {
    id: 'steel-pan',
    name: 'Steel Pan',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.75) {
      if (!throttle(midi, time)) return;
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
 * 10. Glass Harmonica: Airy sine layers, slow attack 40ms, ethereal tail
 */
export function createGlassHarmonica(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 300,
    type: 'highpass',
  });

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.04,
      decay: 0.7,
      sustain: 0.5,
      release: 0.9,
    },
  });
  synth.maxPolyphony = 6;
  synth.connect(filter);
  const throttle = createPitchThrottler();

  return {
    id: 'glass-harmonica',
    name: 'Glass Harmonica',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.65) {
      if (!throttle(midi, time)) return;
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
 * 11. Strings: Detuned sawtooth ensemble through lowpass, 45ms attack
 */
export function createStrings(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 1600,
    type: 'lowpass',
    rolloff: -12,
  });

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 20 } as any,
    envelope: {
      attack: 0.045,
      decay: 0.6,
      sustain: 0.6,
      release: 0.65,
    },
  });
  synth.maxPolyphony = 6;
  synth.connect(filter);
  const throttle = createPitchThrottler();

  return {
    id: 'strings',
    name: 'Strings',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.6) {
      if (!throttle(midi, time)) return;
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
 * 12. Whistle / Theremin: Pure sine with gentle vibrato that deepens as held
 */
export function createTheremin(): InstrumentInstance {
  const vibrato = new Tone.Vibrato({
    frequency: 5.5,
    depth: 0.25,
  });

  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.015,
      decay: 0.25,
      sustain: 0.75,
      release: 0.3,
    },
  });
  synth.connect(vibrato);
  const throttle = createPitchThrottler();

  return {
    id: 'theremin',
    name: 'Theremin',
    output: vibrato,
    triggerNote(midi, duration, time, velocity = 0.7) {
      if (!throttle(midi, time)) return;
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      vibrato.dispose();
    },
  };
}

/**
 * 13. Wobble Bass: Mono saw with LFO-modulated lowpass filter
 */
export function createWobbleBass(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 450,
    type: 'lowpass',
    rolloff: -12,
  });

  const lfo = new Tone.LFO({
    frequency: '4n',
    min: 200,
    max: 1800,
  }).start();
  lfo.connect(filter.frequency);

  const synth = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    envelope: {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.45,
      release: 0.22,
    },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.2,
      release: 0.2,
      baseFrequency: 300,
      octaves: 2,
    },
  });
  synth.connect(filter);
  const throttle = createPitchThrottler();

  return {
    id: 'wobble-bass',
    name: 'Wobble Bass',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.75) {
      if (!throttle(midi, time)) return;
      const bassMidi = Math.max(36, Math.min(60, midi - 12));
      const freq = Tone.Frequency(bassMidi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      lfo.stop();
      lfo.dispose();
      synth.dispose();
      filter.dispose();
    },
  };
}

/**
 * 14. Tape Keys: Electric piano tone with wow/flutter drift and soft saturation
 */
export function createTapeKeys(): InstrumentInstance {
  const filter = new Tone.Filter({
    frequency: 2200,
    type: 'lowpass',
  });

  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1.0,
    modulationIndex: 1.8,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.008,
      decay: 0.5,
      sustain: 0.3,
      release: 0.4,
    },
    modulationEnvelope: {
      attack: 0.008,
      decay: 0.2,
      sustain: 0.1,
      release: 0.2,
    },
  });
  synth.maxPolyphony = 6;
  synth.connect(filter);
  const throttle = createPitchThrottler();

  return {
    id: 'tape-keys',
    name: 'Tape Keys',
    output: filter,
    triggerNote(midi, duration, time, velocity = 0.7) {
      if (!throttle(midi, time)) return;
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
 * 15. Choir Pad: Formant-like "ooh" timbre with dual bandpass resonance
 */
export function createChoirPad(): InstrumentInstance {
  const formant1 = new Tone.Filter({ frequency: 800, type: 'bandpass', Q: 2.2 });
  const formant2 = new Tone.Filter({ frequency: 2200, type: 'bandpass', Q: 2.0 });
  const merger = new Tone.Gain(0.85);

  formant1.connect(merger);
  formant2.connect(merger);

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: {
      attack: 0.045,
      decay: 0.7,
      sustain: 0.6,
      release: 0.75,
    },
  });
  synth.maxPolyphony = 6;
  synth.connect(formant1);
  synth.connect(formant2);
  const throttle = createPitchThrottler();

  return {
    id: 'choir-pad',
    name: 'Choir Pad',
    output: merger,
    triggerNote(midi, duration, time, velocity = 0.65) {
      if (!throttle(midi, time)) return;
      const freq = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, time, velocity);
    },
    dispose() {
      synth.dispose();
      formant1.dispose();
      formant2.dispose();
      merger.dispose();
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
  { id: 'music-box', name: 'Music Box', create: createMusicBox },
  { id: 'steel-pan', name: 'Steel Pan', create: createSteelPan },
  { id: 'glass-harmonica', name: 'Glass Harmonica', create: createGlassHarmonica },
  { id: 'strings', name: 'Strings', create: createStrings },
  { id: 'theremin', name: 'Theremin', create: createTheremin },
  { id: 'wobble-bass', name: 'Wobble Bass', create: createWobbleBass },
  { id: 'tape-keys', name: 'Tape Keys', create: createTapeKeys },
  { id: 'choir-pad', name: 'Choir Pad', create: createChoirPad },
];

export const INSTRUMENTS_MAP: Record<string, InstrumentMeta> = Object.fromEntries(
  INSTRUMENT_METAS.map((meta) => [meta.id, meta])
);

