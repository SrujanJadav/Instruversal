/**
 * Service Worker Registration and Update Notification
 */

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Only run in browser environments
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // If there's an existing worker waiting to activate, notify user
        if (registration.waiting) {
          showUpdateNotification(registration.waiting);
        }

        // Listen for new workers being installed
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (
              installingWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // A new update is ready
              showUpdateNotification(installingWorker);
            }
          });
        });
      })
      .catch((err) => {
        console.debug('Service Worker registration skipped or failed:', err);
      });

    // Ensure page reloads when the new service worker takes over
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

function showUpdateNotification(worker: ServiceWorker): void {
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
  reloadBtn?.addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  });

  const dismissBtn = toast.querySelector<HTMLButtonElement>('#sw-update-dismiss-btn');
  dismissBtn?.addEventListener('click', () => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 250);
  });
}
