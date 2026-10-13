/**
 * garden-background.ts
 *
 * Integrates the TypeGardenEngine into the Instruversal homepage title.
 * Mounts the canvas, respects device settings, visibility change, and clean teardown.
 */

import { TypeGardenEngine } from './TypeGardenEngine';
import { isGardenEnabled } from './garden-setting';

export class WordmarkGardenBackground {
  private canvas: HTMLCanvasElement | null = null;
  private engine: TypeGardenEngine | null = null;
  private isMounted = false;
  private isDestroyed = false;

  private boundOnGardenToggle: (e: Event) => void;
  private boundOnVisibilityChange: () => void;

  constructor() {
    this.boundOnGardenToggle = (e: Event) => this.handleGardenToggle(e as CustomEvent);
    this.boundOnVisibilityChange = () => this.handleVisibilityChange();
  }

  public mount(): void {
    if (this.isDestroyed || this.isMounted) return;

    window.addEventListener('instruversal:garden-toggle', this.boundOnGardenToggle);
    document.addEventListener('visibilitychange', this.boundOnVisibilityChange);

    if (!isGardenEnabled()) {
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
    this.engine = new TypeGardenEngine(canvas, {
      text: 'Instruverse',
      theme: 'auto',
      transparent: true,
    });

    this.isMounted = true;
  }

  private handleGardenToggle(e: CustomEvent): void {
    const enabled = e.detail?.enabled ?? isGardenEnabled();
    if (enabled && !this.engine && this.canvas) {
      this.engine = new TypeGardenEngine(this.canvas, {
        text: 'Instruverse',
      theme: 'auto',
      transparent: true,
      });
      this.isMounted = true;
    } else if (!enabled && this.engine) {
      this.engine.destroy();
      this.engine = null;
      if (this.canvas) {
        const ctx = this.canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      }
    }
  }

  private handleVisibilityChange(): void {
    if (!this.engine) return;
    if (document.hidden) {
      this.engine.stop();
    } else {
      this.engine.start();
    }
  }

  public start(): void {
    this.engine?.start();
  }

  public stop(): void {
    this.engine?.stop();
  }

  public teardown(): void {
    window.removeEventListener('instruversal:garden-toggle', this.boundOnGardenToggle);
    document.removeEventListener('visibilitychange', this.boundOnVisibilityChange);

    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }

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
