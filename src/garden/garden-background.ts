/**
 * garden-background.ts
 *
 * Controller managing the Type Garden background canvas lifecycle.
 * Handles rAF loop, DPR scaling (capped at 2), visibility/blur pausing,
 * reduced motion still frame, frame rate capping, and complete teardown.
 */

import { generateGarden, GardenLandscape } from './garden-math';
import { renderGardenFrame, resolveGardenPalette, GardenThemePalette } from './garden-render';
import { isGardenEnabled } from './garden-setting';

export class GardenBackground {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private landscape: GardenLandscape | null = null;
  private palette: GardenThemePalette = resolveGardenPalette();

  private animFrameId: number | null = null;
  private startTimeMs: number = 0;
  private lastFrameTimeMs: number = 0;
  private isRunning: boolean = false;
  private isMounted: boolean = false;
  private isDestroyed: boolean = false;

  private boundOnResize: () => void;
  private boundOnVisibilityChange: () => void;
  private boundOnBlur: () => void;
  private boundOnFocus: () => void;
  private boundOnThemeChange: () => void;
  private boundOnGardenToggle: (e: Event) => void;

  private resizeTimeout: number | null = null;

  constructor() {
    this.boundOnResize = () => this.handleResize();
    this.boundOnVisibilityChange = () => this.handleVisibilityChange();
    this.boundOnBlur = () => this.handleBlur();
    this.boundOnFocus = () => this.handleFocus();
    this.boundOnThemeChange = () => this.handleThemeChange();
    this.boundOnGardenToggle = (e: Event) => this.handleGardenToggle(e as CustomEvent);
  }

  /**
   * Mounts the garden canvas to the DOM if enabled and starts the lifecycle.
   */
  public mount(container?: HTMLElement | null): void {
    if (this.isDestroyed || this.isMounted) return;

    if (!isGardenEnabled()) {
      // Still listen for toggle to turn on later
      this.bindGlobalEvents();
      return;
    }

    const parent =
      container ||
      document.querySelector<HTMLElement>('#gate-screen') ||
      document.querySelector<HTMLElement>('#app') ||
      document.body;

    let canvas = parent.querySelector<HTMLCanvasElement>('#garden-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'garden-canvas';
      canvas.className = 'garden-background-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('tabindex', '-1');
      // Insert as first child so it sits behind all content
      parent.insertBefore(canvas, parent.firstChild);
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.isMounted = true;

    this.bindGlobalEvents();
    this.resizeCanvasAndLandscape();
    this.start();
  }

  private bindGlobalEvents(): void {
    window.addEventListener('resize', this.boundOnResize, { passive: true });
    document.addEventListener('visibilitychange', this.boundOnVisibilityChange);
    window.addEventListener('blur', this.boundOnBlur);
    window.addEventListener('focus', this.boundOnFocus);
    window.addEventListener('themechange', this.boundOnThemeChange);
    window.addEventListener('instruversal:garden-toggle', this.boundOnGardenToggle);
  }

  private unbindGlobalEvents(): void {
    window.removeEventListener('resize', this.boundOnResize);
    document.removeEventListener('visibilitychange', this.boundOnVisibilityChange);
    window.removeEventListener('blur', this.boundOnBlur);
    window.removeEventListener('focus', this.boundOnFocus);
    window.removeEventListener('themechange', this.boundOnThemeChange);
    window.removeEventListener('instruversal:garden-toggle', this.boundOnGardenToggle);
  }

  private resizeCanvasAndLandscape(): void {
    if (!this.canvas || !this.ctx) return;

    const width = window.innerWidth || 360;
    const height = window.innerHeight || 640;

    // Cap devicePixelRatio at 2.0 to conserve mobile GPU / battery
    const dpr = Math.min(2.0, window.devicePixelRatio || 1);

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Regenerate procedural landscape for the current screen geometry
    this.landscape = generateGarden(width, height);
    this.palette = resolveGardenPalette();
  }

  private handleResize(): void {
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = window.setTimeout(() => {
      this.resizeTimeout = null;
      this.resizeCanvasAndLandscape();
      if (!this.isRunning && this.isMounted) {
        this.renderSingleFrame();
      }
    }, 120);
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  private handleBlur(): void {
    this.stop();
  }

  private handleFocus(): void {
    this.start();
  }

  private handleThemeChange(): void {
    this.palette = resolveGardenPalette();
    if (!this.isRunning && this.isMounted) {
      this.renderSingleFrame();
    }
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
        if (this.ctx && this.landscape) {
          this.ctx.clearRect(0, 0, this.landscape.width, this.landscape.height);
        }
      }
    }
  }

  /**
   * Starts or resumes the animation loop.
   */
  public start(): void {
    if (!this.isMounted || this.isDestroyed || !isGardenEnabled()) return;

    // Check if gate screen is currently active / visible
    const gateScreen = document.querySelector<HTMLElement>('#gate-screen');
    if (gateScreen && (gateScreen.style.display === 'none' || gateScreen.classList.contains('hidden'))) {
      return; // Do not run when editor is open
    }

    // Check for prefers-reduced-motion
    const prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      this.renderSingleFrame(1.0);
      return;
    }

    if (this.isRunning) return;
    this.isRunning = true;
    this.startTimeMs = performance.now();
    this.lastFrameTimeMs = performance.now();

    this.loop();
  }

  /**
   * Pauses the animation loop without removing DOM elements.
   */
  public stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.isRunning = false;
  }

  /**
   * Animation frame loop with frame rate throttling (30fps on mobile, 60fps on desktop).
   */
  private loop = (): void => {
    if (!this.isRunning || !this.ctx || !this.landscape) return;

    const now = performance.now();
    const isMobile = this.landscape.isMobile;
    const minFrameIntervalMs = isMobile ? 32 : 16; // 30 fps cap on phone, 60 fps on desktop

    const elapsedSinceLast = now - this.lastFrameTimeMs;
    if (elapsedSinceLast >= minFrameIntervalMs) {
      this.lastFrameTimeMs = now - (elapsedSinceLast % minFrameIntervalMs);

      const elapsedSec = (now - this.startTimeMs) / 1000;
      // Growth duration 1.8 seconds
      const growthProgress = Math.min(1.0, elapsedSec / 1.8);

      renderGardenFrame(this.ctx, this.landscape, elapsedSec, growthProgress, this.palette);
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * Draws a single static frame for reduced motion or paused resize state.
   */
  public renderSingleFrame(progress: number = 1.0): void {
    if (!this.ctx || !this.landscape) return;
    renderGardenFrame(this.ctx, this.landscape, 0.5, progress, this.palette);
  }

  /**
   * Completely stops the loop, removes listeners, and cleans up canvas resources.
   * Ensures 0 CPU consumption when user is in the editor.
   */
  public teardown(): void {
    this.stop();
    if (this.resizeTimeout !== null) {
      window.clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    this.unbindGlobalEvents();

    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    this.ctx = null;
    this.landscape = null;
    this.isMounted = false;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.teardown();
  }
}

// Global singleton instance for easy lazy loading and lifecycle binding
let activeGarden: GardenBackground | null = null;

export function getGardenBackground(): GardenBackground {
  if (!activeGarden) {
    activeGarden = new GardenBackground();
  }
  return activeGarden;
}

export function teardownGardenBackground(): void {
  if (activeGarden) {
    activeGarden.destroy();
    activeGarden = null;
  }
}
