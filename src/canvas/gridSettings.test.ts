import { describe, it, expect, beforeEach } from 'vitest';

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
  getGridEnabled,
  setGridEnabled,
  toggleGrid,
  GRID_STORAGE_KEY_MELODIC,
  GRID_STORAGE_KEY_BEATS,
} from './gridSettings';
import { events } from '../state';

describe('gridSettings (Canvas Grid Visibility)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides the correct defaults for melodic and beats modes', () => {
    // Melodic default is on (light grid)
    expect(getGridEnabled('melodic')).toBe(true);
    // Beats mode default is off (clean unbordered lanes)
    expect(getGridEnabled('beat')).toBe(false);
  });

  it('persists and loads settings from localStorage with instruversal: prefix', () => {
    setGridEnabled('melodic', false);
    expect(localStorage.getItem(GRID_STORAGE_KEY_MELODIC)).toBe('false');
    expect(getGridEnabled('melodic')).toBe(false);

    setGridEnabled('beat', true);
    expect(localStorage.getItem(GRID_STORAGE_KEY_BEATS)).toBe('true');
    expect(getGridEnabled('beat')).toBe(true);
  });

  it('falls back to default mode values if localStorage has invalid or corrupted data', () => {
    localStorage.setItem(GRID_STORAGE_KEY_MELODIC, 'invalid_value');
    localStorage.setItem(GRID_STORAGE_KEY_BEATS, '12345');

    expect(getGridEnabled('melodic')).toBe(true);
    expect(getGridEnabled('beat')).toBe(false);
  });

  it('toggles setting value cleanly', () => {
    // Melodic starts true -> toggles to false -> toggles back to true
    expect(toggleGrid('melodic')).toBe(false);
    expect(getGridEnabled('melodic')).toBe(false);
    expect(toggleGrid('melodic')).toBe(true);
    expect(getGridEnabled('melodic')).toBe(true);

    // Beats starts false -> toggles to true -> toggles back to false
    expect(toggleGrid('beat')).toBe(true);
    expect(getGridEnabled('beat')).toBe(true);
    expect(toggleGrid('beat')).toBe(false);
    expect(getGridEnabled('beat')).toBe(false);
  });

  it('dispatches grid:change events when settings change', () => {
    const changes: { mode: string; enabled: boolean }[] = [];
    const unsub = events.on('grid:change', (data) => {
      changes.push(data);
    });

    setGridEnabled('melodic', false);
    setGridEnabled('beat', true);

    unsub();

    expect(changes).toEqual([
      { mode: 'melodic', enabled: false },
      { mode: 'beat', enabled: true },
    ]);
  });
});
