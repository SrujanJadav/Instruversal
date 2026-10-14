export interface StartChoiceOptions {
  creationsCount: number;
  recentTitle?: string;
  onNewCanvas: () => void | Promise<void>;
  onOpenGallery: () => void | Promise<void>;
}

export class StartChoiceModal {
  private backdrop: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private newCanvasBtn: HTMLButtonElement;
  private galleryBtn: HTMLButtonElement;
  private gallerySubtext: HTMLElement;
  private isOpen: boolean = false;
  private currentOptions: StartChoiceOptions | null = null;
  private openerElement: HTMLElement | null = null;

  constructor() {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'start-choice-backdrop hidden';
    this.backdrop.id = 'start-choice-modal';
    this.backdrop.setAttribute('role', 'presentation');

    this.backdrop.innerHTML = `
      <div class="start-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="start-choice-title">
        <div class="start-choice-header">
          <h2 class="start-choice-title" id="start-choice-title">Begin a session</h2>
          <button type="button" class="start-choice-close-btn" id="start-choice-close" aria-label="Close dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="start-choice-options">
          <button type="button" class="start-option-card start-option-new" id="start-option-new" aria-label="New Canvas: Start with a clean sheet">
            <div class="start-option-text">
              <span class="start-option-heading">New Canvas</span>
              <span class="start-option-subtext">Start with a clean sheet</span>
            </div>
            <div class="start-option-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </div>
          </button>
          <button type="button" class="start-option-card start-option-gallery" id="start-option-gallery" aria-label="Open Gallery">
            <div class="start-option-text">
              <span class="start-option-heading">Open Gallery</span>
              <span class="start-option-subtext" id="start-option-gallery-sub">0 saved creations</span>
            </div>
            <div class="start-option-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.backdrop);
    this.closeBtn = this.backdrop.querySelector('#start-choice-close')!;
    this.newCanvasBtn = this.backdrop.querySelector('#start-option-new')!;
    this.galleryBtn = this.backdrop.querySelector('#start-option-gallery')!;
    this.gallerySubtext = this.backdrop.querySelector('#start-option-gallery-sub')!;

    this.bindEvents();
  }

  private bindEvents() {
    this.closeBtn.addEventListener('click', () => this.close());

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    this.newCanvasBtn.addEventListener('click', async () => {
      const opts = this.currentOptions;
      this.close();
      if (opts?.onNewCanvas) {
        await opts.onNewCanvas();
      }
    });

    this.galleryBtn.addEventListener('click', async () => {
      const opts = this.currentOptions;
      this.close();
      if (opts?.onOpenGallery) {
        await opts.onOpenGallery();
      }
    });
  }

  public open(options: StartChoiceOptions, opener?: HTMLElement) {
    this.currentOptions = options;
    this.openerElement = opener || (document.activeElement as HTMLElement) || null;

    const count = options.creationsCount;
    let subtext = count === 1 ? '1 saved creation' : `${count} saved creations`;
    if (options.recentTitle && options.recentTitle.trim()) {
      const cleanTitle = options.recentTitle.trim();
      const shortTitle = cleanTitle.length > 20 ? cleanTitle.slice(0, 18) + '…' : cleanTitle;
      subtext = `${count} saved · "${shortTitle}"`;
    }
    this.gallerySubtext.textContent = subtext;

    this.backdrop.classList.remove('hidden');
    this.isOpen = true;

    requestAnimationFrame(() => {
      this.newCanvasBtn.focus();
    });
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backdrop.classList.add('hidden');
    this.currentOptions = null;
    this.openerElement?.focus();
    this.openerElement = null;
  }
}

let startChoiceModalInstance: StartChoiceModal | null = null;
export function getStartChoiceModal(): StartChoiceModal {
  if (!startChoiceModalInstance) {
    startChoiceModalInstance = new StartChoiceModal();
  }
  return startChoiceModalInstance;
}
