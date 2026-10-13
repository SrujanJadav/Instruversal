import { events } from '../state';

export const GRID_STORAGE_KEY_MELODIC = 'instruversal:grid-melodic';
export const GRID_STORAGE_KEY_BEATS = 'instruversal:grid-beats';

export type GridMode = 'melodic' | 'beat';

/**
 * Gets the current grid visibility setting for a mode.
 * Defaults:
 *  - melodic: true (light pitch grid)
 *  - beat: false (clean unbordered lanes, plain text labels only)
 */
export function getGridEnabled(mode: GridMode): boolean {
  try {
    const key = mode === 'beat' ? GRID_STORAGE_KEY_BEATS : GRID_STORAGE_KEY_MELODIC;
    const val = localStorage.getItem(key);
    if (val === null) {
      return mode === 'melodic';
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    // Fall back to default if corrupted/invalid
    return mode === 'melodic';
  } catch {
    return mode === 'melodic';
  }
}

/**
 * Sets and persists the grid visibility setting for a mode.
 * Dispatches a 'grid:change' event to trigger canvas redraw.
 */
export function setGridEnabled(mode: GridMode, enabled: boolean): void {
  try {
    const key = mode === 'beat' ? GRID_STORAGE_KEY_BEATS : GRID_STORAGE_KEY_MELODIC;
    localStorage.setItem(key, String(enabled));
  } catch (err) {
    console.warn('Failed to save grid setting to localStorage:', err);
  }

  events.emit('grid:change', { mode, enabled });
}

/**
 * Toggles the grid visibility setting for a mode and returns the new value.
 */
export function toggleGrid(mode: GridMode): boolean {
  const current = getGridEnabled(mode);
  const next = !current;
  setGridEnabled(mode, next);
  return next;
}
