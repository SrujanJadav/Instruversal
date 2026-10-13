import { describe, it, expect, beforeEach, vi } from 'vitest';
import { canInstallPrompt, isIosSafari, isStandalone } from './installPrompt';

describe('installPrompt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('canInstallPrompt returns false when beforeinstallprompt has not fired', () => {
    expect(canInstallPrompt()).toBe(false);
  });

  it('isStandalone returns false by default in test browser environment', () => {
    expect(isStandalone()).toBe(false);
  });

  it('isIosSafari detects iOS user agent correctly when not standalone', () => {
    const originalNavigator = globalThis.navigator;
    const mockNavigator = {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: mockNavigator,
      configurable: true,
      writable: true,
    });

    expect(isIosSafari()).toBe(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });
});
