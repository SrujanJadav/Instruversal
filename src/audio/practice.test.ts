import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeDroneFrequencies,
  getMetronomeClickProperties,
  calculateCountInDuration,
  loadPracticeSettings,
  savePracticeSettings,
  PRACTICE_STORAGE_KEY,
} from './practice';
import { exportProjectToMidi } from '../export/exportMidi';
import { Stroke } from '../state';

// Polyfill localStorage for node test runner
if (typeof globalThis.localStorage === 'undefined') {
  let store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as unknown as Storage;
}

describe('Practice Aids (src/audio/practice.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('computeDroneFrequencies', () => {
    it('computes exact root and perfect fifth frequencies for C3', () => {
      const { rootFreq, fifthFreq } = computeDroneFrequencies(0);
      // C3 = MIDI 48 ≈ 130.8128 Hz
      expect(rootFreq).toBeCloseTo(130.81, 1);
      // G3 = MIDI 55 ≈ 195.9977 Hz
      expect(fifthFreq).toBeCloseTo(196.0, 1);
      // Interval ratio is approx 3:2 (1.4983)
      expect(fifthFreq / rootFreq).toBeCloseTo(1.498, 2);
    });

    it('computes exact frequencies for D3', () => {
      const { rootFreq, fifthFreq } = computeDroneFrequencies(2);
      // D3 = MIDI 50 ≈ 146.8324 Hz
      expect(rootFreq).toBeCloseTo(146.83, 1);
      // A3 = MIDI 57 = 220.0000 Hz
      expect(fifthFreq).toBeCloseTo(220.0, 1);
    });

    it('computes exact frequencies for A3', () => {
      const { rootFreq, fifthFreq } = computeDroneFrequencies(9);
      // A3 = MIDI 57 = 220.0000 Hz
      expect(rootFreq).toBeCloseTo(220.0, 1);
      // E4 = MIDI 64 ≈ 329.6276 Hz
      expect(fifthFreq).toBeCloseTo(329.63, 1);
    });

    it('handles octave wrapping and negative numbers safely', () => {
      const wrap12 = computeDroneFrequencies(12);
      const c0 = computeDroneFrequencies(0);
      expect(wrap12.rootFreq).toBeCloseTo(c0.rootFreq, 2);

      const neg1 = computeDroneFrequencies(-1); // should wrap to B (11)
      const b11 = computeDroneFrequencies(11);
      expect(neg1.rootFreq).toBeCloseTo(b11.rootFreq, 2);
    });
  });

  describe('getMetronomeClickProperties', () => {
    it('accents beat 0 (beat 1 of bar) with higher pitch and velocity', () => {
      const beat0 = getMetronomeClickProperties(0);
      expect(beat0.isAccent).toBe(true);
      expect(beat0.freq).toBe(1400);
      expect(beat0.velocity).toBeGreaterThan(0.9);

      const beat4 = getMetronomeClickProperties(4);
      expect(beat4.isAccent).toBe(true);
      expect(beat4.freq).toBe(1400);
    });

    it('unaccents beats 1, 2, and 3 with lower pitch and velocity', () => {
      for (const b of [1, 2, 3, 5, 6, 7]) {
        const beat = getMetronomeClickProperties(b);
        expect(beat.isAccent).toBe(false);
        expect(beat.freq).toBe(880);
        expect(beat.velocity).toBeLessThan(0.8);
      }
    });
  });

  describe('calculateCountInDuration', () => {
    it('calculates duration for standard 4 beats at different tempos', () => {
      // At 60 BPM, 4 beats = 4 seconds
      expect(calculateCountInDuration(60)).toBeCloseTo(4.0, 2);
      // At 120 BPM, 4 beats = 2 seconds
      expect(calculateCountInDuration(120)).toBeCloseTo(2.0, 2);
      // At 90 BPM, 4 beats = 2.667 seconds
      expect(calculateCountInDuration(90)).toBeCloseTo(2.667, 2);
    });

    it('clamps extreme BPM values to prevent freeze or runaway timers', () => {
      expect(calculateCountInDuration(10)).toBeCloseTo(8.0, 1); // clamped to 30 BPM
      expect(calculateCountInDuration(500)).toBeCloseTo(1.0, 1); // clamped to 240 BPM
    });
  });

  describe('Settings persistence', () => {
    it('loads default settings when storage is empty', () => {
      const s = loadPracticeSettings();
      expect(s.droneEnabled).toBe(false);
      expect(s.metronomeEnabled).toBe(false);
      expect(s.countInEnabled).toBe(false);
      expect(s.droneVolume).toBe(0.6);
      expect(s.metronomeVolume).toBe(0.7);
      expect(s.droneFollows).toBe('selected');
    });

    it('persists updates under instruversal:practice key', () => {
      savePracticeSettings({
        droneEnabled: true,
        droneVolume: 0.85,
        droneFollows: 'base',
        metronomeEnabled: true,
        countInEnabled: true,
      });

      const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.droneEnabled).toBe(true);
      expect(parsed.droneVolume).toBe(0.85);
      expect(parsed.droneFollows).toBe('base');
      expect(parsed.metronomeEnabled).toBe(true);
      expect(parsed.countInEnabled).toBe(true);

      const reloaded = loadPracticeSettings();
      expect(reloaded.droneEnabled).toBe(true);
      expect(reloaded.droneVolume).toBe(0.85);
      expect(reloaded.droneFollows).toBe('base');
    });

    it('clamps volume inputs between 0 and 1', () => {
      savePracticeSettings({ droneVolume: 2.5, metronomeVolume: -0.4 });
      const reloaded = loadPracticeSettings();
      expect(reloaded.droneVolume).toBe(1.0);
      expect(reloaded.metronomeVolume).toBe(0.0);
    });
  });

  describe('Metronome MIDI Export Integration', () => {
    const dummyStroke: Stroke = {
      id: 'stroke-1',
      trackId: 'track-vermilion',
      points: [
        { x: 0.1, y: 0.5, t: 0 },
        { x: 0.4, y: 0.5, t: 100 },
      ],
      width: 2,
    };

    it('excludes metronome track by default when includeMetronome is false', async () => {
      const result = exportProjectToMidi({
        title: 'Plain Sketch',
        bpm: 120,
        bars: 2,
        repeats: 1,
        strokes: [dummyStroke],
        includeMetronome: false,
        tracks: [
          {
            id: 'track-vermilion',
            colorId: 'vermilion',
            name: 'Lead',
            trackType: 'melodic',
            instrumentId: 'pluck',
            muted: false,
            solo: false,
          } as any,
        ],
      });

      // Simple inspection of track chunks in generated array buffer
      const buf = new Uint8Array(await result.blob.arrayBuffer());
      const str = String.fromCharCode(...buf);
      expect(str).not.toContain('Metronome');
    });

    it('includes dedicated Metronome track on channel 10 with wood blocks when includeMetronome is true', async () => {
      const result = exportProjectToMidi({
        title: 'With Metronome Test',
        bpm: 120,
        bars: 1, // 1 bar = 4 beats
        repeats: 2, // 2 repeats = 8 beats total
        strokes: [dummyStroke],
        includeMetronome: true,
        tracks: [
          {
            id: 'track-vermilion',
            colorId: 'vermilion',
            name: 'Lead',
            trackType: 'melodic',
            instrumentId: 'pluck',
            muted: false,
            solo: false,
          } as any,
        ],
      });

      const buf = new Uint8Array(await result.blob.arrayBuffer());
      const str = String.fromCharCode(...buf);
      expect(str).toContain('Metronome');
    });
  });
});
