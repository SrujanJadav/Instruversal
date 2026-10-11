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
      <button type="button" class="hint-dismiss-btn" id="hint-got-it-btn">
        Got it
      </button>
    </div>
  `;

  document.body.appendChild(overlayEl);

  const dismiss = () => {
    try {
      localStorage.setItem(HINT_INTRO_KEY, 'true');
    } catch {}
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  };

  overlayEl.querySelector('#hint-got-it-btn')?.addEventListener('click', dismiss);
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) dismiss();
  });
}
