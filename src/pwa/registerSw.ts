/**
 * Service Worker Registration and Update Notification
 * Powered by vite-plugin-pwa with runtime safety guards
 */

import { registerSW } from 'virtual:pwa-register';
import { state, events } from '../state';

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // In development, unregister any stale service workers from prior production builds
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
    return;
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showUpdateNotification(updateSW);
    },
    onOfflineReady() {
      console.debug('Instruversal is ready for offline use.');
    },
  });
}

function showUpdateNotification(updateSW: (reloadPage?: boolean) => Promise<void>): void {
  if (document.getElementById('sw-update-toast')) return;

  const toast = document.createElement('aside');
  toast.id = 'sw-update-toast';
  toast.className = 'sw-update-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  toast.innerHTML = `
    <span class="sw-update-text">New version ready.</span>
    <button type="button" class="sw-update-reload-btn" id="sw-update-reload-btn" aria-label="Reload to update">
      Reload
    </button>
    <button type="button" class="sw-update-dismiss-btn" id="sw-update-dismiss-btn" aria-label="Dismiss update notification">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
    </button>
  `;

  document.body.appendChild(toast);

  // Trigger smooth enter transition
  window.requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  const reloadBtn = toast.querySelector<HTMLButtonElement>('#sw-update-reload-btn');
  reloadBtn?.addEventListener('click', async () => {
    // Safety check: Never interrupt active drawing playback or audio export!
    const isPlaying = state.isPlaying;
    const isExporting = Boolean(document.querySelector('.export-recording-view'));

    if (isPlaying || isExporting) {
      const textEl = toast.querySelector('.sw-update-text');
      if (textEl) {
        textEl.textContent = 'Update queued. Applying when paused…';
      }
      reloadBtn.disabled = true;

      const onPause = async () => {
        events.off('transport:pause', onPause);
        await updateSW(true);
      };
      events.on('transport:pause', onPause);
      return;
    }

    await updateSW(true);
  });

  const dismissBtn = toast.querySelector<HTMLButtonElement>('#sw-update-dismiss-btn');
  dismissBtn?.addEventListener('click', () => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 250);
  });
}
