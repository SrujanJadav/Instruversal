import { events } from '../state';

export class CountInOverlay {
  private element: HTMLElement;
  private numberEl: HTMLElement;
  private isVisible: boolean = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'count-in-overlay hidden';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'assertive');
    this.element.setAttribute('aria-label', 'Count in');

    this.numberEl = document.createElement('span');
    this.numberEl.className = 'count-in-number';
    this.element.appendChild(this.numberEl);

    document.body.appendChild(this.element);
    this.setupListeners();
  }

  private setupListeners() {
    events.on('practice:count-in-start' as any, (data: { beat: number }) => {
      this.show(data.beat || 1);
    });

    events.on('practice:count-in-tick' as any, (data: { beat: number }) => {
      this.setBeat(data.beat);
    });

    events.on('practice:count-in-end' as any, () => {
      this.hide();
    });
  }

  public show(beat: number = 1) {
    this.isVisible = true;
    this.setBeat(beat);
    this.element.classList.remove('hidden');
    this.element.classList.add('visible');
  }

  public setBeat(beat: number) {
    this.numberEl.textContent = String(beat);
    // Micro-animation for beat pulse unless reduced-motion is requested
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      this.element.classList.remove('beat-pulse');
      // trigger reflow
      void this.element.offsetWidth;
      this.element.classList.add('beat-pulse');
    }
  }

  public hide() {
    this.isVisible = false;
    this.element.classList.remove('visible');
    this.element.classList.add('hidden');
  }

  public isShowing(): boolean {
    return this.isVisible;
  }

  public dispose() {
    this.element.remove();
  }
}

let sharedOverlay: CountInOverlay | null = null;

export function initCountInOverlay(): CountInOverlay {
  if (!sharedOverlay && typeof document !== 'undefined') {
    sharedOverlay = new CountInOverlay();
  }
  return sharedOverlay!;
}
