import { describe, it, expect, beforeEach } from 'vitest';

// Polyfill localStorage & document for node test runner
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0,
  } as Storage;
}

if (typeof globalThis.document === 'undefined') {
  const docAttrs = new Map<string, string>();
  (globalThis as any).document = {
    documentElement: {
      setAttribute: (k: string, v: string) => docAttrs.set(k, v),
      getAttribute: (k: string) => docAttrs.get(k) ?? null,
      removeAttribute: (k: string) => docAttrs.delete(k),
      classList: {
        add: () => {},
        remove: () => {},
      },
    },
    getElementById: () => null,
    querySelector: () => null,
  };
}

if (typeof globalThis.window === 'undefined') {
  const listeners = new Map<string, Function[]>();
  (globalThis as any).window = {
    addEventListener: (type: string, fn: Function) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      const arr = listeners.get(type);
      if (arr) {
        listeners.set(type, arr.filter((f) => f !== fn));
      }
    },
    dispatchEvent: (event: any) => {
      const arr = listeners.get(event.type);
      if (arr) {
        arr.forEach((fn) => fn(event));
      }
      return true;
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    setTimeout: (fn: Function) => setTimeout(fn, 0),
  };
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params: any = {}) {
      this.type = type;
      this.detail = params.detail;
    }
  };
}

import {
  initTheme,
  getTheme,
  setTheme,
  toggleTheme,
  getThemeTokens,
  getTrackThemeColor,
} from './theme';

describe('Theme System', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light theme when no stored preference or system preference', () => {
    initTheme();
    expect(getTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persists manual theme choice in localStorage under instruversal:theme', () => {
    setTheme('dark', true);
    expect(getTheme()).toBe('dark');
    expect(localStorage.getItem('instruversal:theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    setTheme('light', true);
    expect(getTheme()).toBe('light');
    expect(localStorage.getItem('instruversal:theme')).toBe('light');
  });

  it('toggles between light and dark', () => {
    setTheme('light', true);
    const toggled1 = toggleTheme();
    expect(toggled1).toBe('dark');
    expect(getTheme()).toBe('dark');

    const toggled2 = toggleTheme();
    expect(toggled2).toBe('light');
    expect(getTheme()).toBe('light');
  });

  it('dispatches themechange CustomEvent when theme changes', () => {
    let fired = false;
    let detailTheme = '';
    const listener = (e: any) => {
      fired = true;
      detailTheme = e.detail?.theme;
    };
    window.addEventListener('themechange', listener);

    setTheme('dark', true);
    expect(fired).toBe(true);
    expect(detailTheme).toBe('dark');

    window.removeEventListener('themechange', listener);
  });

  it('provides brightened pigment colors in dark theme and original in light theme', () => {
    setTheme('light', false);
    const lightTokens = getThemeTokens();
    expect(lightTokens.theme).toBe('light');
    expect(getTrackThemeColor('track-1')).toBe('#D2432A'); // vermilion light

    setTheme('dark', false);
    const darkTokens = getThemeTokens();
    expect(darkTokens.theme).toBe('dark');
    expect(getTrackThemeColor('track-1')).toBe('#E5573D'); // vermilion dark
  });
});
