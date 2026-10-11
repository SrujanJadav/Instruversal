import { describe, it, expect, vi, beforeEach } from 'vitest';

// Polyfill sessionStorage for node test runner
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0,
  } as Storage;
}

import {
  isCloudEnabled,
  getCurrentUser,
  onAuthStateChange,
  handleAuthRedirect,
} from './auth';

describe('Auth module', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reports cloud enabled status based on environment variables', () => {
    expect(typeof isCloudEnabled).toBe('boolean');
  });

  it('allows registering and unregistering auth state change listeners', () => {
    let called = false;
    const unsub = onAuthStateChange((user) => {
      called = true;
      expect(user).toBe(getCurrentUser());
    });

    expect(called).toBe(true);
    unsub();
  });

  it('restores previous route and cleans query params on auth redirect', async () => {
    sessionStorage.setItem('instruversal:auth_redirect_route', '#/library');

    let currentUrl = 'http://localhost:5173/?code=fake-oauth-code#/';
    const mockWindow = {
      location: {
        get href() { return currentUrl; },
        origin: 'http://localhost:5173',
        pathname: '/',
        get search() { return new URL(currentUrl).search; },
        get hash() { return new URL(currentUrl).hash; },
      },
      history: {
        replaceState: vi.fn((_state, _title, newUrl) => {
          currentUrl = newUrl;
        }),
      },
    };

    const prevWindow = (globalThis as any).window;
    (globalThis as any).window = mockWindow;

    try {
      await handleAuthRedirect();

      // The ?code= parameter should be removed
      const url = new URL(currentUrl, 'http://localhost:5173');
      expect(url.searchParams.get('code')).toBeNull();
      // The saved hash should be restored
      expect(url.hash).toBe('#/library');
      expect(mockWindow.history.replaceState).toHaveBeenCalled();
    } finally {
      (globalThis as any).window = prevWindow;
    }
  });
});
