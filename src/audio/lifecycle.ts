import * as Tone from 'tone';
import { state, events, savePolyphony } from '../state';
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
  if (enabled) {
    state.polyphony = 'low';
    savePolyphony('low');
    events.emit('polyphony:change', 'low');
  }
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
    <button type="button" class="silent-hint-dismiss" aria-label="Dismiss note">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
    </button>
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

/**
 * Fades master gain to zero over durationSec (default 150ms) to allow effect tails
 * to ring out naturally, pauses the transport, and cleanly releases all voice pools.
 * Does NOT suspend the AudioContext so it remains unlocked for future sound.
 */
export async function fadeMasterOut(durationSec: number = 0.15): Promise<void> {
  try {
    const rack = getMasterEffectsRack();
    if (rack && rack.masterGain) {
      rack.masterGain.gain.rampTo(0, durationSec);
    }
  } catch {}

  // Allow tails to ring out naturally over the fade duration
  await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));

  if (Tone.getTransport().state === 'started') {
    getTransport().pause();
  }

  // Release voices cleanly without clicks
  try {
    getFlowVoicePool().releaseAll(0.01);
  } catch {}
  try {
    getBeatFlowVoicePool().releaseAll(0.01);
  } catch {}
  try {
    getPreviewEngine().cancelPreview();
  } catch {}
}

/**
 * Restores the master gain node back to unity/calibrated level with a subtle click-free ramp.
 */
export function restoreMasterGain(): void {
  try {
    const rack = getMasterEffectsRack();
    if (rack && rack.masterGain) {
      rack.masterGain.gain.rampTo(0.75, 0.05);
    }
  } catch {}
}
