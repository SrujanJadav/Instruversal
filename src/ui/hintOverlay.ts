import { getCurrentUser } from '../auth/auth';
import { getAccountSheet } from './AccountSheet';
import { canInstallPrompt, promptInstall, isIosSafari, isStandalone } from '../pwa/installPrompt';

const HINT_INTRO_KEY = 'instruversal:hint-intro';

let overlayEl: HTMLElement | null = null;

export function isFirstRunHintNeeded(): boolean {
  try {
    return localStorage.getItem(HINT_INTRO_KEY) === null;
  } catch {}
  return false;
}

export function showFirstRunHintOverlay(force = false): void {
  if (!force && !isFirstRunHintNeeded()) return;
  if (overlayEl) return;

  const currentUser = getCurrentUser();

  let installSectionHtml = '';
  if (!isStandalone()) {
    if (canInstallPrompt()) {
      installSectionHtml = `
        <div class="hint-install-section" style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);">
          <div>
            <span style="font-weight: 500; font-size: 0.85rem;">Install app</span>
            <p style="margin: 0; font-size: 0.75rem; color: var(--ink-soft);">Add to home screen for fast offline access.</p>
          </div>
          <button type="button" class="auth-pill-btn" id="hint-install-btn" style="flex-shrink: 0;">Install</button>
        </div>
      `;
    } else if (isIosSafari()) {
      installSectionHtml = `
        <div class="hint-install-section" style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);">
          <div>
            <span style="font-weight: 500; font-size: 0.85rem;">Install app</span>
            <p style="margin: 0; font-size: 0.75rem; color: var(--ink-soft);">Tap Share, then Add to Home Screen.</p>
          </div>
        </div>
      `;
    }
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'hint-overlay-backdrop';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-label', 'How Instruversal works');

  overlayEl.innerHTML = `
    <div class="hint-card">
      <h2 class="hint-title">How it works</h2>
      <ul class="hint-list">
        <li>
          <span class="hint-num">1</span>
          <span class="hint-text"><strong>Left to right is time.</strong> The playhead loops across your strokes.</span>
        </li>
        <li>
          <span class="hint-num">2</span>
          <span class="hint-text"><strong>Up and down is pitch.</strong> Higher lines make higher notes.</span>
        </li>
        <li>
          <span class="hint-num">3</span>
          <span class="hint-text"><strong>Colour is instrument.</strong> Beat colours become drums.</span>
        </li>
      </ul>

      ${installSectionHtml}

      <div class="hint-account-section" style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);">
        <div>
          <span style="font-weight: 500; font-size: 0.85rem;">Account</span>
          <p style="margin: 0; font-size: 0.75rem; color: var(--ink-soft);" id="hint-user-lbl">${currentUser ? currentUser.email : 'Guest (local only)'}</p>
        </div>
        <button type="button" class="auth-pill-btn" id="hint-account-btn" style="flex-shrink: 0;">${currentUser ? 'Manage' : 'Sign in'}</button>
      </div>

      <div class="hint-shortcuts-section desktop-only">
        <div class="hint-shortcuts-header">
          <span class="hint-section-title">Keyboard shortcuts</span>
        </div>
        <ul class="hint-shortcuts-list">
          <li><kbd>Space</kbd><span>Play and pause</span></li>
          <li><kbd>D</kbd><span>Draw</span></li>
          <li><kbd>E</kbd><span>Erase</span></li>
          <li><kbd>V</kbd><span>Select</span></li>
          <li><kbd>Ctrl/Cmd+Z</kbd><span>Undo</span></li>
          <li><kbd>Shift+Ctrl/Cmd+Z</kbd><span>Redo</span></li>
          <li><kbd>Ctrl/Cmd+D</kbd><span>Duplicate</span></li>
          <li><kbd>Ctrl/Cmd+A</kbd><span>Select all</span></li>
          <li><kbd>Arrows</kbd><span>Nudge</span></li>
          <li><kbd>Esc</kbd><span>Closes sheets</span></li>
        </ul>
        <div class="hint-shortcuts-header" style="margin-top: 8px;">
          <span class="hint-section-title">Song Studio shortcuts</span>
        </div>
        <ul class="hint-shortcuts-list">
          <li><kbd>Space</kbd><span>Play and pause</span></li>
          <li><kbd>S</kbd><span>Split clip at playhead</span></li>
          <li><kbd>Delete</kbd><span>Delete clip</span></li>
          <li><kbd>Ctrl/Cmd+D</kbd><span>Duplicate clip</span></li>
          <li><kbd>Arrows</kbd><span>Move by one bar</span></li>
          <li><kbd>Shift+Arrows</kbd><span>Resize by one bar</span></li>
          <li><kbd>+ / −</kbd><span>Zoom timeline</span></li>
          <li><kbd>Esc</kbd><span>Deselect</span></li>
        </ul>
      </div>

      <button type="button" class="hint-dismiss-btn" id="hint-got-it-btn">
        Got it
      </button>
    </div>
  `;

  document.body.appendChild(overlayEl);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      dismiss();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const dismiss = () => {
    window.removeEventListener('keydown', onKeyDown);
    try {
      localStorage.setItem(HINT_INTRO_KEY, 'true');
    } catch {}
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  };

  overlayEl.querySelector('#hint-install-btn')?.addEventListener('click', async () => {
    const installed = await promptInstall();
    if (installed) {
      const btn = overlayEl?.querySelector<HTMLButtonElement>('#hint-install-btn');
      if (btn) {
        btn.textContent = 'Installed';
        btn.disabled = true;
      }
    }
  });

  overlayEl.querySelector('#hint-account-btn')?.addEventListener('click', () => {
    dismiss();
    getAccountSheet().open();
  });

  overlayEl.querySelector('#hint-got-it-btn')?.addEventListener('click', dismiss);
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) dismiss();
  });
}
