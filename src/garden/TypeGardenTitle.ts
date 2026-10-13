/**
 * TypeGardenTitle.ts
 *
 * Production-ready TypeScript component for homepage title and embedded wordmarks.
 * Builds the responsive container and canvas with zero external graphic dependencies,
 * initializes the TypeGardenEngine, and provides full lifecycle controls.
 *
 * Features:
 * - Transparent background by default (seamlessly takes the website's native background)
 * - Dynamic theme detection ('auto' | 'dark' | 'light')
 * - Full touch/pointer interaction and devicePixelRatio support
 */

import { TypeGardenEngine, TypeGardenOptions, GardenPalette } from './TypeGardenEngine';

export interface TypeGardenTitleComponentOptions extends TypeGardenOptions {
  className?: string;
  style?: Partial<CSSStyleDeclaration>;
}

export interface TypeGardenTitleInstance {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  engine: TypeGardenEngine;
  setText: (text: string) => void;
  setTheme: (theme: 'dark' | 'light' | 'auto') => void;
  setTransparent: (transparent: boolean) => void;
  destroy: () => void;
}

export function createTypeGardenTitle(options?: TypeGardenTitleComponentOptions): TypeGardenTitleInstance {
  const container = document.createElement('div');
  container.className = options?.className || 'type-garden-title-container';
  container.style.position = 'relative';
  container.style.width = '100%';
  container.style.height = '180px';
  container.style.maxHeight = '260px';
  container.style.overflow = 'hidden';
  container.style.backgroundColor = 'transparent';

  if (options?.style) {
    Object.assign(container.style, options.style);
  }

  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.cursor = 'default';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-label', options?.text ?? 'Instruverse');
  canvas.setAttribute('role', 'img');

  container.appendChild(canvas);

  const engine = new TypeGardenEngine(canvas, {
    text: options?.text ?? 'Instruverse',
    fontFamily: options?.fontFamily,
    theme: options?.theme ?? 'auto',
    transparent: options?.transparent ?? true,
    palette: options?.palette,
    palettes: options?.palettes,
    seed: options?.seed,
  });

  return {
    container,
    canvas,
    engine,
    setText: (text: string) => engine.setText(text),
    setTheme: (theme: 'dark' | 'light' | 'auto') => engine.setTheme(theme),
    setTransparent: (transparent: boolean) => engine.setTransparent(transparent),
    destroy: () => {
      engine.destroy();
      container.remove();
    },
  };
}

export type { GardenPalette };
