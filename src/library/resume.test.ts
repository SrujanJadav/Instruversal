import { describe, it, expect, beforeEach } from 'vitest';

// Polyfill localStorage for node test runner
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

import {
  isResumeTimestampValid,
  getStoredResumeData,
  setStoredResumeData,
  clearStoredResumeData,
  resolveActiveResumeTarget,
  THIRTY_MINUTES_MS,
  TWENTY_FOUR_HOURS_MS,
  CreationSummary,
} from './resume';

describe('resume helper module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('isResumeTimestampValid', () => {
    const baseNow = 1_000_000_000;

    it('validates 30-minute session return window correctly', () => {
      // 10 minutes ago -> valid
      expect(isResumeTimestampValid(baseNow - 10 * 60 * 1000, false, baseNow)).toBe(true);
      // Exactly 30 minutes ago -> valid
      expect(isResumeTimestampValid(baseNow - THIRTY_MINUTES_MS, false, baseNow)).toBe(true);
      // 31 minutes ago -> expired
      expect(isResumeTimestampValid(baseNow - (THIRTY_MINUTES_MS + 1000), false, baseNow)).toBe(false);
    });

    it('validates 24-hour fresh visit window correctly', () => {
      // 2 hours ago -> valid
      expect(isResumeTimestampValid(baseNow - 2 * 60 * 60 * 1000, true, baseNow)).toBe(true);
      // Exactly 24 hours ago -> valid
      expect(isResumeTimestampValid(baseNow - TWENTY_FOUR_HOURS_MS, true, baseNow)).toBe(true);
      // 25 hours ago -> expired
      expect(isResumeTimestampValid(baseNow - (TWENTY_FOUR_HOURS_MS + 1000), true, baseNow)).toBe(false);
    });

    it('rejects invalid or future timestamps', () => {
      expect(isResumeTimestampValid(0, false, baseNow)).toBe(false);
      expect(isResumeTimestampValid(NaN, false, baseNow)).toBe(false);
      expect(isResumeTimestampValid(baseNow + 5000, false, baseNow)).toBe(false);
    });
  });

  describe('storage methods', () => {
    it('saves, retrieves, and clears resume target data', () => {
      expect(getStoredResumeData()).toBeNull();

      setStoredResumeData('sketch-1', 'My Melody', true, 5000);
      const data = getStoredResumeData();
      expect(data).toEqual({
        id: 'sketch-1',
        title: 'My Melody',
        timestamp: 5000,
        returnedFromSession: true,
      });

      clearStoredResumeData();
      expect(getStoredResumeData()).toBeNull();
    });

    it('falls back to Untitled sketch if title is blank', () => {
      setStoredResumeData('sketch-2', '   ', true, 1000);
      const data = getStoredResumeData();
      expect(data?.title).toBe('Untitled sketch');
    });
  });

  describe('resolveActiveResumeTarget', () => {
    const now = 2_000_000_000;

    it('returns target on active session return within 30 minutes', () => {
      setStoredResumeData('c-1', 'Recent Sketch', true, now - 5 * 60 * 1000);

      const recent: CreationSummary[] = [
        { id: 'c-1', title: 'Recent Sketch', updatedAt: now - 5 * 60 * 1000, strokesCount: 3 },
      ];

      const target = resolveActiveResumeTarget(recent, false, now);
      expect(target).toEqual({ id: 'c-1', title: 'Recent Sketch' });
    });

    it('returns null if session return is older than 30 minutes', () => {
      setStoredResumeData('c-1', 'Recent Sketch', true, now - 35 * 60 * 1000);

      const recent: CreationSummary[] = [
        { id: 'c-1', title: 'Recent Sketch', updatedAt: now - 35 * 60 * 1000, strokesCount: 3 },
      ];

      const target = resolveActiveResumeTarget(recent, false, now);
      expect(target).toBeNull();
    });

    it('on fresh visit, resolves recent creation edited within 24 hours with strokes', () => {
      const recent: CreationSummary[] = [
        { id: 'fresh-1', title: 'Yesterday Jams', updatedAt: now - 2 * 60 * 60 * 1000, strokesCount: 5 },
      ];

      const target = resolveActiveResumeTarget(recent, true, now);
      expect(target).toEqual({ id: 'fresh-1', title: 'Yesterday Jams' });
    });

    it('on fresh visit, ignores creation with 0 strokes or older than 24 hours', () => {
      const emptyRecent: CreationSummary[] = [
        { id: 'empty-1', title: 'Blank Sketch', updatedAt: now - 1000, strokesCount: 0 },
      ];
      expect(resolveActiveResumeTarget(emptyRecent, true, now)).toBeNull();

      const oldRecent: CreationSummary[] = [
        { id: 'old-1', title: 'Ancient Song', updatedAt: now - 26 * 60 * 60 * 1000, strokesCount: 12 },
      ];
      expect(resolveActiveResumeTarget(oldRecent, true, now)).toBeNull();
    });
  });
});
