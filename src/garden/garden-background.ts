/**
 * garden-background.ts
 *
 * Controller managing the Wordmark Rose & Vine Garden canvas lifecycle.
 * Sizes the canvas to 130% width x 220% height of the wordmark hero,
 * handles rAF with delta-time capping, pointer proximity tracking,
 * visibility/blur pausing, reduced-motion, and clean teardown.
 */

import { generateWordmarkGarden, WordmarkGardenModel, Vector2D } from './garden-math';
import { renderWordmarkGarden } from './garden-render';
import { isGardenEnabled } from './garden-setting';

export class WordmarkGardenBackground {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private model: WordmarkGardenModel | null = null;

  private canvasWidthCss: number = 400;
  private canvasHeightCss: number = 220;
  private isMobile: boolean = false;

  private animFrameId: number | null = null;
  private startTimeMs: number = 0;
  private lastFrameTimeMs: number = 0;
  private isRunning: boolean = false;
  private isMounted: boolean = false;
  private isDestroyed: boolean = false;

  private pointerPos: Vector2D | null = null;
  private blurTimeout: number | null = null;
  private resizeTimeout: number | null = null;

  private boundOnResize: () => void;
  private boundOnVisibilityChange: () => void;
  private boundOnBlur: () => void;
  private boundOnFocus: () => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnGardenToggle: (e: Event) => void;

  constructor() {
    this.boundOnResize = () => this.handleResize();
    this.boundOnVisibilityChange = () => this.handleVisibilityChange();
    this.boundOnBlur = () => this.handleBlur();
    this.boundOnFocus = () => this.handleFocus();
    this.boundOnPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
    this.boundOnGardenToggle = (e: Event) => this.handleGardenToggle(e as CustomEvent);
  }

  /**
   * Mounts the garden canvas and begins the animation loop if enabled.
   */
  public mount(): void {
    if (this.isDestroyed || this.isMounted) return;

    if (!isGardenEnabled()) {
      this.bindGlobalEvents();
      return;
    }

    let canvas = document.querySelector<HTMLCanvasElement>('#hero-garden-canvas');
    if (!canvas) {
      const container = document.querySelector<HTMLElement>('#hero-wordmark-container');
      if (container) {
        canvas = document.createElement('canvas');
        canvas.id = 'hero-garden-canvas';
        canvas.className = 'hero-garden-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        canvas.setAttribute('tabindex', '-1');
        container.insertBefore(canvas, container.firstChild);
      }
    }

    if (!canvas) return;

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.isMounted = true;

    this.bindGlobalEvents();
    this.measureAndResize();
    this.start();
  }

  private bindGlobalEvents(): void {
    window.addEventListener('resize', this.boundOnResize, { passive: true });
    document.addEventListener('visibilitychange', this.boundOnVisibilityChange);
    window.addEventListener('blur', this.boundOnBlur);
    window.addEventListener('focus', this.boundOnFocus);
    window.addEventListener('pointermove', this.boundOnPointerMove, { passive: true });
    window.addEventListener('instruversal:garden-toggle', this.boundOnGardenToggle);
  }

  private unbindGlobalEvents(): void {
    window.removeEventListener('resize', this.boundOnResize);
    document.removeEventListener('visibilitychange', this.boundOnVisibilityChange);
    window.removeEventListener('blur', this.boundOnBlur);
    window.removeEventListener('focus', this.boundOnFocus);
    window.removeEventListener('pointermove', this.boundOnPointerMove);
    window.removeEventListener('instruversal:garden-toggle', this.boundOnGardenToggle);
  }

  private measureAndResize(): void {
    if (!this.canvas || !this.ctx) return;

    // Measure the active wordmark element
    const wordmarkEl =
      document.querySelector<HTMLElement>('.wordmark-light:not([style*="display: none"])') ||
      document.querySelector<HTMLElement>('.wordmark-dark:not([style*="display: none"])') ||
      document.querySelector<HTMLElement>('.app-title-link') ||
      document.querySelector<HTMLElement>('.app-title');

    const rect = wordmarkEl ? wordmarkEl.getBoundingClientRect() : null;
    const baseW = rect && rect.width > 50 ? rect.width : (window.innerWidth < 768 ? 240 : 420);
    const baseH = rect && rect.height > 20 ? rect.height : (window.innerWidth < 768 ? 80 : 140);

    // Canvas is about 130% width and 220% height of the wordmark
    this.canvasWidthCss = Math.floor(baseW * 1.35);
    this.canvasHeightCss = Math.floor(baseH * 2.25);

    this.isMobile = (window.innerWidth || 360) < 768;
    // Cap DPR at 2.0 on desktop, 1.5 on mobile phones
    const maxDpr = this.isMobile ? 1.5 : 2.0;
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);

