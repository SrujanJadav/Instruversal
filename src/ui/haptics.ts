/**
 * Haptic feedback utility with prefers-reduced-motion protection.
 */
export function triggerHaptic(durationMs: number = 8): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('vibrate' in navigator)) {
    return;
  }
  // Respect prefers-reduced-motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  try {
    navigator.vibrate(durationMs);
  } catch {
    // Vibration may be restricted on some platforms
  }
}
