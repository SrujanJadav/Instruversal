/**
 * garden-setting.ts
 *
 * Device setting management for the Type Garden background.
 * Persists in localStorage under the 'instruversal:garden' key. Default ON.
 */

export const GARDEN_SETTING_KEY = 'instruversal:garden';

export function isGardenEnabled(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return true;
  }
  try {
    const val = localStorage.getItem(GARDEN_SETTING_KEY);
    if (val === null) return true; // Default ON
    return val === 'true';
  } catch {
    return true;
  }
}

export function setGardenEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(GARDEN_SETTING_KEY, enabled ? 'true' : 'false');
  } catch {}

  window.dispatchEvent(
    new CustomEvent('instruversal:garden-toggle', {
      detail: { enabled },
    })
  );
}