    this.canvas.width = Math.floor(this.canvasWidthCss * dpr);
    this.canvas.height = Math.floor(this.canvasHeightCss * dpr);
    this.canvas.style.width = `${this.canvasWidthCss}px`;
    this.canvas.style.height = `${this.canvasHeightCss}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Procedural garden generation based on the measured canvas dimensions
    this.model = generateWordmarkGarden(this.canvasWidthCss, this.canvasHeightCss);
  }

  private handleResize(): void {
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = window.setTimeout(() => {
      this.resizeTimeout = null;
      this.measureAndResize();
      if (!this.isRunning && this.isMounted) {
        this.renderSingleFrame();
      }
    }, 120);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  private handleBlur(): void {
    // Pause if window has lost focus for more than 5 seconds
    if (this.blurTimeout !== null) window.clearTimeout(this.blurTimeout);
    this.blurTimeout = window.setTimeout(() => {
      this.blurTimeout = null;
      this.stop();
    }, 5000);
  }

  private handleFocus(): void {
    if (this.blurTimeout !== null) {
      window.clearTimeout(this.blurTimeout);
      this.blurTimeout = null;
    }
    this.start();
  }

  private handleGardenToggle(e: CustomEvent<{ enabled: boolean }>): void {
    const enabled = e.detail ? e.detail.enabled : isGardenEnabled();
    if (enabled) {
      if (!this.isMounted) {
        this.mount();
      } else {
        if (this.canvas) this.canvas.style.display = 'block';
        this.start();
      }
    } else {
      this.stop();
      if (this.canvas) {
        this.canvas.style.display = 'none';
        if (this.ctx) {
          this.ctx.clearRect(0, 0, this.canvasWidthCss, this.canvasHeightCss);
        }
      }
    }
  }

  /**
   * Starts or resumes animation loop.
   */
  public start(): void {
    if (!this.isMounted || this.isDestroyed || !isGardenEnabled()) return;

    // Check if on start screen (hash #/ or empty)
    const hash = window.location.hash;
    const isStartScreen = hash === '#/' || hash === '' || hash === '#';
    const gateScreen = document.querySelector<HTMLElement>('#gate-screen');
    const isGateVisible =
      gateScreen && gateScreen.style.display !== 'none' && !gateScreen.classList.contains('hidden');

    if (!isStartScreen || !isGateVisible) {
      return; // Do not run when in editor or studio
    }

    const prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      this.renderSingleFrame();
      return;
    }

    if (this.isRunning) return;
    this.isRunning = true;
    this.startTimeMs = performance.now();
    this.lastFrameTimeMs = performance.now();

    this.loop();
  }

  /**
   * Pauses animation loop.
   */
  public stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.isRunning = false;
  }

  private loop = (): void => {
    if (!this.isRunning || !this.ctx || !this.model) return;

    const now = performance.now();
    const minFrameIntervalMs = this.isMobile ? 32 : 16; // 30fps mobile, 60fps desktop

    const elapsedSinceLast = now - this.lastFrameTimeMs;
    if (elapsedSinceLast >= minFrameIntervalMs) {
      this.lastFrameTimeMs = now;

      const elapsedMs = now - this.startTimeMs;
      const timeSec = elapsedMs / 1000;

      const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';

      renderWordmarkGarden(
        this.ctx,
        this.model,
        this.canvasWidthCss,
        this.canvasHeightCss,
        elapsedMs,
        timeSec,
        this.pointerPos,
        isDarkTheme
      );
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * Renders a single fully-grown still frame for prefers-reduced-motion.
   */
  public renderSingleFrame(): void {
    if (!this.ctx || !this.model) return;
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
    renderWordmarkGarden(
      this.ctx,
      this.model,
      this.canvasWidthCss,
      this.canvasHeightCss,
      4000, // Fully grown state
      1.0,
      null,
      isDarkTheme
    );
  }

  /**
   * Complete cleanup on view exit.
   */
  public teardown(): void {
    this.stop();
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    if (this.blurTimeout !== null) {
      window.clearTimeout(this.blurTimeout);
      this.blurTimeout = null;
    }

    this.unbindGlobalEvents();

    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    this.ctx = null;
    this.model = null;
    this.isMounted = false;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.teardown();
  }
}

let activeGarden: WordmarkGardenBackground | null = null;

export function getGardenBackground(): WordmarkGardenBackground {
  if (!activeGarden) {
    activeGarden = new WordmarkGardenBackground();
  }
  return activeGarden;
}

export function teardownGardenBackground(): void {
  if (activeGarden) {
    activeGarden.destroy();
    activeGarden = null;
  }
}
