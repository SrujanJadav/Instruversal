import * as Tone from 'tone';
import { state, events } from '../state';
import { getTransport } from './transport';
import { getFlowVoicePool } from './voicePool';
import { getBeatFlowVoicePool } from './beatFlowVoices';
import { getPreviewEngine } from './preview';
import { getMasterEffectsRack } from './effects';

const SILENT_HINT_KEY = 'instruversal:hint-silent';
const LIGHT_MODE_KEY = 'instruversal:light-mode';

let wakeLock: any = null;
let wasPlayingBeforeHidden = false;
let resumeBannerEl: HTMLElement | null = null;
let silentHintEl: HTMLElement | null = null;

export function getLightMode(): boolean {
  try {
    const val = localStorage.getItem(LIGHT_MODE_KEY);
    if (val !== null) return val === 'true';
    // Auto-detect low power if <= 4 CPU cores
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
      return true;
    }
  } catch {}
  return false;
}

export function setLightMode(enabled: boolean): void {
  try {
    localStorage.setItem(LIGHT_MODE_KEY, String(enabled));
  } catch {}
  applyLightModeSettings(enabled);
}

function applyLightModeSettings(isLight: boolean): void {
  const rack = getMasterEffectsRack();
  if (isLight) {
    // Light mode: reduce reverb burden for mobile CPU
    if (state.fx.reverb.size > 1.8) {
      rack.applyConfig({
        ...state.fx,
        reverb: { ...state.fx.reverb, size: 1.5 },
      });
    }
  }
}

/**
 * Screen Wake Lock management while loop is playing
 */
async function acquireWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (!state.isPlaying || wakeLock !== null) return;
  try {
    wakeLock = await (navigator as any).wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock(): void {
  if (wakeLock) {
    try {
      wakeLock.release().catch(() => {});
    } catch {}
    wakeLock = null;
  }
}

/**
 * Shows small "Tap to resume audio" banner if audio context was interrupted
 */
function showResumeBanner(): void {
  if (resumeBannerEl) return;
  resumeBannerEl = document.createElement('div');
  resumeBannerEl.className = 'audio-resume-banner';
  resumeBannerEl.innerHTML = `
    <span>Audio was interrupted. Tap to resume.</span>
    <button type="button" class="resume-tap-btn">Resume</button>
  `;

  document.body.appendChild(resumeBannerEl);

  const handleResume = async () => {
    try {
      await Tone.context.resume();
      if (wasPlayingBeforeHidden) {
        getTransport().play();
      }
    } catch {}
    if (resumeBannerEl) {
      resumeBannerEl.remove();
      resumeBannerEl = null;
    }
    window.removeEventListener('pointerdown', handleResume, true);
  };

  resumeBannerEl.querySelector('button')?.addEventListener('click', handleResume);
  window.addEventListener('pointerdown', handleResume, true);
}

/**
 * Shows one-time gentle note after first play:
 * "No sound? Check your phone's silent switch and volume."
 */
export function checkSilentSwitchNotice(): void {
  try {
    if (localStorage.getItem(SILENT_HINT_KEY)) return;
  } catch {}

  if (silentHintEl) return;

  silentHintEl = document.createElement('div');
  silentHintEl.className = 'silent-switch-hint';
  silentHintEl.innerHTML = `
    <span>No sound? Check your phone's silent switch and volume.</span>
    <button type="button" class="silent-hint-dismiss" aria-label="Dismiss note">✕</button>
  `;

  const container = document.querySelector('.main-view');
  if (container) {
    container.insertBefore(silentHintEl, container.firstChild);
  } else {
    document.body.appendChild(silentHintEl);
  }

  const dismiss = () => {
    try {
      localStorage.setItem(SILENT_HINT_KEY, 'true');
    } catch {}
    if (silentHintEl) {
      silentHintEl.remove();
      silentHintEl = null;
    }
  };

  silentHintEl.querySelector('.silent-hint-dismiss')?.addEventListener('click', dismiss);
  window.setTimeout(dismiss, 9000); // Auto dismiss after 9s
}

/**
 * Initialize all mobile audio lifecycle listeners
 */
export function initAudioLifecycle(): () => void {
  applyLightModeSettings(getLightMode());

  // Handle tab visibility change, lock, incoming call
  const handleVisibilityChange = async () => {
    if (document.hidden) {
      wasPlayingBeforeHidden = state.isPlaying;
      if (state.isPlaying) {
        getTransport().pause();
      }
      // Release all voice pools cleanly so no stuck notes
      getFlowVoicePool().releaseAll(0.01);
      getBeatFlowVoicePool().releaseAll(0.01);
      getPreviewEngine().cancelPreview();
      releaseWakeLock();
    } else {
      // Returning to app
      if (Tone.context.state !== 'running') {
        try {
          await Tone.context.resume();
          if (wasPlayingBeforeHidden) {
            getTransport().play();
            acquireWakeLock();
          }
        } catch {
          // Browser requires direct user interaction
          showResumeBanner();
        }
      } else if (wasPlayingBeforeHidden) {
        getTransport().play();
        acquireWakeLock();
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Wake lock on play/pause
  const unsubs = [
    events.on('transport:play', () => {
      acquireWakeLock();
      checkSilentSwitchNotice();
    }),
    events.on('transport:pause', () => {
      releaseWakeLock();
    }),
  ];

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    unsubs.forEach((fn) => fn());
    releaseWakeLock();
  };
}
