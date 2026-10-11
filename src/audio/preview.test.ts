import { describe, it, expect, beforeEach } from 'vitest';
import {
  getComfortableRootMidi,
  getAuditionEnabled,
  setAuditionEnabled,
} from './preview';

// Polyfill localStorage for node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0,
  } as Storage;
}

describe('preview module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getComfortableRootMidi', () => {
    it('chooses the octave nearest to MIDI 60 within C3 to C6', () => {
      // C (0) should be 60 (C4)
      expect(getComfortableRootMidi(0)).toBe(60);

      // B (11) should be 59 (B3), NOT 71 (B4) or 83 (B5)
      expect(getComfortableRootMidi(11)).toBe(59);

      // A (9) -> 57 (A3) is |57-60|=3, whereas 69 (A4) is |69-60|=9
      expect(getComfortableRootMidi(9)).toBe(57);

      // D (2) -> 62 (D4) is |62-60|=2, whereas 50 (D3) is |50-60|=10
      expect(getComfortableRootMidi(2)).toBe(62);
    });
  });

  describe('Audition settings persistence', () => {
    it('defaults to true (ON)', () => {
      expect(getAuditionEnabled()).toBe(true);
    });

    it('persists enabled and disabled states to localStorage under instruversal:audition', () => {
      setAuditionEnabled(false);
      expect(getAuditionEnabled()).toBe(false);
      expect(localStorage.getItem('instruversal:audition')).toBe('false');

      setAuditionEnabled(true);
      expect(getAuditionEnabled()).toBe(true);
      expect(localStorage.getItem('instruversal:audition')).toBe('true');
    });
  });
});
